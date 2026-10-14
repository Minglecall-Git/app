import { NextRequest } from 'next/server';
import { mapCreatorMetricsRow } from '../../../../lib/handlers/creatorMetricsMap';
import { createServiceClient, jsonErr, jsonOk, requireAuth } from '../../../../lib/nextAuth';
import { parseJsonBody } from '../../../../lib/nextRequest';
import { enforceRateLimit } from '../../../../lib/nextRateLimit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** POST /api/creator/first-call-bonus — atomic RPC claim (native Next). */
export async function POST(req: NextRequest) {
  try {
    const limited = await enforceRateLimit(req, 'sensitive');
    if (limited) return limited;

    const auth = await requireAuth(req);
    if (!auth.ok) { return jsonErr(auth.status, auth.error.message, auth.error.code); }

    await parseJsonBody(req);

    const client = createServiceClient();
    if (!client) return jsonErr(503, 'Supabase not configured', 'NO_SUPABASE');

    const creatorId = auth.profileId;
    const todayStr = new Date().toISOString().slice(0, 10);

    const { data: cfg } = await client
      .from('system_configs')
      .select('daily_first_call_bonus_coins, daily_first_call_bonus_usd')
      .eq('id', 'default')
      .maybeSingle();

    const bonusCoins = Math.max(
      1,
      Math.round(Number(cfg?.daily_first_call_bonus_coins || 100) || 100)
    );
    const bonusUSD = Number(Number(cfg?.daily_first_call_bonus_usd || 1).toFixed(2));

    const { data: rpcRaw, error: rpcErr } = await client.rpc('claim_first_call_bonus_atomic', {
      p_creator_id: creatorId,
      p_bonus_coins: bonusCoins,
      p_bonus_usd: bonusUSD,
      p_claim_date: todayStr,
      p_metadata: {
        kind: 'first_call_bonus',
        source: 'next-native',
        claimDate: todayStr,
      },
    });

    if (rpcErr) {
      console.error('[next /api/creator/first-call-bonus] RPC', rpcErr.message);
      return jsonErr(500, 'First call bonus RPC failed', 'BONUS_RPC_FAILED');
    }

    const result = typeof rpcRaw === 'string' ? JSON.parse(rpcRaw) : rpcRaw || {};
    const code = String(result?.error_code || result?.code || '');

    if (result?.already_claimed || code === 'ALREADY_CLAIMED') {
      const { data: metrics } = await client
        .from('creator_metrics')
        .select('*')
        .eq('creator_id', creatorId)
        .maybeSingle();
      return jsonOk({
        success: false,
        alreadyClaimed: true,
        awarded: false,
        message: result?.error_message || 'Daily first call bonus already claimed today.',
        metrics: metrics
          ? mapCreatorMetricsRow(metrics as Record<string, unknown>)
          : {
              creatorId,
              firstCallBonusClaimedDate: todayStr,
              bonusEarnedCoins: Number(result?.bonus_earned_coins || 0),
              bonusEarnedUSD: Number(result?.bonus_earned_usd || 0),
            },
        runtime: 'next-native',
      });
    }

    if (!result?.success) {
      return jsonErr(
        400,
        result?.error_message || 'First call bonus failed',
        code || 'BONUS_FAILED',
        { awarded: false }
      );
    }

    const { data: saved } = await client
      .from('creator_metrics')
      .select('*')
      .eq('creator_id', creatorId)
      .maybeSingle();

    return jsonOk({
      success: true,
      awarded: !result.duplicate,
      duplicate: Boolean(result.duplicate),
      bonusCoins: Number(result.bonus_coins ?? bonusCoins) || bonusCoins,
      bonusUSD: Number(result.bonus_usd ?? bonusUSD) || bonusUSD,
      earningsCoins: Number(result.new_earnings_coins || 0),
      metrics: saved
        ? mapCreatorMetricsRow(saved as Record<string, unknown>)
        : {
            creatorId,
            firstCallBonusClaimedDate: todayStr,
            bonusEarnedCoins: Number(result.bonus_earned_coins || 0),
            bonusEarnedUSD: Number(result.bonus_earned_usd || 0),
          },
      runtime: 'next-native',
    });
  } catch (err: any) {
    console.error('[next /api/creator/first-call-bonus]', err);
    return jsonErr(500, err?.message || 'First call bonus failed', 'INTERNAL_ERROR');
  }
}
