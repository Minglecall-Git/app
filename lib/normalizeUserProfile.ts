import type { UserProfile } from '../src/types';

/** Normalize db / API profiles into standardized camelCase UserProfile (shared native + Express runtime). */
export function normalizeUserProfile(p: any): UserProfile {
  return {
    id: p.id,
    authId: p.authId || p.auth_id || p.id,
    name: p.name || 'Member',
    email: p.email || '',
    phone: p.phone || undefined,
    gender: p.gender || 'female',
    genderLocked: p.genderLocked ?? p.gender_locked ?? true,
    age: Number(p.age) || 24,
    dob: p.dob || '2000-01-01',
    nationality: p.nationality || 'United States',
    countryCode: (p.countryCode || p.country_code || 'US').toUpperCase(),
    spokenLanguages: Array.isArray(p.spokenLanguages)
      ? p.spokenLanguages
      : Array.isArray(p.spoken_languages)
        ? p.spoken_languages
        : ['English'],
    bio: p.bio || '',
    extendedBio: p.extendedBio || p.extended_bio || undefined,
    locationCity: p.locationCity || p.location_city || undefined,
    zodiac: p.zodiac || undefined,
    interests: Array.isArray(p.interests) ? p.interests : [],
    interestedIn: Array.isArray(p.interestedIn)
      ? p.interestedIn
      : Array.isArray(p.interested_in)
        ? p.interested_in
        : [],
    tags: Array.isArray(p.tags) ? p.tags : [],
    avatarUrl:
      p.avatarUrl ||
      p.avatar_url ||
      'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&q=80&w=400',
    gallery: (() => {
      const raw = Array.isArray(p.gallery) ? p.gallery : [];
      return raw.filter((u: any) => u && !String(u).startsWith('__mc_gv1__:'));
    })(),
    galleryVideos: (() => {
      if (Array.isArray(p.galleryVideos) && p.galleryVideos.length) return p.galleryVideos;
      if (Array.isArray(p.gallery_videos) && p.gallery_videos.length) return p.gallery_videos;
      const raw = Array.isArray(p.gallery) ? p.gallery : [];
      const sentinel = raw.find((u: any) => String(u || '').startsWith('__mc_gv1__:'));
      if (!sentinel) return [];
      try {
        const parsed = JSON.parse(String(sentinel).slice('__mc_gv1__:'.length));
        return Array.isArray(parsed) ? parsed : [];
      } catch {
        return [];
      }
    })(),
    introVideoUrl: p.introVideoUrl || p.intro_video_url || undefined,
    verificationVideoUrl: p.verificationVideoUrl || p.verification_video_url || undefined,
    isVerified: Boolean(p.isVerified ?? p.is_verified),
    isOnboarded: p.isOnboarded ?? p.is_onboarded ?? true,
    agreedToTerms: p.agreedToTerms ?? p.agreed_to_terms ?? true,
    agreedToAdultTerms: Boolean(p.agreedToAdultTerms ?? p.agreed_to_adult_terms),
    agreedToHostTerms: Boolean(p.agreedToHostTerms ?? p.agreed_to_host_terms),
    kycStatus: p.kycStatus || p.kyc_status || 'unsubmitted',
    kycDocuments: p.kycDocuments || p.kyc_documents || undefined,
    onlineStatus: p.onlineStatus || p.online_status || 'offline',
    role: p.role || 'female_creator',
    coinBalance: Number(p.coinBalance ?? p.coin_balance ?? 0),
    hourlyCoinRate: Number(p.hourlyCoinRate ?? p.hourly_coin_rate ?? 10),
    earningsCoins: Number(p.earningsCoins ?? p.earnings_coins ?? 0),
    totalLifetimeEarnedUSD: Number(p.totalLifetimeEarnedUSD ?? p.total_lifetime_earned_usd ?? 0),
    allowMockLocation: Boolean(p.allowMockLocation ?? p.allow_mock_location),
    isUsingMockLocation: Boolean(p.isUsingMockLocation ?? p.is_using_mock_location),
    mockLocationCity: p.mockLocationCity || p.mock_location_city || undefined,
    mockLocationCountry: p.mockLocationCountry || p.mock_location_country || undefined,
    totalCallsHosted: Number(p.totalCallsHosted ?? p.total_calls_hosted ?? 0),
    totalCallMinutes: Number(p.totalCallMinutes ?? p.total_call_minutes ?? 0),
    totalGiftsReceivedCount: Number(p.totalGiftsReceivedCount ?? p.total_gifts_received_count ?? 0),
    ratingScore: Number(p.ratingScore ?? p.rating_score ?? 5.0),
    totalReviewsCount: Number(p.totalReviewsCount ?? p.total_reviews_count ?? 0),
    acceptanceRatePercent: Number(p.acceptanceRatePercent ?? p.acceptance_rate_percent ?? 100),
    hasPasswordSet: Boolean(p.hasPasswordSet ?? p.has_password_set ?? p.password_hash ?? p.password),
    teamLeaderId: p.teamLeaderId || p.team_leader_id || p.createdById || p.created_by_id || undefined,
    createdById: p.createdById || p.created_by_id || p.teamLeaderId || p.team_leader_id || undefined,
    agencyName: p.agencyName || p.agency_name || undefined,
    coinEarnOverrideRate:
      p.coinEarnOverrideRate !== undefined && p.coinEarnOverrideRate !== null
        ? Number(p.coinEarnOverrideRate)
        : p.coin_earn_override_rate !== undefined && p.coin_earn_override_rate !== null
          ? Number(p.coin_earn_override_rate)
          : undefined,
    commissionPercent:
      p.commissionPercent !== undefined && p.commissionPercent !== null
        ? Number(p.commissionPercent)
        : p.commission_percent !== undefined && p.commission_percent !== null
          ? Number(p.commission_percent)
          : undefined,
    teamLeaderNote: p.teamLeaderNote || p.team_leader_note || undefined,
    createdAt: p.createdAt || p.created_at || new Date().toISOString(),
  };
}
