import { NextRequest } from 'next/server';
import { createServiceClient, jsonErr, jsonOk, requireAuth } from '../../../../../lib/nextAuth';
import { parseJsonBody } from '../../../../../lib/nextRequest';
import { loadRequestsForUser } from '../../../../../lib/handlers/friends';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** POST /api/v1/friends/remove */
export async function POST(req: NextRequest) {
  try {
    const auth = await requireAuth(req);
    if (!auth.ok) { return jsonErr(auth.status, auth.error.message, auth.error.code); }

    const parsed = await parseJsonBody<{ targetUserId?: string }>(req);
    if (!parsed.ok) { return jsonErr(parsed.status, parsed.error.message, parsed.error.code); }

    const targetUserId = String(parsed.data?.targetUserId || '').trim();
    if (!targetUserId || targetUserId === auth.profileId) {
      return jsonErr(400, 'Invalid targetUserId', 'INVALID_TARGET');
    }

    const client = createServiceClient();
    if (!client) return jsonErr(503, 'Friends backend unavailable', 'NO_ADMIN');

    const { error } = await client
      .from('friend_requests')
      .delete()
      .or(
        `and(sender_id.eq.${auth.profileId},receiver_id.eq.${targetUserId}),and(sender_id.eq.${targetUserId},receiver_id.eq.${auth.profileId})`
      );
    if (error) {
      console.error('[next /api/v1/friends/remove] delete:', error.message);
      return jsonErr(500, 'Failed to remove friend', 'DELETE_FAILED');
    }

    const payload = await loadRequestsForUser(client, auth.profileId);
    return jsonOk({
      success: true,
      data: { removed: true, targetUserId, ...payload },
    });
  } catch (err: any) {
    console.error('[next /api/v1/friends/remove]', err);
    return jsonErr(500, err?.message || 'Failed to remove friend', 'REMOVE_FAILED');
  }
}
