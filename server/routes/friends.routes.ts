import { Router } from 'express';
import { randomUUID } from 'crypto';
import type { ServerRuntime } from '../runtimeTypes';
import { requireAuth } from '../middleware/auth';
import { getSupabaseAdmin, isSupabaseAdminConfigured } from '../supabaseAdmin';

function authUserId(req: any): string {
  return String(req.profileId || req.user?.id || '');
}

function sendError(res: any, status: number, message: string, code: string) {
  return res.status(status).json({ success: false, error: { message, code } });
}

/** Product rule: female hosts/creators (and female gender) may initiate friend requests. */
function canInitiateFriendRequest(profile: { role?: string | null; gender?: string | null }) {
  const role = String(profile.role || '');
  const gender = String(profile.gender || '');
  if (gender === 'female') return true;
  return role === 'female_creator' || role === 'female_host' || role === 'female_user';
}

async function isBlockedEitherWay(client: any, userId: string, targetUserId: string) {
  const { data, error } = await client
    .from('blocked_users')
    .select('user_id, blocked_user_id')
    .or(
      `and(user_id.eq.${userId},blocked_user_id.eq.${targetUserId}),and(user_id.eq.${targetUserId},blocked_user_id.eq.${userId})`
    )
    .limit(1);
  if (error) throw error;
  return Boolean(data && data.length > 0);
}

function mapFriendRequestRow(row: any, profilesById: Map<string, any>) {
  const sender = profilesById.get(String(row.sender_id));
  const receiver = profilesById.get(String(row.receiver_id));
  return {
    id: String(row.id),
    senderId: String(row.sender_id),
    senderName: sender?.name || String(row.sender_id),
    senderAvatar: sender?.avatar_url || '',
    receiverId: String(row.receiver_id),
    receiverName: receiver?.name || String(row.receiver_id),
    receiverAvatar: receiver?.avatar_url || '',
    status: String(row.status || 'pending'),
    timestamp: row.created_at
      ? new Date(row.created_at).toLocaleString()
      : new Date().toLocaleString(),
    createdAt: row.created_at || null,
    respondedAt: row.responded_at || null,
  };
}

async function enrichFriendRequests(client: any, rows: any[]) {
  const ids = Array.from(
    new Set(
      (rows || []).flatMap((r) => [String(r.sender_id), String(r.receiver_id)]).filter(Boolean)
    )
  );
  const profilesById = new Map<string, any>();
  if (ids.length > 0) {
    const { data: profiles, error } = await client
      .from('profiles')
      .select('id, name, avatar_url')
      .in('id', ids);
    if (error) throw error;
    for (const p of profiles || []) {
      profilesById.set(String(p.id), p);
    }
  }
  return (rows || []).map((row) => mapFriendRequestRow(row, profilesById));
}

async function loadRequestsForUser(client: any, userId: string) {
  const { data, error } = await client
    .from('friend_requests')
    .select('*')
    .or(`sender_id.eq.${userId},receiver_id.eq.${userId}`)
    .order('created_at', { ascending: false });
  if (error) throw error;
  const requests = await enrichFriendRequests(client, data || []);
  const friendIds = requests
    .filter((r) => r.status === 'accepted')
    .map((r) => (r.senderId === userId ? r.receiverId : r.senderId));
  return {
    requests,
    friendIds: Array.from(new Set(friendIds)),
  };
}

export function createFriendsRouter(_runtime: ServerRuntime) {
  const router = Router();

  /** GET /api/v1/friends/requests — requests involving me */
  router.get('/requests', requireAuth, async (req, res) => {
    try {
      if (!isSupabaseAdminConfigured()) {
        return sendError(res, 503, 'Friends backend unavailable', 'NO_ADMIN');
      }
      const userId = authUserId(req);
      if (!userId) return sendError(res, 401, 'Unauthorized', 'UNAUTHORIZED');

      const payload = await loadRequestsForUser(getSupabaseAdmin()!, userId);
      return res.json({ success: true, data: payload });
    } catch (err: any) {
      console.error('[friends/requests] exception:', err);
      return sendError(res, 500, err?.message || 'Failed to load friend requests', 'LOAD_FAILED');
    }
  });

  /** POST /api/v1/friends/request  { targetUserId, callLogId? } */
  router.post('/request', requireAuth, async (req, res) => {
    try {
      if (!isSupabaseAdminConfigured()) {
        return sendError(res, 503, 'Friends backend unavailable', 'NO_ADMIN');
      }
      const senderId = authUserId(req);
      const targetUserId = String(req.body?.targetUserId || '').trim();
      // callLogId accepted for API compat; schema has no call_log_id column yet
      void req.body?.callLogId;

      if (!senderId) return sendError(res, 401, 'Unauthorized', 'UNAUTHORIZED');
      if (!targetUserId || targetUserId === senderId) {
        return sendError(res, 400, 'Invalid targetUserId', 'INVALID_TARGET');
      }

      const client = getSupabaseAdmin()!;
      const { data: sender, error: senderErr } = await client
        .from('profiles')
        .select('id, role, gender, name, avatar_url, is_banned')
        .eq('id', senderId)
        .maybeSingle();
      if (senderErr) throw senderErr;
      if (!sender) return sendError(res, 404, 'Sender profile not found', 'SENDER_NOT_FOUND');
      if (sender.is_banned) return sendError(res, 403, 'Account unavailable', 'SENDER_BANNED');
      if (!canInitiateFriendRequest(sender)) {
        return sendError(
          res,
          403,
          'Only female hosts can initiate friend requests',
          'SENDER_NOT_ALLOWED'
        );
      }

      const { data: target, error: targetErr } = await client
        .from('profiles')
        .select('id, name, avatar_url, is_banned')
        .eq('id', targetUserId)
        .maybeSingle();
      if (targetErr) throw targetErr;
      if (!target) return sendError(res, 404, 'Target user not found', 'NOT_FOUND');
      if (target.is_banned) return sendError(res, 403, 'Target user unavailable', 'TARGET_BANNED');

      if (await isBlockedEitherWay(client, senderId, targetUserId)) {
        return sendError(res, 403, 'Blocked relationship', 'BLOCKED');
      }

      const pairFilter = `and(sender_id.eq.${senderId},receiver_id.eq.${targetUserId}),and(sender_id.eq.${targetUserId},receiver_id.eq.${senderId})`;
      const { data: existingRows, error: existErr } = await client
        .from('friend_requests')
        .select('*')
        .or(pairFilter);
      if (existErr) throw existErr;

      const rows = existingRows || [];
      if (rows.some((r: any) => r.status === 'accepted')) {
        return sendError(res, 409, 'Already friends', 'ALREADY_FRIENDS');
      }
      if (rows.some((r: any) => r.status === 'pending')) {
        return sendError(res, 409, 'Friend request already pending', 'PENDING_EXISTS');
      }
      if (rows.length > 0) {
        const { error: delErr } = await client.from('friend_requests').delete().or(pairFilter);
        if (delErr) {
          console.error('[friends/request] clear stale:', delErr.message);
          return sendError(res, 500, 'Failed to send friend request', 'CLEAR_FAILED');
        }
      }

      const id = randomUUID();
      const { data: inserted, error: insertErr } = await client
        .from('friend_requests')
        .insert({
          id,
          sender_id: senderId,
          receiver_id: targetUserId,
          status: 'pending',
          created_at: new Date().toISOString(),
        })
        .select('*')
        .maybeSingle();
      if (insertErr) {
        console.error('[friends/request] insert:', insertErr.message);
        return sendError(res, 500, 'Failed to send friend request', 'INSERT_FAILED');
      }

      const [mapped] = await enrichFriendRequests(client, [inserted]);
      const payload = await loadRequestsForUser(client, senderId);
      return res.json({
        success: true,
        data: { request: mapped, ...payload },
      });
    } catch (err: any) {
      console.error('[friends/request] exception:', err);
      return sendError(res, 500, err?.message || 'Failed to send friend request', 'REQUEST_FAILED');
    }
  });

  /** POST /api/v1/friends/accept  { requestId } */
  router.post('/accept', requireAuth, async (req, res) => {
    try {
      if (!isSupabaseAdminConfigured()) {
        return sendError(res, 503, 'Friends backend unavailable', 'NO_ADMIN');
      }
      const userId = authUserId(req);
      const requestId = String(req.body?.requestId || '').trim();
      if (!userId) return sendError(res, 401, 'Unauthorized', 'UNAUTHORIZED');
      if (!requestId) return sendError(res, 400, 'requestId required', 'INVALID_REQUEST');

      const client = getSupabaseAdmin()!;
      const { data: row, error: fetchErr } = await client
        .from('friend_requests')
        .select('*')
        .eq('id', requestId)
        .maybeSingle();
      if (fetchErr) throw fetchErr;
      if (!row) return sendError(res, 404, 'Friend request not found', 'NOT_FOUND');
      if (String(row.receiver_id) !== userId) {
        return sendError(res, 403, 'Only the receiver may accept this request', 'NOT_RECEIVER');
      }
      if (row.status === 'accepted') {
        const payload = await loadRequestsForUser(client, userId);
        const [mapped] = await enrichFriendRequests(client, [row]);
        return res.json({ success: true, data: { request: mapped, ...payload } });
      }
      if (row.status !== 'pending') {
        return sendError(res, 409, 'Request is no longer pending', 'NOT_PENDING');
      }

      if (await isBlockedEitherWay(client, String(row.sender_id), String(row.receiver_id))) {
        return sendError(res, 403, 'Blocked relationship', 'BLOCKED');
      }

      const { data: updated, error: updErr } = await client
        .from('friend_requests')
        .update({
          status: 'accepted',
          responded_at: new Date().toISOString(),
        })
        .eq('id', requestId)
        .select('*')
        .maybeSingle();
      if (updErr) {
        console.error('[friends/accept] update:', updErr.message);
        return sendError(res, 500, 'Failed to accept friend request', 'UPDATE_FAILED');
      }

      const [mapped] = await enrichFriendRequests(client, [updated]);
      const payload = await loadRequestsForUser(client, userId);
      return res.json({ success: true, data: { request: mapped, ...payload } });
    } catch (err: any) {
      console.error('[friends/accept] exception:', err);
      return sendError(res, 500, err?.message || 'Failed to accept friend request', 'ACCEPT_FAILED');
    }
  });

  /** POST /api/v1/friends/decline  { requestId } */
  router.post('/decline', requireAuth, async (req, res) => {
    try {
      if (!isSupabaseAdminConfigured()) {
        return sendError(res, 503, 'Friends backend unavailable', 'NO_ADMIN');
      }
      const userId = authUserId(req);
      const requestId = String(req.body?.requestId || '').trim();
      if (!userId) return sendError(res, 401, 'Unauthorized', 'UNAUTHORIZED');
      if (!requestId) return sendError(res, 400, 'requestId required', 'INVALID_REQUEST');

      const client = getSupabaseAdmin()!;
      const { data: row, error: fetchErr } = await client
        .from('friend_requests')
        .select('*')
        .eq('id', requestId)
        .maybeSingle();
      if (fetchErr) throw fetchErr;
      if (!row) return sendError(res, 404, 'Friend request not found', 'NOT_FOUND');
      if (String(row.receiver_id) !== userId) {
        return sendError(res, 403, 'Only the receiver may decline this request', 'NOT_RECEIVER');
      }
      if (row.status !== 'pending' && row.status !== 'declined') {
        return sendError(res, 409, 'Request cannot be declined', 'NOT_PENDING');
      }

      const { data: updated, error: updErr } = await client
        .from('friend_requests')
        .update({
          status: 'declined',
          responded_at: new Date().toISOString(),
        })
        .eq('id', requestId)
        .select('*')
        .maybeSingle();
      if (updErr) {
        console.error('[friends/decline] update:', updErr.message);
        return sendError(res, 500, 'Failed to decline friend request', 'UPDATE_FAILED');
      }

      const [mapped] = await enrichFriendRequests(client, [updated]);
      const payload = await loadRequestsForUser(client, userId);
      return res.json({ success: true, data: { request: mapped, ...payload } });
    } catch (err: any) {
      console.error('[friends/decline] exception:', err);
      return sendError(res, 500, err?.message || 'Failed to decline friend request', 'DECLINE_FAILED');
    }
  });

  /** POST /api/v1/friends/remove  { targetUserId } — either participant may remove friendship */
  router.post('/remove', requireAuth, async (req, res) => {
    try {
      if (!isSupabaseAdminConfigured()) {
        return sendError(res, 503, 'Friends backend unavailable', 'NO_ADMIN');
      }
      const userId = authUserId(req);
      const targetUserId = String(req.body?.targetUserId || '').trim();
      if (!userId) return sendError(res, 401, 'Unauthorized', 'UNAUTHORIZED');
      if (!targetUserId || targetUserId === userId) {
        return sendError(res, 400, 'Invalid targetUserId', 'INVALID_TARGET');
      }

      const client = getSupabaseAdmin()!;
      const { error } = await client
        .from('friend_requests')
        .delete()
        .or(
          `and(sender_id.eq.${userId},receiver_id.eq.${targetUserId}),and(sender_id.eq.${targetUserId},receiver_id.eq.${userId})`
        );
      if (error) {
        console.error('[friends/remove] delete:', error.message);
        return sendError(res, 500, 'Failed to remove friend', 'DELETE_FAILED');
      }

      const payload = await loadRequestsForUser(client, userId);
      return res.json({
        success: true,
        data: { removed: true, targetUserId, ...payload },
      });
    } catch (err: any) {
      console.error('[friends/remove] exception:', err);
      return sendError(res, 500, err?.message || 'Failed to remove friend', 'REMOVE_FAILED');
    }
  });

  return router;
}
