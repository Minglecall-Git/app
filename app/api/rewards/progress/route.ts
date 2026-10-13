import { NextRequest } from 'next/server';
import { createServiceClient, jsonErr, jsonOk, requireAuth } from '../../../../lib/nextAuth';
import { parseJsonBody } from '../../../../lib/nextRequest';
import { loadRewardConfig, resolveRewardDay } from '../../../../lib/handlers/rewards';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** POST /api/rewards/progress */
export async function POST(req: NextRequest) {
  try {
    const auth = await requireAuth(req);
    if (!auth.ok) { return jsonErr(auth.status, auth.error.message, auth.error.code); }

    const parsed = await parseJsonBody<{
      rewardDay?: string;
      type?: string;
      receiverId?: string;
      seconds?: number;
    }>(req);
    if (!parsed.ok) { return jsonErr(parsed.status, parsed.error.message, parsed.error.code); }

    const client = createServiceClient();
    if (!client) return jsonErr(503, 'Rewards backend unavailable', 'NO_ADMIN');

    const rewardDay = resolveRewardDay(String(parsed.data?.rewardDay || ''));
    const progressType = String(parsed.data?.type || '');
    const { missions } = await loadRewardConfig(client);

    const { applyDailyRewardProgressAdmin, mapDailyRewardsRowToRecord } = await import(
      '../../../../server/supabaseAdmin'
    );

    const result = await applyDailyRewardProgressAdmin({
      userId: auth.profileId,
      rewardDay,
      type: progressType,
      receiverId: parsed.data?.receiverId ? String(parsed.data.receiverId) : undefined,
      seconds: Number(parsed.data?.seconds || 0),
      missions,
    });

    if (!result.success) {
      return jsonErr(400, result.error || 'Progress update failed', result.code || 'PROGRESS_FAILED');
    }

    return jsonOk({
      success: true,
      data: { record: mapDailyRewardsRowToRecord(result.data) },
    });
  } catch (err: any) {
    console.error('[next /api/rewards/progress]', err);
    return jsonErr(500, err?.message || 'Server error', 'SERVER_ERROR');
  }
}
