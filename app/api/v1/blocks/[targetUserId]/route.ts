import { NextRequest } from 'next/server';
import { createServiceClient, jsonErr, jsonOk, requireAuth } from '../../../../../lib/nextAuth';
import { loadBlockLists } from '../../../../../lib/handlers/blocks';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type RouteContext = { params: Promise<{ targetUserId: string }> };

/** DELETE /api/v1/blocks/:targetUserId */
export async function DELETE(req: NextRequest, context: RouteContext) {
  try {
    const auth = await requireAuth(req);
    if (!auth.ok) { return jsonErr(auth.status, auth.error.message, auth.error.code); }

    const { targetUserId: rawId } = await context.params;
    const targetUserId = String(rawId || '').trim();
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
      console.error('[next DELETE /api/v1/blocks/:targetUserId] delete:', error.message);
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
    console.error('[next DELETE /api/v1/blocks/:targetUserId]', err);
    return jsonErr(500, err?.message || 'Failed to unblock user', 'UNBLOCK_FAILED');
  }
}
