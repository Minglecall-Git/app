/**
 * Accrual query helpers — aggregate wallet_ledger earnings for a settlement window.
 * Window is half-open: [periodStart, periodEnd).
 *
 * Notes:
 * - Operational coin movements live in wallet_ledger (HOST_EARN / TL_EARN).
 * - Gifts are included when posted as HOST_EARN/TL_EARN (metadata.kind = 'gift').
 * - Sender gift/tip burns post as GIFT_DEBIT (negative) so platform retained includes gift margin.
 * - Reward types are excluded from settlement salary accrual by default.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { getSupabaseAdmin, isSupabaseAdminConfigured } from '../supabaseAdmin';
import { toIso } from '../../shared/finance/periodBounds';

export type AccrualLedgerType =
  | 'HOST_EARN'
  | 'TL_EARN'
  | 'CALL_DEBIT'
  | 'GIFT_DEBIT'
  | 'TARGET_SHARE_TRUEUP';

export interface UserAccrualTotals {
  userId: string;
  hostEarnCoins: number;
  tlEarnCoins: number;
  /** HOST_EARN rows tagged metadata.kind === 'gift' (best-effort). */
  giftHostEarnCoins: number;
  /** TL_EARN rows tagged metadata.kind === 'gift' (best-effort). */
  giftTlEarnCoins: number;
  /** hostEarnCoins - giftHostEarnCoins (non-negative). */
  callHostEarnCoins: number;
  /** tlEarnCoins - giftTlEarnCoins (non-negative). */
  callTlEarnCoins: number;
  /** Period-end TARGET_SHARE_TRUEUP credits (host only). */
  targetShareTrueUpCoins: number;
}

export interface AccrualQueryResult {
  success: boolean;
  byUser: Map<string, UserAccrualTotals>;
  totals: {
    /**
     * Absolute CALL_DEBIT + GIFT_DEBIT coins in window (caller/sender burns).
     * Kept as callDebitCoins for closePeriod compatibility; includes gift debits.
     */
    callDebitCoins: number;
    /** Absolute GIFT_DEBIT only (subset of callDebitCoins). */
    giftDebitCoins: number;
    hostEarnCoins: number;
    tlEarnCoins: number;
    giftHostEarnCoins: number;
    giftTlEarnCoins: number;
    targetShareTrueUpCoins: number;
    /**
     * max(0, debit − HOST_EARN − TARGET_SHARE_TRUEUP − TL_EARN).
     * True-up increases host obligation and decreases platform retained.
     */
    platformRetainedCoins: number;
  };
  error?: string;
}

function emptyUser(userId: string): UserAccrualTotals {
  return {
    userId,
    hostEarnCoins: 0,
    tlEarnCoins: 0,
    giftHostEarnCoins: 0,
    giftTlEarnCoins: 0,
    callHostEarnCoins: 0,
    callTlEarnCoins: 0,
    targetShareTrueUpCoins: 0,
  };
}

function isGiftMetadata(metadata: unknown): boolean {
  if (!metadata || typeof metadata !== 'object') return false;
  const m = metadata as Record<string, unknown>;
  const kind = String(m.kind || m.source || m.category || '').toLowerCase();
  return kind === 'gift' || kind === 'virtual_gift' || m.is_gift === true;
}

/**
 * Aggregate HOST_EARN / TL_EARN / CALL_DEBIT / GIFT_DEBIT from wallet_ledger for [periodStart, periodEnd).
 * Paginates to avoid PostgREST row caps.
 */
export async function aggregateWalletLedgerEarnings(opts: {
  periodStart: Date | string;
  periodEnd: Date | string;
  userIds?: string[];
  client?: SupabaseClient | null;
  pageSize?: number;
}): Promise<AccrualQueryResult> {
  const byUser = new Map<string, UserAccrualTotals>();
  const totals = {
    callDebitCoins: 0,
    giftDebitCoins: 0,
    hostEarnCoins: 0,
    tlEarnCoins: 0,
    giftHostEarnCoins: 0,
    giftTlEarnCoins: 0,
    targetShareTrueUpCoins: 0,
    platformRetainedCoins: 0,
  };

  if (!opts.client && !isSupabaseAdminConfigured()) {
    return { success: false, byUser, totals, error: 'Supabase admin not configured' };
  }
  const client = opts.client ?? getSupabaseAdmin();
  if (!client) {
    return { success: false, byUser, totals, error: 'Supabase admin client unavailable' };
  }

  const startIso =
    typeof opts.periodStart === 'string' ? opts.periodStart : toIso(opts.periodStart);
  const endIso = typeof opts.periodEnd === 'string' ? opts.periodEnd : toIso(opts.periodEnd);
  const pageSize = Math.min(Math.max(opts.pageSize ?? 1000, 100), 5000);
  const includeDebits = opts.userIds == null || opts.userIds.length === 0;

  let offset = 0;
  for (;;) {
    let q = client
      .from('wallet_ledger')
      .select('user_id, transaction_type, amount, metadata, created_at')
      .in(
        'transaction_type',
        includeDebits
          ? ([
              'CALL_DEBIT',
              'GIFT_DEBIT',
              'HOST_EARN',
              'TL_EARN',
              'TARGET_SHARE_TRUEUP',
            ] satisfies AccrualLedgerType[])
          : (['HOST_EARN', 'TL_EARN', 'TARGET_SHARE_TRUEUP'] satisfies AccrualLedgerType[])
      )
      .gte('created_at', startIso)
      .lt('created_at', endIso)
      .order('created_at', { ascending: true })
      .range(offset, offset + pageSize - 1);

    if (opts.userIds && opts.userIds.length > 0) {
      q = q.in('user_id', opts.userIds);
    }

    const { data, error } = await q;
    if (error) {
      return { success: false, byUser, totals, error: error.message };
    }

    const rows = data || [];
    for (const row of rows) {
      const userId = String(row.user_id || '');
      if (!userId) continue;
      const amount = Number(row.amount) || 0;
      if (amount === 0) continue;
      const entry = byUser.get(userId) || emptyUser(userId);
      const gift = isGiftMetadata(row.metadata);

      if (row.transaction_type === 'CALL_DEBIT' || row.transaction_type === 'GIFT_DEBIT') {
        // Debit amounts are negative — use absolute burn.
        const abs = Math.abs(amount);
        totals.callDebitCoins += abs;
        if (row.transaction_type === 'GIFT_DEBIT') {
          totals.giftDebitCoins += abs;
        }
      } else if (row.transaction_type === 'HOST_EARN') {
        entry.hostEarnCoins += amount;
        totals.hostEarnCoins += amount;
        if (gift) {
          entry.giftHostEarnCoins += amount;
          totals.giftHostEarnCoins += amount;
        }
        entry.callHostEarnCoins = Math.max(0, entry.hostEarnCoins - entry.giftHostEarnCoins);
        entry.callTlEarnCoins = Math.max(0, entry.tlEarnCoins - entry.giftTlEarnCoins);
        byUser.set(userId, entry);
      } else if (row.transaction_type === 'TARGET_SHARE_TRUEUP') {
        entry.targetShareTrueUpCoins += Math.max(0, amount);
        totals.targetShareTrueUpCoins += Math.max(0, amount);
        byUser.set(userId, entry);
      } else if (row.transaction_type === 'TL_EARN') {
        entry.tlEarnCoins += amount;
        totals.tlEarnCoins += amount;
        if (gift) {
          entry.giftTlEarnCoins += amount;
          totals.giftTlEarnCoins += amount;
        }
        entry.callHostEarnCoins = Math.max(0, entry.hostEarnCoins - entry.giftHostEarnCoins);
        entry.callTlEarnCoins = Math.max(0, entry.tlEarnCoins - entry.giftTlEarnCoins);
        byUser.set(userId, entry);
      }
    }

    if (rows.length < pageSize) break;
    offset += pageSize;
  }

  totals.platformRetainedCoins = Math.max(
    0,
    totals.callDebitCoins -
      totals.hostEarnCoins -
      totals.targetShareTrueUpCoins -
      totals.tlEarnCoins
  );

  return { success: true, byUser, totals };
}

/** Convenience: totals for a single user in the window. */
export async function getUserPeriodAccrual(
  userId: string,
  periodStart: Date | string,
  periodEnd: Date | string
): Promise<UserAccrualTotals | null> {
  const res = await aggregateWalletLedgerEarnings({
    periodStart,
    periodEnd,
    userIds: [userId],
  });
  if (!res.success) return null;
  return res.byUser.get(userId) || emptyUser(userId);
}
