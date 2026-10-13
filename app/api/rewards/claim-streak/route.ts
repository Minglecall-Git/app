import { NextRequest } from 'next/server';
import { createServiceClient, jsonErr, jsonOk, requireAuth } from '../../../../lib/nextAuth';
import { parseJsonBody } from '../../../../lib/nextRequest';
import { loadRewardConfig, resolveRewardDay } from '../../../../lib/handlers/rewards';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** POST /api/rewards/claim-streak */
export async function POST(req: NextRequest) {
  try {
    const auth = await requireAuth(req);
    if (!auth.ok) { return jsonErr(auth.status, auth.error.message, auth.error.code); }

    const parsed = await parseJsonBody<{ rewardDay?: string }>(req);
    if (!parsed.ok) { return jsonErr(parsed.status, parsed.error.message, parsed.error.code); }

    const client = createServiceClient();
    if (!client) return jsonErr(503, 'Rewards backend unavailable', 'NO_ADMIN');

    const rewardDay = resolveRewardDay(String(parsed.data?.rewardDay || ''));
    const { streakRewards } = await loadRewardConfig(client);

    const { ensureUserDailyRewardsRolloverAdmin, claimDailyRewardAdmin, mapDailyRewardsRowToRecord } =
      await import('../../../../server/supabaseAdmin');

    const ensured = await ensureUserDailyRewardsRolloverAdmin(auth.profileId, rewardDay);
    if (!ensured.success || !ensured.data) {
      return jsonErr(500, ensured.error || 'Load failed', 'LOAD_FAILED');
    }
    const row = ensured.data;
    if (row.streak_claimed_date === rewardDay) {
      return jsonErr(409, 'Streak already claimed today', 'ALREADY_CLAIMED', {
        data: {
          coinsAwarded: 0,
          record: mapDailyRewardsRowToRecord(row),
          coinBalance: null,
          alreadyClaimed: true,
        },
      });
    }

    const dayIndex = Math.min(Math.max(0, Number(row.streak_count || 1) - 1), 6);
    const coins = Number(streakRewards[dayIndex] ?? 20);

    const claim = await claimDailyRewardAdmin({
      userId: auth.profileId,
      claimKind: 'streak',
      missionKey: null,
      rewardDay,
      coins,
    });

    if (!claim.success) {
      const code = claim.code || 'CLAIM_FAILED';
      const status = code === 'ALREADY_CLAIMED' ? 409 : 400;
      return jsonErr(status, claim.error || 'Claim failed', code, {
        data: {
          coinsAwarded: 0,
          record: claim.record ? mapDailyRewardsRowToRecord(claim.record) : mapDailyRewardsRowToRecord(row),
          coinBalance: claim.coinBalance ?? null,
          alreadyClaimed: code === 'ALREADY_CLAIMED',
        },
      });
    }

    return jsonOk({
      success: true,
      data: {
        coinsAwarded: claim.coinsAwarded ?? coins,
        record: mapDailyRewardsRowToRecord(claim.record),
        coinBalance: claim.coinBalance,
        alreadyClaimed: Boolean(claim.duplicate),
      },
    });
  } catch (err: any) {
    console.error('[next /api/rewards/claim-streak]', err);
    return jsonErr(500, err?.message || 'Server error', 'SERVER_ERROR');
  }
}