import { NextRequest } from 'next/server';
import { bufferCallLedgerMinute, flushCallLedger, pendingLedgerCoins } from '../../../../lib/callLedger';
import { updateCallLogs } from '../../../../lib/handlers/callLogsDb';
import {
  deleteCallState,
  getCallLedger,
  isRedisConfigured,
  setPresence,
} from '../../../../lib/redis';
import { createServiceClient, jsonErr, jsonOk, requireAuth } from '../../../../lib/nextAuth';
import { parseJsonBody } from '../../../../lib/nextRequest';
import { enforceRateLimit } from '../../../../lib/nextRateLimit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * POST /api/calls/burn — buffer billing minute in Redis call:ledger:{callId}.
 * Wallet + call_logs flush runs on call termination (see calls sync / terminate).
 */
export async function POST(req: NextRequest) {
  try {
    const limited = await enforceRateLimit(req, 'sensitive');
    if (limited) return limited;

    const auth = await requireAuth(req);
    if (!auth.ok) { return jsonErr(auth.status, auth.error.message, auth.error.code); }

    const parsed = await parseJsonBody<{
      callId?: string;
      billingMinute?: number;
      coinsBurned?: unknown;
      hostCoinsEarned?: unknown;
      tlCoinsEarned?: unknown;
      coins?: unknown;
      amount?: unknown;
    }>(req);
    if (!parsed.ok) { return jsonErr(parsed.status, parsed.error.message, parsed.error.code); }

    const body = parsed.data || {};
    if (
      body.coinsBurned != null ||
      body.hostCoinsEarned != null ||
      body.tlCoinsEarned != null ||
      body.coins != null ||
      body.amount != null
    ) {
      return jsonErr(
        400,
        'Client must not supply coin amounts; rates are server-derived.',
        'CLIENT_AMOUNTS_FORBIDDEN'
      );
    }

    const callId = typeof body.callId === 'string' ? body.callId.trim() : '';
    const billingMinute = Number(body.billingMinute);
    if (!callId || !Number.isFinite(billingMinute) || billingMinute < 1) {
      return jsonErr(400, 'callId and billingMinute (>=1) are required', 'INVALID_INPUT');
    }

    if (!isRedisConfigured()) {
      return jsonErr(503, 'Billing buffer unavailable — Redis is not configured', 'REDIS_UNAVAILABLE');
    }

    const client = createServiceClient();
    if (!client) return jsonErr(503, 'Billing unavailable', 'NO_SUPABASE');

    const callerId = auth.profileId;
    const { data: callRow, error: callErr } = await client
      .from('call_logs')
      .select(
        'id, caller_id, receiver_id, host_id, status, team_leader_id, coins_spent, coins_earned, duration_seconds'
      )
      .eq('id', callId)
      .maybeSingle();

    if (callErr) {
      console.error('[next /api/calls/burn]', callErr.message);
      return jsonErr(500, 'Call lookup failed', 'CALL_LOOKUP_FAILED');
    }
    if (!callRow) return jsonErr(404, 'Call not found', 'CALL_NOT_FOUND');
    if (String(callRow.caller_id) !== String(callerId)) {
      return jsonErr(403, 'Only the call caller may trigger billing', 'FORBIDDEN');
    }

    const callStatus = String(callRow.status || '').toLowerCase();
    if (['ended', 'completed', 'missed', 'declined', 'cancelled', 'canceled', 'failed', 'terminated'].includes(callStatus)) {
      return jsonErr(404, 'Active call not found', 'CALL_NOT_FOUND');
    }
    if (!['active', 'accepted', 'in_call'].includes(callStatus)) {
      return jsonErr(
        409,
        'Call is not active — billing starts after accept and media connect',
        'CALL_NOT_ACTIVE'
      );
    }

    const receiverId = String(callRow.receiver_id || callRow.host_id || '');
    if (!receiverId) return jsonErr(404, 'Receiver profile not found', 'RECEIVER_NOT_FOUND');

    const { data: cfg } = await client
      .from('system_configs')
      .select(
        'coin_burn_rate_per_min, coin_burn_rate_friend_per_min, female_host_share_percent, team_leader_share_percent'
      )
      .eq('id', 'default')
      .maybeSingle();

    const standardRate = Math.max(1, Math.round(Number(cfg?.coin_burn_rate_per_min) || 120));
    const friendRate = Math.max(1, Math.round(Number(cfg?.coin_burn_rate_friend_per_min) || 80));
    const hostSharePercent = Math.min(
      100,
      Math.max(0, Math.round(Number(cfg?.female_host_share_percent) || 30))
    );
    const tlSharePercent = Math.min(
      100,
      Math.max(0, Math.round(Number(cfg?.team_leader_share_percent) || 10))
    );

    const { data: recvRow } = await client
      .from('profiles')
      .select('id, role, team_leader_id, created_by_id, coin_earn_override_rate')
      .eq('id', receiverId)
      .maybeSingle();
    if (!recvRow) return jsonErr(404, 'Receiver profile not found', 'RECEIVER_NOT_FOUND');

    let isFriendPair = false;
    const { data: frForward } = await client
      .from('friend_requests')
      .select('id')
      .eq('status', 'accepted')
      .eq('sender_id', callerId)
      .eq('receiver_id', receiverId)
      .limit(1)
      .maybeSingle();
    if (frForward) {
      isFriendPair = true;
    } else {
      const { data: frReverse } = await client
        .from('friend_requests')
        .select('id')
        .eq('status', 'accepted')
        .eq('sender_id', receiverId)
        .eq('receiver_id', callerId)
        .limit(1)
        .maybeSingle();
      isFriendPair = Boolean(frReverse);
    }

    const coinsBurned = isFriendPair ? friendRate : standardRate;
    const isCreator = recvRow.role === 'female_creator' || recvRow.role === 'female_host';
    const tlId = isCreator
      ? String(recvRow.team_leader_id || recvRow.created_by_id || callRow.team_leader_id || '') || null
      : null;

    let hostCoinsEarned = 0;
    let tlCoinsEarned = 0;
    const override = Number(recvRow.coin_earn_override_rate);
    const usedOverride = Number.isFinite(override) && override > 0;
    if (isCreator && coinsBurned > 0) {
      if (usedOverride) {
        hostCoinsEarned = Math.min(coinsBurned, Math.round(override));
      } else {
        hostCoinsEarned = Math.round(coinsBurned * (hostSharePercent / 100));
      }
      if (tlId && tlSharePercent > 0) {
        tlCoinsEarned = Math.round(coinsBurned * (tlSharePercent / 100));
      }
      if (hostCoinsEarned + tlCoinsEarned > coinsBurned) {
        if (tlCoinsEarned > coinsBurned) {
          tlCoinsEarned = coinsBurned;
          hostCoinsEarned = 0;
        } else {
          hostCoinsEarned = coinsBurned - tlCoinsEarned;
        }
      }
    }

    // Soft balance check against live balance minus already-buffered minutes
    const { data: callerProfile } = await client
      .from('profiles')
      .select('coin_balance')
      .eq('id', callerId)
      .maybeSingle();
    const liveBalance = Number(callerProfile?.coin_balance || 0);
    const existingLedger = await getCallLedger(callId);
    const alreadyPending = pendingLedgerCoins(existingLedger);
    const minuteAlreadyBuffered = Boolean(
      existingLedger?.minutes?.some((m) => m.billingMinute === billingMinute)
    );
    const needForThisMinute = minuteAlreadyBuffered ? 0 : coinsBurned;
    if (liveBalance < alreadyPending + needForThisMinute) {
      // Flush whatever was already buffered, then fail the call
      await flushCallLedger(client, callId);
      const endIso = new Date().toISOString();
      await updateCallLogs(
        client,
        {
          status: 'failed',
          end_reason: 'INSUFFICIENT_BALANCE',
          ended_at: endIso,
          end_time: endIso,
          updated_at: endIso,
        },
        (q) => q.eq('id', callId)
      );
      try {
        await setPresence(callerId, 'online');
        await setPresence(receiverId, 'online');
        await deleteCallState(callId);
      } catch {
        /* optional */
      }
      const { data: after } = await client
        .from('profiles')
        .select('coin_balance')
        .eq('id', callerId)
        .maybeSingle();
      return jsonErr(402, 'Insufficient coin balance for next billing minute', 'INSUFFICIENT_BALANCE', {
        success: false,
        status: 'INSUFFICIENT_BALANCE',
        data: {
          newCallerBalance: Number(after?.coin_balance) || 0,
          callId,
          billingMinute,
        },
      });
    }

    const buffered = await bufferCallLedgerMinute({
      callId,
      billingMinute,
      coinsBurned,
      hostCoinsEarned,
      tlCoinsEarned,
      tlId,
      isFriendPair,
      receiverId,
      callerId,
      receiverRole: String(recvRow.role || ''),
      hostSharePercent,
      tlSharePercent,
      usedOverride,
      bufferedAt: new Date().toISOString(),
    });

    const pendingCoins = buffered.pendingCoins;
    const estimatedBalance = Math.max(0, liveBalance - pendingCoins);
    const callCoinsSpent = (Number(callRow.coins_spent) || 0) + pendingCoins;
    const callCoinsEarned =
      (Number(callRow.coins_earned) || 0) +
      buffered.doc.minutes.reduce((s, m) => s + (Number(m.hostCoinsEarned) || 0), 0);

    return jsonOk({
      success: true,
      data: {
        callId,
        billingMinute,
        coinsBurned,
        hostCoinsEarned,
        tlCoinsEarned,
        platformRetained: Math.max(0, coinsBurned - hostCoinsEarned - tlCoinsEarned),
        newCallerBalance: estimatedBalance,
        newHostEarnings: 0,
        newTlEarnings: 0,
        callCoinsSpent,
        callCoinsEarned,
        billedMinutes: billingMinute,
        duplicate: buffered.duplicate,
        isFriendRate: isFriendPair,
        isFemaleCreator: isCreator,
        buffered: true,
        pendingCoins,
      },
      runtime: 'next-native',
    });
  } catch (err: any) {
    console.error('[next /api/calls/burn]', err);
    return jsonErr(500, err?.message || 'Burn failed', 'INTERNAL_ERROR');
  }
}
