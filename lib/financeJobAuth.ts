import type { NextRequest } from 'next/server';
import { requireAdmin } from './nextAuth';

function getConfiguredJobSecret(): string {
  return (
    process.env.FINANCE_JOB_SECRET ||
    process.env.CRON_SECRET ||
    process.env.FINANCE_CRON_SECRET ||
    ''
  ).trim();
}

function timingSafeEqualString(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let out = 0;
  for (let i = 0; i < a.length; i++) out |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return out === 0;
}

function extractJobSecret(req: NextRequest, body?: Record<string, unknown>): string {
  const header =
    req.headers.get('x-finance-job-secret') ||
    req.headers.get('x-cron-secret') ||
    '';
  if (header && String(header).trim()) return String(header).trim();

  const configured = getConfiguredJobSecret();
  const auth = String(req.headers.get('authorization') || '').trim();
  if (configured && /^Bearer\s+/i.test(auth)) {
    const bearer = auth.replace(/^Bearer\s+/i, '').trim();
    if (bearer && timingSafeEqualString(bearer, configured)) return bearer;
  }

  const bodySecret = body?.jobSecret || body?.secret;
  if (typeof bodySecret === 'string' && bodySecret.trim()) return bodySecret.trim();
  return '';
}

export type FinanceJobAuthResult = {
  ok: boolean;
  mode?: 'secret' | 'admin';
  userId?: string;
  profileId?: string;
  status: number;
  error: { message: string; code: string };
};

const OK = { status: 0, error: { message: '', code: '' } };

/**
 * Auth for finance cron/job endpoints.
 * Production: job secret required (admin JWT alone insufficient).
 * Non-production: job secret OR admin JWT.
 */
export async function requireFinanceJobAuth(
  req: NextRequest,
  body?: Record<string, unknown>
): Promise<FinanceJobAuthResult> {
  const configured = getConfiguredJobSecret();
  const provided = extractJobSecret(req, body);
  const isProd = String(process.env.NODE_ENV || '').toLowerCase() === 'production';

  if (isProd && !configured) {
    return {
      ok: false,
      status: 503,
      error: {
        message: 'FINANCE_JOB_SECRET (or CRON_SECRET) must be configured in production',
        code: 'JOB_SECRET_REQUIRED',
      },
    };
  }

  if (configured && provided && timingSafeEqualString(provided, configured)) {
    return { ok: true, mode: 'secret', ...OK };
  }

  if (isProd && configured) {
    return {
      ok: false,
      status: 401,
      error: { message: 'Invalid or missing finance job secret', code: 'JOB_AUTH_FAILED' },
    };
  }

  const admin = await requireAdmin(req);
  if (!admin.ok) {
    return {
      ok: false,
      status: admin.status,
      error: admin.error,
    };
  }
  return {
    ok: true,
    mode: 'admin',
    userId: admin.userId,
    profileId: admin.profileId,
    ...OK,
  };
}
