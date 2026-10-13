import { NextRequest } from 'next/server';
import { mapCreatorMetricsRow } from '../../../../lib/handlers/creatorMetricsMap';
import { createServiceClient, jsonErr, jsonOk, requireAuth } from '../../../../lib/nextAuth';
import { parseJsonBody } from '../../../../lib/nextRequest';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** POST /api/creator/first-call-bonus — daily bonus via creator_metrics (native Next). */
export async function POST(req: NextRequest) {
  try {
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

    const { data: metrics } = await client
      .from('creator_metrics')
      .select('*')
      .eq('creator_id', creatorId)
      .maybeSingle();

    if (metrics && String(metrics.first_call_bonus_claimed_date || '') === todayStr) {
      return jsonOk({
        success: false,
        alreadyClaimed: true,
        awarded: false,
        message: 'Daily first call bonus already claimed today.',
        metrics: {
          creatorId,
          firstCallBonusClaimedDate: todayStr,
          bonusEarnedCoins: Number(metrics.bonus_earned_coins || 0),
          bonusEarnedUSD: Number(metrics.bonus_earned_usd || 0),
        },
        runtime: 'next-native',
      });
    }

    const nextBonusCoins = Number(metrics?.bonus_earned_coins || 0) + bonusCoins;
    const nextBonusUsd = Number((Number(metrics?.bonus_earned_usd || 0) + bonusUSD).toFixed(2));

    const { data: saved, error: mErr } = await client
      .from('creator_metrics')
      .upsert(
        {
          creator_id: creatorId,
          first_call_bonus_claimed_date: todayStr,
          bonus_earned_coins: nextBonusCoins,
          bonus_earned_usd: nextBonusUsd,
          last_active_date: todayStr,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'creator_id' }
      )
      .select('*')
      .maybeSingle();

    if (mErr) {
      return jsonErr(500, mErr.message, 'METRICS_UPDATE_FAILED', { awarded: false });
    }

    const { data: profile } = await client
      .from('profiles')
      .select('earnings_coins')
      .eq('id', creatorId)
      .maybeSingle();
    const newEarnings = Number(profile?.earnings_coins || 0) + bonusCoins;
    await client
      .from('profiles')
      .update({ earnings_coins: newEarnings, updated_at: new Date().toISOString() })
      .eq('id', creatorId);

    return jsonOk({
      success: true,
      awarded: true,
      bonusCoins,
      bonusUSD,
      metrics: saved
        ? mapCreatorMetricsRow(saved as Record<string, unknown>)
        : {
            creatorId,
            firstCallBonusClaimedDate: todayStr,
            bonusEarnedCoins: nextBonusCoins,
            bonusEarnedUSD: nextBonusUsd,
          },
      runtime: 'next-native',
    });
  } catch (err: any) {
    console.error('[next /api/creator/first-call-bonus]', err);
    return jsonErr(500, err?.message || 'First call bonus failed', 'INTERNAL_ERROR');
  }
}
