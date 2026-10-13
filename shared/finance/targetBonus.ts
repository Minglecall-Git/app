/**
 * Pure creator target tier / cash-bonus helpers.
 * Thresholds come from system_configs (with safe defaults when missing).
 */

import type { CreatorPerformanceTier } from './types';

export interface TargetTierThresholds {
  bronzeHours: number;
  bronzeCoins: number;
  bronzeBonusUsd: number;
  silverHours: number;
  silverCoins: number;
  silverBonusUsd: number;
  goldHours: number;
  goldCoins: number;
  goldBonusUsd: number;
}

/** Matches supabase_schema.sql / appDefaults defaults. */
export const DEFAULT_TARGET_THRESHOLDS: TargetTierThresholds = {
  bronzeHours: 20,
  bronzeCoins: 5000,
  bronzeBonusUsd: 15,
  silverHours: 40,
  silverCoins: 20000,
  silverBonusUsd: 50,
  goldHours: 60,
  goldCoins: 60000,
  goldBonusUsd: 150,
};

function num(raw: unknown, fallback: number): number {
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

/** Map DB / camelCase config rows into thresholds (safe defaults). */
export function resolveTargetThresholds(raw?: Record<string, unknown> | null): TargetTierThresholds {
  const r = raw || {};
  return {
    bronzeHours: num(r.creator_target_bronze_hours ?? r.creatorTargetBronzeHours, DEFAULT_TARGET_THRESHOLDS.bronzeHours),
    bronzeCoins: num(r.creator_target_bronze_coins ?? r.creatorTargetBronzeCoins, DEFAULT_TARGET_THRESHOLDS.bronzeCoins),
    bronzeBonusUsd: num(r.creator_target_bronze_bonus_usd ?? r.creatorTargetBronzeBonusUSD, DEFAULT_TARGET_THRESHOLDS.bronzeBonusUsd),
    silverHours: num(r.creator_target_silver_hours ?? r.creatorTargetSilverHours, DEFAULT_TARGET_THRESHOLDS.silverHours),
    silverCoins: num(r.creator_target_silver_coins ?? r.creatorTargetSilverCoins, DEFAULT_TARGET_THRESHOLDS.silverCoins),
    silverBonusUsd: num(r.creator_target_silver_bonus_usd ?? r.creatorTargetSilverBonusUSD, DEFAULT_TARGET_THRESHOLDS.silverBonusUsd),
    goldHours: num(r.creator_target_gold_hours ?? r.creatorTargetGoldHours, DEFAULT_TARGET_THRESHOLDS.goldHours),
    goldCoins: num(r.creator_target_gold_coins ?? r.creatorTargetGoldCoins, DEFAULT_TARGET_THRESHOLDS.goldCoins),
    goldBonusUsd: num(r.creator_target_gold_bonus_usd ?? r.creatorTargetGoldBonusUSD, DEFAULT_TARGET_THRESHOLDS.goldBonusUsd),
  };
}

/**
 * Highest tier whose hours AND coins thresholds are both met.
 * Gold > silver > bronze.
 */
export function computePerformanceTier(
  hours: number,
  totalCoins: number,
  thresholds: TargetTierThresholds = DEFAULT_TARGET_THRESHOLDS
): CreatorPerformanceTier {
  const h = Number(hours) || 0;
  const c = Number(totalCoins) || 0;
  if (h >= thresholds.goldHours && c >= thresholds.goldCoins) return 'gold';
  if (h >= thresholds.silverHours && c >= thresholds.silverCoins) return 'silver';
  return 'bronze';
}

/** Cash bonus USD for a achieved tier (bronze bonus is informational; gold/silver used at settlement). */
export function targetBonusUsdForTier(
  tier: CreatorPerformanceTier,
  thresholds: TargetTierThresholds = DEFAULT_TARGET_THRESHOLDS
): number {
  if (tier === 'gold') return thresholds.goldBonusUsd;
  if (tier === 'silver') return thresholds.silverBonusUsd;
  return thresholds.bronzeBonusUsd;
}
