/**
 * Aggregate per-host CALL burn + call HOST_EARN for share true-up at period close.
 * Eligible burn = CALL_DEBIT matched to this host's call HOST_EARN minutes (gifts excluded).
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { getSupabaseAdmin, isSupabaseAdminConfigured } from '../supabaseAdmin';
import { toIso } from '../../shared/finance/periodBounds';
import {
  computeHostShareTrueUpCoins,
  shouldSkipHostShareTrueUp,
  targetShareTrueUpCallId,
} from '../../shared/finance/hostShareTrueUp';
import {
  hasMetCreatorPeriodTarget,
  resolveEconomyBurnRates,
} from '../../shared/finance/economyBurn';
import type { TargetTierThresholds } from '../../shared/finance/targetBonus';

function isGiftMetadata(metadata: unknown): boolean {
  if (!metadata || typeof metadata !== 'object') return false;
  const m = metadata as Record<string, unknown>;
  const kind = String(m.kind || m.source || m.category || '').toLowerCase();
  return kind === 'gift' || kind === 'virtual_gift' || m.is_gift === true;
}

function callMinuteKey(callId: unknown, billingMinute: unknown): string {
  return `${String(callId || '')}:${Number(billingMinute) || 0}`;
}

export interface HostTrueUpAgg {
  hostId: string;
  periodEligibleCallBurn: number;
  periodHostCallEarn: number;
  /** Already posted TARGET_SHARE_TRUEUP for this period (idempotency). */
  alreadyTrueUpCoins: number;
}

export interface HostTrueUpPlan {
  hostId: string;
  targetMet: boolean;
  skippedOverride: boolean;
  skippedAlreadyPosted: boolean;
  periodEligibleCallBurn: number;
  periodHostCallEarn: number;
  trueUpCoins: number;
  targetSharePercent: number;
  hours: number;
  coins: number;
}

async function paginateWallet(
  client: SupabaseClient,
  types: string[],
  startIso: string,
  endIso: string,
  pageSize: number,
  onRow: (row: Record<string, unknown>) => void
): Promise<string | null> {
  let offset = 0;
  for (;;) {
    const { data, error } = await client
      .from('wallet_ledger')
      .select('user_id, call_id, transaction_type, amount, billing_minute, metadata')
      .in('transaction_type', types)
      .gte('created_at', startIso)
      .lt('created_at', endIso)
      .order('created_at', { ascending: true })
      .range(offset, offset + pageSize - 1);
    if (error) return error.message;
    const rows = data || [];
    for (const row of rows) onRow(row as Record<string, unknown>);
    if (rows.length < pageSize) break;
    offset += pageSize;
  }
  return null;
}

/**
 * Build burn/earn maps for hosts in [periodStart, periodEnd).
 * Pass 1: CALL_DEBIT → burn by call_id:billing_minute
 * Pass 2: HOST_EARN (non-gift) → earn + attributed burn; TARGET_SHARE_TRUEUP → already posted
 */
export async function aggregateHostCallBurnForTrueUp(opts: {
  periodStart: Date | string;
  periodEnd: Date | string;
  periodId: string;
  client?: SupabaseClient | null;
  pageSize?: number;
}): Promise<{
  success: boolean;
  byHost: Map<string, HostTrueUpAgg>;
  error?: string;
}> {
  const byHost = new Map<string, HostTrueUpAgg>();
  if (!opts.client && !isSupabaseAdminConfigured()) {
    return { success: false, byHost, error: 'Supabase admin not configured' };
  }
  const client = opts.client ?? getSupabaseAdmin();
  if (!client) {
    return { success: false, byHost, error: 'Supabase admin client unavailable' };
  }

  const startIso =
    typeof opts.periodStart === 'string' ? opts.periodStart : toIso(opts.periodStart);
  const endIso = typeof opts.periodEnd === 'string' ? opts.periodEnd : toIso(opts.periodEnd);
  const pageSize = Math.min(Math.max(opts.pageSize ?? 1000, 100), 5000);
  const trueUpCallId = targetShareTrueUpCallId(opts.periodId);
  const debitBurnByKey = new Map<string, number>();

  const err1 = await paginateWallet(
    client,
    ['CALL_DEBIT'],
    startIso,
    endIso,
    pageSize,
    (row) => {
      const key = callMinuteKey(row.call_id, row.billing_minute);
      const abs = Math.abs(Number(row.amount) || 0);
      if (abs > 0) debitBurnByKey.set(key, (debitBurnByKey.get(key) || 0) + abs);
    }
  );
  if (err1) return { success: false, byHost, error: err1 };

  const ensure = (hostId: string): HostTrueUpAgg => {
    let e = byHost.get(hostId);
    if (!e) {
      e = {
        hostId,
        periodEligibleCallBurn: 0,
        periodHostCallEarn: 0,
        alreadyTrueUpCoins: 0,
      };
      byHost.set(hostId, e);
    }
    return e;
  };

  const err2 = await paginateWallet(
    client,
    ['HOST_EARN', 'TARGET_SHARE_TRUEUP'],
    startIso,
    endIso,
    pageSize,
    (row) => {
      const userId = String(row.user_id || '');
      if (!userId) return;
      const t = String(row.transaction_type || '');
      const amount = Number(row.amount) || 0;
      const meta = (row.metadata || {}) as Record<string, unknown>;

      if (t === 'TARGET_SHARE_TRUEUP') {
        const periodMatch =
          String(row.call_id || '') === trueUpCallId ||
          String(meta.period_id || '') === opts.periodId;
        if (!periodMatch) return;
        ensure(userId).alreadyTrueUpCoins += Math.max(0, amount);
        return;
      }

      if (t !== 'HOST_EARN') return;
      if (isGiftMetadata(meta)) return;
      const kind = String(meta.kind || '').toLowerCase();
      if (kind === 'target_share_trueup' || kind === 'share_trueup') return;

      const entry = ensure(userId);
      entry.periodHostCallEarn += Math.max(0, amount);

      const key = callMinuteKey(row.call_id, row.billing_minute);
      let burn = debitBurnByKey.get(key) || 0;
      if (burn <= 0) {
        const fromMeta = Number(meta.ratePerMin ?? meta.coinsBurned ?? meta.coins_burned);
        if (Number.isFinite(fromMeta) && fromMeta > 0) burn = Math.round(fromMeta);
      }
      entry.periodEligibleCallBurn += Math.max(0, burn);
    }
  );
  if (err2) return { success: false, byHost, error: err2 };

  return { success: true, byHost };
}

/** Plan true-up coins per host (does not write). Idempotent: already posted → 0. */
export function planHostShareTrueUps(opts: {
  hostIds: string[];
  aggByHost: Map<string, HostTrueUpAgg>;
  metricsByCreator: Map<string, { hours: number; coins: number }>;
  overrideByHost: Map<string, number | null | undefined>;
  thresholds: TargetTierThresholds;
  targetSharePercent: number;
  burnConfig?: unknown;
}): HostTrueUpPlan[] {
  const rates = resolveEconomyBurnRates(opts.burnConfig || {});
  const targetShare =
    opts.targetSharePercent > 0
      ? opts.targetSharePercent
      : rates.femaleHostTargetSharePercent;

  const ids = new Set([
    ...opts.hostIds,
    ...opts.aggByHost.keys(),
    ...opts.metricsByCreator.keys(),
  ]);
  const plans: HostTrueUpPlan[] = [];

  for (const hostId of ids) {
    const metrics = opts.metricsByCreator.get(hostId) || { hours: 0, coins: 0 };
    const agg = opts.aggByHost.get(hostId) || {
      hostId,
      periodEligibleCallBurn: 0,
      periodHostCallEarn: 0,
      alreadyTrueUpCoins: 0,
    };
    const targetMet = hasMetCreatorPeriodTarget(
      metrics.hours,
      metrics.coins,
      opts.thresholds
    );
    const skippedOverride = shouldSkipHostShareTrueUp(opts.overrideByHost.get(hostId));
    const skippedAlreadyPosted = agg.alreadyTrueUpCoins > 0;

    let trueUpCoins = 0;
    if (targetMet && !skippedOverride && !skippedAlreadyPosted) {
      trueUpCoins = computeHostShareTrueUpCoins({
        periodEligibleCallBurn: agg.periodEligibleCallBurn,
        periodHostCallEarnCoinsAlready: agg.periodHostCallEarn,
        targetSharePercent: targetShare,
      });
    }

    plans.push({
      hostId,
      targetMet,
      skippedOverride,
      skippedAlreadyPosted,
      periodEligibleCallBurn: agg.periodEligibleCallBurn,
      periodHostCallEarn: agg.periodHostCallEarn,
      trueUpCoins,
      targetSharePercent: targetShare,
      hours: metrics.hours,
      coins: metrics.coins,
    });
  }

  return plans;
}

/**
 * Credit earnings_coins + insert wallet_ledger TARGET_SHARE_TRUEUP
 * (idempotent via unique call_id + billing_minute + type + user).
 */
export async function postHostShareTrueUpWallet(opts: {
  hostId: string;
  periodId: string;
  trueUpCoins: number;
  metadata?: Record<string, unknown>;
  client?: SupabaseClient | null;
}): Promise<{ success: boolean; posted: boolean; error?: string }> {
  const coins = Math.max(0, Math.round(opts.trueUpCoins));
  if (coins <= 0) return { success: true, posted: false };

  const client = opts.client ?? getSupabaseAdmin();
  if (!client) return { success: false, posted: false, error: 'No supabase client' };

  const callId = targetShareTrueUpCallId(opts.periodId);

  const { data: existing } = await client
    .from('wallet_ledger')
    .select('id')
    .eq('user_id', opts.hostId)
    .eq('transaction_type', 'TARGET_SHARE_TRUEUP')
    .eq('call_id', callId)
    .eq('billing_minute', 0)
    .maybeSingle();
  if (existing?.id) return { success: true, posted: false };

  const { data: profile, error: pErr } = await client
    .from('profiles')
    .select('earnings_coins')
    .eq('id', opts.hostId)
    .maybeSingle();
  if (pErr) return { success: false, posted: false, error: pErr.message };

  const current = Number(profile?.earnings_coins) || 0;
  const next = current + coins;

  const { error: upErr } = await client
    .from('profiles')
    .update({ earnings_coins: next, updated_at: new Date().toISOString() })
    .eq('id', opts.hostId);
  if (upErr) return { success: false, posted: false, error: upErr.message };

  const { error: wErr } = await client.from('wallet_ledger').insert({
    user_id: opts.hostId,
    call_id: callId,
    transaction_type: 'TARGET_SHARE_TRUEUP',
    amount: coins,
    balance_after: next,
    billing_minute: 0,
    metadata: {
      kind: 'target_share_trueup',
      period_id: opts.periodId,
      ...(opts.metadata || {}),
    },
  });

  if (wErr) {
    if (String(wErr.code || '') === '23505' || /duplicate/i.test(String(wErr.message || ''))) {
      return { success: true, posted: false };
    }
    await client
      .from('profiles')
      .update({ earnings_coins: current, updated_at: new Date().toISOString() })
      .eq('id', opts.hostId);
    return { success: false, posted: false, error: wErr.message };
  }

  return { success: true, posted: true };
}
