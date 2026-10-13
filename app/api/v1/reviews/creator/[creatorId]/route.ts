import { NextRequest } from 'next/server';
import { createServiceClient, jsonErr, jsonOk, requireAuth } from '../../../../../../lib/nextAuth';
import { isAdminRole, mapReviewRow, sanitizeText } from '../../../../../../lib/handlers/reviews';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type RouteContext = { params: Promise<{ creatorId: string }> };

/** GET /api/v1/reviews/creator/:creatorId */
export async function GET(req: NextRequest, context: RouteContext) {
  try {
    const auth = await requireAuth(req);
    if (!auth.ok) { return jsonErr(auth.status, auth.error.message, auth.error.code); }

    const { creatorId: rawId } = await context.params;
    const creatorId = sanitizeText(rawId, 128);
    if (!creatorId) return jsonErr(400, 'creatorId required', 'INVALID_CREATOR');

    const isAdmin =
      isAdminRole(auth.role) ||
      auth.email === 'admin@livecall.app' ||
      auth.email === 'superadmin@minglecall.com' ||
      auth.email === 'sadmin@minglecall.com';
    if (auth.profileId !== creatorId && !isAdmin) {
      return jsonErr(403, 'You can only view your own reviews', 'FORBIDDEN');
    }

    const client = createServiceClient();
    if (!client) return jsonErr(503, 'Reviews backend unavailable', 'NO_ADMIN');

    const limit = Math.min(Math.max(Number(req.nextUrl.searchParams.get('limit')) || 100, 1), 200);
    const { data, error } = await client
      .from('creator_reviews')
      .select('*')
      .eq('creator_id', creatorId)
      .order('created_at', { ascending: false })
      .limit(limit);
    if (error) {
      console.error('[next /api/v1/reviews/creator/:creatorId]', error.message);
      return jsonErr(500, 'Failed to load reviews', 'LOAD_FAILED');
    }

    return jsonOk({
      success: true,
      data: { reviews: (data || []).map(mapReviewRow) },
    });
  } catch (err: any) {
    console.error('[next /api/v1/reviews/creator/:creatorId]', err);
    return jsonErr(500, err?.message || 'Failed to load reviews', 'LOAD_FAILED');
  }
}
