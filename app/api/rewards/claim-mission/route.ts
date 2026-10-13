import { NextRequest } from 'next/server';
import { createServiceClient, jsonErr, jsonOk, requireAuth } from '../../../../lib/nextAuth';
import { parseJsonBody } from '../../../../lib/nextRequest';
import {
  MISSION_KEYS,
  type MissionKey,
  evaluateMissionEligibility,
  loadRewardConfig,
  resolveRewardDay,
} from '../../../../lib/handlers/rewards';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** POST /api/rewards/claim-mission */
export async function POST(req: NextRequest) {
  try {
    const auth = await requireAuth(req);
    if (!auth.ok) { return jsonErr(auth.status, auth.error.message, auth.error.code); }

    const parsed = await parseJsonBody<{ missionKey?: string; rewardDay?: string }>(req);
    if (!parsed.ok) { return jsonErr(parsed.status, parsed.error.message, parsed.error.code); }

    const missionKey = String(parsed.data?.missionKey || '') as MissionKey;
    if (!MISSION_KEYS.includes(missionKey)) {
      return jsonErr(400, 'Invalid missionKey', 'INVALID_MISSION');
    }

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

    const eligibility = evaluateMissionEligibility(row, missionKey, missions);
    if (eligibility.ok === false) {
      const status = eligibility.code === 'ALREADY_CLAIMED' ? 409 : 400;
      return jsonErr(status, eligibility.message, eligibility.code, {
        data: {
          coinsAwarded: 0,
          record: mapDailyRewardsRowToRecord(row),
          coinBalance: null,
          alreadyClaimed: eligibility.code === 'ALREADY_CLAIMED',
        },
      });
    }

    const coins = eligibility.baseReward;
    const claim = await claimDailyRewardAdmin({
      userId: auth.profileId,
      claimKind: 'mission',
      missionKey,
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
    console.error('[next /api/rewards/claim-mission]', err);
    return jsonErr(500, err?.message || 'Server error', 'SERVER_ERROR');
  }
}
