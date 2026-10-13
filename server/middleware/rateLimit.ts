/**
 * Tiered Express rate limiting (in-memory store).
 *
 * Multi-instance / multi-node deploys need a shared store (e.g. Redis) later —
 * the default MemoryStore is per-process only.
 *
 * Auth routes use dual per-IP + per-account (email) counters with exponential
 * backoff (Retry-After), not a fixed window hard lockout.
 *
 * Env (all optional; defaults shown):
 *   RATE_LIMIT_DISABLED=true
 *
 *   RATE_LIMIT_AUTH_WINDOW_MS=900000
 *   RATE_LIMIT_AUTH_BACKOFF_BASE_MS=1000
 *   RATE_LIMIT_AUTH_BACKOFF_MAX_MS=900000
 *   RATE_LIMIT_AUTH_BACKOFF_MULTIPLIER=2
 *
 *   RATE_LIMIT_AUTH_STRICT_IP_FREE=10        (alias: RATE_LIMIT_AUTH_MAX)
 *   RATE_LIMIT_AUTH_STRICT_ACCOUNT_FREE=5
 *   RATE_LIMIT_AUTH_OTP_SEND_IP_FREE=5
 *   RATE_LIMIT_AUTH_OTP_SEND_ACCOUNT_FREE=3
 *   RATE_LIMIT_AUTH_OTP_VERIFY_IP_FREE=20
 *   RATE_LIMIT_AUTH_OTP_VERIFY_ACCOUNT_FREE=10
 *
 *   RATE_LIMIT_PUBLIC_MAX=90
 *   RATE_LIMIT_PUBLIC_WINDOW_MS=60000
 *   RATE_LIMIT_AUTHENTICATED_MAX=240
 *   RATE_LIMIT_AUTHENTICATED_WINDOW_MS=60000
 *   RATE_LIMIT_SENSITIVE_MAX=40
 *   RATE_LIMIT_SENSITIVE_WINDOW_MS=60000
 *   RATE_LIMIT_GLOBAL_MAX=600
 *   RATE_LIMIT_GLOBAL_WINDOW_MS=60000
 */

import type { Request, Response, NextFunction, RequestHandler } from 'express';
import { rateLimit, ipKeyGenerator } from 'express-rate-limit';
import { createHash } from 'crypto';

// ---------------------------------------------------------------------------
// Env helpers — every threshold is overridable
// ---------------------------------------------------------------------------

const RATE_LIMIT_DISABLED =
  String(process.env.RATE_LIMIT_DISABLED || '').toLowerCase() === 'true';

function envInt(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw == null || raw === '') return fallback;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback;
}

/** Allows 0 (e.g. free attempts = 0 means backoff from first hit). */
function envIntAllowZero(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw == null || raw === '') return fallback;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : fallback;
}

function envNumber(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw == null || raw === '') return fallback;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

function envIntFirst(names: string[], fallback: number): number {
  for (const name of names) {
    const raw = process.env[name];
    if (raw == null || raw === '') continue;
    const n = Number(raw);
    if (Number.isFinite(n) && n > 0) return Math.floor(n);
  }
  return fallback;
}

// Auth backoff config
const AUTH_WINDOW_MS = envInt('RATE_LIMIT_AUTH_WINDOW_MS', 15 * 60 * 1000);
const AUTH_BACKOFF_BASE_MS = envInt('RATE_LIMIT_AUTH_BACKOFF_BASE_MS', 1000);
const AUTH_BACKOFF_MAX_MS = envInt('RATE_LIMIT_AUTH_BACKOFF_MAX_MS', 15 * 60 * 1000);
const AUTH_BACKOFF_MULTIPLIER = envNumber('RATE_LIMIT_AUTH_BACKOFF_MULTIPLIER', 2);

const AUTH_STRICT_IP_FREE = envIntFirst(
  ['RATE_LIMIT_AUTH_STRICT_IP_FREE', 'RATE_LIMIT_AUTH_MAX'],
  10
);
const AUTH_STRICT_ACCOUNT_FREE = envIntAllowZero('RATE_LIMIT_AUTH_STRICT_ACCOUNT_FREE', 5);
const OTP_SEND_IP_FREE = envIntAllowZero('RATE_LIMIT_AUTH_OTP_SEND_IP_FREE', 5);
const OTP_SEND_ACCOUNT_FREE = envIntAllowZero('RATE_LIMIT_AUTH_OTP_SEND_ACCOUNT_FREE', 3);
const OTP_VERIFY_IP_FREE = envIntAllowZero('RATE_LIMIT_AUTH_OTP_VERIFY_IP_FREE', 20);
const OTP_VERIFY_ACCOUNT_FREE = envIntAllowZero('RATE_LIMIT_AUTH_OTP_VERIFY_ACCOUNT_FREE', 10);

// Non-auth express-rate-limit tiers
const PUBLIC_WINDOW_MS = envInt('RATE_LIMIT_PUBLIC_WINDOW_MS', 60 * 1000);
const PUBLIC_MAX = envInt('RATE_LIMIT_PUBLIC_MAX', 90);
const AUTHENTICATED_WINDOW_MS = envInt('RATE_LIMIT_AUTHENTICATED_WINDOW_MS', 60 * 1000);
const AUTHENTICATED_MAX = envInt('RATE_LIMIT_AUTHENTICATED_MAX', 240);
const SENSITIVE_WINDOW_MS = envInt('RATE_LIMIT_SENSITIVE_WINDOW_MS', 60 * 1000);
const SENSITIVE_MAX = envInt('RATE_LIMIT_SENSITIVE_MAX', 40);
const GLOBAL_WINDOW_MS = envInt('RATE_LIMIT_GLOBAL_WINDOW_MS', 60 * 1000);
const GLOBAL_MAX = envInt('RATE_LIMIT_GLOBAL_MAX', 600);

const AUTH_BUCKET_MAP_MAX = envInt('RATE_LIMIT_AUTH_BUCKET_MAP_MAX', 10_000);

function noopLimiter(_req: Request, _res: Response, next: NextFunction) {
  next();
}

function clientIp(req: Request): string {
  const ip = req.ip || req.socket?.remoteAddress || 'unknown';
  return ipKeyGenerator(ip);
}

function authUserId(req: Request): string | null {
  const profileId = (req as any).profileId;
  const profile = (req as any).profile;
  const user = (req as any).user;
  const id = String(profileId || profile?.id || user?.id || '').trim();
  return id || null;
}

/** Prefer authenticated profile/user id; fall back to IP. */
function userOrIpKey(req: Request): string {
  const uid = authUserId(req);
  if (uid) return `u:${uid}`;
  return `ip:${clientIp(req)}`;
}

function truncateIp(ip: string): string {
  if (ip.length <= 12) return ip;
  return `${ip.slice(0, 8)}…`;
}

function redactEmail(email: string): string {
  const hash = createHash('sha256').update(email).digest('hex').slice(0, 10);
  const at = email.indexOf('@');
  const domain = at >= 0 ? email.slice(at + 1) : '?';
  return `e:${hash}@${domain}`;
}

function logRateLimited(req: Request, keyType: string, keyHint: string, retryAfterMs?: number) {
  const route = `${req.method} ${req.originalUrl || req.url}`;
  const retry = retryAfterMs != null ? ` retryAfterMs=${retryAfterMs}` : '';
  console.warn(`[rateLimit] 429 ${route} key=${keyType}:${keyHint}${retry}`);
}

function normalizeEmail(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const clean = value.toLowerCase().trim();
  if (!clean || !clean.includes('@')) return null;
  return clean;
}

function shouldSkip(req: Request): boolean {
  if (req.method === 'OPTIONS') return true;
  const path = req.path || '';
  const original = req.originalUrl || '';
  if (path === '/health' || original === '/api/health' || original.startsWith('/api/health?')) {
    return true;
  }
  return false;
}

function sendRateLimited(
  req: Request,
  res: Response,
  opts: { keyType: string; keyHint: string; retryAfterMs: number; message?: string }
) {
  const retryAfterMs = Math.max(0, Math.ceil(opts.retryAfterMs));
  const retryAfterSec = Math.max(1, Math.ceil(retryAfterMs / 1000));
  logRateLimited(req, opts.keyType, opts.keyHint, retryAfterMs);
  res.setHeader('Retry-After', String(retryAfterSec));
  return res.status(429).json({
    success: false,
    error: {
      message: opts.message || 'Too many requests. Please try again later.',
      code: 'RATE_LIMITED',
      retryAfterMs,
    },
  });
}

function rateLimitedHandler(keyType: 'ip' | 'user' | 'email') {
  return (req: Request, res: Response, _next: NextFunction, options: { windowMs?: number }) => {
    const uid = authUserId(req);
    let keyHint = truncateIp(clientIp(req));
    let logType: string = 'ip';
    if (keyType === 'user' && uid) {
      keyHint = uid.slice(0, 8);
      logType = 'user';
    } else if (keyType === 'email') {
      const email = normalizeEmail((req.body as any)?.email);
      keyHint = email ? redactEmail(email) : 'none';
      logType = 'email';
    }
    const retryAfterMs = typeof options?.windowMs === 'number' ? options.windowMs : GLOBAL_WINDOW_MS;
    return sendRateLimited(req, res, { keyType: logType, keyHint, retryAfterMs });
  };
}

function buildLimiter(opts: {
  windowMs: number;
  max: number;
  keyGenerator: (req: Request) => string;
  keyType: 'ip' | 'user' | 'email';
}): RequestHandler {
  if (RATE_LIMIT_DISABLED) return noopLimiter;

  return rateLimit({
    windowMs: opts.windowMs,
    max: opts.max,
    standardHeaders: true,
    legacyHeaders: false,
    skip: shouldSkip,
    keyGenerator: (req) => opts.keyGenerator(req),
    handler: rateLimitedHandler(opts.keyType),
    validate: { keyGeneratorIpFallback: false, xForwardedForHeader: false },
  });
}

// ---------------------------------------------------------------------------
// Auth dual IP + account exponential backoff (no hard lockout)
// ---------------------------------------------------------------------------

type AuthBackoffBucket = {
  hits: number;
  blockedUntil: number;
  windowStartedAt: number;
};

type AuthBackoffTier = {
  name: string;
  ipFreeAttempts: number;
  accountFreeAttempts: number;
  windowMs: number;
  baseMs: number;
  maxMs: number;
  multiplier: number;
};

type AuthBackoffControl = { clear: (req: Request) => void };
const authBackoffControls: Record<string, AuthBackoffControl> = {};

function computeBackoffMs(
  overageHits: number,
  baseMs: number,
  multiplier: number,
  maxMs: number
): number {
  // overageHits >= 1 → base, base*mult, base*mult^2, …
  const exp = Math.max(0, overageHits - 1);
  const raw = baseMs * Math.pow(multiplier, exp);
  if (!Number.isFinite(raw) || raw <= 0) return Math.min(baseMs, maxMs);
  return Math.min(maxMs, Math.floor(raw));
}

function getOrResetBucket(
  map: Map<string, AuthBackoffBucket>,
  key: string,
  windowMs: number,
  now: number
): AuthBackoffBucket {
  let bucket = map.get(key);
  if (!bucket || now - bucket.windowStartedAt >= windowMs) {
    bucket = { hits: 0, blockedUntil: 0, windowStartedAt: now };
    map.set(key, bucket);
  }
  return bucket;
}

function pruneAuthMaps(
  ipMap: Map<string, AuthBackoffBucket>,
  accountMap: Map<string, AuthBackoffBucket>,
  windowMs: number,
  now: number
) {
  const prune = (map: Map<string, AuthBackoffBucket>) => {
    if (map.size <= AUTH_BUCKET_MAP_MAX) return;
    for (const [key, bucket] of Array.from(map.entries())) {
      if (now - bucket.windowStartedAt >= windowMs && now >= bucket.blockedUntil) {
        map.delete(key);
      }
    }
  };
  prune(ipMap);
  prune(accountMap);
}

function createAuthDualBackoffLimiter(tier: AuthBackoffTier): RequestHandler {
  if (RATE_LIMIT_DISABLED) {
    authBackoffControls[tier.name] = { clear: () => undefined };
    return noopLimiter;
  }

  const ipMap = new Map<string, AuthBackoffBucket>();
  const accountMap = new Map<string, AuthBackoffBucket>();

  authBackoffControls[tier.name] = {
    clear(req: Request) {
      const ip = clientIp(req);
      ipMap.delete(`${tier.name}:ip:${ip}`);
      const email = normalizeEmail((req.body as any)?.email);
      if (email) accountMap.delete(`${tier.name}:acct:${email}`);
    },
  };

  return (req: Request, res: Response, next: NextFunction) => {
    if (shouldSkip(req)) return next();

    const now = Date.now();
    const ip = clientIp(req);
    const ipKey = `${tier.name}:ip:${ip}`;
    const email = normalizeEmail((req.body as any)?.email);

    pruneAuthMaps(ipMap, accountMap, tier.windowMs, now);

    const ipBucket = getOrResetBucket(ipMap, ipKey, tier.windowMs, now);

    if (ipBucket.blockedUntil > now) {
      return sendRateLimited(req, res, {
        keyType: 'ip',
        keyHint: truncateIp(ip),
        retryAfterMs: ipBucket.blockedUntil - now,
        message: 'Too many authentication attempts from this network. Please wait and try again.',
      });
    }

    let accountBucket: AuthBackoffBucket | null = null;
    if (email) {
      const accountKey = `${tier.name}:acct:${email}`;
      accountBucket = getOrResetBucket(accountMap, accountKey, tier.windowMs, now);
      if (accountBucket.blockedUntil > now) {
        return sendRateLimited(req, res, {
          keyType: 'email',
          keyHint: redactEmail(email),
          retryAfterMs: accountBucket.blockedUntil - now,
          message: 'Too many authentication attempts for this account. Please wait and try again.',
        });
      }
    }

    // Count this attempt against both dimensions.
    ipBucket.hits += 1;
    if (accountBucket) accountBucket.hits += 1;

    // Over free budget → apply exponential backoff and defer this attempt (429 + Retry-After).
    // After the wait, the client may retry; delay grows with repeated overages until the window resets.
    if (ipBucket.hits > tier.ipFreeAttempts) {
      const overage = ipBucket.hits - tier.ipFreeAttempts;
      ipBucket.blockedUntil =
        now + computeBackoffMs(overage, tier.baseMs, tier.multiplier, tier.maxMs);
      return sendRateLimited(req, res, {
        keyType: 'ip',
        keyHint: truncateIp(ip),
        retryAfterMs: ipBucket.blockedUntil - now,
        message: 'Too many authentication attempts from this network. Please wait and try again.',
      });
    }

    if (accountBucket && accountBucket.hits > tier.accountFreeAttempts) {
      const overage = accountBucket.hits - tier.accountFreeAttempts;
      accountBucket.blockedUntil =
        now + computeBackoffMs(overage, tier.baseMs, tier.multiplier, tier.maxMs);
      return sendRateLimited(req, res, {
        keyType: 'email',
        keyHint: redactEmail(email!),
        retryAfterMs: accountBucket.blockedUntil - now,
        message: 'Too many authentication attempts for this account. Please wait and try again.',
      });
    }

    return next();
  };
}

/**
 * Clears auth backoff for the request's IP + body.email after successful
 * login / OTP verify so legitimate users are not delayed after success.
 */
export function clearAuthBackoff(
  tierName: 'auth_strict' | 'otp_send' | 'otp_verify',
  req: Request
) {
  authBackoffControls[tierName]?.clear(req);
}

function authTier(
  name: string,
  ipFreeAttempts: number,
  accountFreeAttempts: number
): AuthBackoffTier {
  return {
    name,
    ipFreeAttempts,
    accountFreeAttempts,
    windowMs: AUTH_WINDOW_MS,
    baseMs: AUTH_BACKOFF_BASE_MS,
    maxMs: AUTH_BACKOFF_MAX_MS,
    multiplier: AUTH_BACKOFF_MULTIPLIER,
  };
}

// ---------------------------------------------------------------------------
// Named tiered limiters
// ---------------------------------------------------------------------------

/** login-password, register-bootstrap, reset-password — IP + account exponential backoff */
export const authStrictLimiter = createAuthDualBackoffLimiter(
  authTier('auth_strict', AUTH_STRICT_IP_FREE, AUTH_STRICT_ACCOUNT_FREE)
);

/**
 * OTP send — IP + account exponential backoff.
 * (Replaces prior hard IP cap + separate email cooldown Map.)
 */
export const authOtpSendLimiter = createAuthDualBackoffLimiter(
  authTier('otp_send', OTP_SEND_IP_FREE, OTP_SEND_ACCOUNT_FREE)
);

/**
 * OTP verify — IP + account exponential backoff.
 * emailService still caps 5 wrong codes per stored OTP independently.
 */
export const authVerifyLimiter = createAuthDualBackoffLimiter(
  authTier('otp_verify', OTP_VERIFY_IP_FREE, OTP_VERIFY_ACCOUNT_FREE)
);

/**
 * @deprecated No-op kept for import compatibility; OTP send uses authOtpSendLimiter dual backoff.
 */
export const otpSendEmailCooldown: RequestHandler = noopLimiter;

/** Unauthenticated / public API */
export const publicApiLimiter = buildLimiter({
  windowMs: PUBLIC_WINDOW_MS,
  max: PUBLIC_MAX,
  keyGenerator: (req) => `pub:${clientIp(req)}`,
  keyType: 'ip',
});

/**
 * Default for requireAuth routes.
 * Exported for optional mounting; v1 wiring prefers global + auth + sensitive only.
 */
export const authenticatedApiLimiter = buildLimiter({
  windowMs: AUTHENTICATED_WINDOW_MS,
  max: AUTHENTICATED_MAX,
  keyGenerator: userOrIpKey,
  keyType: 'user',
});

/** Money / burn / gifts / finance mutations / admin destructive */
export const sensitiveActionLimiter = buildLimiter({
  windowMs: SENSITIVE_WINDOW_MS,
  max: SENSITIVE_MAX,
  keyGenerator: userOrIpKey,
  keyType: 'user',
});

/** Backstop on all /api/* (skips OPTIONS + /api/health) */
export const globalApiLimiter = buildLimiter({
  windowMs: GLOBAL_WINDOW_MS,
  max: GLOBAL_MAX,
  keyGenerator: (req) => `api:${clientIp(req)}`,
  keyType: 'ip',
});
