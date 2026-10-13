/**
 * Operational wallet_ledger writers for Financial Module accrual.
 * Close aggregates CALL_DEBIT/GIFT_DEBIT + HOST_EARN / TL_EARN;
 * gifts must set metadata.kind = 'gift' and preferably write GIFT_DEBIT for sender.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { getSupabaseAdmin, isSupabaseAdminConfigured } from '../supabaseAdmin';
import {
  DEFAULT_GIFT_FEMALE_HOST_SHARE_PERCENT,
  DEFAULT_GIFT_TEAM_LEADER_SHARE_PERCENT,
  resolveEconomyGiftShares,
} from '../../shared/finance/economyGift';

export type GiftLedgerKind = 'gift' | 'moment_tip';

export interface GiftEarnLedgerInput {
  /** Idempotency key stored as call_id (pairs with billing_minute=0 unique index). */
  sourceKey: string;
  /** Sender debit (GIFT_DEBIT, negative amount) — required for platform retained invariant. */
  senderUserId?: string | null;
  giftCost?: number;
  senderBalanceAfter?: number;
  hostUserId: string | null;
  hostCoins: number;
  hostBalanceAfter: number;
  tlUserId?: string | null;
  tlCoins?: number;
  tlBalanceAfter?: number;
  kind: GiftLedgerKind;
  metadata?: Record<string, unknown>;
  client?: SupabaseClient | null;
}

function sanitizeSourceKey(key: string): string {
  return String(key || '')
    .trim()
    .slice(0, 180)
    .replace(/\s+/g, '_');
}

/**
 * Insert GIFT_DEBIT (sender) + HOST_EARN / TL_EARN for a gift or tip.
 * Uses synthetic call_id = sourceKey + billing_minute 0 for unique index idempotency.
 */
export async function appendGiftEarnLedger(
  input: GiftEarnLedgerInput
): Promise<{ success: boolean; duplicate?: boolean; error?: string }> {
  if (!input.client && !isSupabaseAdminConfigured()) {
    return { success: false, error: 'Supabase admin not configured' };
  }
  const client = input.client ?? getSupabaseAdmin();
  if (!client) return { success: false, error: 'Supabase admin client unavailable' };

  const sourceKey = sanitizeSourceKey(input.sourceKey);
  if (!sourceKey) return { success: false, error: 'sourceKey required' };

  const baseMeta = {
    kind: 'gift',
    source: input.kind,
    ...(input.metadata || {}),
  };

  const rows: Array<Record<string, unknown>> = [];
  const giftCost = Math.max(0, Math.round(Number(input.giftCost) || 0));
  const hostCoins = Math.max(0, Math.round(Number(input.hostCoins) || 0));
  const tlCoins = Math.max(0, Math.round(Number(input.tlCoins) || 0));

  if (input.senderUserId && giftCost > 0) {
    rows.push({
      user_id: input.senderUserId,
      call_id: sourceKey,
      transaction_type: 'GIFT_DEBIT',
      amount: -giftCost,
      balance_after: Math.max(0, Number(input.senderBalanceAfter) || 0),
      billing_minute: 0,
      metadata: { ...baseMeta, side: 'sender' },
    });
  }

  if (input.hostUserId && hostCoins > 0) {
    rows.push({
      user_id: input.hostUserId,
      call_id: sourceKey,
      transaction_type: 'HOST_EARN',
      amount: hostCoins,
      balance_after: Math.max(0, Number(input.hostBalanceAfter) || 0),
      billing_minute: 0,
      metadata: { ...baseMeta, side: 'host' },
    });
  }
  if (input.tlUserId && tlCoins > 0) {
    rows.push({
      user_id: input.tlUserId,
      call_id: sourceKey,
      transaction_type: 'TL_EARN',
      amount: tlCoins,
      balance_after: Math.max(0, Number(input.tlBalanceAfter) || 0),
      billing_minute: 0,
      metadata: { ...baseMeta, side: 'team_leader' },
    });
  }

  if (!rows.length) return { success: true };

  const { error } = await client.from('wallet_ledger').insert(rows);
  if (error) {
    const msg = String(error.message || '');
    // Unique violation → already posted (idempotent)
    if (error.code === '23505' || /duplicate|unique/i.test(msg)) {
      return { success: true, duplicate: true };
    }
    return { success: false, error: msg };
  }
  return { success: true };
}

export async function loadGiftSharePercents(client?: SupabaseClient | null): Promise<{
  host: number;
  tl: number;
}> {
  try {
    const c = client ?? getSupabaseAdmin();
    if (!c) {
      return {
        host: DEFAULT_GIFT_FEMALE_HOST_SHARE_PERCENT,
        tl: DEFAULT_GIFT_TEAM_LEADER_SHARE_PERCENT,
      };
    }
    const { data } = await c
      .from('system_configs')
      .select('gift_female_host_share_percent, gift_team_leader_share_percent')
      .eq('id', 'default')
      .maybeSingle();
    const shares = resolveEconomyGiftShares(data || {});
    return {
      host: shares.giftFemaleHostSharePercent,
      tl: shares.giftTeamLeaderSharePercent,
    };
  } catch {
    return {
      host: DEFAULT_GIFT_FEMALE_HOST_SHARE_PERCENT,
      tl: DEFAULT_GIFT_TEAM_LEADER_SHARE_PERCENT,
    };
  }
}

/** Resolve gift catalog entry by id from system_configs.virtual_gifts_json (fallback provided). */
export async function resolveCatalogGiftById(
  giftId: string,
  fallbackCatalog: Array<{ id: string; coinCost: number; isActive?: boolean; name?: string }>,
  client?: SupabaseClient | null
): Promise<{ id: string; coinCost: number; name?: string } | null> {
  const id = String(giftId || '').trim();
  if (!id) return null;

  const pick = (
    list: Array<{ id: string; coinCost: number; isActive?: boolean; name?: string }>
  ) => {
    const g = list.find((x) => x.id === id && x.isActive !== false);
    if (!g) return null;
    const cost = Number(g.coinCost);
    if (!Number.isFinite(cost) || cost <= 0) return null;
    return { id: g.id, coinCost: Math.round(cost), name: g.name };
  };

  try {
    const c = client ?? getSupabaseAdmin();
    if (c) {
      const { data } = await c
        .from('system_configs')
        .select('virtual_gifts_json')
        .eq('id', 'default')
        .maybeSingle();
      const raw = data?.virtual_gifts_json;
      if (raw) {
        const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
        if (Array.isArray(parsed)) {
          const fromDb = pick(parsed);
          if (fromDb) return fromDb;
        }
      }
    }
  } catch (err: any) {
    console.warn('[resolveCatalogGiftById]', err?.message || err);
  }

  return pick(fallbackCatalog);
}
