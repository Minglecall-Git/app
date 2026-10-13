import { Router } from 'express';
import { AccessToken } from 'livekit-server-sdk';
import type { ServerRuntime } from '../runtimeTypes';
import { requireAuth, requireAdmin } from '../middleware/auth';
import {
  isSupabaseAdminConfigured,
  updateUserStatusAdmin,
  getSupabaseAdmin,
} from '../supabaseAdmin';

export function createLivekitRouter(ctx: ServerRuntime): Router {
  const router = Router();
  const { livekitConfig } = ctx;

  // GET LiveKit Credentials (for admin dashboard settings) — never expose apiSecret
  router.get('/config', requireAdmin, (req, res) => {
    const hasSecret = Boolean(
      livekitConfig.apiSecret &&
      livekitConfig.apiSecret !== 'secret'
    );
    const configured = Boolean(
      livekitConfig.apiKey &&
      hasSecret &&
      livekitConfig.apiKey !== 'devkey'
    );

    res.json({
      configured,
      apiKeyConfigured: Boolean(livekitConfig.apiKey && livekitConfig.apiKey !== 'devkey'),
      apiSecretConfigured: hasSecret,
      wsUrl: livekitConfig.wsUrl,
    });
  });

  // POST LiveKit Credentials (save directly from admin dashboard setting)
  router.post('/config', requireAdmin, (req, res) => {
    try {
      const { apiKey, apiSecret, wsUrl } = req.body;

      if (apiKey !== undefined) {
        livekitConfig.apiKey = String(apiKey).trim();
        process.env.LIVEKIT_API_KEY = livekitConfig.apiKey;
      }
      if (apiSecret !== undefined) {
        livekitConfig.apiSecret = String(apiSecret).trim();
        process.env.LIVEKIT_API_SECRET = livekitConfig.apiSecret;
      }
      if (wsUrl !== undefined) {
        livekitConfig.wsUrl = String(wsUrl).trim();
        process.env.LIVEKIT_URL = livekitConfig.wsUrl;
      }

      const configured = Boolean(
        livekitConfig.apiKey &&
        livekitConfig.apiSecret &&
        livekitConfig.apiKey !== 'devkey' &&
        livekitConfig.apiSecret !== 'secret'
      );

      res.json({
        success: true,
        configured,
        apiKeyConfigured: Boolean(livekitConfig.apiKey),
        apiSecretConfigured: Boolean(livekitConfig.apiSecret && livekitConfig.apiSecret !== 'secret'),
        wsUrl: livekitConfig.wsUrl,
        message: 'LiveKit API keys updated successfully!',
      });
    } catch (err: any) {
      console.error('Error updating LiveKit config:', err);
      res.status(500).json({ error: err.message || 'Failed to update LiveKit credentials' });
    }
  });

  // LiveKit Token Generation Endpoint
  router.post('/token', requireAuth, async (req, res) => {
    try {
      const { roomName, name } = req.body;
      // Identity is always server-derived from the verified session (never trust client identity)
      const identity = String((req as any).profileId || (req as any).user?.id || '').trim();
      const profileRole = String((req as any).profile?.role || '');
      const appMetaRole = String((req as any).user?.app_metadata?.role || '');
      const authUserId = String((req as any).user?.id || '').trim();

      if (!roomName || !identity) {
        return res.status(400).json({ error: 'roomName is required' });
      }

      const { activeCalls } = ctx;
      const isAdmin = profileRole === 'admin' || appMetaRole === 'admin';
      const room = String(roomName);
      const isAdminTestRoom = room.startsWith('admin_test_room_');

      if (isAdminTestRoom && !isAdmin) {
        return res.status(403).json({ error: 'Admin test rooms require admin privileges.' });
      }

      // Non-admin rooms: membership via in-memory activeCalls OR call_logs (Accept race / multi-instance)
      if (!isAdminTestRoom) {
        let call = activeCalls.get(room) || null;
        if (!call && isSupabaseAdminConfigured()) {
          const supabase = getSupabaseAdmin();
          if (supabase) {
            const { data: row } = await supabase
              .from('call_logs')
              .select('id, caller_id, receiver_id, host_id, status')
              .eq('id', room)
              .maybeSingle();
            const st = String(row?.status || '').toLowerCase();
            const open = ['ringing', 'active', 'accepted', 'in_call', 'connecting'].includes(st);
            if (row && open) {
              call = {
                id: String(row.id),
                callerId: String(row.caller_id || ''),
                receiverId: String(row.receiver_id || row.host_id || ''),
                status: st === 'ringing' ? 'ringing' : 'active',
                ringingAt: Date.now(),
                startTime: st === 'ringing' ? undefined : Date.now(),
              } as any;
              // Hydrate memory so subsequent burns / admin monitor see the call
              activeCalls.set(room, call as any);
            } else if (row && !open) {
              return res.status(409).json({ error: 'This call has already ended.' });
            }
          }
        }
        if (!call) {
          // Brief retry — Accept may race ahead of call_logs upsert
          if (isSupabaseAdminConfigured()) {
            const supabase = getSupabaseAdmin();
            await new Promise((r) => setTimeout(r, 500));
            if (supabase) {
              const { data: row } = await supabase
                .from('call_logs')
                .select('id, caller_id, receiver_id, host_id, status')
                .eq('id', room)
                .maybeSingle();
              const st = String(row?.status || '').toLowerCase();
              const open = ['ringing', 'active', 'accepted', 'in_call', 'connecting'].includes(st);
              if (row && open) {
                call = {
                  id: String(row.id),
                  callerId: String(row.caller_id || ''),
                  receiverId: String(row.receiver_id || row.host_id || ''),
                  status: st === 'ringing' ? 'ringing' : 'active',
                  ringingAt: Date.now(),
                  startTime: st === 'ringing' ? undefined : Date.now(),
                } as any;
                activeCalls.set(room, call as any);
              }
            }
          }
        }
        if (!call) {
          return res.status(404).json({ error: 'Call room not found or is no longer active.' });
        }
        const participantIds = [call.callerId, call.receiverId]
          .map((v) => String(v || '').trim())
          .filter(Boolean);
        let isMember =
          participantIds.includes(identity) ||
          (!!authUserId && participantIds.includes(authUserId));
        // Resolve profile.id ↔ auth_id aliases when ids disagree across devices
        if (!isMember && isSupabaseAdminConfigured() && participantIds.length) {
          const supabase = getSupabaseAdmin();
          if (supabase) {
            const { data: rows } = await supabase
              .from('profiles')
              .select('id, auth_id, email')
              .in('id', participantIds);
            const myEmail = String((req as any).user?.email || (req as any).profile?.email || '')
              .trim()
              .toLowerCase();
            for (const row of rows || []) {
              if (String(row.id) === identity || String(row.id) === authUserId) {
                isMember = true;
                break;
              }
              if (row.auth_id && (String(row.auth_id) === identity || String(row.auth_id) === authUserId)) {
                isMember = true;
                break;
              }
              if (myEmail && row.email && String(row.email).trim().toLowerCase() === myEmail) {
                isMember = true;
                break;
              }
            }
          }
        }
        if (!isMember) {
          return res.status(403).json({ error: 'Not authorized to join this room.' });
        }
      }

      const apiKey = String(livekitConfig.apiKey || '').trim();
      const apiSecret = String(livekitConfig.apiSecret || '').trim();
      const livekitUrl = String(livekitConfig.wsUrl || '').trim();
      const urlOk =
        Boolean(livekitUrl) &&
        !livekitUrl.includes('your-livekit') &&
        (livekitUrl.startsWith('wss://') || livekitUrl.startsWith('ws://'));

      if (!apiKey || !apiSecret || apiKey === 'devkey' || apiSecret === 'secret' || !urlOk) {
        return res.json({
          configured: false,
          token: null,
          wsUrl: urlOk ? livekitUrl : null,
          message:
            'LiveKit credentials missing or placeholder. Set LIVEKIT_URL, LIVEKIT_API_KEY, LIVEKIT_API_SECRET.',
        });
      }

      const displayName =
        (typeof name === 'string' && name.trim()) ||
        (req as any).user?.user_metadata?.full_name ||
        (req as any).user?.email ||
        identity;

      const at = new AccessToken(apiKey, apiSecret, {
        identity,
        name: displayName,
        ttl: '1h',
      });

      at.addGrant({
        roomJoin: true,
        room,
        canPublish: true,
        canSubscribe: true,
        canPublishData: true,
        hidden: false,
      });

      const token = await at.toJwt();

      return res.json({
        configured: true,
        token,
        wsUrl: livekitUrl,
      });
    } catch (err: any) {
      console.error('Error generating LiveKit token:', err);
      return res.status(500).json({
        configured: false,
        token: null,
        error: 'Failed to generate token',
        message: 'Token signing failed. Check that LIVEKIT_API_KEY and LIVEKIT_API_SECRET match your LiveKit Cloud project.',
      });
    }
  });

  // GET helper for LiveKit status
  router.get('/status', (req, res) => {
    const apiKey = livekitConfig.apiKey;
    const apiSecret = livekitConfig.apiSecret;
    const livekitUrl = livekitConfig.wsUrl;

    const configured = Boolean(
      apiKey && apiSecret && apiKey !== 'devkey' && apiSecret !== 'secret'
    );

    res.json({
      configured,
      wsUrl: livekitUrl || null,
    });
  });

  return router;
}

export function createLivekitAdminRouter(ctx: ServerRuntime): Router {
  const router = Router();
  const {
    livekitConfig,
    activeCalls,
    presenceMap,
    broadcastAll,
    broadcastPresence,
    broadcastUsers,
    sendToUser,
  } = ctx;

  // POST Generate Silent Spectator Token (RBAC Admin Only)
  // Ensures Total Discretion: canPublish = false, canPublishData = false, hidden = true
  router.post('/livekit/spectator-token', requireAdmin, async (req, res) => {
    try {
      const { roomName } = req.body;

      if (!roomName) {
        return res.status(400).json({ error: 'roomName is required' });
      }

      // Admin identity comes from verified session — never trust client-supplied adminId/adminRole
      const adminId = String((req as any).user?.id || '').trim() || 'root';

      const apiKey = livekitConfig.apiKey;
      const apiSecret = livekitConfig.apiSecret;
      const livekitUrl = livekitConfig.wsUrl || 'wss://your-livekit-project.livekit.cloud';

      const spectatorIdentity = `spectator_admin_${adminId}_${Math.random().toString(36).substring(2, 6)}`;

      if (!apiKey || !apiSecret || apiKey === 'devkey' || apiSecret === 'secret') {
        return res.json({
          configured: false,
          token: null,
          spectatorIdentity,
          wsUrl: livekitUrl,
          message: 'LiveKit credentials unconfigured; local simulator stream active.',
        });
      }

      // Create strictly one-way spectator token (No mic, no camera, hidden from room participant lists)
      const at = new AccessToken(apiKey, apiSecret, {
        identity: spectatorIdentity,
        name: 'Quality Assurance Spectator',
        ttl: '2h',
        metadata: JSON.stringify({ role: 'silent_spectator', hidden: true }),
      });

      at.addGrant({
        roomJoin: true,
        room: roomName,
        canPublish: false,       // Hard server block: Admin microphone & camera blocked
        canPublishData: false,   // Hard server block: Admin cannot transmit chat/data
        canSubscribe: true,      // Admin can receive audio & video feeds
        hidden: true,            // Discretion: Participant count remains strictly invariant
      });

      const token = await at.toJwt();

      return res.json({
        configured: true,
        token: token,
        wsUrl: livekitUrl,
        spectatorIdentity,
        mode: 'silent_spectator',
        discretionLevel: 'strict_zero_presence',
      });
    } catch (err: any) {
      console.error('Error generating spectator token:', err);
      return res.status(500).json({ error: err.message || 'Failed to generate spectator token' });
    }
  });

  // POST Admin Force Terminate Call (Safety Killswitch)
  router.post('/terminate-call', requireAdmin, (req, res) => {
    try {
      const { callId, reason, adminId } = req.body;
      const call = activeCalls.get(callId);

      if (!call) {
        // Also broadcast termination in case it was a frontend synced call
        broadcastAll({
          type: 'call:ended',
          callId,
          reason: reason || 'Call terminated by Safety & Compliance Administration.',
        });
        return res.json({ success: true, message: 'Call terminated.' });
      }

      call.status = 'ended';
      activeCalls.delete(callId);

      presenceMap.set(call.callerId, 'online');
      presenceMap.set(call.receiverId, 'online');
      if (isSupabaseAdminConfigured()) {
        updateUserStatusAdmin(call.callerId, 'online').catch(() => {});
        updateUserStatusAdmin(call.receiverId, 'online').catch(() => {});
      }
      broadcastPresence();
      broadcastUsers();

      const payload = {
        type: 'call:ended',
        callId,
        endedBy: 'admin_moderator',
        reason: reason || 'Violation of Safety & Community Standards.',
      };

      sendToUser!(call.callerId, payload);
      sendToUser!(call.receiverId, payload);
      broadcastAll(payload);

      return res.json({
        success: true,
        callId,
        message: 'Call successfully terminated by Safety Administration.',
      });
    } catch (err: any) {
      console.error('Error terminating call:', err);
      return res.status(500).json({ error: err.message || 'Failed to terminate call' });
    }
  });

  // POST Admin Issue Safety Warning to Room
  router.post('/issue-warning', requireAdmin, (req, res) => {
    try {
      const { callId, warningText } = req.body;
      const call = activeCalls.get(callId);

      const warningPayload = {
        type: 'call:safety_warning',
        callId,
        message: warningText || 'Automated Safety Advisory: Please adhere to community guidelines.',
        timestamp: Date.now(),
      };

      if (call) {
        sendToUser!(call.callerId, warningPayload);
        sendToUser!(call.receiverId, warningPayload);
      } else {
        broadcastAll(warningPayload);
      }

      return res.json({ success: true, message: 'Warning dispatched discreetly.' });
    } catch (err: any) {
      console.error('Error issuing safety warning:', err);
      return res.status(500).json({ error: err.message || 'Failed to issue warning' });
    }
  });

  return router;
}
