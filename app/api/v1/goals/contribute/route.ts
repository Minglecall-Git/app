import { randomUUID } from 'crypto';
import { NextRequest } from 'next/server';
import { createServiceClient, jsonErr, jsonOk, requireAuth } from '../../../../../lib/nextAuth';
import { parseJsonBody } from '../../../../../lib/nextRequest';
import { enforceRateLimit } from '../../../../../lib/nextRateLimit';
import { loadGiftSharePercents } from '../../../../../server/finance/walletLedgerWrite';
import { computeGiftCoinSplit, isGiftEligibleHostRole } from '../../../../../shared/finance/economyGift';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MAX_GOAL_COINS = 5000;
const ALLOWED_GOAL_AMOUNTS = [10, 20, 50, 100, 200, 500, 1000] as const;

/** POST /api/v1/goals/contribute */
export async function POST(req: NextRequest) {
  try {
    const limited = await enforceRateLimit(req, 'sensitive');
    if (limited) return limited;

    const auth = await requireAuth(req);
    if (!auth.ok) { return jsonErr(auth.status, auth.error.message, auth.error.code); }

    const parsed = await parseJsonBody<{
      creatorId?: string;
      coins?: number;
      idempotencyKey?: string;
      hostCoinsEarned?: unknown;
      tlCoinsEarned?: unknown;
      amount?: unknown;
    }>(req);
    if (!parsed.ok) { return jsonErr(parsed.status, parsed.error.message, parsed.error.code); }

    const client = createServiceClient();
    if (!client) return jsonErr(503, 'Goals backend unavailable', 'NO_ADMIN');

    if (
      parsed.data?.hostCoinsEarned != null ||
      parsed.data?.tlCoinsEarned != null ||
      parsed.data?.amount != null
    ) {
      return jsonErr(
        400,
        'Client must not supply hostCoinsEarned, tlCoinsEarned, or amount aliases',
        'CLIENT_AMOUNTS_FORBIDDEN'
      );
    }

    const creatorId = String(parsed.data?.creatorId || '').trim();
    let coins = Number(parsed.data?.coins);
    if (!creatorId) return jsonErr(400, 'creatorId required', 'INVALID_INPUT');
    if (!Number.isFinite(coins) || coins <= 0) {
      return jsonErr(400, 'coins must be a positive number', 'INVALID_AMOUNT');
    }
    coins = Math.round(coins);
    if (coins > MAX_GOAL_COINS) {
      return jsonErr(400, `Max contribution is ${MAX_GOAL_COINS} coins`, 'AMOUNT_TOO_HIGH');
    }
    if (!(ALLOWED_GOAL_AMOUNTS as readonly number[]).includes(coins)) {
      return jsonErr(400, `coins must be one of: ${ALLOWED_GOAL_AMOUNTS.join(', ')}`, 'INVALID_AMOUNT');
    }
    if (creatorId === auth.profileId) {
      return jsonErr(400, 'Cannot contribute to your own goal', 'SELF_CONTRIBUTE');
    }

    const clientIdem =
      typeof parsed.data?.idempotencyKey === 'string'
        ? String(parsed.data.idempotencyKey).trim().slice(0, 200)
        : '';
    const idempotencyKey = clientIdem || `goal:${creatorId}:${auth.profileId}:${coins}:${randomUUID()}`;

    const { data: creator, error: creatorErr } = await client
      .from('profiles')
      .select('id, role, team_leader_id, created_by_id, name')
      .eq('id', creatorId)
      .maybeSingle();
    if (creatorErr) throw creatorErr;
    if (!creator) return jsonErr(404, 'Creator not found', 'CREATOR_NOT_FOUND');

    if (!isGiftEligibleHostRole(creator.role)) {
      return jsonErr(400, 'Goal contributions only apply to verified host creators', 'HOST_NOT_ELIGIBLE');
    }

    const shares = await loadGiftSharePercents(client);
    const tlId = creator.team_leader_id || creator.created_by_id || null;
    const split = computeGiftCoinSplit({
      giftCost: coins,
      hostSharePercent: shares.host,
      tlSharePercent: shares.tl,
      hasTeamLeader: Boolean(tlId),
      hostEligible: true,
    });

    const { data: rpcRaw, error: rpcErr } = await client.rpc('gift_spend_atomic', {
      p_sender_id: auth.profileId,
      p_receiver_id: creatorId,
      p_tl_id: tlId ? String(tlId) : null,
      p_coins: coins,
      p_host_coins: split.hostCoins,
      p_tl_coins: split.tlCoins,
      p_idempotency_key: idempotencyKey,
      p_metadata: {
        kind: 'goal_contribute',
        creatorId,
        coins,
      },
    });

    if (rpcErr) {
      console.error('[next /api/v1/goals/contribute] RPC:', rpcErr.message);
      return jsonErr(500, 'Goal contribution billing failed', 'GOAL_RPC_FAILED');
    }

    const rpcResult = typeof rpcRaw === 'string' ? JSON.parse(rpcRaw) : rpcRaw;
    if (!rpcResult?.success) {
      const code = rpcResult?.error_code || 'GOAL_FAILED';
      const status = code === 'INSUFFICIENT_BALANCE' ? 400 : 500;
      return jsonErr(status, rpcResult?.error_message || 'Contribution failed', code);
    }

    let goalRow: { title: string; current_coins: number; target_coins: number } | null = null;
    if (!rpcResult.duplicate) {
      const { data: existing } = await client
        .from('creator_goals')
        .select('title, current_coins, target_coins')
        .eq('creator_id', creatorId)
        .maybeSingle();
      const nextCurrent = Number(existing?.current_coins || 0) + coins;
      const title = existing?.title || 'Creator Target Goal';
      const target = Number(existing?.target_coins || 10000);
      const { data: upserted, error: goalErr } = await client
        .from('creator_goals')
        .upsert(
          {
            creator_id: creatorId,
            title,
            current_coins: nextCurrent,
            target_coins: target,
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'creator_id' }
        )
        .select('title, current_coins, target_coins')
        .maybeSingle();
      if (goalErr) {
        console.error('[next /api/v1/goals/contribute] goal upsert:', goalErr.message);
      }
      goalRow = upserted || { title, current_coins: nextCurrent, target_coins: target };
    } else {
      const { data: existing } = await client
        .from('creator_goals')
        .select('title, current_coins, target_coins')
        .eq('creator_id', creatorId)
        .maybeSingle();
      goalRow = existing || null;
    }

    const newSenderBalance = Number(rpcResult.new_sender_balance || 0);
    const newHostEarnings = Number(rpcResult.new_host_earnings || 0);
    const hostCoinsEarned = Number(rpcResult.host_coins_earned ?? split.hostCoins) || 0;

    return jsonOk({
      success: true,
      data: {
        creatorId,
        coins,
        senderBalance: newSenderBalance,
        hostEarnings: newHostEarnings,
        hostCoinsEarned,
        duplicate: Boolean(rpcResult.duplicate),
        goal: goalRow
          ? {
              title: goalRow.title,
              currentCoins: Number(goalRow.current_coins || 0),
              targetCoins: Number(goalRow.target_coins || 10000),
            }
          : undefined,
      },
    });
  } catch (err: any) {
    console.error('[next /api/v1/goals/contribute]', err);
    return jsonErr(500, err?.message || 'Contribution failed', 'GOAL_FAILED');
  }
}
