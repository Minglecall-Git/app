import { NextRequest } from 'next/server';
import { createServiceClient, jsonErr, requireAuth } from '../../../../../lib/nextAuth';
import { handleFeedDelete } from '../../../../../lib/handlers/feed';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** DELETE /api/v1/feed/:postId */
export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ postId: string }> }) {
  try {
    const auth = await requireAuth(_req);
    if (auth.ok === false) return jsonErr(auth.status, auth.error.message, auth.error.code);
    const client = createServiceClient();
    if (!client) return jsonErr(503, 'Feed backend unavailable', 'NO_ADMIN');
    const { postId } = await ctx.params;
    return handleFeedDelete(auth, client, postId);
  } catch (err: any) {
    console.error('[next /api/v1/feed/delete]', err);
    return jsonErr(500, err?.message || 'Failed to delete moment', 'DELETE_FAILED');
  }
}
