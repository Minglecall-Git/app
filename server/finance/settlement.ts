/**
 * Settlement batch builders.
 * Pure grouping + optional persist helpers for Phase 3 close orchestrator.
 *
 * Admin pays ONE batch per Team Leader = TL commission + all managed host salaries.
 * Direct hosts (no TL) = separate direct_host batches.
 *
 * Phase 5 Fixed Peg: opts.fxRatio is frozen coin_usd_peg. All salary USD = coins × peg
 * (target bonus prefers explicit USD tier cash).
 */

import { getSupabaseAdmin, isSupabaseAdminConfigured } from '../supabaseAdmin';
import { coinsToUsd } from '../../shared/finance/fx';
import type {
  SettlementBatchKind,
  SettlementLineComponent,
  SettlementPayeeRole,
} from '../../shared/finance/types';

export interface SettlementPayeeAccrual {
  userId: string;
  /** Managed host under this TL, or null/undefined for direct host. */
  teamLeaderId?: string | null;
  role: 'host' | 'team_leader';
  callEarningsCoins?: number;
  giftEarningsCoins?: number;
  targetBonusCoins?: number;
  targetBonusUsd?: number;
  /** Period-end call share true-up (TARGET_SHARE_TRUEUP). TL has none. */
  targetShareTrueUpCoins?: number;
  tlCommissionCoins?: number;
  breakdown?: Record<string, unknown>;
}

export interface BuiltLineItem {
  payeeUserId: string;
  payeeRole: SettlementPayeeRole;
  amountCoins: number;
  amountUsd: number;
  component: SettlementLineComponent;
  breakdown: Record<string, unknown>;
}

export interface BuiltSettlementBatch {
  batchKind: SettlementBatchKind;
  teamLeaderId: string | null;
  payeeUserId: string;
  totalHostSalaryUsd: number;
  totalTlCommissionUsd: number;
  totalDueUsd: number;
  totalHostSalaryCoins: number;
  totalTlCommissionCoins: number;
  currency: string;
  lineItems: BuiltLineItem[];
}

function pushComponent(
  lines: BuiltLineItem[],
  payeeUserId: string,
  payeeRole: SettlementPayeeRole,
  component: SettlementLineComponent,
  coins: number,
  usd: number,
  breakdown: Record<string, unknown> = {}
) {
  if (coins <= 0 && usd <= 0) return;
  lines.push({
    payeeUserId,
    payeeRole,
    amountCoins: Math.max(0, Math.round(coins)),
    amountUsd: Math.max(0, usd),
    component,
    breakdown,
  });
}

/**
 * Pure builder: group accruals into TL bundles + direct-host batches.
 * Does not write to DB.
 */
export function buildSettlementBatches(opts: {
  accruals: SettlementPayeeAccrual[];
  fxRatio: number;
  currency?: string;
}): BuiltSettlementBatch[] {
  const fxRatio = opts.fxRatio;
  const currency = opts.currency || 'USD';
  const hostsByTl = new Map<string, SettlementPayeeAccrual[]>();
  const directHosts: SettlementPayeeAccrual[] = [];
  const tlRows = new Map<string, SettlementPayeeAccrual>();

  for (const a of opts.accruals) {
    if (a.role === 'team_leader') {
      tlRows.set(a.userId, a);
      continue;
    }
    const tlId = a.teamLeaderId ? String(a.teamLeaderId) : '';
    if (tlId) {
      const list = hostsByTl.get(tlId) || [];
      list.push(a);
      hostsByTl.set(tlId, list);
    } else {
      directHosts.push(a);
    }
  }

  // Ensure every TL with commission gets a bundle even if hosts list empty
  for (const tlId of tlRows.keys()) {
    if (!hostsByTl.has(tlId)) hostsByTl.set(tlId, []);
  }

  const batches: BuiltSettlementBatch[] = [];

  for (const [tlId, hosts] of hostsByTl.entries()) {
    const lines: BuiltLineItem[] = [];
    let totalHostSalaryCoins = 0;
    let totalHostSalaryUsd = 0;

    for (const host of hosts) {
      const callCoins = Number(host.callEarningsCoins) || 0;
      const giftCoins = Number(host.giftEarningsCoins) || 0;
      const bonusCoins = Number(host.targetBonusCoins) || 0;
      const trueUpCoins = Number(host.targetShareTrueUpCoins) || 0;
      const bonusUsd =
        host.targetBonusUsd !== undefined && Number.isFinite(Number(host.targetBonusUsd))
          ? Number(host.targetBonusUsd)
          : coinsToUsd(bonusCoins, fxRatio);

      pushComponent(lines, host.userId, 'host', 'call_earnings', callCoins, coinsToUsd(callCoins, fxRatio), {
        ...(host.breakdown || {}),
      });
      pushComponent(lines, host.userId, 'host', 'gift_earnings', giftCoins, coinsToUsd(giftCoins, fxRatio));
      pushComponent(
        lines,
        host.userId,
        'host',
        'target_share_trueup',
        trueUpCoins,
        coinsToUsd(trueUpCoins, fxRatio),
        { kind: 'target_share_trueup' }
      );
      pushComponent(lines, host.userId, 'host', 'target_bonus', bonusCoins, bonusUsd, {
        targetBonusUsd: bonusUsd,
      });

      totalHostSalaryCoins += callCoins + giftCoins + trueUpCoins + bonusCoins;
      totalHostSalaryUsd +=
        coinsToUsd(callCoins, fxRatio) +
        coinsToUsd(giftCoins, fxRatio) +
        coinsToUsd(trueUpCoins, fxRatio) +
        bonusUsd;
    }

    const tlAccrual = tlRows.get(tlId);
    const tlCommissionCoins = Number(tlAccrual?.tlCommissionCoins) || 0;
    const tlCommissionUsd = coinsToUsd(tlCommissionCoins, fxRatio);
    pushComponent(lines, tlId, 'team_leader', 'tl_commission', tlCommissionCoins, tlCommissionUsd, {
      ...(tlAccrual?.breakdown || {}),
    });

    batches.push({
      batchKind: 'team_leader_bundle',
      teamLeaderId: tlId,
      payeeUserId: tlId,
      totalHostSalaryUsd: round4(totalHostSalaryUsd),
      totalTlCommissionUsd: round4(tlCommissionUsd),
      totalDueUsd: round4(totalHostSalaryUsd + tlCommissionUsd),
      totalHostSalaryCoins,
      totalTlCommissionCoins: tlCommissionCoins,
      currency,
      lineItems: lines,
    });
  }

  for (const host of directHosts) {
    const lines: BuiltLineItem[] = [];
    const callCoins = Number(host.callEarningsCoins) || 0;
    const giftCoins = Number(host.giftEarningsCoins) || 0;
    const bonusCoins = Number(host.targetBonusCoins) || 0;
    const trueUpCoins = Number(host.targetShareTrueUpCoins) || 0;
    const bonusUsd =
      host.targetBonusUsd !== undefined && Number.isFinite(Number(host.targetBonusUsd))
        ? Number(host.targetBonusUsd)
        : coinsToUsd(bonusCoins, fxRatio);

    pushComponent(lines, host.userId, 'host', 'call_earnings', callCoins, coinsToUsd(callCoins, fxRatio));
    pushComponent(lines, host.userId, 'host', 'gift_earnings', giftCoins, coinsToUsd(giftCoins, fxRatio));
    pushComponent(
      lines,
      host.userId,
      'host',
      'target_share_trueup',
      trueUpCoins,
      coinsToUsd(trueUpCoins, fxRatio),
      { kind: 'target_share_trueup' }
    );
    pushComponent(lines, host.userId, 'host', 'target_bonus', bonusCoins, bonusUsd);

    const totalCoins = callCoins + giftCoins + trueUpCoins + bonusCoins;
    const totalUsd =
      coinsToUsd(callCoins, fxRatio) +
      coinsToUsd(giftCoins, fxRatio) +
      coinsToUsd(trueUpCoins, fxRatio) +
      bonusUsd;

    batches.push({
      batchKind: 'direct_host',
      teamLeaderId: null,
      payeeUserId: host.userId,
      totalHostSalaryUsd: round4(totalUsd),
      totalTlCommissionUsd: 0,
      totalDueUsd: round4(totalUsd),
      totalHostSalaryCoins: totalCoins,
      totalTlCommissionCoins: 0,
      currency,
      lineItems: lines,
    });
  }

  return batches;
}

function round4(n: number): number {
  return Math.round(n * 10000) / 10000;
}

/**
 * Persist built batches + line items for a period (Phase 3 close will call this).
 * Does not emit settlement_events — caller should use statusTransition helpers.
 */
export async function createSettlementBatchesForPeriod(opts: {
  periodId: string;
  batches: BuiltSettlementBatch[];
}): Promise<{ success: boolean; batchIds: string[]; error?: string }> {
  if (!opts.batches.length) return { success: true, batchIds: [] };
  if (!isSupabaseAdminConfigured()) {
    return { success: false, batchIds: [], error: 'Supabase admin not configured' };
  }
  const client = getSupabaseAdmin();
  if (!client) {
    return { success: false, batchIds: [], error: 'Supabase admin client unavailable' };
  }

  const batchIds: string[] = [];

  for (const batch of opts.batches) {
    const { data: inserted, error } = await client
      .from('settlement_batches')
      .insert({
        period_id: opts.periodId,
        batch_kind: batch.batchKind,
        team_leader_id: batch.teamLeaderId,
        payee_user_id: batch.payeeUserId,
        status: 'pending_admin_pay',
        total_host_salary_usd: batch.totalHostSalaryUsd,
        total_tl_commission_usd: batch.totalTlCommissionUsd,
        total_due_usd: batch.totalDueUsd,
        total_host_salary_coins: batch.totalHostSalaryCoins,
        total_tl_commission_coins: batch.totalTlCommissionCoins,
        currency: batch.currency,
      })
      .select('id')
      .maybeSingle();

    if (error || !inserted?.id) {
      // Unique conflict = already created (idempotent close resume)
      const isUnique =
        String((error as any)?.code) === '23505' || /duplicate|unique/i.test(error?.message || '');
      if (isUnique) {
        let existingId: string | null = null;
        if (batch.batchKind === 'team_leader_bundle' && batch.teamLeaderId) {
          const { data: existing } = await client
            .from('settlement_batches')
            .select('id')
            .eq('period_id', opts.periodId)
            .eq('batch_kind', 'team_leader_bundle')
            .eq('team_leader_id', batch.teamLeaderId)
            .maybeSingle();
          existingId = existing?.id || null;
        } else {
          const { data: existing } = await client
            .from('settlement_batches')
            .select('id')
            .eq('period_id', opts.periodId)
            .eq('batch_kind', 'direct_host')
            .eq('payee_user_id', batch.payeeUserId)
            .maybeSingle();
          existingId = existing?.id || null;
        }
        if (existingId) {
          batchIds.push(existingId);
          continue;
        }
      }
      return {
        success: false,
        batchIds,
        error: error?.message || 'Failed to insert settlement_batches row',
      };
    }

    batchIds.push(inserted.id);

    if (batch.lineItems.length) {
      const lines = batch.lineItems.map((li) => ({
        batch_id: inserted.id,
        payee_user_id: li.payeeUserId,
        payee_role: li.payeeRole,
        amount_coins: li.amountCoins,
        amount_usd: li.amountUsd,
        component: li.component,
        breakdown: li.breakdown,
        host_salary_status: 'pending',
      }));
      const { error: lineError } = await client.from('settlement_line_items').insert(lines);
      if (lineError) {
        // Line unique isn't enforced; duplicate lines on resume are avoided by skipping
        // insert when batch already existed (continue above). Fresh insert failures fail closed.
        return { success: false, batchIds, error: lineError.message };
      }
    }
  }

  return { success: true, batchIds };
}
