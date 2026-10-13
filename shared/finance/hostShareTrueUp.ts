/**
 * Host target share true-up — period-close math (Phase 3).
 * Live burns use base %; at close, top up to target % of eligible CALL burn (gifts excluded).
 * TL has no true-up.
 */

import { normalizeSharePercent, DEFAULT_FEMALE_HOST_TARGET_SHARE_PERCENT } from './economyBurn';

/**
 * trueUpHostCoins = max(0, round(periodEligibleCallBurn × targetShare%/100) − periodHostCallEarnCoinsAlready)
 */
export function computeHostShareTrueUpCoins(opts: {
  periodEligibleCallBurn: number;
  periodHostCallEarnCoinsAlready: number;
  targetSharePercent: number;
}): number {
  const burn = Math.max(0, Math.round(Number(opts.periodEligibleCallBurn) || 0));
  const already = Math.max(0, Math.round(Number(opts.periodHostCallEarnCoinsAlready) || 0));
  const pct = normalizeSharePercent(
    opts.targetSharePercent,
    DEFAULT_FEMALE_HOST_TARGET_SHARE_PERCENT
  );
  return Math.max(0, Math.round((burn * pct) / 100) - already);
}

/** Skip share true-up when profile has coin_earn_override_rate > 0 at close. */
export function shouldSkipHostShareTrueUp(coinEarnOverrideRate: unknown): boolean {
  const n = Number(coinEarnOverrideRate);
  return Number.isFinite(n) && n > 0;
}

/** wallet_ledger.call_id prefix for period true-up rows (unique with billing_minute=0). */
export function targetShareTrueUpCallId(periodId: string): string {
  return `target_share_trueup:${periodId}`;
}
