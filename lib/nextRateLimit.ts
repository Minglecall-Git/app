/**
 * Redis-backed rate limit helpers for native Next Route Handlers.
 * Falls open (allows) when Redis is unavailable — same pragmatic stance as checkRateLimit.
 */
import type { NextRequest } from 'next/server';
import { checkRateLimit, isRedisConfigured } from './redis';
import { getClientIp } from './nextRequest';
import { jsonErr } from './nextAuth';

function envInt(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw == null || raw === '') return fallback;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback;
}

const RATE_LIMIT_DISABLED =
  String(process.env.RATE_LIMIT_DISABLED || '').toLowerCase() === 'true';

const PUBLIC_MAX = envInt('RATE_LIMIT_PUBLIC_MAX', 90);
const PUBLIC_WINDOW_SEC = Math.max(1, Math.floor(envInt('RATE_LIMIT_PUBLIC_WINDOW_MS', 60_000) / 1000));
const AUTH_MAX = envInt('RATE_LIMIT_AUTHENTICATED_MAX', 240);
const AUTH_WINDOW_SEC = Math.max(1, Math.floor(envInt('RATE_LIMIT_AUTHENTICATED_WINDOW_MS', 60_000) / 1000));
const SENSITIVE_MAX = envInt('RATE_LIMIT_SENSITIVE_MAX', 40);
const SENSITIVE_WINDOW_SEC = Math.max(1, Math.floor(envInt('RATE_LIMIT_SENSITIVE_WINDOW_MS', 60_000) / 1000));
const AUTH_STRICT_MAX = envInt('RATE_LIMIT_AUTH_STRICT_IP_FREE', 10);
const AUTH_STRICT_WINDOW_SEC = Math.max(1, Math.floor(envInt('RATE_LIMIT_AUTH_WINDOW_MS', 900_000) / 1000));
const OTP_SEND_MAX = envInt('RATE_LIMIT_AUTH_OTP_SEND_IP_FREE', 5);
const OTP_VERIFY_MAX = envInt('RATE_LIMIT_AUTH_OTP_VERIFY_IP_FREE', 20);

export type RateLimitTier = 'public' | 'authenticated' | 'sensitive' | 'authStrict' | 'otpSend' | 'otpVerify';

async function allow(key: string, endpoint: string, max: number, windowSec: number): Promise<boolean> {
  if (RATE_LIMIT_DISABLED || !isRedisConfigured()) return true;
  return checkRateLimit(key, endpoint, max, windowSec);
}

/** Returns null if allowed, or a 429 Response if limited. */
export async function enforceRateLimit(
  req: NextRequest,
  tier: RateLimitTier,
  identity?: string
): Promise<Response | null> {
  const ip = getClientIp(req);
  const id = (identity || ip || 'anon').trim() || 'anon';

  let endpoint: string;
  let max: number;
  let windowSec: number;

  switch (tier) {
    case 'public':
      endpoint = 'tier:public';
      max = PUBLIC_MAX;
      windowSec = PUBLIC_WINDOW_SEC;
      break;
    case 'authenticated':
      endpoint = 'tier:authenticated';
      max = AUTH_MAX;
      windowSec = AUTH_WINDOW_SEC;
      break;
    case 'sensitive':
      endpoint = 'tier:sensitive';
      max = SENSITIVE_MAX;
      windowSec = SENSITIVE_WINDOW_SEC;
      break;
    case 'authStrict':
      endpoint = 'tier:authStrict';
      max = AUTH_STRICT_MAX;
      windowSec = AUTH_STRICT_WINDOW_SEC;
      break;
    case 'otpSend':
      endpoint = 'tier:otpSend';
      max = OTP_SEND_MAX;
      windowSec = AUTH_STRICT_WINDOW_SEC;
      break;
    case 'otpVerify':
      endpoint = 'tier:otpVerify';
      max = OTP_VERIFY_MAX;
      windowSec = AUTH_STRICT_WINDOW_SEC;
      break;
    default:
      return null;
  }

  const ok = await allow(id, endpoint, max, windowSec);
  if (ok) return null;
  return jsonErr(429, 'Too many requests. Please try again later.', 'RATE_LIMITED');
}
