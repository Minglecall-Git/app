/**
 * Upstash Redis — server-only. Never import from client components.
 * Keys: presence:{userId}, profile:{userId}, rate:{userId}:{endpoint}, call:{callId},
 * call:ledger:{callId}, signup:{email}, creator:online:{userId}, creator:online:dirty
 *
 * Credential order: UPSTASH_REDIS_REST_* , then Vercel KV_REST_API_* , then https REDIS_URL / KV_URL.
 */
import { Redis } from '@upstash/redis';

let redis: Redis | null | undefined;

const REDIS_NOT_CONFIGURED =
  'Redis REST credentials are not configured. Set UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN, or KV_REST_API_URL and KV_REST_API_TOKEN.';

function cleanEnv(value: string | undefined): string {
  return String(value || '')
    .trim()
    .replace(/^["']|["']$/g, '');
}

function httpUrl(value: string | undefined): string {
  const url = cleanEnv(value);
  return /^https?:\/\//i.test(url) ? url : '';
}

export type RedisCredentialSource = {
  url: string;
  token: string;
  urlSource: string | null;
  tokenSource: string | null;
};

/** Same env fallback order as documented above. */
export function getRedisRestCredentials(): RedisCredentialSource {
  const upstashUrl = httpUrl(process.env.UPSTASH_REDIS_REST_URL);
  const kvRestUrl = httpUrl(process.env.KV_REST_API_URL);
  const redisHttpUrl = httpUrl(process.env.REDIS_URL);
  const kvHttpUrl = httpUrl(process.env.KV_URL);
  const upstashToken = cleanEnv(process.env.UPSTASH_REDIS_REST_TOKEN);
  const kvToken = cleanEnv(process.env.KV_REST_API_TOKEN);

  let url = '';
  let urlSource: string | null = null;
  if (upstashUrl) {
    url = upstashUrl;
    urlSource = 'UPSTASH_REDIS_REST_URL';
  } else if (kvRestUrl) {
    url = kvRestUrl;
    urlSource = 'KV_REST_API_URL';
  } else if (redisHttpUrl) {
    url = redisHttpUrl;
    urlSource = 'REDIS_URL';
  } else if (kvHttpUrl) {
    url = kvHttpUrl;
    urlSource = 'KV_URL';
  }

  let token = '';
  let tokenSource: string | null = null;
  if (upstashToken) {
    token = upstashToken;
    tokenSource = 'UPSTASH_REDIS_REST_TOKEN';
  } else if (kvToken) {
    token = kvToken;
    tokenSource = 'KV_REST_API_TOKEN';
  }

  return { url, token, urlSource, tokenSource };
}

export function isRedisConfigured(): boolean {
  const { url, token } = getRedisRestCredentials();
  return Boolean(url && token);
}

function redisHostLabel(url: string): string {
  try {
    return new URL(url).host || 'unknown-host';
  } catch {
    return 'invalid-url';
  }
}

/** Normalize Upstash/undici failures for API + admin diagnostics (never include the token). */
export function formatRedisError(err: unknown, fallback = 'Redis request failed'): string {
  const { url, urlSource } = getRedisRestCredentials();
  const host = url ? redisHostLabel(url) : 'unconfigured';
  const source = urlSource || 'none';
  const root = err as { message?: string; cause?: { message?: string; code?: string } | Error };
  const message = String(root?.message || fallback);
  const causeMsg =
    root?.cause && typeof root.cause === 'object'
      ? String((root.cause as { message?: string }).message || root.cause)
      : '';
  const causeCode =
    root?.cause && typeof root.cause === 'object'
      ? String((root.cause as { code?: string }).code || '')
      : '';

  if (/fetch failed/i.test(message) || causeCode === 'ENOTFOUND' || /ENOTFOUND/i.test(causeMsg)) {
    const dns = causeCode || (causeMsg.match(/ENOTFOUND\s+(\S+)/)?.[0] ?? causeMsg) || 'network error';
    return `Upstash REST unreachable (${dns}) via ${source} → ${host}. Set non-empty UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN (HTTPS). A rediss:// REDIS_URL alone is not enough.`;
  }
  if (/unauthorized|forbidden|401|403/i.test(message) || /unauthorized|forbidden|401|403/i.test(causeMsg)) {
    return `Upstash REST rejected credentials via ${source} → ${host}. Check UPSTASH_REDIS_REST_TOKEN (or KV_REST_API_TOKEN).`;
  }
  return `${message} (via ${source} → ${host})`;
}

export function getRedis(): Redis | null {
  if (redis !== undefined) return redis;
  const { url, token } = getRedisRestCredentials();
  if (!url || !token) {
    redis = null;
    return null;
  }
  redis = new Redis({ url, token });
  return redis;
}

/** Presence lease TTL (30–45s window). Refreshed by ~15–20s client heartbeats. */
export const PRESENCE_TTL_SEC = 40;
export const PROFILE_CACHE_TTL_SEC = 60;
export const RATE_LIMIT_WINDOW_SEC = 60;

export type PresenceStatus = 'online' | 'busy' | 'offline';

export function presenceKey(userId: string): string {
  return `presence:${userId}`;
}

export function profileCacheKey(userId: string): string {
  return `profile:${userId}`;
}

export function rateLimitKey(userId: string, endpoint: string): string {
  return `rate:${userId}:${endpoint}`;
}

export function callStateKey(callId: string): string {
  return `call:${callId}`;
}

/** Ephemeral per-call billing buffer (flushed to Postgres on call end). */
export function callLedgerKey(callId: string): string {
  return `call:ledger:${callId}`;
}

export const CALL_LEDGER_TTL_SEC = 4 * 60 * 60;
export const CALL_LEDGER_DIRTY_SET = 'call:ledger:dirty';

/** In-progress signup credentials (hashed password + metadata) — 1h TTL, keyed by normalized email. */
export const PENDING_SIGNUP_TTL_SEC = 60 * 60;

export type PendingSignupRecord = {
  passwordHash: string;
  name?: string;
  role?: string;
  updatedAt: number;
};

export function pendingSignupKey(email: string): string {
  const clean = String(email || '')
    .trim()
    .toLowerCase();
  return `signup:${clean}`;
}

export async function setPendingSignup(
  email: string,
  payload: { passwordHash: string; name?: string; role?: string }
): Promise<boolean> {
  const client = getRedis();
  if (!client) return false;
  const record: PendingSignupRecord = { ...payload, updatedAt: Date.now() };
  await client.set(pendingSignupKey(email), JSON.stringify(record), { ex: PENDING_SIGNUP_TTL_SEC });
  return true;
}

export async function getPendingSignup(email: string): Promise<PendingSignupRecord | null> {
  const client = getRedis();
  if (!client) return null;
  const raw = await client.get<string>(pendingSignupKey(email));
  if (!raw) return null;
  try {
    const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
    if (!parsed?.passwordHash) return null;
    return parsed as PendingSignupRecord;
  } catch {
    return null;
  }
}

export async function deletePendingSignup(email: string): Promise<void> {
  const client = getRedis();
  if (!client) return;
  await client.del(pendingSignupKey(email));
}

export class RedisUnavailableError extends Error {
  code = 'REDIS_UNAVAILABLE';
  constructor(message = 'Redis presence store unavailable') {
    super(message);
    this.name = 'RedisUnavailableError';
  }
}

/** Heartbeat / presence writes — Redis only. Throws if unconfigured or unreachable. */
export async function setPresence(
  userId: string,
  status: PresenceStatus,
  ttlSec: number = PRESENCE_TTL_SEC
): Promise<true> {
  const client = getRedis();
  if (!client || !userId) {
    throw new RedisUnavailableError(REDIS_NOT_CONFIGURED);
  }
  try {
    await client.set(presenceKey(userId), status, { ex: ttlSec });
    return true;
  } catch (err: unknown) {
    throw new RedisUnavailableError(formatRedisError(err, 'Redis SET failed'));
  }
}

export async function deletePresence(userId: string): Promise<void> {
  const client = getRedis();
  if (!client || !userId) {
    throw new RedisUnavailableError(REDIS_NOT_CONFIGURED);
  }
  try {
    await client.del(presenceKey(userId));
  } catch (err: unknown) {
    throw new RedisUnavailableError(formatRedisError(err, 'Redis DEL failed'));
  }
}

export async function getPresence(userId: string): Promise<PresenceStatus | null> {
  const client = getRedis();
  if (!client || !userId) return null;
  const v = await client.get<string>(presenceKey(userId));
  if (v === 'online' || v === 'busy' || v === 'offline') return v;
  return null;
}

/** Batch presence for visible user IDs only (never full directory). */
export async function mgetPresence(
  userIds: string[]
): Promise<Record<string, PresenceStatus>> {
  const client = getRedis();
  const out: Record<string, PresenceStatus> = {};
  if (!client) {
    throw new RedisUnavailableError(REDIS_NOT_CONFIGURED);
  }
  if (!userIds.length) return out;
  const ids = Array.from(new Set(userIds.map((id) => String(id || '').trim()).filter(Boolean))).slice(
    0,
    200
  );
  if (!ids.length) return out;
  try {
    const keys = ids.map(presenceKey);
    const values = await client.mget<(string | null)[]>(...keys);
    ids.forEach((id, i) => {
      const v = values?.[i];
      if (v === 'online' || v === 'busy' || v === 'offline') out[id] = v;
      else out[id] = 'offline';
    });
    return out;
  } catch (err: unknown) {
    if (err instanceof RedisUnavailableError) throw err;
    throw new RedisUnavailableError(formatRedisError(err, 'Redis MGET failed'));
  }
}

export async function setCallState(
  callId: string,
  state: Record<string, unknown>,
  ttlSec: number = 4 * 60 * 60
): Promise<void> {
  const client = getRedis();
  if (!client || !callId) return;
  await client.set(callStateKey(callId), JSON.stringify(state), { ex: ttlSec });
}

export async function getCallState(callId: string): Promise<Record<string, unknown> | null> {
  const client = getRedis();
  if (!client || !callId) return null;
  const raw = await client.get<string>(callStateKey(callId));
  if (!raw) return null;
  try {
    return typeof raw === 'string' ? JSON.parse(raw) : (raw as Record<string, unknown>);
  } catch {
    return null;
  }
}

export async function deleteCallState(callId: string): Promise<void> {
  const client = getRedis();
  if (!client || !callId) return;
  await client.del(callStateKey(callId));
}

export type CallLedgerMinute = {
  billingMinute: number;
  coinsBurned: number;
  hostCoinsEarned: number;
  tlCoinsEarned: number;
  tlId: string | null;
  isFriendPair: boolean;
  receiverId: string;
  callerId: string;
  receiverRole?: string;
  hostSharePercent?: number;
  tlSharePercent?: number;
  usedOverride?: boolean;
  bufferedAt: string;
};

export type CallLedgerDoc = {
  callId: string;
  callerId: string;
  receiverId: string;
  minutes: CallLedgerMinute[];
  updatedAt: string;
};

export async function getCallLedger(callId: string): Promise<CallLedgerDoc | null> {
  const client = getRedis();
  if (!client || !callId) return null;
  try {
    const raw = await client.get<string>(callLedgerKey(callId));
    if (!raw) return null;
    const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
    if (!parsed || !Array.isArray(parsed.minutes)) return null;
    return parsed as CallLedgerDoc;
  } catch {
    return null;
  }
}

export async function saveCallLedger(doc: CallLedgerDoc): Promise<void> {
  const client = getRedis();
  if (!client || !doc?.callId) {
    throw new RedisUnavailableError(REDIS_NOT_CONFIGURED);
  }
  try {
    await client.set(callLedgerKey(doc.callId), JSON.stringify(doc), { ex: CALL_LEDGER_TTL_SEC });
    await client.sadd(CALL_LEDGER_DIRTY_SET, doc.callId);
  } catch (err: unknown) {
    throw new RedisUnavailableError(formatRedisError(err, 'Redis call ledger SET failed'));
  }
}

/** Atomically take ledger for flush. Requeue with saveCallLedger on failure. */
export async function takeCallLedger(callId: string): Promise<CallLedgerDoc | null> {
  const client = getRedis();
  if (!client || !callId) return null;
  try {
    const raw = await client.getdel<string>(callLedgerKey(callId));
    await client.srem(CALL_LEDGER_DIRTY_SET, callId);
    if (!raw) return null;
    const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
    if (!parsed || !Array.isArray(parsed.minutes)) return null;
    return parsed as CallLedgerDoc;
  } catch (err: unknown) {
    throw new RedisUnavailableError(formatRedisError(err, 'Redis call ledger TAKE failed'));
  }
}

export async function deleteCallLedger(callId: string): Promise<void> {
  const client = getRedis();
  if (!client || !callId) return;
  try {
    await client.del(callLedgerKey(callId));
    await client.srem(CALL_LEDGER_DIRTY_SET, callId);
  } catch {
    /* best effort */
  }
}

export async function listDirtyCallLedgerIds(limit = 100): Promise<string[]> {
  const client = getRedis();
  if (!client) return [];
  try {
    const members = await client.smembers(CALL_LEDGER_DIRTY_SET);
    if (!Array.isArray(members)) return [];
    return members.map(String).filter(Boolean).slice(0, Math.max(1, Math.min(limit, 200)));
  } catch {
    return [];
  }
}

/** Simple fixed-window rate limit. Returns true if allowed. */
export async function checkRateLimit(
  userId: string,
  endpoint: string,
  max: number,
  windowSec: number = RATE_LIMIT_WINDOW_SEC
): Promise<boolean> {
  const client = getRedis();
  if (!client || !userId) return true;
  const key = rateLimitKey(userId, endpoint);
  const n = await client.incr(key);
  if (n === 1) await client.expire(key, windowSec);
  return n <= max;
}

/** Ephemeral creator online-time accrual (flushed to Postgres on lifecycle / cron). */
export const CREATOR_ONLINE_TICK_SEC = 45;
/** Ignore duplicate ticks closer than this (ms). */
export const CREATOR_ONLINE_MIN_GAP_MS = 30_000;
export const CREATOR_ONLINE_PENDING_TTL_SEC = 7 * 24 * 60 * 60;
export const CREATOR_ONLINE_DIRTY_SET = 'creator:online:dirty';

export function creatorOnlinePendingKey(userId: string): string {
  return `creator:online:${userId}`;
}

export function creatorOnlineLastTickKey(userId: string): string {
  return `creator:online:last:${userId}`;
}

/**
 * Accrue one heartbeat tick of online seconds in Redis only.
 * Returns pending total after incr (0 if skipped by min-gap / Redis down).
 */
export async function accrueCreatorOnlineTick(
  userId: string,
  tickSec: number = CREATOR_ONLINE_TICK_SEC
): Promise<number> {
  const client = getRedis();
  if (!client || !userId || tickSec <= 0) return 0;
  const lastKey = creatorOnlineLastTickKey(userId);
  const pendingKey = creatorOnlinePendingKey(userId);
  const now = Date.now();
  try {
    const lastRaw = await client.get<string | number>(lastKey);
    const lastMs = lastRaw != null ? Number(lastRaw) : 0;
    if (Number.isFinite(lastMs) && lastMs > 0 && now - lastMs < CREATOR_ONLINE_MIN_GAP_MS) {
      const pending = await client.get<string | number>(pendingKey);
      return Math.max(0, Math.floor(Number(pending) || 0));
    }
    const next = await client.incrby(pendingKey, tickSec);
    await client.expire(pendingKey, CREATOR_ONLINE_PENDING_TTL_SEC);
    await client.set(lastKey, String(now), { ex: CREATOR_ONLINE_PENDING_TTL_SEC });
    await client.sadd(CREATOR_ONLINE_DIRTY_SET, userId);
    return Math.max(0, Math.floor(Number(next) || 0));
  } catch (err: any) {
    throw new RedisUnavailableError(err?.message || 'Redis creator online accrue failed');
  }
}

export async function getCreatorOnlinePending(userId: string): Promise<number> {
  const client = getRedis();
  if (!client || !userId) return 0;
  try {
    const pending = await client.get<string | number>(creatorOnlinePendingKey(userId));
    return Math.max(0, Math.floor(Number(pending) || 0));
  } catch {
    return 0;
  }
}

/** Atomically take pending seconds for flush. Re-credit with requeueCreatorOnlinePending on failure. */
export async function takeCreatorOnlinePending(userId: string): Promise<number> {
  const client = getRedis();
  if (!client || !userId) return 0;
  try {
    const raw = await client.getdel<string | number>(creatorOnlinePendingKey(userId));
    const secs = Math.max(0, Math.floor(Number(raw) || 0));
    if (secs > 0) await client.srem(CREATOR_ONLINE_DIRTY_SET, userId);
    return secs;
  } catch (err: any) {
    throw new RedisUnavailableError(err?.message || 'Redis creator online take failed');
  }
}

export async function requeueCreatorOnlinePending(userId: string, seconds: number): Promise<void> {
  const client = getRedis();
  if (!client || !userId || seconds <= 0) return;
  try {
    await client.incrby(creatorOnlinePendingKey(userId), seconds);
    await client.expire(creatorOnlinePendingKey(userId), CREATOR_ONLINE_PENDING_TTL_SEC);
    await client.sadd(CREATOR_ONLINE_DIRTY_SET, userId);
  } catch (err: any) {
    throw new RedisUnavailableError(err?.message || 'Redis creator online requeue failed');
  }
}

export async function listDirtyCreatorOnlineIds(limit = 200): Promise<string[]> {
  const client = getRedis();
  if (!client) return [];
  try {
    const members = await client.smembers(CREATOR_ONLINE_DIRTY_SET);
    if (!Array.isArray(members)) return [];
    return members.map(String).filter(Boolean).slice(0, Math.max(1, Math.min(limit, 500)));
  } catch {
    return [];
  }
}
