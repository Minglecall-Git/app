import { NextRequest } from 'next/server';
import { createServiceClient, jsonErr, requireAuth } from '../../../../../../lib/nextAuth';
import { handleFeedLike } from '../../../../../../lib/handlers/feed';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** POST /api/v1/feed/:postId/like */
export async function POST(req: NextRequest, ctx: { params: Promise<{ postId: string }> }) {
  try {
    const auth = await requireAuth(req);
    if (auth.ok === false) return jsonErr(auth.status, auth.error.message, auth.error.code);
    const client = createServiceClient();
    if (!client) return jsonErr(503, 'Feed backend unavailable', 'NO_ADMIN');
    const { postId } = await ctx.params;
    return handleFeedLike(auth, client, postId);
  } catch (err: any) {
    console.error('[next /api/v1/feed/like]', err);
    return jsonErr(500, err?.message || 'Failed to toggle like', 'LIKE_FAILED');
  }
}
