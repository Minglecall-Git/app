import { NextRequest } from 'next/server';
import { createServiceClient, jsonErr, jsonOk, requireAuth } from '../../../../../../lib/nextAuth';
import { mapPublicProfileRow, PUBLIC_PROFILE_SELECT } from '../../../../../../lib/handlers/usersPublic';
import { isBlockedEitherWay } from '../../../../../../lib/handlers/social';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type RouteContext = { params: Promise<{ id: string }> };

/** GET /api/v1/users/:id/public */
export async function GET(req: NextRequest, context: RouteContext) {
  try {
    const auth = await requireAuth(req);
    if (!auth.ok) { return jsonErr(auth.status, auth.error.message, auth.error.code); }

    const { id: rawId } = await context.params;
    const targetId = String(rawId || '').trim();
    if (!targetId) return jsonErr(400, 'Invalid user id', 'INVALID_ID');

    const client = createServiceClient();
    if (!client) return jsonErr(503, 'Profiles backend unavailable', 'NO_ADMIN');

    if (targetId !== auth.profileId && (await isBlockedEitherWay(client, auth.profileId, targetId))) {
      return jsonErr(404, 'Profile not found', 'NOT_FOUND');
    }

    let { data, error } = await client
      .from('profiles')
      .select(PUBLIC_PROFILE_SELECT)
      .eq('id', targetId)
      .maybeSingle();

    if (error && /column|does not exist/i.test(String(error.message || ''))) {
      const fallback = await client
        .from('profiles')
        .select(
          'id, name, gender, age, dob, nationality, country_code, spoken_languages, bio, extended_bio, location_city, zodiac, interests, tags, avatar_url, gallery, intro_video_url, is_verified, online_status, role, hourly_coin_rate, created_at, is_banned'
        )
        .eq('id', targetId)
        .maybeSingle();
      data = fallback.data as typeof data;
      error = fallback.error;
    }

    if (error) {
      console.error('[next /api/v1/users/:id/public]', error.message);
      return jsonErr(500, 'Failed to load profile', 'LOAD_FAILED');
    }
    const row = data as Record<string, any> | null;
    if (!row || row.is_banned) {
      return jsonErr(404, 'Profile not found', 'NOT_FOUND');
    }

    return jsonOk({ success: true, data: { user: mapPublicProfileRow(row) } });
  } catch (err: any) {
    console.error('[next /api/v1/users/:id/public]', err);
    return jsonErr(500, err?.message || 'Failed to load profile', 'LOAD_FAILED');
  }
}
