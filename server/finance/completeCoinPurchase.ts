/**
 * Single posting path for coin funding — admin manual credit + gateway webhook.
 * Inserts/completes coin_purchases + credits profiles.coin_balance + wallet_ledger PURCHASE.
 *
 * Gateway flow:
 * 1) createCheckoutIntent → pending coin_purchases
 * 2) webhook/success → completeCoinPurchase({ purchaseId, channel: GATEWAY, ... })
 *
 * Phase 4: amount_usd = cash paid (retail). Also snapshots coin_usd_peg_at_purchase,
 * peg_value_usd (= coins × peg), load_margin_usd (= paid − peg value when paid known).
 * Package price is NOT forced to coins×peg.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { getSupabaseAdmin, isSupabaseAdminConfigured } from '../supabaseAdmin';
import { getCoinUsdPeg, coinsToUsd, DEFAULT_COIN_USD_PEG } from '../../shared/finance/fx';

export type CoinPurchaseChannel = 'ADMIN_MANUAL' | 'GATEWAY';
export type CoinPurchaseStatus = 'pending' | 'completed' | 'failed' | 'refunded';

export interface CompleteCoinPurchaseInput {
  userId: string;
  amountCoins: number;
  channel: CoinPurchaseChannel;
  amountUsd?: number | null;
  packageId?: string | null;
  provider?: string | null;
  externalRef?: string | null;
  actorAdminId?: string | null;
  reason?: string | null;
  /** When set, completes an existing pending coin_purchases row (checkout intent). */
  purchaseId?: string | null;
  client?: SupabaseClient | null;
}

export interface CompleteCoinPurchaseResult {
  success: boolean;
  duplicate?: boolean;
  purchaseId?: string;
  walletLedgerId?: string;
  coinBalance?: number;
  error?: string;
  code?: string;
}

export interface CheckoutIntentInput {
  userId: string;
  packageId: string;
  provider?: string | null;
  client?: SupabaseClient | null;
}

export interface CheckoutIntentResult {
  success: boolean;
  purchase?: {
    id: string;
    userId: string;
    channel: 'GATEWAY';
    status: 'pending';
    amountCoins: number;
    amountUsd: number | null;
    pegValueUsd?: number | null;
    loadMarginUsd?: number | null;
    coinUsdPegAtPurchase?: number | null;
    packageId: string;
    paymentProvider: string;
    externalRef: string | null;
    createdAt: string;
  };
  package?: {
    id: string;
    title: string;
    coins: number;
    bonusCoins: number;
    totalCoins: number;
    priceUsd: number;
  };
  /** Opaque token for future PSP session wiring (not a live payment URL). */
  checkoutToken?: string;
  error?: string;
  code?: string;
}

function purchasePegFields(amountCoins: number, amountUsd: number | null | undefined, peg: number) {
  const coinUsdPegAtPurchase = peg > 0 ? peg : DEFAULT_COIN_USD_PEG;
  const pegValueUsd = coinsToUsd(amountCoins, coinUsdPegAtPurchase);
  const paid = amountUsd == null ? null : Number(amountUsd);
  const loadMarginUsd =
    paid != null && Number.isFinite(paid)
      ? Math.round((paid - pegValueUsd) * 1e6) / 1e6
      : null;
  return { coinUsdPegAtPurchase, pegValueUsd, loadMarginUsd };
}

async function loadLiveCoinUsdPeg(client: SupabaseClient): Promise<number> {
  try {
    const { data } = await client
      .from('system_configs')
      .select('coin_usd_peg, female_payout_ratio_usd, coin_to_usd_ratio')
      .eq('id', 'default')
      .maybeSingle();
    return getCoinUsdPeg(data || {});
  } catch {
    return DEFAULT_COIN_USD_PEG;
  }
}

function buildLedgerMetadata(
  input: CompleteCoinPurchaseInput,
  pegFields: { coinUsdPegAtPurchase: number; pegValueUsd: number; loadMarginUsd: number | null }
): Record<string, unknown> {
  return {
    channel: input.channel,
    ...(input.actorAdminId ? { actor_admin_id: input.actorAdminId } : {}),
    ...(input.reason ? { reason: input.reason } : {}),
    ...(input.provider ? { payment_provider: input.provider } : {}),
    ...(input.externalRef ? { external_ref: input.externalRef } : {}),
    ...(input.packageId ? { package_id: input.packageId } : {}),
    ...(input.amountUsd != null && Number.isFinite(Number(input.amountUsd))
      ? { amount_usd: Number(input.amountUsd) }
      : {}),
    coin_usd_peg: pegFields.coinUsdPegAtPurchase,
    peg_value_usd: pegFields.pegValueUsd,
    ...(pegFields.loadMarginUsd != null ? { load_margin_usd: pegFields.loadMarginUsd } : {}),
  };
}

function resolveAdminClient(client?: SupabaseClient | null): SupabaseClient | null {
  if (client) return client;
  if (!isSupabaseAdminConfigured()) return null;
  return getSupabaseAdmin();
}

/**
 * Create a GATEWAY pending purchase from a coin_packages SKU.
 * Does NOT credit balance — webhook / completeCoinPurchase does that.
 */
export async function createCheckoutIntent(
  input: CheckoutIntentInput
): Promise<CheckoutIntentResult> {
  const userId = String(input.userId || '').trim();
  const packageId = String(input.packageId || '').trim();
  if (!userId) return { success: false, error: 'userId required', code: 'INVALID_USER' };
  if (!packageId) return { success: false, error: 'packageId required', code: 'INVALID_PACKAGE' };

  const client = resolveAdminClient(input.client);
  if (!client) return { success: false, error: 'Supabase admin not configured', code: 'NO_ADMIN' };

  const { data: profile, error: profileErr } = await client
    .from('profiles')
    .select('id')
    .eq('id', userId)
    .maybeSingle();
  if (profileErr) return { success: false, error: profileErr.message, code: 'PROFILE_LOAD_FAILED' };
  if (!profile) return { success: false, error: 'User not found', code: 'NOT_FOUND' };

  const { data: pkg, error: pkgErr } = await client
    .from('coin_packages')
    .select('id, title, coins, bonus_coins, price_usd, discount_price_usd')
    .eq('id', packageId)
    .maybeSingle();
  if (pkgErr) return { success: false, error: pkgErr.message, code: 'PACKAGE_LOAD_FAILED' };
  if (!pkg) return { success: false, error: 'Coin package not found', code: 'PACKAGE_NOT_FOUND' };

  const baseCoins = Math.max(0, Math.round(Number(pkg.coins) || 0));
  const bonusCoins = Math.max(0, Math.round(Number(pkg.bonus_coins) || 0));
  const totalCoins = baseCoins + bonusCoins;
  if (totalCoins <= 0) {
    return { success: false, error: 'Package has no coins', code: 'INVALID_PACKAGE' };
  }
  // Effective pay price = discount_price_usd ?? price_usd (NOT coins×peg)
  const listUsd = Number(pkg.price_usd);
  const discountRaw = (pkg as { discount_price_usd?: number | null }).discount_price_usd;
  const discountUsd = discountRaw == null ? NaN : Number(discountRaw);
  const payUsd = Number.isFinite(discountUsd) ? discountUsd : listUsd;
  const amountUsd = Number.isFinite(payUsd) ? payUsd : null;
  const provider = (input.provider ? String(input.provider).trim() : 'stub') || 'stub';
  const peg = await loadLiveCoinUsdPeg(client);
  const pegFields = purchasePegFields(totalCoins, amountUsd, peg);

  const { data: purchaseRow, error: purchaseErr } = await client
    .from('coin_purchases')
    .insert({
      user_id: userId,
      channel: 'GATEWAY',
      status: 'pending',
      amount_coins: totalCoins,
      amount_usd: amountUsd,
      coin_usd_peg_at_purchase: pegFields.coinUsdPegAtPurchase,
      peg_value_usd: pegFields.pegValueUsd,
      load_margin_usd: pegFields.loadMarginUsd,
      package_id: packageId,
      payment_provider: provider,
      external_ref: null,
      reason: `Checkout intent · ${pkg.title || packageId}`,
    })
    .select('*')
    .single();

  if (purchaseErr) {
    return { success: false, error: purchaseErr.message, code: 'INTENT_INSERT_FAILED' };
  }

  const purchaseId = String(purchaseRow.id);
  return {
    success: true,
    purchase: {
      id: purchaseId,
      userId,
      channel: 'GATEWAY',
      status: 'pending',
      amountCoins: totalCoins,
      amountUsd,
      pegValueUsd: pegFields.pegValueUsd,
      loadMarginUsd: pegFields.loadMarginUsd,
      coinUsdPegAtPurchase: pegFields.coinUsdPegAtPurchase,
      packageId,
      paymentProvider: provider,
      externalRef: null,
      createdAt: purchaseRow.created_at,
    },
    package: {
      id: String(pkg.id),
      title: String(pkg.title || packageId),
      coins: baseCoins,
      bonusCoins,
      totalCoins,
      priceUsd: amountUsd ?? 0,
    },
    // Extension point: real PSP would return session URL; token identifies the pending intent.
    checkoutToken: `minglecall_checkout_${purchaseId}`,
  };
}

/**
 * Complete a coin purchase — credits balance and appends immutable PURCHASE ledger row.
 * Gateway callers should pass provider + externalRef for idempotent replays.
 * Pass purchaseId to complete a pending checkout intent (same completer as admin credit).
 */
export async function completeCoinPurchase(
  input: CompleteCoinPurchaseInput
): Promise<CompleteCoinPurchaseResult> {
  const channel = input.channel;
  const existingPurchaseId = input.purchaseId ? String(input.purchaseId).trim() : '';

  if (channel !== 'ADMIN_MANUAL' && channel !== 'GATEWAY') {
    return { success: false, error: 'Invalid channel', code: 'INVALID_CHANNEL' };
  }

  const client = resolveAdminClient(input.client);
  if (!client) return { success: false, error: 'Supabase admin client unavailable', code: 'NO_ADMIN' };

  const provider = input.provider ? String(input.provider).trim() : null;
  const externalRef = input.externalRef ? String(input.externalRef).trim() : null;

  // Gateway idempotency — return existing completed purchase if replayed
  if (channel === 'GATEWAY' && provider && externalRef) {
    const { data: existing } = await client
      .from('coin_purchases')
      .select('id, wallet_ledger_id, user_id, amount_coins')
      .eq('channel', 'GATEWAY')
      .eq('payment_provider', provider)
      .eq('external_ref', externalRef)
      .eq('status', 'completed')
      .maybeSingle();
    if (existing?.id) {
      const { data: profile } = await client
        .from('profiles')
        .select('coin_balance')
        .eq('id', existing.user_id)
        .maybeSingle();
      return {
        success: true,
        duplicate: true,
        purchaseId: existing.id,
        walletLedgerId: existing.wallet_ledger_id ?? undefined,
        coinBalance: Number(profile?.coin_balance) || 0,
      };
    }
  }

  let userId = String(input.userId || '').trim();
  let amountCoins = Math.round(Number(input.amountCoins) || 0);
  let amountUsd = input.amountUsd;
  let packageId = input.packageId ?? null;
  let reason = input.reason ?? null;
  let purchaseId = existingPurchaseId;
  let pendingMode = false;

  if (existingPurchaseId) {
    const { data: pending, error: pendingErr } = await client
      .from('coin_purchases')
      .select('*')
      .eq('id', existingPurchaseId)
      .maybeSingle();
    if (pendingErr) return { success: false, error: pendingErr.message, code: 'PURCHASE_LOAD_FAILED' };
    if (!pending) return { success: false, error: 'Purchase intent not found', code: 'NOT_FOUND' };
    if (pending.status === 'completed' && pending.wallet_ledger_id) {
      const { data: profile } = await client
        .from('profiles')
        .select('coin_balance')
        .eq('id', pending.user_id)
        .maybeSingle();
      return {
        success: true,
        duplicate: true,
        purchaseId: pending.id,
        walletLedgerId: pending.wallet_ledger_id,
        coinBalance: Number(profile?.coin_balance) || 0,
      };
    }
    if (pending.status !== 'pending') {
      return {
        success: false,
        error: `Purchase status is ${pending.status}, expected pending`,
        code: 'INVALID_STATUS',
      };
    }
    if (String(pending.channel) !== 'GATEWAY') {
      return {
        success: false,
        error: 'Only GATEWAY pending intents can be completed this way',
        code: 'INVALID_CHANNEL',
      };
    }
    pendingMode = true;
    userId = String(pending.user_id);
    amountCoins = Math.round(Number(pending.amount_coins) || 0);
    amountUsd = pending.amount_usd != null ? Number(pending.amount_usd) : amountUsd;
    packageId = pending.package_id ?? packageId;
    reason = reason || pending.reason || 'Gateway purchase completed';
  }

  if (!userId) return { success: false, error: 'userId required', code: 'INVALID_USER' };
  if (!Number.isFinite(amountCoins) || amountCoins <= 0) {
    return { success: false, error: 'amountCoins must be a positive integer', code: 'INVALID_AMOUNT' };
  }

  const { data: profile, error: profileErr } = await client
    .from('profiles')
    .select('id, coin_balance')
    .eq('id', userId)
    .maybeSingle();
  if (profileErr) return { success: false, error: profileErr.message, code: 'PROFILE_LOAD_FAILED' };
  if (!profile) return { success: false, error: 'User not found', code: 'NOT_FOUND' };

  const peg = await loadLiveCoinUsdPeg(client);
  const pegFields = purchasePegFields(amountCoins, amountUsd, peg);

  const nowIso = new Date().toISOString();
  const ledgerMeta = buildLedgerMetadata(
    {
      ...input,
      userId,
      amountCoins,
      amountUsd,
      packageId,
      reason,
      provider: provider || input.provider,
      externalRef: externalRef || input.externalRef,
    },
    pegFields
  );

  const pegColumnPayload = {
    coin_usd_peg_at_purchase: pegFields.coinUsdPegAtPurchase,
    peg_value_usd: pegFields.pegValueUsd,
    load_margin_usd: pegFields.loadMarginUsd,
  };

  if (!pendingMode) {
    const { data: purchaseRow, error: purchaseErr } = await client
      .from('coin_purchases')
      .insert({
        user_id: userId,
        channel,
        status: 'pending',
        amount_coins: amountCoins,
        amount_usd: amountUsd != null ? Number(amountUsd) : null,
        ...pegColumnPayload,
        package_id: packageId,
        payment_provider: provider,
        external_ref: externalRef,
        actor_admin_id: input.actorAdminId ?? null,
        reason: reason,
      })
      .select('id')
      .single();

    if (purchaseErr) {
      if (purchaseErr.code === '23505') {
        return { success: false, error: 'Duplicate gateway purchase reference', code: 'DUPLICATE' };
      }
      return { success: false, error: purchaseErr.message, code: 'PURCHASE_INSERT_FAILED' };
    }
    purchaseId = String(purchaseRow.id);
  }

  const idempotencyKey =
    (externalRef && provider ? `purchase:${provider}:${externalRef}` : null) ||
    `purchase:${purchaseId}`;

  const { data: rpcRaw, error: rpcErr } = await client.rpc('complete_coin_purchase_atomic', {
    p_user_id: userId,
    p_amount_coins: amountCoins,
    p_idempotency_key: idempotencyKey,
    p_purchase_id: purchaseId,
    p_metadata: ledgerMeta,
  });

  if (rpcErr) {
    if (!pendingMode && purchaseId) {
      await client.from('coin_purchases').update({ status: 'failed' }).eq('id', purchaseId);
    }
    return { success: false, error: rpcErr.message, code: 'PURCHASE_RPC_FAILED' };
  }

  const rpcResult = typeof rpcRaw === 'string' ? JSON.parse(rpcRaw) : rpcRaw;
  if (!rpcResult?.success) {
    if (!pendingMode && purchaseId) {
      await client.from('coin_purchases').update({ status: 'failed' }).eq('id', purchaseId);
    }
    return {
      success: false,
      error: rpcResult?.error_message || 'Purchase credit failed',
      code: rpcResult?.error_code || 'PURCHASE_FAILED',
    };
  }

  const walletLedgerId = rpcResult.wallet_ledger_id
    ? String(rpcResult.wallet_ledger_id)
    : undefined;
  const newBalance = Number(rpcResult.coin_balance) || 0;

  await client
    .from('coin_purchases')
    .update({
      status: 'completed',
      wallet_ledger_id: walletLedgerId || null,
      completed_at: nowIso,
      payment_provider: provider || undefined,
      external_ref: externalRef || undefined,
      reason: reason || undefined,
      amount_usd: amountUsd != null ? Number(amountUsd) : undefined,
      ...pegColumnPayload,
    })
    .eq('id', purchaseId!);

  return {
    success: true,
    purchaseId,
    walletLedgerId,
    coinBalance: newBalance,
    duplicate: Boolean(rpcResult.duplicate),
  };
}

/** Mark a pending purchase failed (PSP failure / cancel). Does not touch balances. */
export async function failCheckoutIntent(opts: {
  purchaseId: string;
  reason?: string;
  provider?: string | null;
  externalRef?: string | null;
  client?: SupabaseClient | null;
}): Promise<{ success: boolean; error?: string; code?: string }> {
  const client = resolveAdminClient(opts.client);
  if (!client) return { success: false, error: 'Supabase admin unavailable', code: 'NO_ADMIN' };
  const id = String(opts.purchaseId || '').trim();
  if (!id) return { success: false, error: 'purchaseId required', code: 'INVALID_ID' };

  const { data: row, error } = await client.from('coin_purchases').select('*').eq('id', id).maybeSingle();
  if (error) return { success: false, error: error.message, code: 'PURCHASE_LOAD_FAILED' };
  if (!row) return { success: false, error: 'Purchase not found', code: 'NOT_FOUND' };
  if (row.status === 'completed') {
    return { success: false, error: 'Cannot fail a completed purchase', code: 'ALREADY_COMPLETED' };
  }
  if (row.status === 'failed') return { success: true };

  const { error: updErr } = await client
    .from('coin_purchases')
    .update({
      status: 'failed',
      reason: opts.reason || row.reason || 'Payment failed',
      payment_provider: opts.provider || row.payment_provider,
      external_ref: opts.externalRef || row.external_ref,
    })
    .eq('id', id)
    .eq('status', 'pending');
  if (updErr) return { success: false, error: updErr.message, code: 'UPDATE_FAILED' };
  return { success: true };
}
