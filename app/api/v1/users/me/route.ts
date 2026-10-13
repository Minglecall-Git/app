import { NextRequest } from 'next/server';
import { createServiceClient, jsonErr, jsonOk, requireAuth } from '../../../../../lib/nextAuth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const PROFILE_SELECT =
  'id, name, gender, age, dob, nationality, country_code, spoken_languages, bio, extended_bio, location_city, zodiac, interests, tags, avatar_url, gallery, gallery_videos, intro_video_url, is_verified, online_status, role, hourly_coin_rate, created_at, coin_balance, earnings_coins, email, auth_id, rating_score, total_reviews_count';

function mapMeProfile(row: Record<string, any>) {
  const gallery = Array.isArray(row.gallery) ? row.gallery : [];
  return {
    id: row.id,
    name: row.name || 'Member',
    gender: row.gender || 'male',
    age: Number(row.age) || 24,
    dob: row.dob || undefined,
    nationality: row.nationality || 'United States',
    countryCode: String(row.country_code || 'US').toUpperCase(),
    spokenLanguages: Array.isArray(row.spoken_languages) ? row.spoken_languages : ['English'],
    bio: row.bio || '',
    extendedBio: row.extended_bio || undefined,
    locationCity: row.location_city || undefined,
    zodiac: row.zodiac || undefined,
    interests: Array.isArray(row.interests) ? row.interests : [],
    tags: Array.isArray(row.tags) ? row.tags : [],
    avatarUrl:
      row.avatar_url ||
      'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&q=80&w=400',
    gallery,
    galleryVideos: Array.isArray(row.gallery_videos) ? row.gallery_videos : [],
    introVideoUrl: row.intro_video_url || undefined,
    isVerified: Boolean(row.is_verified),
    onlineStatus: row.online_status || 'offline',
    role: row.role || 'male_user',
    hourlyCoinRate: Number(row.hourly_coin_rate) || 0,
    ratingScore: row.rating_score != null ? Number(row.rating_score) : undefined,
    totalReviewsCount: row.total_reviews_count != null ? Number(row.total_reviews_count) : undefined,
    createdAt: row.created_at,
    email: row.email || undefined,
    authId: row.auth_id || undefined,
    coinBalance: Number(row.coin_balance || 0),
    earningsCoins: Number(row.earnings_coins || 0),
  };
}

/** GET /api/v1/users/me — native Next (no Express boot). */
export async function GET(req: NextRequest) {
  try {
    const auth = await requireAuth(req);
    if (!auth.ok) { return jsonErr(auth.status, auth.error.message, auth.error.code); }

    const client = createServiceClient();
    if (!client) return jsonErr(503, 'Profiles backend unavailable', 'NO_ADMIN');

    let { data, error } = await client
      .from('profiles')
      .select(PROFILE_SELECT)
      .eq('id', auth.profileId)
      .maybeSingle();

    // Older DBs may lack gallery_videos — retry without it.
    if (error && /column|does not exist/i.test(String(error.message || ''))) {
      const retry = await client
        .from('profiles')
        .select(
          'id, name, gender, age, dob, nationality, country_code, spoken_languages, bio, extended_bio, location_city, zodiac, interests, tags, avatar_url, gallery, intro_video_url, is_verified, online_status, role, hourly_coin_rate, created_at, coin_balance, earnings_coins, email, auth_id'
        )
        .eq('id', auth.profileId)
        .maybeSingle();
      data = retry.data as typeof data;
      error = retry.error;
    }

    if (error) {
      console.error('[next /api/v1/users/me]', error.message);
      return jsonErr(500, 'Failed to load profile', 'LOAD_FAILED');
    }
    if (!data) return jsonErr(404, 'Profile not found', 'NOT_FOUND');

    return jsonOk({
      success: true,
      data: { user: mapMeProfile(data as Record<string, any>) },
      runtime: 'next-native',
    });
  } catch (err: any) {
    console.error('[next /api/v1/users/me]', err);
    return jsonErr(500, err?.message || 'Failed to load profile', 'LOAD_FAILED');
  }
}
