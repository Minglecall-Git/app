/**
 * Append-only financial_ledger writers.
 * Never update amount columns — corrections must use REVERSAL entries (Phase 3+/8).
 */

import { getSupabaseAdmin, isSupabaseAdminConfigured } from '../supabaseAdmin';
import type {
  FinancialCounterpartyRole,
  FinancialLedgerEntry,
  FinancialLedgerEntryType,
} from '../../shared/finance/types';
import { coinsToUsd, normalizeFxRatio } from '../../shared/finance/fx';

export interface AppendLedgerInput {
  periodId?: string | null;
  entryType: FinancialLedgerEntryType;
  userId?: string | null;
  teamLeaderId?: string | null;
  counterpartyRole?: FinancialCounterpartyRole | null;
  amountCoins: number;
  /** If omitted, derived via fxRatio. */
  amountUsd?: number;
  fxRatio: number;
  sourceRefType?: string | null;
  sourceRefId?: string | null;
  metadata?: Record<string, unknown>;
}

function rowToEntry(row: any): FinancialLedgerEntry {
  return {
    id: row.id,
    createdAt: row.created_at,
    periodId: row.period_id ?? null,
    entryType: row.entry_type,
    userId: row.user_id ?? null,
    teamLeaderId: row.team_leader_id ?? null,
    counterpartyRole: row.counterparty_role ?? null,
    amountCoins: Number(row.amount_coins) || 0,
    amountUsd: Number(row.amount_usd) || 0,
    fxRatio: Number(row.fx_ratio) || 0,
    sourceRefType: row.source_ref_type ?? null,
    sourceRefId: row.source_ref_id ?? null,
    metadata: (row.metadata || {}) as Record<string, unknown>,
  };
}

export async function appendFinancialLedgerEntry(
  input: AppendLedgerInput
): Promise<{ success: boolean; entry: FinancialLedgerEntry | null; error?: string }> {
  if (!isSupabaseAdminConfigured()) {
    return { success: false, entry: null, error: 'Supabase admin not configured' };
  }
  const client = getSupabaseAdmin();
  if (!client) {
    return { success: false, entry: null, error: 'Supabase admin client unavailable' };
  }

  const fxRatio = normalizeFxRatio(input.fxRatio);
  const amountCoins = Number(input.amountCoins) || 0;
  const amountUsd =
    input.amountUsd !== undefined && Number.isFinite(Number(input.amountUsd))
      ? Number(input.amountUsd)
      : coinsToUsd(amountCoins, fxRatio);

  const payload = {
    period_id: input.periodId ?? null,
    entry_type: input.entryType,
    user_id: input.userId ?? null,
    team_leader_id: input.teamLeaderId ?? null,
    counterparty_role: input.counterpartyRole ?? null,
    amount_coins: amountCoins,
    amount_usd: amountUsd,
    fx_ratio: fxRatio,
    source_ref_type: input.sourceRefType ?? null,
    source_ref_id: input.sourceRefId ?? null,
    metadata: input.metadata ?? {},
  };

  const { data, error } = await client
    .from('financial_ledger')
    .insert(payload)
    .select('*')
    .maybeSingle();

  if (error) {
    return { success: false, entry: null, error: error.message };
  }
  return { success: true, entry: data ? rowToEntry(data) : null };
}

export async function appendFinancialLedgerEntries(
  inputs: AppendLedgerInput[]
): Promise<{ success: boolean; entries: FinancialLedgerEntry[]; error?: string }> {
  if (!inputs.length) return { success: true, entries: [] };
  if (!isSupabaseAdminConfigured()) {
    return { success: false, entries: [], error: 'Supabase admin not configured' };
  }
  const client = getSupabaseAdmin();
  if (!client) {
    return { success: false, entries: [], error: 'Supabase admin client unavailable' };
  }

  const rows = inputs.map((input) => {
    const fxRatio = normalizeFxRatio(input.fxRatio);
    const amountCoins = Number(input.amountCoins) || 0;
    const amountUsd =
      input.amountUsd !== undefined && Number.isFinite(Number(input.amountUsd))
        ? Number(input.amountUsd)
        : coinsToUsd(amountCoins, fxRatio);
    return {
      period_id: input.periodId ?? null,
      entry_type: input.entryType,
      user_id: input.userId ?? null,
      team_leader_id: input.teamLeaderId ?? null,
      counterparty_role: input.counterpartyRole ?? null,
      amount_coins: amountCoins,
      amount_usd: amountUsd,
      fx_ratio: fxRatio,
      source_ref_type: input.sourceRefType ?? null,
      source_ref_id: input.sourceRefId ?? null,
      metadata: input.metadata ?? {},
    };
  });

  const { data, error } = await client.from('financial_ledger').insert(rows).select('*');
  if (error) {
    return { success: false, entries: [], error: error.message };
  }
  return { success: true, entries: (data || []).map(rowToEntry) };
}

/**
 * Phase 10: append-only money correction. Never UPDATE/DELETE prior ledger rows.
 * Amounts should typically be negative to offset a prior accrual.
 */
export async function appendReversalEntry(opts: {
  periodId?: string | null;
  userId?: string | null;
  teamLeaderId?: string | null;
  counterpartyRole?: FinancialCounterpartyRole | null;
  amountCoins: number;
  amountUsd?: number;
  fxRatio: number;
  reversesEntryId?: string | null;
  reason?: string;
  metadata?: Record<string, unknown>;
}): Promise<{ success: boolean; entry: FinancialLedgerEntry | null; error?: string }> {
  return appendFinancialLedgerEntry({
    periodId: opts.periodId ?? null,
    entryType: 'REVERSAL',
    userId: opts.userId ?? null,
    teamLeaderId: opts.teamLeaderId ?? null,
    counterpartyRole: opts.counterpartyRole ?? null,
    amountCoins: opts.amountCoins,
    amountUsd: opts.amountUsd,
    fxRatio: opts.fxRatio,
    sourceRefType: opts.reversesEntryId ? 'financial_ledger' : 'manual_reversal',
    sourceRefId: opts.reversesEntryId ?? null,
    metadata: {
      reason: opts.reason || 'admin_reversal',
      ...(opts.metadata || {}),
    },
  });
}
