import { NextRequest } from 'next/server';
import { createServiceClient, jsonErr, jsonOk, requireAuth } from '../../../../lib/nextAuth';
import { parseJsonBody } from '../../../../lib/nextRequest';
import { loadRewardConfig, resolveRewardDay } from '../../../../lib/handlers/rewards';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** POST /api/rewards/claim-master-chest */
export async function POST(req: NextRequest) {
  try {
    const auth = await requireAuth(req);
    if (!auth.ok) { return jsonErr(auth.status, auth.error.message, auth.error.code); }

    const parsed = await parseJsonBody<{ rewardDay?: string }>(req);
    if (!parsed.ok) { return jsonErr(parsed.status, parsed.error.message, parsed.error.code); }

    const client = createServiceClient();
    if (!client) return jsonErr(503, 'Rewards backend unavailable', 'NO_ADMIN');

    const rewardDay = resolveRewardDay(String(parsed.data?.rewardDay || ''));
    const { missions } = await loadRewardConfig(client);

    const { ensureUserDailyRewardsRolloverAdmin, claimDailyRewardAdmin, mapDailyRewardsRowToRecord } =
      await import('../../../../server/supabaseAdmin');

    const ensured = await ensureUserDailyRewardsRolloverAdmin(auth.profileId, rewardDay);
    if (!ensured.success || !ensured.data) {
      return jsonErr(500, ensured.error || 'Load failed', 'LOAD_FAILED');
    }
    const row = ensured.data;

    if (row.master_chest_claimed) {
      return jsonErr(409, 'Master chest already claimed today', 'ALREADY_CLAIMED', {
        data: {
          coinsAwarded: 0,
          record: mapDailyRewardsRowToRecord(row),
          coinBalance: null,
          alreadyClaimed: true,
        },
      });
    }

    const claimedCount = [
      row.task_chat_claimed,
      row.task_quick_match_claimed,
      row.task_video_call_claimed,
      row.task_moment_claimed,
      row.task_gift_claimed,
    ].filter(Boolean).length;
    const masterTarget = Number(missions.masterChest?.target || 4);
    if (claimedCount < masterTarget) {
      return jsonErr(400, `Complete at least ${masterTarget} daily missions first`, 'LOCKED');
    }

    const coins = Number(missions.masterChest?.reward || 50);
    const claim = await claimDailyRewardAdmin({
      userId: auth.profileId,
      claimKind: 'master_chest',
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
    console.error('[next /api/rewards/claim-master-chest]', err);
    return jsonErr(500, err?.message || 'Server error', 'SERVER_ERROR');
  }
}
