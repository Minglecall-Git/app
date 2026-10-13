import { NextRequest } from 'next/server';
import { createServiceClient, jsonErr, requireAuth } from '../../../../../../lib/nextAuth';
import { handleFeedUserPosts } from '../../../../../../lib/handlers/feed';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** GET /api/v1/feed/user/:userId */
export async function GET(req: NextRequest, ctx: { params: Promise<{ userId: string }> }) {
  try {
    const auth = await requireAuth(req);
    if (auth.ok === false) return jsonErr(auth.status, auth.error.message, auth.error.code);
    const client = createServiceClient();
    if (!client) return jsonErr(503, 'Feed backend unavailable', 'NO_ADMIN');
    const { userId } = await ctx.params;
    return handleFeedUserPosts(req, auth, client, userId);
  } catch (err: any) {
    console.error('[next /api/v1/feed/user]', err);
    return jsonErr(500, err?.message || 'Failed to load user moments', 'LOAD_FAILED');
  }
}
