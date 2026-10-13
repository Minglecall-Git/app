import { NextRequest } from 'next/server';
import { createServiceClient, jsonErr, jsonOk, requireAuth } from '../../../../../lib/nextAuth';
import { parseJsonBody } from '../../../../../lib/nextRequest';
import { enrichFriendRequests, loadRequestsForUser } from '../../../../../lib/handlers/friends';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** POST /api/v1/friends/decline */
export async function POST(req: NextRequest) {
  try {
    const auth = await requireAuth(req);
    if (!auth.ok) { return jsonErr(auth.status, auth.error.message, auth.error.code); }

    const parsed = await parseJsonBody<{ requestId?: string }>(req);
    if (!parsed.ok) { return jsonErr(parsed.status, parsed.error.message, parsed.error.code); }

    const requestId = String(parsed.data?.requestId || '').trim();
    if (!requestId) return jsonErr(400, 'requestId required', 'INVALID_REQUEST');

    const client = createServiceClient();
    if (!client) return jsonErr(503, 'Friends backend unavailable', 'NO_ADMIN');

    const { data: row, error: fetchErr } = await client
      .from('friend_requests')
      .select('*')
      .eq('id', requestId)
      .maybeSingle();
    if (fetchErr) throw fetchErr;
    if (!row) return jsonErr(404, 'Friend request not found', 'NOT_FOUND');
    if (String(row.receiver_id) !== auth.profileId) {
      return jsonErr(403, 'Only the receiver may decline this request', 'NOT_RECEIVER');
    }
    if (row.status !== 'pending' && row.status !== 'declined') {
      return jsonErr(409, 'Request cannot be declined', 'NOT_PENDING');
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
      console.error('[next /api/v1/friends/decline] update:', updErr.message);
      return jsonErr(500, 'Failed to decline friend request', 'UPDATE_FAILED');
    }

    const [mapped] = await enrichFriendRequests(client, [updated]);
    const payload = await loadRequestsForUser(client, auth.profileId);
    return jsonOk({ success: true, data: { request: mapped, ...payload } });
  } catch (err: any) {
    console.error('[next /api/v1/friends/decline]', err);
    return jsonErr(500, err?.message || 'Failed to decline friend request', 'DECLINE_FAILED');
  }
}
