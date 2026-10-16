import { NextRequest } from 'next/server';
import { createServiceClient, jsonErr, jsonOk, requireAuth } from '../../../../lib/nextAuth';
import { parseJsonBody } from '../../../../lib/nextRequest';
import { enforceRateLimit } from '../../../../lib/nextRateLimit';
import { mapProfileRow } from '../../../../lib/authHelpers';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * POST /api/auth/complete-onboarding
 * Authoritative registration finish — always sets is_onboarded=true in Postgres.
 */
export async function POST(req: NextRequest) {
  const limited = await enforceRateLimit(req, 'authStrict');
  if (limited) return limited;

  const auth = await requireAuth(req);
  if (!auth.ok) {
    return jsonErr(auth.status, auth.error.message, auth.error.code);
  }

  const parsed = await parseJsonBody<Record<string, unknown>>(req, { large: true });
  if (!parsed.ok) {
    return jsonErr(parsed.status, parsed.error.message, parsed.error.code);
  }

  const body = parsed.data || {};
  const client = createServiceClient();
  if (!client) return jsonErr(503, 'Profiles backend unavailable', 'NO_ADMIN');

  const profileId = auth.profileId;
  const isHost =
    auth.role === 'female_creator' ||
    auth.role === 'female_host' ||
    auth.role === 'team_leader' ||
    auth.role === 'agency_manager';

  const agreedToTerms = body.agreedToTerms === true || body.agreed_to_terms === true;
  const agreedToAdultTerms =
    body.agreedToAdultTerms === true || body.agreed_to_adult_terms === true;
  const agreedToHostTerms =
    body.agreedToHostTerms === true || body.agreed_to_host_terms === true;

  if (!agreedToTerms) {
    return jsonErr(400, 'You must agree to the Platform Terms of Service.', 'TERMS_REQUIRED');
  }
  if (isHost && !agreedToHostTerms) {
    return jsonErr(400, 'You must accept the Host Code of Conduct.', 'HOST_TERMS_REQUIRED');
  }
  if (!isHost && !agreedToAdultTerms) {
    return jsonErr(400, 'You must acknowledge the 18+ Adult & Content Policy.', 'ADULT_TERMS_REQUIRED');
  }

  const age = Number(body.age);
  if (!Number.isFinite(age) || age < 18) {
    return jsonErr(400, 'You must be 18 years or older to use this service.', 'AGE_GATE');
  }

  const payload: Record<string, unknown> = {
    dob: body.dob || null,
    age,
    nationality: body.nationality || null,
    country_code: body.countryCode || body.country_code || null,
    zodiac: body.zodiac || null,
    spoken_languages: Array.isArray(body.spokenLanguages)
      ? body.spokenLanguages
      : Array.isArray(body.spoken_languages)
        ? body.spoken_languages
        : ['English'],
    bio: typeof body.bio === 'string' ? body.bio : '',
    interests: Array.isArray(body.interests) ? body.interests : [],
    interested_in: Array.isArray(body.interestedIn)
      ? body.interestedIn
      : Array.isArray(body.interested_in)
        ? body.interested_in
        : [],
    tags: Array.isArray(body.tags) ? body.tags : [],
    avatar_url: body.avatarUrl || body.avatar_url || null,
    gallery: Array.isArray(body.gallery) ? body.gallery : [],
    intro_video_url: body.introVideoUrl || body.intro_video_url || null,
    agreed_to_terms: true,
    agreed_to_adult_terms: isHost ? Boolean(agreedToAdultTerms) : true,
    agreed_to_host_terms: isHost ? true : Boolean(agreedToHostTerms),
    // Authoritative completion flag — never omit
    is_onboarded: true,
    updated_at: new Date().toISOString(),
  };

  if (isHost && (body.hourlyCoinRate != null || body.hourly_coin_rate != null)) {
    payload.hourly_coin_rate = Number(body.hourlyCoinRate ?? body.hourly_coin_rate) || 10;
  }

  // Prefer profiles.id (= auth.profileId); also try auth_id for legacy rows
  let { data, error } = await client
    .from('profiles')
    .update(payload as any)
    .eq('id', profileId)
    .select('*')
    .maybeSingle();

  const authUserId = auth.authId || auth.userId;
  if ((!data || error) && authUserId && authUserId !== profileId) {
    const retry = await client
      .from('profiles')
      .update(payload as any)
      .eq('auth_id', authUserId)
      .select('*')
      .maybeSingle();
    data = retry.data as typeof data;
    error = retry.error;
  }

  if (error) {
    console.error('[complete-onboarding] update failed:', error.message);
    return jsonErr(500, 'Could not save your profile. Please try again.', 'SAVE_FAILED');
  }
  if (!data) {
    return jsonErr(404, 'Profile not found', 'NOT_FOUND');
  }

  // Hard assert — even if a trigger/default interfered
  if (!(data as any).is_onboarded) {
    const assert = await client
      .from('profiles')
      .update({ is_onboarded: true, updated_at: new Date().toISOString() } as any)
      .eq('id', (data as any).id)
      .select('*')
      .maybeSingle();
    if (assert.data) data = assert.data as typeof data;
  }

  const normalized = mapProfileRow(data as Record<string, unknown>);
  if (!normalized) {
    return jsonErr(500, 'Could not map saved profile', 'MAP_FAILED');
  }

  return jsonOk({
    success: true,
    user: {
      ...normalized,
      isOnboarded: true,
      agreedToTerms: true,
      agreedToAdultTerms: Boolean((data as any).agreed_to_adult_terms),
      agreedToHostTerms: Boolean((data as any).agreed_to_host_terms),
    },
  });
}
