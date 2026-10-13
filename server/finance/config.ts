/**
 * Load Financial Module config from system_configs (service role).
 * Cached briefly so hot paths (creator accrual) stay sync-friendly.
 *
 * Phase 1 Fixed Peg: coinUsdPeg is the only FX for host/TL/platform coin→USD.
 * Legacy femalePayoutRatioUsd / coinToUsdRatio mirror peg for backward-compat readers.
 */

import { getSupabaseAdmin, isSupabaseAdminConfigured } from '../supabaseAdmin';
import {
  normalizeCycleType,
  parseUtcCloseTime,
} from '../../shared/finance/periodBounds';
import type { SettlementCycleType } from '../../shared/finance/types';
import {
  DEFAULT_TARGET_THRESHOLDS,
  resolveTargetThresholds,
  type TargetTierThresholds,
} from '../../shared/finance/targetBonus';
import {
  DEFAULT_COIN_USD_PEG,
  getCoinUsdPeg,
  normalizeFxRatio,
} from '../../shared/finance/fx';
import {
  DEFAULT_COIN_BURN_RATE_FRIEND_PER_MIN,
  DEFAULT_COIN_BURN_RATE_PER_MIN,
  DEFAULT_FEMALE_HOST_SHARE_PERCENT,
  DEFAULT_FEMALE_HOST_TARGET_SHARE_PERCENT,
  DEFAULT_TEAM_LEADER_SHARE_PERCENT,
  resolveEconomyBurnRates,
  type EconomyBurnRates,
} from '../../shared/finance/economyBurn';

export interface FinanceSystemConfig {
  creatorTargetCycle: SettlementCycleType;
  periodCloseUtcTime: string;
  settlementEnabled: boolean;
  /** Fixed Peg — USD per coin (canonical). */
  coinUsdPeg: number;
  /**
   * @deprecated Synced to coinUsdPeg. Prefer coinUsdPeg.
   */
  femalePayoutRatioUsd: number;
  /**
   * @deprecated Synced to coinUsdPeg. Prefer coinUsdPeg.
   */
  coinToUsdRatio: number;
  /** Phase 2 call burn economy (from system_configs). */
  burn: EconomyBurnRates;
  thresholds: TargetTierThresholds;
  raw: Record<string, unknown>;
}

/** @deprecated Use DEFAULT_COIN_USD_PEG from shared/finance/fx. */
export const DEFAULT_COIN_TO_USD_RATIO = DEFAULT_COIN_USD_PEG;

const CACHE_TTL_MS = 60_000;

let cached: { value: FinanceSystemConfig; fetchedAt: number } | null = null;

export function defaultFinanceSystemConfig(): FinanceSystemConfig {
  const peg = DEFAULT_COIN_USD_PEG;
  return {
    creatorTargetCycle: 'weekly',
    periodCloseUtcTime: '00:00',
    settlementEnabled: true,
    coinUsdPeg: peg,
    femalePayoutRatioUsd: peg,
    coinToUsdRatio: peg,
    burn: {
      coinBurnRatePerMin: DEFAULT_COIN_BURN_RATE_PER_MIN,
      coinBurnRateFriendPerMin: DEFAULT_COIN_BURN_RATE_FRIEND_PER_MIN,
      femaleHostSharePercent: DEFAULT_FEMALE_HOST_SHARE_PERCENT,
      femaleHostTargetSharePercent: DEFAULT_FEMALE_HOST_TARGET_SHARE_PERCENT,
      teamLeaderSharePercent: DEFAULT_TEAM_LEADER_SHARE_PERCENT,
    },
    thresholds: { ...DEFAULT_TARGET_THRESHOLDS },
    raw: {},
  };
}

function mapRow(row: Record<string, unknown> | null | undefined): FinanceSystemConfig {
  const r = row || {};
  const close = parseUtcCloseTime(r.period_close_utc_time ?? r.periodCloseUtcTime);
  const settlementRaw = r.settlement_enabled ?? r.settlementEnabled;
  const settlementEnabled =
    settlementRaw === undefined || settlementRaw === null
      ? true
      : Boolean(settlementRaw);
  const peg = getCoinUsdPeg(r);
  return {
    creatorTargetCycle: normalizeCycleType(r.creator_target_cycle ?? r.creatorTargetCycle),
    periodCloseUtcTime: close.hhmm,
    settlementEnabled,
    coinUsdPeg: peg,
    femalePayoutRatioUsd: peg,
    coinToUsdRatio: peg,
    burn: resolveEconomyBurnRates(r),
    thresholds: resolveTargetThresholds(r),
    raw: r,
  };
}

/** Sync peek at last cached config (or defaults). Safe for creator accrual. */
export function getCachedFinanceConfig(): FinanceSystemConfig {
  return cached?.value ?? defaultFinanceSystemConfig();
}

/** Force cache clear (e.g. after admin config save). */
export function invalidateFinanceConfigCache(): void {
  cached = null;
}

export async function loadFinanceSystemConfig(opts?: {
  force?: boolean;
}): Promise<FinanceSystemConfig> {
  const now = Date.now();
  if (!opts?.force && cached && now - cached.fetchedAt < CACHE_TTL_MS) {
    return cached.value;
  }

  if (!isSupabaseAdminConfigured()) {
    const fallback = defaultFinanceSystemConfig();
    cached = { value: fallback, fetchedAt: now };
    return fallback;
  }

  try {
    const client = getSupabaseAdmin();
    if (!client) {
      const fallback = defaultFinanceSystemConfig();
      cached = { value: fallback, fetchedAt: now };
      return fallback;
    }
    const { data, error } = await client
      .from('system_configs')
      .select(
        [
          'creator_target_cycle',
          'period_close_utc_time',
          'settlement_enabled',
          'coin_usd_peg',
          'female_payout_ratio_usd',
          'coin_to_usd_ratio',
          'coin_burn_rate_per_min',
          'coin_burn_rate_friend_per_min',
          'female_host_share_percent',
          'female_host_target_share_percent',
          'team_leader_share_percent',
          'gift_female_host_share_percent',
          'gift_team_leader_share_percent',
          'creator_target_bronze_hours',
          'creator_target_bronze_coins',
          'creator_target_bronze_bonus_usd',
          'creator_target_silver_hours',
          'creator_target_silver_coins',
          'creator_target_silver_bonus_usd',
          'creator_target_gold_hours',
          'creator_target_gold_coins',
          'creator_target_gold_bonus_usd',
        ].join(', ')
      )
      .eq('id', 'default')
      .maybeSingle();

    if (error) {
      console.warn('[finance/config] load failed:', error.message);
      const fallback = cached?.value ?? defaultFinanceSystemConfig();
      cached = { value: fallback, fetchedAt: now };
      return fallback;
    }

    const value = mapRow((data || {}) as Record<string, unknown>);
    cached = { value, fetchedAt: now };
    return value;
  } catch (err: any) {
    console.warn('[finance/config] load exception:', err?.message || err);
    const fallback = cached?.value ?? defaultFinanceSystemConfig();
    cached = { value: fallback, fetchedAt: now };
    return fallback;
  }
}

/** Best-effort background refresh for sync paths. */
export function refreshFinanceConfigInBackground(): void {
  void loadFinanceSystemConfig({ force: true });
}

export interface FinanceConfigPatch {
  creatorTargetCycle?: SettlementCycleType | string;
  periodCloseUtcTime?: string;
  settlementEnabled?: boolean;
}

/**
 * Persist Financial Module knobs onto system_configs and refresh cache.
 */
export async function updateFinanceSystemConfig(
  patch: FinanceConfigPatch
): Promise<{ success: boolean; config?: FinanceSystemConfig; error?: string }> {
  if (!isSupabaseAdminConfigured()) {
    return { success: false, error: 'Supabase admin not configured' };
  }
  const client = getSupabaseAdmin();
  if (!client) return { success: false, error: 'Supabase admin client unavailable' };

  const payload: Record<string, unknown> = { updated_at: new Date().toISOString() };

  if (patch.creatorTargetCycle !== undefined) {
    payload.creator_target_cycle = normalizeCycleType(patch.creatorTargetCycle);
  }
  if (patch.periodCloseUtcTime !== undefined) {
    const raw = String(patch.periodCloseUtcTime).trim();
    if (!/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(raw)) {
      return { success: false, error: 'period_close_utc_time must be HH:mm UTC (00:00–23:59)' };
    }
    payload.period_close_utc_time = parseUtcCloseTime(raw).hhmm;
  }
  if (patch.settlementEnabled !== undefined) {
    payload.settlement_enabled = Boolean(patch.settlementEnabled);
  }

  if (Object.keys(payload).length <= 1) {
    return { success: false, error: 'No finance config fields to update' };
  }

  const { error } = await client.from('system_configs').update(payload).eq('id', 'default');
  if (error) return { success: false, error: error.message };

  invalidateFinanceConfigCache();
  const config = await loadFinanceSystemConfig({ force: true });
  return { success: true, config };
}

/** Re-export for callers that only need the peg number. */
export { getCoinUsdPeg, normalizeFxRatio, DEFAULT_COIN_USD_PEG };
