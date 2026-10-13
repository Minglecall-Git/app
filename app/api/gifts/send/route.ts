import { NextRequest } from 'next/server';
import { VIRTUAL_GIFTS } from '../../../../src/constants/appDefaults';
import { computeGiftCoinSplit, isGiftEligibleHostRole } from '../../../../shared/finance/economyGift';
import {
  loadGiftSharePercents,
  resolveCatalogGiftById,
} from '../../../../server/finance/walletLedgerWrite';
import { createServiceClient, jsonErr, jsonOk, requireAuth } from '../../../../lib/nextAuth';
import { parseJsonBody } from '../../../../lib/nextRequest';
import { enforceRateLimit } from '../../../../lib/nextRateLimit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** POST /api/gifts/send — gift_spend_atomic RPC (native Next). */
export async function POST(req: NextRequest) {
  try {
    const limited = await enforceRateLimit(req, 'sensitive');
    if (limited) return limited;

    const auth = await requireAuth(req);
    if (!auth.ok) { return jsonErr(auth.status, auth.error.message, auth.error.code); }

    const parsed = await parseJsonBody<{
      receiverId?: string;
      giftId?: string;
      idempotencyKey?: string;
      clientTempId?: string;
      callId?: string;
      hostCoinsEarned?: unknown;
      tlCoinsEarned?: unknown;
      coinCost?: unknown;
      cost?: unknown;
      coins?: unknown;
      amount?: unknown;
    }>(req);
    if (!parsed.ok) { return jsonErr(parsed.status, parsed.error.message, parsed.error.code); }

    const body = parsed.data || {};
    if (
      body.hostCoinsEarned != null ||
      body.tlCoinsEarned != null ||
      body.coinCost != null ||
      body.cost != null ||
      body.coins != null ||
      body.amount != null
    ) {
      return jsonErr(
        400,
        'Client must not supply coin amounts; gift prices are server-derived.',
        'CLIENT_AMOUNTS_FORBIDDEN'
      );
    }

    const senderId = auth.profileId;
    const receiverId = String(body.receiverId || '').trim();
    const giftId = String(body.giftId || '').trim();
    const client = createServiceClient();
    if (!client) return jsonErr(503, 'Billing unavailable', 'NO_SUPABASE');

    const catalogGift = await resolveCatalogGiftById(giftId, VIRTUAL_GIFTS, client);
    const giftCost = Number(catalogGift?.coinCost || 0);
    if (!senderId || !receiverId || !catalogGift || giftCost <= 0) {
      return jsonErr(400, 'Invalid gift.', 'INVALID_GIFT');
    }

    const idempotencyKey = String(body.idempotencyKey || body.clientTempId || '')
      .trim()
      .slice(0, 200);
    if (!idempotencyKey) {
      return jsonErr(400, 'idempotencyKey or clientTempId is required', 'IDEMPOTENCY_REQUIRED');
    }

    const { data: recvRow } = await client
      .from('profiles')
      .select('id, role, team_leader_id, created_by_id, earnings_coins')
      .eq('id', receiverId)
      .maybeSingle();

    const isEligibleHost = recvRow && isGiftEligibleHostRole(recvRow.role);
    const shares = await loadGiftSharePercents(client);
    const tlId = isEligibleHost
      ? String(recvRow?.team_leader_id || recvRow?.created_by_id || '') || null
      : null;
    const split = computeGiftCoinSplit({
      giftCost,
      hostSharePercent: shares.host,
      tlSharePercent: shares.tl,
      hasTeamLeader: Boolean(tlId),
      hostEligible: Boolean(isEligibleHost),
    });

    const { data: rpcRaw, error: rpcErr } = await client.rpc('gift_spend_atomic', {
      p_sender_id: senderId,
      p_receiver_id: receiverId,
      p_tl_id: tlId,
      p_coins: giftCost,
      p_host_coins: split.hostCoins,
      p_tl_coins: split.tlCoins,
      p_idempotency_key: idempotencyKey,
      p_metadata: {
        giftId,
        giftName: catalogGift.name,
        kind: 'gift',
        cost: giftCost,
        ...(String(body.callId || '').trim()
          ? { session_call_id: String(body.callId).trim().slice(0, 200) }
          : {}),
      },
    });

    if (rpcErr) {
      console.error('[next /api/gifts/send] RPC', rpcErr.message);
      return jsonErr(500, 'Gift billing failed', 'GIFT_RPC_FAILED');
    }

    const rpcResult = typeof rpcRaw === 'string' ? JSON.parse(rpcRaw) : rpcRaw;
    if (!rpcResult?.success) {
      const code = rpcResult?.error_code || 'GIFT_FAILED';
      const status = code === 'INSUFFICIENT_BALANCE' ? 400 : 500;
      return jsonErr(status, rpcResult?.error_message || 'Gift failed', code);
    }

    const newSenderBalance = Number(rpcResult.new_sender_balance || 0);
    const hostBalanceAfter = Number(rpcResult.new_host_earnings || 0);
    const hostCoinsEarned = Number(rpcResult.host_coins_earned ?? split.hostCoins) || 0;
    const tlCoinsEarned = Number(rpcResult.tl_coins_earned ?? split.tlCoins) || 0;

    return jsonOk({
      success: true,
      senderBalance: newSenderBalance,
      senderCoinBalance: newSenderBalance,
      hostEarnings: isEligibleHost ? hostBalanceAfter : 0,
      hostCoinsEarned,
      tlCoinsEarned,
      platformCoins: Math.max(0, giftCost - hostCoinsEarned - tlCoinsEarned),
      receiverEarningsDelta: hostCoinsEarned,
      duplicate: Boolean(rpcResult.duplicate),
      giftId,
      cost: giftCost,
      runtime: 'next-native',
    });
  } catch (err: any) {
    console.error('[next /api/gifts/send]', err);
    return jsonErr(500, err?.message || 'Gift send failed', 'INTERNAL_ERROR');
  }
}
