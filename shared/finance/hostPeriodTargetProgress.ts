/**
 * Host period bronze-target progress — same gate as live burn metadata + period close.
 * Pure helper (no I/O). True-up posting is Phase 3; preview estimate is read-only.
 */

import {
  hasMetCreatorPeriodTarget,
  resolveEconomyBurnRates,
  DEFAULT_FEMALE_HOST_SHARE_PERCENT,
  DEFAULT_FEMALE_HOST_TARGET_SHARE_PERCENT,
  type EconomyBurnRates,
} from './economyBurn';
import {
  resolveTargetThresholds,
  type TargetTierThresholds,
} from './targetBonus';
import {
  computeHostShareTrueUpCoins,
  shouldSkipHostShareTrueUp,
} from './hostShareTrueUp';

export interface HostPeriodTargetProgress {
  creatorId: string;
  /** Period active online hours from creator_metrics. */
  periodHours: number;
  /** Period target coins from creator_metrics (calls+gifts counters). */
  periodCoins: number;
  bronzeHours: number;
  bronzeCoins: number;
  /** 0–100 vs bronze hours threshold. */
  pctHours: number;
  /** 0–100 vs bronze coins threshold. */
  pctCoins: number;
  /** Bronze+ hours AND coins (same as hasMetCreatorPeriodTarget). */
  targetMet: boolean;
  baseSharePercent: number;
  targetSharePercent: number;
  /**
   * Optional read-only estimate of host true-up coins at close.
   * null when burn/earn totals not supplied.
   * 0 when override skip, target not met, or no gap (same rules as close).
   */
  estimatedTrueUpPreview: number | null;
  /** Profile coin_earn_override_rate > 0 at evaluation → skip share true-up (Phase 3 rule). */
  trueUpSkippedDueToOverride: boolean;
}

function pctToward(current: number, target: number): number {
  const t = Math.max(0, Number(target) || 0);
  if (t <= 0) return current > 0 ? 100 : 0;
  return Math.min(100, Math.round(((Number(current) || 0) / t) * 100));
}

function resolveHoursCoins(opts: {
  periodHours?: number;
  periodCoins?: number;
  metrics?: Record<string, unknown> | null;
}): { hours: number; coins: number } {
  const m = opts.metrics || {};
  const hours =
    opts.periodHours != null
      ? Number(opts.periodHours) || 0
      : Number(m.activeOnlineHours ?? m.active_online_hours ?? 0) || 0;
  const fromMetrics =
    Number(m.totalTargetCoins ?? m.total_target_coins) ||
    (Number(m.coinsEarnedFromCalls) || 0) + (Number(m.coinsEarnedFromGifts) || 0);
  const coins =
    opts.periodCoins != null ? Number(opts.periodCoins) || 0 : fromMetrics || 0;
  return { hours, coins };
}

/**
 * Compute bronze-target progress for a host in the current settlement period.
 * Prefer passing creator_metrics hours/coins + system_configs / systemSettings.
 */
export function getHostPeriodTargetProgress(opts: {
  creatorId: string;
  periodHours?: number;
  periodCoins?: number;
  /** creator_metrics row or client CreatorMetrics shape. */
  metrics?: Record<string, unknown> | null;
  /** Creator Ops / finance thresholds (or full systemSettings / system_configs row). */
  thresholds?: TargetTierThresholds | Record<string, unknown> | null;
  /** Economy burn shares (or full systemSettings / system_configs row). */
  burnRates?: Partial<EconomyBurnRates> | Record<string, unknown> | null;
  /** Alias: pass systemSettings once for both thresholds + shares. */
  systemSettings?: Record<string, unknown> | null;
  /** Optional CALL_DEBIT burn sum for this host in period (gifts excluded). */
  periodEligibleCallBurnCoins?: number | null;
  /** Optional HOST_EARN call coins already credited this period. */
  periodHostCallEarnCoinsAlready?: number | null;
  /** Profile override at close — if > 0, true-up skipped. */
  coinEarnOverrideRate?: number | null;
}): HostPeriodTargetProgress {
  const settings = opts.systemSettings || {};
  const { hours: periodHours, coins: periodCoins } = resolveHoursCoins(opts);

  const thresholds = resolveTargetThresholds(
    (opts.thresholds as Record<string, unknown>) || settings
  );
  const burn = resolveEconomyBurnRates(opts.burnRates || settings);

  const targetMet = hasMetCreatorPeriodTarget(periodHours, periodCoins, thresholds);
  const trueUpSkippedDueToOverride = shouldSkipHostShareTrueUp(opts.coinEarnOverrideRate);

  let estimatedTrueUpPreview: number | null = null;
  const burnCoins = opts.periodEligibleCallBurnCoins;
  const already = opts.periodHostCallEarnCoinsAlready;
  if (trueUpSkippedDueToOverride) {
    estimatedTrueUpPreview = 0;
  } else if (burnCoins != null && Number.isFinite(Number(burnCoins))) {
    if (!targetMet) {
      estimatedTrueUpPreview = 0;
    } else {
      estimatedTrueUpPreview = computeHostShareTrueUpCoins({
        periodEligibleCallBurn: Number(burnCoins),
        periodHostCallEarnCoinsAlready: Number(already) || 0,
        targetSharePercent: burn.femaleHostTargetSharePercent,
      });
    }
  }

  return {
    creatorId: opts.creatorId,
    periodHours,
    periodCoins,
    bronzeHours: thresholds.bronzeHours,
    bronzeCoins: thresholds.bronzeCoins,
    pctHours: pctToward(periodHours, thresholds.bronzeHours),
    pctCoins: pctToward(periodCoins, thresholds.bronzeCoins),
    targetMet,
    baseSharePercent: burn.femaleHostSharePercent || DEFAULT_FEMALE_HOST_SHARE_PERCENT,
    targetSharePercent:
      burn.femaleHostTargetSharePercent || DEFAULT_FEMALE_HOST_TARGET_SHARE_PERCENT,
    estimatedTrueUpPreview,
    trueUpSkippedDueToOverride,
  };
}
