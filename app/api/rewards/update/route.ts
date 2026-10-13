import { NextRequest } from 'next/server';
import { createServiceClient, jsonErr, jsonOk, requireAuth } from '../../../../lib/nextAuth';
import { parseJsonBody } from '../../../../lib/nextRequest';
import { loadRewardConfig, resolveRewardDay } from '../../../../lib/handlers/rewards';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** POST /api/rewards/update — progress-only merge (legacy compat). */
export async function POST(req: NextRequest) {
  try {
    const auth = await requireAuth(req);
    if (!auth.ok) { return jsonErr(auth.status, auth.error.message, auth.error.code); }

    const parsed = await parseJsonBody<Record<string, unknown>>(req);
    if (!parsed.ok) { return jsonErr(parsed.status, parsed.error.message, parsed.error.code); }

    const client = createServiceClient();
    if (!client) return jsonErr(503, 'Rewards backend unavailable', 'NO_ADMIN');

    const body = parsed.data || {};
    const rewardDay = resolveRewardDay(
      String(body.rewardDay || body.tasksDate || '')
    );
    const { missions } = await loadRewardConfig(client);

    const {
      ensureUserDailyRewardsRolloverAdmin,
      applyDailyRewardProgressAdmin,
      fetchUserDailyRewardsAdmin,
      mapDailyRewardsRowToRecord,
    } = await import('../../../../server/supabaseAdmin');

    const ensured = await ensureUserDailyRewardsRolloverAdmin(auth.profileId, rewardDay);
    if (!ensured.success || !ensured.data) {
      return jsonErr(500, ensured.error || 'Load failed', 'LOAD_FAILED');
    }
    const current = ensured.data;

    const friends = Array.isArray(body.taskChatFriends)
      ? body.taskChatFriends
      : Array.isArray(body.task_chat_friends)
        ? body.task_chat_friends
        : null;
    if (friends && !current.task_chat_claimed) {
      for (const fid of friends) {
        if (typeof fid === 'string' && fid && fid !== auth.profileId) {
          await applyDailyRewardProgressAdmin({
            userId: auth.profileId,
            rewardDay,
            type: 'chat_friend',
            receiverId: fid,
            missions,
          });
        }
      }
    }

    const qm = Number(body.taskQuickMatches ?? body.task_quick_matches);
    if (Number.isFinite(qm) && qm > Number(current.task_quick_matches || 0) && !current.task_quick_match_claimed) {
      const delta = Math.min(5, Math.floor(qm - Number(current.task_quick_matches || 0)));
      for (let i = 0; i < delta; i++) {
        await applyDailyRewardProgressAdmin({ userId: auth.profileId, rewardDay, type: 'quick_match', missions });
      }
    }

    const secs = Number(body.taskVideoCallSeconds ?? body.task_video_call_seconds);
    if (Number.isFinite(secs) && secs > Number(current.task_video_call_seconds || 0) && !current.task_video_call_claimed) {
      const delta = Math.min(600, Math.floor(secs - Number(current.task_video_call_seconds || 0)));
      if (delta > 0) {
        await applyDailyRewardProgressAdmin({
          userId: auth.profileId,
          rewardDay,
          type: 'video_call',
          seconds: delta,
          missions,
        });
      }
    }

    const moments = Number(body.taskMomentInteractions ?? body.task_moment_interactions);
    if (Number.isFinite(moments) && moments > Number(current.task_moment_interactions || 0) && !current.task_moment_claimed) {
      const delta = Math.min(5, Math.floor(moments - Number(current.task_moment_interactions || 0)));
      for (let i = 0; i < delta; i++) {
        await applyDailyRewardProgressAdmin({ userId: auth.profileId, rewardDay, type: 'moment', missions });
      }
    }

    const gifts = Number(body.taskGiftCount ?? body.task_gift_count);
    if (Number.isFinite(gifts) && gifts > Number(current.task_gift_count || 0) && !current.task_gift_claimed) {
      const delta = Math.min(5, Math.floor(gifts - Number(current.task_gift_count || 0)));
      for (let i = 0; i < delta; i++) {
        await applyDailyRewardProgressAdmin({ userId: auth.profileId, rewardDay, type: 'gift', missions });
      }
    }

    const refreshed = await fetchUserDailyRewardsAdmin(auth.profileId);
    return jsonOk({
      success: true,
      data: refreshed.data ? mapDailyRewardsRowToRecord(refreshed.data) : null,
      note: 'Claim flags and coin totals from client are ignored; use claim endpoints to award coins.',
    });
  } catch (err: any) {
    console.error('[next /api/rewards/update]', err);
    return jsonErr(500, err?.message || 'Server error', 'SERVER_ERROR');
  }
}
