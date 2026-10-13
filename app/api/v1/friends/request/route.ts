import { randomUUID } from 'crypto';
import { NextRequest } from 'next/server';
import { createServiceClient, jsonErr, jsonOk, requireAuth } from '../../../../../lib/nextAuth';
import { parseJsonBody } from '../../../../../lib/nextRequest';
import {
  canInitiateFriendRequest,
  enrichFriendRequests,
  loadRequestsForUser,
} from '../../../../../lib/handlers/friends';
import { isBlockedEitherWay } from '../../../../../lib/handlers/social';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** POST /api/v1/friends/request */
export async function POST(req: NextRequest) {
  try {
    const auth = await requireAuth(req);
    if (!auth.ok) { return jsonErr(auth.status, auth.error.message, auth.error.code); }

    const parsed = await parseJsonBody<{ targetUserId?: string; callLogId?: string }>(req);
    if (!parsed.ok) { return jsonErr(parsed.status, parsed.error.message, parsed.error.code); }

    const targetUserId = String(parsed.data?.targetUserId || '').trim();
    void parsed.data?.callLogId;

    if (!targetUserId || targetUserId === auth.profileId) {
      return jsonErr(400, 'Invalid targetUserId', 'INVALID_TARGET');
    }

    const client = createServiceClient();
    if (!client) return jsonErr(503, 'Friends backend unavailable', 'NO_ADMIN');

    const { data: sender, error: senderErr } = await client
      .from('profiles')
      .select('id, role, gender, name, avatar_url, is_banned')
      .eq('id', auth.profileId)
      .maybeSingle();
    if (senderErr) throw senderErr;
    if (!sender) return jsonErr(404, 'Sender profile not found', 'SENDER_NOT_FOUND');
    if (sender.is_banned) return jsonErr(403, 'Account unavailable', 'SENDER_BANNED');
    if (!canInitiateFriendRequest(sender)) {
      return jsonErr(403, 'Only female hosts can initiate friend requests', 'SENDER_NOT_ALLOWED');
    }

    const { data: target, error: targetErr } = await client
      .from('profiles')
      .select('id, name, avatar_url, is_banned')
      .eq('id', targetUserId)
      .maybeSingle();
    if (targetErr) throw targetErr;
    if (!target) return jsonErr(404, 'Target user not found', 'NOT_FOUND');
    if (target.is_banned) return jsonErr(403, 'Target user unavailable', 'TARGET_BANNED');

    if (await isBlockedEitherWay(client, auth.profileId, targetUserId)) {
      return jsonErr(403, 'Blocked relationship', 'BLOCKED');
    }

    const pairFilter = `and(sender_id.eq.${auth.profileId},receiver_id.eq.${targetUserId}),and(sender_id.eq.${targetUserId},receiver_id.eq.${auth.profileId})`;
    const { data: existingRows, error: existErr } = await client.from('friend_requests').select('*').or(pairFilter);
    if (existErr) throw existErr;

    const rows = existingRows || [];
    if (rows.some((r: any) => r.status === 'accepted')) {
      return jsonErr(409, 'Already friends', 'ALREADY_FRIENDS');
    }
    if (rows.some((r: any) => r.status === 'pending')) {
      return jsonErr(409, 'Friend request already pending', 'PENDING_EXISTS');
    }
    if (rows.length > 0) {
      const { error: delErr } = await client.from('friend_requests').delete().or(pairFilter);
      if (delErr) {
        console.error('[next /api/v1/friends/request] clear stale:', delErr.message);
        return jsonErr(500, 'Failed to send friend request', 'CLEAR_FAILED');
      }
    }

    const id = randomUUID();
    const { data: inserted, error: insertErr } = await client
      .from('friend_requests')
      .insert({
        id,
        sender_id: auth.profileId,
        receiver_id: targetUserId,
        status: 'pending',
        created_at: new Date().toISOString(),
      })
      .select('*')
      .maybeSingle();
    if (insertErr) {
      console.error('[next /api/v1/friends/request] insert:', insertErr.message);
      return jsonErr(500, 'Failed to send friend request', 'INSERT_FAILED');
    }

    const [mapped] = await enrichFriendRequests(client, [inserted]);
    const payload = await loadRequestsForUser(client, auth.profileId);
    return jsonOk({ success: true, data: { request: mapped, ...payload } });
  } catch (err: any) {
    console.error('[next /api/v1/friends/request]', err);
    return jsonErr(500, err?.message || 'Failed to send friend request', 'REQUEST_FAILED');
  }
}
