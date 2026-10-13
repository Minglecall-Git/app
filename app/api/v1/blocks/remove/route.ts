import { NextRequest } from 'next/server';
import { createServiceClient, jsonErr, jsonOk, requireAuth } from '../../../../../lib/nextAuth';
import { parseJsonBody } from '../../../../../lib/nextRequest';
import { loadBlockLists } from '../../../../../lib/handlers/blocks';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** POST /api/v1/blocks/remove */
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
    if (!client) return jsonErr(503, 'Blocks backend unavailable', 'NO_ADMIN');

    const { error } = await client
      .from('blocked_users')
      .delete()
      .eq('user_id', auth.profileId)
      .eq('blocked_user_id', targetUserId);
    if (error) {
      console.error('[next /api/v1/blocks/remove] delete:', error.message);
      return jsonErr(500, 'Failed to unblock user', 'DELETE_FAILED');
    }

    const lists = await loadBlockLists(client, auth.profileId);
    return jsonOk({
      success: true,
      data: {
        blocked: false,
        targetUserId,
        ...lists,
      },
    });
  } catch (err: any) {
    console.error('[next /api/v1/blocks/remove]', err);
    return jsonErr(500, err?.message || 'Failed to unblock user', 'UNBLOCK_FAILED');
  }
}
