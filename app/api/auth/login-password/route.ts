import { NextRequest } from 'next/server';
import { enforceRateLimit } from '../../../../lib/nextRateLimit';
import { parseJsonBody } from '../../../../lib/nextRequest';
import { authFail, authJson, isValidEmail, mapProfileRow, safeClientError } from '../../../../lib/authHelpers';
import {
  authenticateUserWithPasswordAdmin,
  claimExclusiveSessionAdmin,
  isSupabaseAdminConfigured,
} from '../../../../server/supabaseAdmin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const limited = await enforceRateLimit(req, 'authStrict');
  if (limited) return authFail(429, 'Too many requests. Please try again later.');

  const parsed = await parseJsonBody<{ email?: string; password?: string }>(req);
  if (!parsed.ok) return authFail(parsed.status, parsed.error.message);

  try {
    const { email, password } = parsed.data || {};
    if (!isValidEmail(email) || typeof password !== 'string' || !password) {
      return authFail(400, 'Email and password are required');
    }
    if (password.trim().length === 0) {
      return authFail(401, 'Invalid email or password. Please check your credentials.');
    }

    const cleanEmail = String(email).trim().toLowerCase();
    if (!isSupabaseAdminConfigured()) {
      return authFail(503, 'Authentication service is not configured.');
    }

    const authRes = await authenticateUserWithPasswordAdmin(cleanEmail, password);
    if (authRes.success && authRes.user) {
      const normalized = mapProfileRow(authRes.user);
      const claimed = await claimExclusiveSessionAdmin(String(authRes.user.id));
      return authJson({
        success: true,
        user: normalized,
        session: authRes.session,
        activeSessionId: claimed.sessionId || null,
      });
    }

    if (authRes.error && (authRes.error.includes('suspended') || authRes.error.includes('banned'))) {
      return authFail(403, authRes.error, { isBanned: true });
    }
    if (authRes.error && /not found or was deleted/i.test(authRes.error)) {
      return authFail(401, authRes.error);
    }

    return authFail(401, authRes.error || 'Invalid email or password. Please check your credentials.');
  } catch (err: unknown) {
    console.error('[next /api/auth/login-password]', err);
    return authFail(500, safeClientError(err, 'Authentication error'));
  }
}
