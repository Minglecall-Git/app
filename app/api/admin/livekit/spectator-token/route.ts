import { AccessToken } from 'livekit-server-sdk';
import { NextRequest } from 'next/server';
import { getLiveKitEnv, isLiveKitConfigured } from '../../../../../lib/livekitEnv';
import { jsonErr, jsonOk, requireAdmin } from '../../../../../lib/nextAuth';
import { parseJsonBody } from '../../../../../lib/nextRequest';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** POST /api/admin/livekit/spectator-token — silent spectator (native Next). */
export async function POST(req: NextRequest) {
  try {
    const auth = await requireAdmin(req);
    if (!auth.ok) { return jsonErr(auth.status, auth.error.message, auth.error.code); }

    const parsed = await parseJsonBody<{ roomName?: string }>(req);
    if (!parsed.ok) { return jsonErr(parsed.status, parsed.error.message, parsed.error.code); }

    const roomName = String(parsed.data?.roomName || '').trim();
    if (!roomName) return jsonErr(400, 'roomName is required', 'INVALID_INPUT');

    const livekit = getLiveKitEnv();
    const adminId = auth.profileId || auth.userId || 'root';
    const spectatorIdentity = `spectator_admin_${adminId}_${Math.random().toString(36).substring(2, 6)}`;

    if (!isLiveKitConfigured()) {
      return jsonOk({
        configured: false,
        token: null,
        spectatorIdentity,
        wsUrl: livekit.wsUrl || 'wss://your-livekit-project.livekit.cloud',
        message: 'LiveKit credentials unconfigured; local simulator stream active.',
        runtime: 'next-native',
      });
    }

    const at = new AccessToken(livekit.apiKey, livekit.apiSecret, {
      identity: spectatorIdentity,
      name: 'Quality Assurance Spectator',
      ttl: '2h',
      metadata: JSON.stringify({ role: 'silent_spectator', hidden: true }),
    });
    at.addGrant({
      roomJoin: true,
      room: roomName,
      canPublish: false,
      canPublishData: false,
      canSubscribe: true,
      hidden: true,
    });

    const token = await at.toJwt();
    return jsonOk({
      configured: true,
      token,
      wsUrl: livekit.wsUrl,
      spectatorIdentity,
      mode: 'silent_spectator',
      discretionLevel: 'strict_zero_presence',
      runtime: 'next-native',
    });
  } catch (err: any) {
    console.error('[next /api/admin/livekit/spectator-token]', err);
    return jsonErr(500, err?.message || 'Failed to generate spectator token', 'SERVER_ERROR');
  }
}
