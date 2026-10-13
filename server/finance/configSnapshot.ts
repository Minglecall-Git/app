/**
 * Freeze FinanceSystemConfig onto settlement_periods.config_snapshot.
 * Single helper for open-period seed + close-time freeze (Phase 5).
 */

import type { SettlementConfigSnapshot } from '../../shared/finance/types';
import {
  DEFAULT_COIN_BURN_RATE_FRIEND_PER_MIN,
  DEFAULT_COIN_BURN_RATE_PER_MIN,
  DEFAULT_FEMALE_HOST_SHARE_PERCENT,
  DEFAULT_FEMALE_HOST_TARGET_SHARE_PERCENT,
  DEFAULT_TEAM_LEADER_SHARE_PERCENT,
} from '../../shared/finance/economyBurn';
import {
  DEFAULT_GIFT_FEMALE_HOST_SHARE_PERCENT,
  DEFAULT_GIFT_TEAM_LEADER_SHARE_PERCENT,
} from '../../shared/finance/economyGift';
import type { FinanceSystemConfig } from './config';
import { PAYABLE_SOURCE_OF_TRUTH } from './payableModel';

/**
 * Snapshot money rules: peg, burn rates, call shares (base+target), TL, gift shares, targets.
 * Call host defaults are 40/40 — never gift 70%.
 */
export function freezeFinanceConfigSnapshot(
  config: FinanceSystemConfig,
  opts?: { includeFrozenAt?: boolean }
): SettlementConfigSnapshot {
  const burn = config.burn;
  const raw = config.raw || {};
  const num = (v: unknown, fallback: number) => {
    const n = Number(v);
    return Number.isFinite(n) ? n : fallback;
  };

  const snap: SettlementConfigSnapshot = {
    period_close_utc_time: config.periodCloseUtcTime,
    creator_target_cycle: config.creatorTargetCycle,
    coin_usd_peg: config.coinUsdPeg,
    // Legacy mirrors — same peg
    female_payout_ratio_usd: config.coinUsdPeg,
    coin_to_usd_ratio: config.coinUsdPeg,
    // Call burn rates (Phase 2 / 5)
    coin_burn_rate_per_min: num(
      burn?.coinBurnRatePerMin ?? raw.coin_burn_rate_per_min ?? raw.coinBurnRatePerMin,
      DEFAULT_COIN_BURN_RATE_PER_MIN
    ),
    coin_burn_rate_friend_per_min: num(
      burn?.coinBurnRateFriendPerMin ??
        raw.coin_burn_rate_friend_per_min ??
        raw.coinBurnRateFriendPerMin,
      DEFAULT_COIN_BURN_RATE_FRIEND_PER_MIN
    ),
    // Call shares — base + target (NOT gift defaults)
    female_host_share_percent: num(
      burn?.femaleHostSharePercent ??
        raw.female_host_share_percent ??
        raw.femaleHostSharePercent,
      DEFAULT_FEMALE_HOST_SHARE_PERCENT
    ),
    female_host_target_share_percent: num(
      burn?.femaleHostTargetSharePercent ??
        raw.female_host_target_share_percent ??
        raw.femaleHostTargetSharePercent,
      DEFAULT_FEMALE_HOST_TARGET_SHARE_PERCENT
    ),
    team_leader_share_percent: num(
      burn?.teamLeaderSharePercent ??
        raw.team_leader_share_percent ??
        raw.teamLeaderSharePercent,
      DEFAULT_TEAM_LEADER_SHARE_PERCENT
    ),
    // Gift shares (Phase 3) — separate from call
    gift_female_host_share_percent: num(
      raw.gift_female_host_share_percent ?? raw.giftFemaleHostSharePercent,
      DEFAULT_GIFT_FEMALE_HOST_SHARE_PERCENT
    ),
    gift_team_leader_share_percent: num(
      raw.gift_team_leader_share_percent ?? raw.giftTeamLeaderSharePercent,
      DEFAULT_GIFT_TEAM_LEADER_SHARE_PERCENT
    ),
    creator_target_bronze_hours: config.thresholds.bronzeHours,
    creator_target_bronze_coins: config.thresholds.bronzeCoins,
    creator_target_bronze_bonus_usd: config.thresholds.bronzeBonusUsd,
    creator_target_silver_hours: config.thresholds.silverHours,
    creator_target_silver_coins: config.thresholds.silverCoins,
    creator_target_silver_bonus_usd: config.thresholds.silverBonusUsd,
    creator_target_gold_hours: config.thresholds.goldHours,
    creator_target_gold_coins: config.thresholds.goldCoins,
    creator_target_gold_bonus_usd: config.thresholds.goldBonusUsd,
    payable_source_of_truth: PAYABLE_SOURCE_OF_TRUTH,
  };

  if (opts?.includeFrozenAt !== false) {
    snap.frozen_at = new Date().toISOString();
  }

  return snap;
}
