import type { SupabaseClient } from '@supabase/supabase-js';
import { createServiceClient } from '../nextAuth';

const DEFAULT_STREAK = [10, 15, 20, 25, 35, 50, 100];
const DEFAULT_MISSIONS = {
  chatFriends: { target: 3, reward: 25, enabled: true },
  quickMatches: { target: 10, reward: 30, enabled: true },
  videoCall: { target: 60, reward: 35, enabled: true },
  momentInteract: { target: 3, reward: 15, enabled: true },
  sendGift: { target: 1, reward: 20, enabled: true },
  masterChest: { target: 4, reward: 50, enabled: true },
};

export const MISSION_KEYS = [
  'chat_friends',
  'quick_matches',
  'video_call',
  'moment_interact',
  'send_gift',
] as const;

export type MissionKey = (typeof MISSION_KEYS)[number];

/** Accept client local YYYY-MM-DD if within ±1 calendar day of server UTC. */
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

export async function loadRewardConfig(client?: SupabaseClient | null) {
  const db = client ?? createServiceClient();
  if (!db) {
    return { streakRewards: DEFAULT_STREAK, missions: DEFAULT_MISSIONS };
  }
  const { data } = await db
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

export function evaluateMissionEligibility(
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
