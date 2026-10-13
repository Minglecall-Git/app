/**
 * Call burn economy helpers — rates & share % from system_configs (no magic numbers in burn path).
 * Defaults match supabase_schema.sql / appDefaults.
 */

import {
  DEFAULT_TARGET_THRESHOLDS,
  type TargetTierThresholds,
} from './targetBonus';

export const DEFAULT_COIN_BURN_RATE_PER_MIN = 120;
export const DEFAULT_COIN_BURN_RATE_FRIEND_PER_MIN = 80;
/** Host base share % used on every live call burn minute (admin-configurable). */
export const DEFAULT_FEMALE_HOST_SHARE_PERCENT = 30;
/**
 * Host target share % — applied at period CLOSE via true-up if bronze+ target met (Phase 3).
 * Not used mid-call; live burns always use base share.
 */
export const DEFAULT_FEMALE_HOST_TARGET_SHARE_PERCENT = 40;
export const DEFAULT_TEAM_LEADER_SHARE_PERCENT = 10;

export interface EconomyBurnRates {
  coinBurnRatePerMin: number;
  coinBurnRateFriendPerMin: number;
  femaleHostSharePercent: number;
  femaleHostTargetSharePercent: number;
  teamLeaderSharePercent: number;
}

export function normalizePositiveInt(raw: unknown, fallback: number): number {
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return Math.round(n);
}

export function normalizeSharePercent(raw: unknown, fallback: number): number {
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0) return fallback;
  return Math.min(100, Math.round(n));
}

/** Map system_configs / settings row → burn economy knobs. */
export function resolveEconomyBurnRates(source?: unknown): EconomyBurnRates {
  const s =
    source && typeof source === 'object' ? (source as Record<string, unknown>) : {};
  return {
    coinBurnRatePerMin: normalizePositiveInt(
      s.coin_burn_rate_per_min ?? s.coinBurnRatePerMin,
      DEFAULT_COIN_BURN_RATE_PER_MIN
    ),
    coinBurnRateFriendPerMin: normalizePositiveInt(
      s.coin_burn_rate_friend_per_min ?? s.coinBurnRateFriendPerMin,
      DEFAULT_COIN_BURN_RATE_FRIEND_PER_MIN
    ),
    femaleHostSharePercent: normalizeSharePercent(
      s.female_host_share_percent ?? s.femaleHostSharePercent,
      DEFAULT_FEMALE_HOST_SHARE_PERCENT
    ),
    femaleHostTargetSharePercent: normalizeSharePercent(
      s.female_host_target_share_percent ?? s.femaleHostTargetSharePercent,
      DEFAULT_FEMALE_HOST_TARGET_SHARE_PERCENT
    ),
    teamLeaderSharePercent: normalizeSharePercent(
      s.team_leader_share_percent ?? s.teamLeaderSharePercent,
      DEFAULT_TEAM_LEADER_SHARE_PERCENT
    ),
  };
}

/**
 * Current-period creator target met = bronze hours AND bronze coins thresholds both satisfied
 * (same gate used at period close for target eligibility).
 */
export function hasMetCreatorPeriodTarget(
  hours: number,
  totalCoins: number,
  thresholds: TargetTierThresholds = DEFAULT_TARGET_THRESHOLDS
): boolean {
  const h = Number(hours) || 0;
  const c = Number(totalCoins) || 0;
  return h >= thresholds.bronzeHours && c >= thresholds.bronzeCoins;
}

/**
 * Host share % for a live call burn minute — always BASE.
 * `targetMet` / `targetSharePercent` are ignored here (kept for call-site compat / metadata).
 * Period-end true-up (Phase 3) uses target share separately when bronze+ is met at close.
 */
export function resolveCallHostSharePercent(opts: {
  targetMet?: boolean;
  baseSharePercent: number;
  targetSharePercent?: number;
}): number {
  void opts.targetMet;
  void opts.targetSharePercent;
  return normalizeSharePercent(opts.baseSharePercent, DEFAULT_FEMALE_HOST_SHARE_PERCENT);
}

export interface CallMinuteSplit {
  coinsBurned: number;
  hostCoins: number;
  tlCoins: number;
  platformCoins: number;
  hostSharePercentApplied: number;
  tlSharePercentApplied: number;
  usedOverride: boolean;
  targetMet: boolean;
}

/**
 * Compute host/TL/platform coins for one billing minute.
 * - Live host % is always the base share passed in (never mid-period target %).
 * - overrideRate: absolute host coins/min when set (>0); TL still from % of burn when TL linked
 * - targetMet is logged through for analytics only
 * - clamp host+TL ≤ burn
 */
export function computeCallMinuteSplit(opts: {
  coinsBurned: number;
  hostSharePercent: number;
  tlSharePercent: number;
  hasTeamLeader: boolean;
  targetMet?: boolean;
  /** Absolute host coins per minute (admin override). */
  coinEarnOverrideRate?: number | null;
}): CallMinuteSplit {
  const burned = Math.max(0, Math.round(Number(opts.coinsBurned) || 0));
  const hostPct = normalizeSharePercent(opts.hostSharePercent, DEFAULT_FEMALE_HOST_SHARE_PERCENT);
  const tlPct = opts.hasTeamLeader
    ? normalizeSharePercent(opts.tlSharePercent, DEFAULT_TEAM_LEADER_SHARE_PERCENT)
    : 0;
  const targetMet = Boolean(opts.targetMet);
  const override = Number(opts.coinEarnOverrideRate);
  const usedOverride = Number.isFinite(override) && override > 0;

  let hostCoins = 0;
  let tlCoins = 0;

  if (burned > 0) {
    if (usedOverride) {
      hostCoins = Math.min(burned, Math.round(override));
    } else {
      hostCoins = Math.round(burned * (hostPct / 100));
    }
    if (opts.hasTeamLeader && tlPct > 0) {
      tlCoins = Math.round(burned * (tlPct / 100));
    }
  }

  // Clamp host + TL ≤ burn (prefer keeping TL, reduce host)
  if (hostCoins + tlCoins > burned) {
    if (tlCoins > burned) {
      tlCoins = burned;
      hostCoins = 0;
    } else {
      hostCoins = burned - tlCoins;
    }
  }

  return {
    coinsBurned: burned,
    hostCoins,
    tlCoins,
    platformCoins: Math.max(0, burned - hostCoins - tlCoins),
    hostSharePercentApplied: usedOverride ? -1 : hostPct,
    tlSharePercentApplied: tlPct,
    usedOverride,
    targetMet,
  };
}

/** Derived display helper (not used for burn). */
export function deriveHostEarnPerMin(burnPerMin: number, hostSharePercent: number): number {
  return Math.round(
    normalizePositiveInt(burnPerMin, DEFAULT_COIN_BURN_RATE_PER_MIN) *
      (normalizeSharePercent(hostSharePercent, DEFAULT_FEMALE_HOST_SHARE_PERCENT) / 100)
  );
}
