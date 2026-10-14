import { NextRequest } from 'next/server';
import { createServiceClient, jsonErr, jsonOk, requireAuth } from '../../../../../lib/nextAuth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** GET /api/v1/favorites/me — Next.js Route Handler. */
export async function GET(req: NextRequest) {
  try {
    const auth = await requireAuth(req);
    if (!auth.ok) { return jsonErr(auth.status, auth.error.message, auth.error.code); }

    const client = createServiceClient();
    if (!client) return jsonErr(503, 'Favorites backend unavailable', 'NO_ADMIN');

    const { data, error } = await client
      .from('favorites')
      .select('favorite_user_id, created_at')
      .eq('user_id', auth.profileId)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('[next /api/v1/favorites/me]', error.message);
      return jsonErr(500, 'Failed to load favorites', 'LOAD_FAILED');
    }

    const favoriteUserIds = (data || []).map((r: any) => String(r.favorite_user_id));
    return jsonOk({ success: true, data: { favoriteUserIds } });
  } catch (err: any) {
    console.error('[next /api/v1/favorites/me]', err);
    return jsonErr(500, err?.message || 'Failed to load favorites', 'LOAD_FAILED');
  }
}
