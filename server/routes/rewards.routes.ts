import { Router } from 'express';
import type { ServerRuntime } from '../runtimeTypes';
import { requireAuth } from '../middleware/auth';
import {
  getSupabaseAdmin,
  isSupabaseAdminConfigured,
  fetchUserDailyRewardsAdmin,
  ensureUserDailyRewardsRolloverAdmin,
  claimDailyRewardAdmin,
  applyDailyRewardProgressAdmin,
  mapDailyRewardsRowToRecord,
} from '../supabaseAdmin';

const DEFAULT_STREAK = [10, 15, 20, 25, 35, 50, 100];
const DEFAULT_MISSIONS = {
  chatFriends: { target: 3, reward: 25, enabled: true },
  quickMatches: { target: 10, reward: 30, enabled: true },
  videoCall: { target: 60, reward: 35, enabled: true }, // target = seconds
  momentInteract: { target: 3, reward: 15, enabled: true },
  sendGift: { target: 1, reward: 20, enabled: true },
  masterChest: { target: 4, reward: 50, enabled: true },
};

const MISSION_KEYS = [
  'chat_friends',
  'quick_matches',
  'video_call',
  'moment_interact',
  'send_gift',
] as const;
type MissionKey = (typeof MISSION_KEYS)[number];

/** Accept client local YYYY-MM-DD if within ±1 calendar day of server UTC (avoids UTC-only streak breaks). */
export function resolveRewardDay(clientHint?: string): string {
  const serverUtc = new Date().toISOString().slice(0, 10);
  if (!clientHint || !/^\d{4}-\d{2}-\d{2}$/.test(clientHint)) return serverUtc;
  const hintMs = Date.parse(`${clientHint}T12:00:00.000Z`);
  const utcMs = Date.parse(`${serverUtc}T12:00:00.000Z`);
  if (!Number.isFinite(hintMs) || !Number.isFinite(utcMs)) return serverUtc;
  const diffDays = Math.abs(hintMs - utcMs) / 86_400_000;
  return diffDays <= 1 ? clientHint : serverUtc;
}

function parseJsonSafe<T>(raw: unknown, fallback: T): T {
  if (raw == null) return fallback;
  if (typeof raw === 'object') return raw as T;
  if (typeof raw === 'string') {
    try {
      return JSON.parse(raw) as T;
    } catch {
      return fallback;
    }
  }
  return fallback;
}

async function loadRewardConfig() {
  const client = getSupabaseAdmin();
  if (!client) {
    return { streakRewards: DEFAULT_STREAK, missions: DEFAULT_MISSIONS };
  }
  const { data } = await client
    .from('system_configs')
    .select('daily_streak_rewards_json, daily_missions_config_json')
    .limit(1)
    .maybeSingle();

  const streakRewards = parseJsonSafe<number[]>(data?.daily_streak_rewards_json, DEFAULT_STREAK);
  const missions = {
    ...DEFAULT_MISSIONS,
    ...parseJsonSafe<Record<string, any>>(data?.daily_missions_config_json, {}),
  };
  return {
    streakRewards: Array.isArray(streakRewards) && streakRewards.length ? streakRewards : DEFAULT_STREAK,
    missions,
  };
}

function authUserId(req: any): string {
  return String(req.profileId || req.user?.id || '');
}

export function createRewardsRouter(_runtime: ServerRuntime) {
  const router = Router();

  /**
   * GET or POST /api/rewards/get
   * Returns server-owned reward record (creates + day-rollover applied).
   * Body/query may include rewardDay (local YYYY-MM-DD hint).
   */
  const handleGet = async (req: any, res: any) => {
    try {
      if (!isSupabaseAdminConfigured()) {
        return res.status(503).json({ success: false, error: { message: 'Rewards backend unavailable', code: 'NO_ADMIN' } });
      }
      const userId = authUserId(req);
      if (!userId) {
        return res.status(401).json({ success: false, error: { message: 'Unauthorized', code: 'UNAUTHORIZED' } });
      }
      const rewardDay = resolveRewardDay(
        String(req.body?.rewardDay || req.query?.rewardDay || '')
      );
      const result = await ensureUserDailyRewardsRolloverAdmin(userId, rewardDay);
      if (!result.success) {
        return res.status(500).json({ success: false, error: { message: result.error || 'Failed to load rewards', code: 'LOAD_FAILED' } });
      }
      return res.json({
        success: true,
        data: {
          record: mapDailyRewardsRowToRecord(result.data),
          rewardDay,
        },
      });
    } catch (err: any) {
      return res.status(500).json({ success: false, error: { message: err.message || 'Server error', code: 'SERVER_ERROR' } });
    }
  };

  router.get('/get', requireAuth, handleGet);
  router.post('/get', requireAuth, handleGet);

  /**
   * POST /api/rewards/claim-streak
   */
  router.post('/claim-streak', requireAuth, async (req, res) => {
    try {
      const userId = authUserId(req);
      if (!userId) {
        return res.status(401).json({ success: false, error: { message: 'Unauthorized', code: 'UNAUTHORIZED' } });
      }
      const rewardDay = resolveRewardDay(String(req.body?.rewardDay || ''));
      const { streakRewards } = await loadRewardConfig();

      const ensured = await ensureUserDailyRewardsRolloverAdmin(userId, rewardDay);
      if (!ensured.success || !ensured.data) {
        return res.status(500).json({ success: false, error: { message: ensured.error || 'Load failed', code: 'LOAD_FAILED' } });
      }
      const row = ensured.data;
      if (row.streak_claimed_date === rewardDay) {
        return res.status(409).json({
          success: false,
          error: { message: 'Streak already claimed today', code: 'ALREADY_CLAIMED' },
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
        userId,
        claimKind: 'streak',
        missionKey: null,
        rewardDay,
        coins,
      });

      if (!claim.success) {
        const code = claim.code || 'CLAIM_FAILED';
        const status = code === 'ALREADY_CLAIMED' ? 409 : 400;
        return res.status(status).json({
          success: false,
          error: { message: claim.error || 'Claim failed', code },
          data: {
            coinsAwarded: 0,
            record: claim.record ? mapDailyRewardsRowToRecord(claim.record) : mapDailyRewardsRowToRecord(row),
            coinBalance: claim.coinBalance ?? null,
            alreadyClaimed: code === 'ALREADY_CLAIMED',
          },
        });
      }

      return res.json({
        success: true,
        data: {
          coinsAwarded: claim.coinsAwarded ?? coins,
          record: mapDailyRewardsRowToRecord(claim.record),
          coinBalance: claim.coinBalance,
          alreadyClaimed: Boolean(claim.duplicate),
        },
      });
    } catch (err: any) {
      return res.status(500).json({ success: false, error: { message: err.message || 'Server error', code: 'SERVER_ERROR' } });
    }
  });

  /**
   * POST /api/rewards/claim-mission { missionKey, rewardDay? }
   */
  router.post('/claim-mission', requireAuth, async (req, res) => {
    try {
      const userId = authUserId(req);
      if (!userId) {
        return res.status(401).json({ success: false, error: { message: 'Unauthorized', code: 'UNAUTHORIZED' } });
      }
      const missionKey = String(req.body?.missionKey || '') as MissionKey;
      if (!MISSION_KEYS.includes(missionKey)) {
        return res.status(400).json({ success: false, error: { message: 'Invalid missionKey', code: 'INVALID_MISSION' } });
      }

      const rewardDay = resolveRewardDay(String(req.body?.rewardDay || ''));
      const { missions } = await loadRewardConfig();

      const ensured = await ensureUserDailyRewardsRolloverAdmin(userId, rewardDay);
      if (!ensured.success || !ensured.data) {
        return res.status(500).json({ success: false, error: { message: ensured.error || 'Load failed', code: 'LOAD_FAILED' } });
      }
      const row = ensured.data;

      const eligibility = evaluateMissionEligibility(row, missionKey, missions);
      if (eligibility.ok === false) {
        const status = eligibility.code === 'ALREADY_CLAIMED' ? 409 : 400;
        return res.status(status).json({
          success: false,
          error: { message: eligibility.message, code: eligibility.code },
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
        userId,
        claimKind: 'mission',
        missionKey,
        rewardDay,
        coins,
      });

      if (!claim.success) {
        const code = claim.code || 'CLAIM_FAILED';
        const status = code === 'ALREADY_CLAIMED' ? 409 : 400;
        return res.status(status).json({
          success: false,
          error: { message: claim.error || 'Claim failed', code },
          data: {
            coinsAwarded: 0,
            record: claim.record ? mapDailyRewardsRowToRecord(claim.record) : mapDailyRewardsRowToRecord(row),
            coinBalance: claim.coinBalance ?? null,
            alreadyClaimed: code === 'ALREADY_CLAIMED',
          },
        });
      }

      return res.json({
        success: true,
        data: {
          coinsAwarded: claim.coinsAwarded ?? coins,
          record: mapDailyRewardsRowToRecord(claim.record),
          coinBalance: claim.coinBalance,
          alreadyClaimed: Boolean(claim.duplicate),
        },
      });
    } catch (err: any) {
      return res.status(500).json({ success: false, error: { message: err.message || 'Server error', code: 'SERVER_ERROR' } });
    }
  });

  /**
   * POST /api/rewards/claim-master-chest
   */
  router.post('/claim-master-chest', requireAuth, async (req, res) => {
    try {
      const userId = authUserId(req);
      if (!userId) {
        return res.status(401).json({ success: false, error: { message: 'Unauthorized', code: 'UNAUTHORIZED' } });
      }
      const rewardDay = resolveRewardDay(String(req.body?.rewardDay || ''));
      const { missions } = await loadRewardConfig();

      const ensured = await ensureUserDailyRewardsRolloverAdmin(userId, rewardDay);
      if (!ensured.success || !ensured.data) {
        return res.status(500).json({ success: false, error: { message: ensured.error || 'Load failed', code: 'LOAD_FAILED' } });
      }
      const row = ensured.data;

      if (row.master_chest_claimed) {
        return res.status(409).json({
          success: false,
          error: { message: 'Master chest already claimed today', code: 'ALREADY_CLAIMED' },
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
        return res.status(400).json({
          success: false,
          error: {
            message: `Complete at least ${masterTarget} daily missions first`,
            code: 'LOCKED',
          },
        });
      }

      const coins = Number(missions.masterChest?.reward || 50);

      const claim = await claimDailyRewardAdmin({
        userId,
        claimKind: 'master_chest',
        missionKey: null,
        rewardDay,
        coins,
      });

      if (!claim.success) {
        const code = claim.code || 'CLAIM_FAILED';
        const status = code === 'ALREADY_CLAIMED' ? 409 : 400;
        return res.status(status).json({
          success: false,
          error: { message: claim.error || 'Claim failed', code },
          data: {
            coinsAwarded: 0,
            record: claim.record ? mapDailyRewardsRowToRecord(claim.record) : mapDailyRewardsRowToRecord(row),
            coinBalance: claim.coinBalance ?? null,
            alreadyClaimed: code === 'ALREADY_CLAIMED',
          },
        });
      }

      return res.json({
        success: true,
        data: {
          coinsAwarded: claim.coinsAwarded ?? coins,
          record: mapDailyRewardsRowToRecord(claim.record),
          coinBalance: claim.coinBalance,
          alreadyClaimed: Boolean(claim.duplicate),
        },
      });
    } catch (err: any) {
      return res.status(500).json({ success: false, error: { message: err.message || 'Server error', code: 'SERVER_ERROR' } });
    }
  });

  /**
   * POST /api/rewards/progress
   * Server-validated progress increments only (never accepts claim flags / coin totals).
   */
  router.post('/progress', requireAuth, async (req, res) => {
    try {
      const userId = authUserId(req);
      if (!userId) {
        return res.status(401).json({ success: false, error: { message: 'Unauthorized', code: 'UNAUTHORIZED' } });
      }
      const rewardDay = resolveRewardDay(String(req.body?.rewardDay || ''));
      const progressType = String(req.body?.type || '');
      const { missions } = await loadRewardConfig();

      const result = await applyDailyRewardProgressAdmin({
        userId,
        rewardDay,
        type: progressType,
        receiverId: req.body?.receiverId ? String(req.body.receiverId) : undefined,
        seconds: Number(req.body?.seconds || 0),
        missions,
      });

      if (!result.success) {
        return res.status(400).json({
          success: false,
          error: { message: result.error || 'Progress update failed', code: result.code || 'PROGRESS_FAILED' },
        });
      }

      return res.json({
        success: true,
        data: { record: mapDailyRewardsRowToRecord(result.data) },
      });
    } catch (err: any) {
      return res.status(500).json({ success: false, error: { message: err.message || 'Server error', code: 'SERVER_ERROR' } });
    }
  });

  /**
   * POST /api/rewards/update — hardened: progress-only merge; strips claim/coin fields.
   * Prefer /progress. Kept for backward compatibility.
   */
  router.post('/update', requireAuth, async (req, res) => {
    try {
      const userId = authUserId(req);
      if (!userId) {
        return res.status(401).json({ success: false, error: { message: 'Unauthorized', code: 'UNAUTHORIZED' } });
      }
      const rewardDay = resolveRewardDay(String(req.body?.rewardDay || req.body?.tasksDate || ''));
      const { missions } = await loadRewardConfig();

      // Map legacy full-record updates into capped progress deltas only
      const body = req.body || {};
      const ensured = await ensureUserDailyRewardsRolloverAdmin(userId, rewardDay);
      if (!ensured.success || !ensured.data) {
        return res.status(500).json({ success: false, error: { message: ensured.error || 'Load failed', code: 'LOAD_FAILED' } });
      }
      const current = ensured.data;

      const friends = Array.isArray(body.taskChatFriends)
        ? body.taskChatFriends
        : Array.isArray(body.task_chat_friends)
        ? body.task_chat_friends
        : null;
      if (friends && !current.task_chat_claimed) {
        for (const fid of friends) {
          if (typeof fid === 'string' && fid && fid !== userId) {
            await applyDailyRewardProgressAdmin({
              userId,
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
          await applyDailyRewardProgressAdmin({ userId, rewardDay, type: 'quick_match', missions });
        }
      }

      const secs = Number(body.taskVideoCallSeconds ?? body.task_video_call_seconds);
      if (Number.isFinite(secs) && secs > Number(current.task_video_call_seconds || 0) && !current.task_video_call_claimed) {
        const delta = Math.min(600, Math.floor(secs - Number(current.task_video_call_seconds || 0)));
        if (delta > 0) {
          await applyDailyRewardProgressAdmin({ userId, rewardDay, type: 'video_call', seconds: delta, missions });
        }
      }

      const moments = Number(body.taskMomentInteractions ?? body.task_moment_interactions);
      if (Number.isFinite(moments) && moments > Number(current.task_moment_interactions || 0) && !current.task_moment_claimed) {
        const delta = Math.min(5, Math.floor(moments - Number(current.task_moment_interactions || 0)));
        for (let i = 0; i < delta; i++) {
          await applyDailyRewardProgressAdmin({ userId, rewardDay, type: 'moment', missions });
        }
      }

      const gifts = Number(body.taskGiftCount ?? body.task_gift_count);
      if (Number.isFinite(gifts) && gifts > Number(current.task_gift_count || 0) && !current.task_gift_claimed) {
        const delta = Math.min(5, Math.floor(gifts - Number(current.task_gift_count || 0)));
        for (let i = 0; i < delta; i++) {
          await applyDailyRewardProgressAdmin({ userId, rewardDay, type: 'gift', missions });
        }
      }

      const refreshed = await fetchUserDailyRewardsAdmin(userId);
      return res.json({
        success: true,
        data: refreshed.data ? mapDailyRewardsRowToRecord(refreshed.data) : null,
        note: 'Claim flags and coin totals from client are ignored; use claim endpoints to award coins.',
      });
    } catch (err: any) {
      return res.status(500).json({ success: false, error: { message: err.message || 'Server error', code: 'SERVER_ERROR' } });
    }
  });

  return router;
}

function evaluateMissionEligibility(
  row: any,
  missionKey: MissionKey,
  missions: Record<string, any>
): { ok: true; baseReward: number } | { ok: false; message: string; code: string } {
  if (missionKey === 'chat_friends') {
    if (row.task_chat_claimed) return { ok: false, message: 'Mission already claimed', code: 'ALREADY_CLAIMED' };
    const target = Number(missions.chatFriends?.target || 3);
    if ((row.task_chat_friends?.length || 0) < target) {
      return { ok: false, message: 'Mission progress incomplete', code: 'INCOMPLETE' };
    }
    return { ok: true, baseReward: Number(missions.chatFriends?.reward || 25) };
  }
  if (missionKey === 'quick_matches') {
    if (row.task_quick_match_claimed) return { ok: false, message: 'Mission already claimed', code: 'ALREADY_CLAIMED' };
    const target = Number(missions.quickMatches?.target || 10);
    if (Number(row.task_quick_matches || 0) < target) {
      return { ok: false, message: 'Mission progress incomplete', code: 'INCOMPLETE' };
    }
    return { ok: true, baseReward: Number(missions.quickMatches?.reward || 30) };
  }
  if (missionKey === 'video_call') {
    // Video target is stored/compared in SECONDS (admin label: Min Seconds; UI shows minutes).
    if (row.task_video_call_claimed) return { ok: false, message: 'Mission already claimed', code: 'ALREADY_CLAIMED' };
    const target = Number(missions.videoCall?.target || 60);
    if (Number(row.task_video_call_seconds || 0) < target) {
      return { ok: false, message: 'Mission progress incomplete', code: 'INCOMPLETE' };
    }
    return { ok: true, baseReward: Number(missions.videoCall?.reward || 35) };
  }
  if (missionKey === 'moment_interact') {
    if (row.task_moment_claimed) return { ok: false, message: 'Mission already claimed', code: 'ALREADY_CLAIMED' };
    const target = Number(missions.momentInteract?.target || 3);
    if (Number(row.task_moment_interactions || 0) < target) {
      return { ok: false, message: 'Mission progress incomplete', code: 'INCOMPLETE' };
    }
    return { ok: true, baseReward: Number(missions.momentInteract?.reward || 15) };
  }
  if (missionKey === 'send_gift') {
    if (row.task_gift_claimed) return { ok: false, message: 'Mission already claimed', code: 'ALREADY_CLAIMED' };
    const target = Number(missions.sendGift?.target || 1);
    if (Number(row.task_gift_count || 0) < target) {
      return { ok: false, message: 'Mission progress incomplete', code: 'INCOMPLETE' };
    }
    return { ok: true, baseReward: Number(missions.sendGift?.reward || 20) };
  }
  return { ok: false, message: 'Invalid mission', code: 'INVALID_MISSION' };
}
