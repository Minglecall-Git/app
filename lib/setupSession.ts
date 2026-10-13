/**
 * Setup wizard session tokens — Redis-backed with HMAC-signed fallback (never in-memory Map).
 */
import { createHmac, randomBytes, timingSafeEqual } from 'crypto';
import { getRedis, isRedisConfigured } from './redis';

const SETUP_TOKEN_PREFIX = 'setup:session:';
const TTL_SEC = 24 * 60 * 60;

function sessionSecret(): string {
  const s =
    process.env.SETUP_SESSION_SECRET ||
    process.env.SETUP_MASTER_KEY ||
    process.env.SUPABASE_SECRET_KEY ||
    '';
  return s || 'minglecall-setup-session-dev-only';
}

function signToken(base: string): string {
  const sig = createHmac('sha256', sessionSecret()).update(base).digest('hex');
  return `${base}.${sig}`;
}

function verifySignedToken(token: string): boolean {
  const dot = token.lastIndexOf('.');
  if (dot <= 0) return false;
  const base = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  if (!base.startsWith('setup_')) return false;
  const expected = createHmac('sha256', sessionSecret()).update(base).digest('hex');
  if (sig.length !== expected.length) return false;
  try {
    return timingSafeEqual(Buffer.from(sig, 'utf8'), Buffer.from(expected, 'utf8'));
  } catch {
    return false;
  }
}

/** Issue a setup session token (stores in Redis when configured). */
export async function issueSetupToken(): Promise<string> {
  const base = `setup_${randomBytes(24).toString('hex')}`;
  const redis = getRedis();
  if (redis && isRedisConfigured()) {
    await redis.set(`${SETUP_TOKEN_PREFIX}${base}`, '1', { ex: TTL_SEC });
    return base;
  }
  return signToken(base);
}

/** Validate x-setup-token / body.setupToken. */
export async function validateSetupToken(raw: unknown): Promise<boolean> {
  const token = String(raw || '').trim();
  if (!token) return false;

  const redis = getRedis();
  if (redis && isRedisConfigured() && !token.includes('.')) {
    const v = await redis.get(`${SETUP_TOKEN_PREFIX}${token}`);
    if (v === '1' || v === 1) return true;
  }

  return verifySignedToken(token);
}

export async function revokeSetupToken(raw: unknown): Promise<void> {
  const token = String(raw || '').trim();
  if (!token || token.includes('.')) return;
  const redis = getRedis();
  if (redis && isRedisConfigured()) {
    await redis.del(`${SETUP_TOKEN_PREFIX}${token}`);
  }
}
