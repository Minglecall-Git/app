import type { UserProfile } from '../types';

const LATCH_PREFIX = 'minglecall_reg_complete_v1:';

function latchKey(userId: string): string {
  return `${LATCH_PREFIX}${userId}`;
}

/** Durable client latch — set only after server confirms onboarding write. */
export function setRegistrationCompleteLatch(userId: string): void {
  if (typeof window === 'undefined' || !userId || userId === 'guest_user') return;
  try {
    window.localStorage.setItem(latchKey(userId), '1');
  } catch {
    /* ignore quota */
  }
}

export function clearRegistrationCompleteLatch(userId: string): void {
  if (typeof window === 'undefined' || !userId) return;
  try {
    window.localStorage.removeItem(latchKey(userId));
  } catch {
    /* ignore */
  }
}

export function hasRegistrationCompleteLatch(userId: string | null | undefined): boolean {
  if (typeof window === 'undefined' || !userId || userId === 'guest_user') return false;
  try {
    return window.localStorage.getItem(latchKey(userId)) === '1';
  } catch {
    return false;
  }
}

/**
 * Whether the user may enter the main app (registration fully finished).
 * Order: explicit isOnboarded → client latch → step-4 policy flags.
 *
 * Note: agreed_to_terms defaults true in DB — do NOT use it alone.
 * Adult/host policy flags default false and are only set on wizard step 4.
 */
export function isRegistrationComplete(
  user: Pick<
    UserProfile,
    | 'id'
    | 'authId'
    | 'isOnboarded'
    | 'agreedToTerms'
    | 'agreedToAdultTerms'
    | 'agreedToHostTerms'
    | 'role'
  > | null | undefined
): boolean {
  if (!user) return false;
  if (user.isOnboarded === true) return true;
  if (hasRegistrationCompleteLatch(user.id) || hasRegistrationCompleteLatch(user.authId)) {
    return true;
  }

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
  if (isRegistrationComplete(user)) {
    if (user.id) setRegistrationCompleteLatch(user.id);
    if (user.authId && user.authId !== user.id) setRegistrationCompleteLatch(user.authId);
    return { ...user, isOnboarded: true };
  }
  return user;
}
