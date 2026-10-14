/**
 * Redis call:ledger:{callId} buffering + Postgres flush on call end.
 * Billing ticks accumulate here; burn_call_coins_atomic runs only on flush.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { addCallMinuteTotals } from './handlers/callLogsDb';
import {
  getCallLedger,
  isRedisConfigured,
  saveCallLedger,
  takeCallLedger,
  type CallLedgerDoc,
  type CallLedgerMinute,
} from './redis';

export function pendingLedgerCoins(doc: CallLedgerDoc | null): number {
  if (!doc?.minutes?.length) return 0;
  return doc.minutes.reduce((sum, m) => sum + Math.max(0, Number(m.coinsBurned) || 0), 0);
}

export async function bufferCallLedgerMinute(
  entry: CallLedgerMinute & { callId: string }
): Promise<{ doc: CallLedgerDoc; duplicate: boolean; pendingCoins: number }> {
  if (!isRedisConfigured()) {
    throw new Error('Redis is required for call ledger buffering');
  }
  const existing = (await getCallLedger(entry.callId)) || {
    callId: entry.callId,
    callerId: entry.callerId,
    receiverId: entry.receiverId,
    minutes: [] as CallLedgerMinute[],
    updatedAt: new Date().toISOString(),
  };

  const already = existing.minutes.some((m) => m.billingMinute === entry.billingMinute);
  if (already) {
    return {
      doc: existing,
      duplicate: true,
      pendingCoins: pendingLedgerCoins(existing),
    };
  }

  const minute: CallLedgerMinute = {
    billingMinute: entry.billingMinute,
    coinsBurned: entry.coinsBurned,
    hostCoinsEarned: entry.hostCoinsEarned,
    tlCoinsEarned: entry.tlCoinsEarned,
    tlId: entry.tlId,
    isFriendPair: entry.isFriendPair,
    receiverId: entry.receiverId,
    callerId: entry.callerId,
    receiverRole: entry.receiverRole,
    hostSharePercent: entry.hostSharePercent,
    tlSharePercent: entry.tlSharePercent,
    usedOverride: entry.usedOverride,
    bufferedAt: entry.bufferedAt || new Date().toISOString(),
  };

  const doc: CallLedgerDoc = {
    ...existing,
    callerId: entry.callerId,
    receiverId: entry.receiverId,
    minutes: [...existing.minutes, minute].sort((a, b) => a.billingMinute - b.billingMinute),
    updatedAt: new Date().toISOString(),
  };
  await saveCallLedger(doc);
  return { doc, duplicate: false, pendingCoins: pendingLedgerCoins(doc) };
}

export type FlushCallLedgerResult = {
  success: boolean;
  callId: string;
  flushedMinutes: number;
  coinsSpent: number;
  coinsEarned: number;
  newCallerBalance?: number;
  error?: string;
  code?: string;
  partial?: boolean;
};

/**
 * Take Redis ledger and apply each minute via burn_call_coins_atomic + call_logs totals.
 * Idempotent per billing_minute (RPC + unique ledger index).
 */
export async function flushCallLedger(
  client: SupabaseClient,
  callId: string
): Promise<FlushCallLedgerResult> {
  const id = String(callId || '').trim();
  if (!id) {
    return { success: false, callId: '', flushedMinutes: 0, coinsSpent: 0, coinsEarned: 0, error: 'callId required', code: 'INVALID_INPUT' };
  }

  if (!isRedisConfigured()) {
    return { success: true, callId: id, flushedMinutes: 0, coinsSpent: 0, coinsEarned: 0 };
  }

  let doc: CallLedgerDoc | null = null;
  try {
    doc = await takeCallLedger(id);
  } catch (err: any) {
    return {
      success: false,
      callId: id,
      flushedMinutes: 0,
      coinsSpent: 0,
      coinsEarned: 0,
      error: err?.message || 'Redis take failed',
      code: 'REDIS_UNAVAILABLE',
    };
  }

  if (!doc || !doc.minutes.length) {
    return { success: true, callId: id, flushedMinutes: 0, coinsSpent: 0, coinsEarned: 0 };
  }

  const sorted = [...doc.minutes].sort((a, b) => a.billingMinute - b.billingMinute);
  let flushedMinutes = 0;
  let coinsSpent = 0;
  let coinsEarned = 0;
  let newCallerBalance: number | undefined;
  const remaining: CallLedgerMinute[] = [];

  for (let i = 0; i < sorted.length; i++) {
    const m = sorted[i];
    const metadata = {
      billingMinute: m.billingMinute,
      isFriendPair: m.isFriendPair,
      ratePerMin: m.coinsBurned,
      hostSharePercent: m.hostSharePercent,
      tlSharePercent: m.tlSharePercent,
      usedOverride: m.usedOverride,
      receiverId: m.receiverId,
      receiverRole: m.receiverRole,
      source: 'call-ledger-flush',
      bufferedAt: m.bufferedAt,
    };

    const { data: rpcRaw, error: rpcErr } = await client.rpc('burn_call_coins_atomic', {
      p_caller_id: m.callerId,
      p_receiver_id: m.receiverId,
      p_tl_id: m.tlId,
      p_call_id: id,
      p_billing_minute: m.billingMinute,
      p_coins_burned: m.coinsBurned,
      p_host_coins_earned: m.hostCoinsEarned,
      p_tl_coins_earned: m.tlCoinsEarned,
      p_metadata: metadata,
    });

    if (rpcErr) {
      remaining.push(...sorted.slice(i));
      try {
        await saveCallLedger({
          ...doc,
          minutes: remaining,
          updatedAt: new Date().toISOString(),
        });
      } catch {
        /* keep remaining best-effort */
      }
      return {
        success: false,
        callId: id,
        flushedMinutes,
        coinsSpent,
        coinsEarned,
        newCallerBalance,
        error: rpcErr.message,
        code: 'BILLING_RPC_FAILED',
        partial: flushedMinutes > 0,
      };
    }

    const result = typeof rpcRaw === 'string' ? JSON.parse(rpcRaw) : rpcRaw || {};
    if (!result.success) {
      const code =
        result.code ||
        (String(result.error_message || '').includes('INSUFFICIENT')
          ? 'INSUFFICIENT_BALANCE'
          : 'BURN_FAILED');
      remaining.push(...sorted.slice(i));
      try {
        await saveCallLedger({
          ...doc,
          minutes: remaining,
          updatedAt: new Date().toISOString(),
        });
      } catch {
        /* ignore */
      }
      return {
        success: false,
        callId: id,
        flushedMinutes,
        coinsSpent,
        coinsEarned,
        newCallerBalance: Number(result.new_caller_balance) || newCallerBalance,
        error: result.error_message || 'Burn failed',
        code,
        partial: flushedMinutes > 0,
      };
    }

    const burned = Number(result.coins_burned ?? m.coinsBurned) || m.coinsBurned;
    const hostEarned = Number(result.host_coins_earned ?? m.hostCoinsEarned) || 0;
    newCallerBalance = Number(result.new_caller_balance);
    const isDuplicate = Boolean(result.duplicate);

    if (!isDuplicate) {
      const burnPatch: Record<string, unknown> = {
        burn_rate_per_min: m.coinsBurned,
        was_friend_call: m.isFriendPair,
        team_leader_id: m.tlId || undefined,
        updated_at: new Date().toISOString(),
      };
      Object.keys(burnPatch).forEach((k) => burnPatch[k] === undefined && delete burnPatch[k]);
      await addCallMinuteTotals(
        client,
        id,
        burned,
        hostEarned,
        (m.billingMinute - 1) * 60,
        burnPatch
      );
      coinsSpent += burned;
      coinsEarned += hostEarned;
    }
    flushedMinutes += 1;
  }

  return {
    success: true,
    callId: id,
    flushedMinutes,
    coinsSpent,
    coinsEarned,
    newCallerBalance,
  };
}
