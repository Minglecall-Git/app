/**
 * Settlement period lifecycle helpers.
 *
 * Scheduling rule (locked):
 * - Accrual window is [period_start, period_end) in UTC.
 * - Weekly: Mon 00:00 UTC → next Mon 00:00 UTC.
 * - Monthly: 1st 00:00 UTC → next 1st 00:00 UTC.
 * - close_scheduled_at = UTC calendar date of period_end at system_configs.period_close_utc_time (HH:mm).
 *   When period_close_utc_time is 00:00, close_scheduled_at equals period_end.
 */

import { getSupabaseAdmin, isSupabaseAdminConfigured } from '../supabaseAdmin';
import {
  computeCloseScheduledAt,
  getCurrentPeriodBounds,
  getNextCloseAt as getNextCloseAtPure,
  normalizeCycleType,
  toIso,
  type PeriodBounds,
} from '../../shared/finance/periodBounds';
import type { SettlementCycleType, SettlementPeriod } from '../../shared/finance/types';
import { loadFinanceSystemConfig, type FinanceSystemConfig } from './config';
import { freezeFinanceConfigSnapshot } from './configSnapshot';

export {
  getCurrentPeriodBounds,
  computeCloseScheduledAt,
  normalizeCycleType,
} from '../../shared/finance/periodBounds';
export type { PeriodBounds } from '../../shared/finance/periodBounds';

function rowToPeriod(row: any): SettlementPeriod {
  return {
    id: row.id,
    cycleType: normalizeCycleType(row.cycle_type),
    periodStart: row.period_start,
    periodEnd: row.period_end,
    closeScheduledAt: row.close_scheduled_at,
    closedAt: row.closed_at ?? null,
    status: row.status,
    configSnapshot: row.config_snapshot || {},
    closeError: row.close_error ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function getNextCloseAt(opts?: {
  at?: Date;
  config?: FinanceSystemConfig;
}): Promise<Date> {
  const config = opts?.config ?? (await loadFinanceSystemConfig());
  const at = opts?.at ?? new Date();
  return getNextCloseAtPure(config.creatorTargetCycle, config.periodCloseUtcTime, at);
}

/**
 * Ensure an open settlement_periods row exists for the current cycle window.
 * Idempotent via UNIQUE (cycle_type, period_start).
 */
export async function ensureOpenPeriod(opts?: {
  at?: Date;
  config?: FinanceSystemConfig;
  cycleType?: SettlementCycleType | string;
}): Promise<{
  success: boolean;
  period: SettlementPeriod | null;
  bounds: PeriodBounds;
  created: boolean;
  error?: string;
}> {
  const at = opts?.at ?? new Date();
  const config = opts?.config ?? (await loadFinanceSystemConfig());
  const cycleType = normalizeCycleType(opts?.cycleType ?? config.creatorTargetCycle);
  const bounds = getCurrentPeriodBounds(cycleType, at);
  const closeScheduledAt = computeCloseScheduledAt(bounds.periodEnd, config.periodCloseUtcTime);

  if (!isSupabaseAdminConfigured()) {
    return {
      success: false,
      period: null,
      bounds,
      created: false,
      error: 'Supabase admin not configured',
    };
  }

  const client = getSupabaseAdmin();
  if (!client) {
    return {
      success: false,
      period: null,
      bounds,
      created: false,
      error: 'Supabase admin client unavailable',
    };
  }

  const periodStartIso = toIso(bounds.periodStart);
  const periodEndIso = toIso(bounds.periodEnd);
  const closeIso = toIso(closeScheduledAt);

  const { data: existing, error: selectError } = await client
    .from('settlement_periods')
    .select('*')
    .eq('cycle_type', cycleType)
    .eq('period_start', periodStartIso)
    .maybeSingle();

  if (selectError) {
    return {
      success: false,
      period: null,
      bounds,
      created: false,
      error: selectError.message,
    };
  }

  if (existing) {
    // Keep close_scheduled_at in sync for still-open periods when admin changes HH:mm
    if (existing.status === 'open' && existing.close_scheduled_at !== closeIso) {
      const { data: updated, error: updateError } = await client
        .from('settlement_periods')
        .update({
          close_scheduled_at: closeIso,
          updated_at: new Date().toISOString(),
        })
        .eq('id', existing.id)
        .eq('status', 'open')
        .select('*')
        .maybeSingle();
      if (!updateError && updated) {
        return { success: true, period: rowToPeriod(updated), bounds, created: false };
      }
    }
    return { success: true, period: rowToPeriod(existing), bounds, created: false };
  }

  const insertPayload = {
    cycle_type: cycleType,
    period_start: periodStartIso,
    period_end: periodEndIso,
    close_scheduled_at: closeIso,
    status: 'open',
    // Seed with full economy snapshot (peg, burns, call/gift shares, targets).
    // Close re-freezes with frozen_at.
    config_snapshot: freezeFinanceConfigSnapshot(config, { includeFrozenAt: false }),
  };

  const { data: inserted, error: insertError } = await client
    .from('settlement_periods')
    .insert(insertPayload)
    .select('*')
    .maybeSingle();

  if (insertError) {
    // Race: another writer inserted first
    if (String(insertError.code) === '23505' || /duplicate/i.test(insertError.message)) {
      const { data: raced } = await client
        .from('settlement_periods')
        .select('*')
        .eq('cycle_type', cycleType)
        .eq('period_start', periodStartIso)
        .maybeSingle();
      if (raced) {
        return { success: true, period: rowToPeriod(raced), bounds, created: false };
      }
    }
    return {
      success: false,
      period: null,
      bounds,
      created: false,
      error: insertError.message,
    };
  }

  return {
    success: true,
    period: inserted ? rowToPeriod(inserted) : null,
    bounds,
    created: true,
  };
}
