/** Profile field / ownership guards for Next.js Route Handlers. */

export type ResolvedProfile = {
  id: string;
  authId?: string | null;
  role: string;
  email?: string | null;
  teamLeaderId?: string | null;
  createdById?: string | null;
  agencyName?: string | null;
};

const PRIVILEGED_PROFILE_KEYS = new Set([
  'coinBalance',
  'coin_balance',
  'earningsCoins',
  'earnings_coins',
  'coinEarnOverrideRate',
  'coin_earn_override_rate',
  'role',
  'password',
  'password_hash',
  'hasPasswordSet',
  'has_password_set',
  'isBanned',
  'is_banned',
  'banReason',
  'ban_reason',
  'bannedUntil',
  'banned_until',
  'bannedById',
  'banned_by_id',
  'bannedByRole',
  'banned_by_role',
  'isVerified',
  'is_verified',
  'kycStatus',
  'kyc_status',
  'totalLifetimeEarnedUSD',
  'total_lifetime_earned_usd',
]);

const PUBLIC_SIGNUP_ROLES = new Set([
  'male_user',
  'female_user',
  'female_creator',
  'female_host',
  'other_user',
]);

export function sanitizePublicSignupRole(role: unknown): string {
  const value = String(role || 'male_user');
  return PUBLIC_SIGNUP_ROLES.has(value) ? value : 'male_user';
}

export function stripPrivilegedProfileFields<T extends Record<string, any>>(body: T): Partial<T> {
  const next: Record<string, any> = { ...body };
  for (const key of PRIVILEGED_PROFILE_KEYS) {
    delete next[key];
  }
  return next as Partial<T>;
}

/** Ownership by profile IDs only — never agencyName string match. */
export function callerOwnsCreator(
  leader: ResolvedProfile,
  creator: { teamLeaderId?: string | null; createdById?: string | null; agencyName?: string | null }
) {
  if (leader.role === 'admin') return true;
  const leaderIds = [leader.id, leader.authId].filter(Boolean);
  if (creator.teamLeaderId && leaderIds.includes(creator.teamLeaderId)) return true;
  if (creator.createdById && leaderIds.includes(creator.createdById)) return true;
  return false;
}

export function ownsCreatorByLeaderId(
  leaderId: string,
  creator: { teamLeaderId?: string | null; createdById?: string | null },
  leaderAuthId?: string | null
) {
  if (!leaderId && !leaderAuthId) return false;
  const ids = [leaderId, leaderAuthId].filter(Boolean) as string[];
  return (
    (Boolean(creator.teamLeaderId) && ids.includes(String(creator.teamLeaderId))) ||
    (Boolean(creator.createdById) && ids.includes(String(creator.createdById)))
  );
}
