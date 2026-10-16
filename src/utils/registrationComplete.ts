import type { UserProfile } from '../types';

/**
 * Whether the user may enter the main app (registration fully finished).
 * Prefers the persisted isOnboarded flag; also treats a finished step-4 policy
 * acceptance as complete so users are not re-gated if is_onboarded was wiped.
 *
 * Note: agreed_to_terms defaults true in DB — do NOT use it alone.
 * Adult/host policy flags default false and are only set on wizard step 4.
 */
export function isRegistrationComplete(
  user: Pick<
    UserProfile,
    'isOnboarded' | 'agreedToTerms' | 'agreedToAdultTerms' | 'agreedToHostTerms' | 'role'
  > | null | undefined
): boolean {
  if (!user) return false;
  if (user.isOnboarded === true) return true;

  const isHost =
    user.role === 'female_creator' ||
    user.role === 'female_host' ||
    user.role === 'team_leader' ||
    user.role === 'agency_manager';
  if (isHost) return Boolean(user.agreedToHostTerms);
  return Boolean(user.agreedToAdultTerms);
}

/** Normalize login/hydrate profiles that finished terms but lost is_onboarded. */
export function withRegistrationCompleteFlag<T extends UserProfile>(user: T): T {
  if (user.isOnboarded === true) return user;
  if (!isRegistrationComplete(user)) return user;
  return { ...user, isOnboarded: true };
}
