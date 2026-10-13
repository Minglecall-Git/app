import { NextRequest } from 'next/server';
import { createServiceClient, jsonErr, requireAuth } from '../../../../../../lib/nextAuth';
import { enforceRateLimit } from '../../../../../../lib/nextRateLimit';
import { handleFeedTip } from '../../../../../../lib/handlers/feed';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** POST /api/v1/feed/:postId/tip */
export async function POST(req: NextRequest, ctx: { params: Promise<{ postId: string }> }) {
  try {
    const limited = await enforceRateLimit(req, 'sensitive');
    if (limited) return limited;

    const auth = await requireAuth(req);
    if (auth.ok === false) return jsonErr(auth.status, auth.error.message, auth.error.code);
    const client = createServiceClient();
    if (!client) return jsonErr(503, 'Feed backend unavailable', 'NO_ADMIN');
    const { postId } = await ctx.params;
    return handleFeedTip(req, auth, client, postId);
  } catch (err: any) {
    console.error('[next /api/v1/feed/tip]', err);
    return jsonErr(500, err?.message || 'Failed to tip', 'TIP_FAILED');
  }
}
