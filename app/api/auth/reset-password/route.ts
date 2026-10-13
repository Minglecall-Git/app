import { NextRequest } from 'next/server';
import { getPasswordPolicyError } from '../../../../shared/passwordPolicy';
import { createServiceClient } from '../../../../lib/nextAuth';
import { enforceRateLimit } from '../../../../lib/nextRateLimit';
import { parseJsonBody } from '../../../../lib/nextRequest';
import { authFail, authJson, findProfileByEmail, isValidEmail, isValidOtpToken, safeClientError } from '../../../../lib/authHelpers';
import { verifyOtpDb } from '../../../../lib/otpDb';
import {
  hashPassword,
  isProfileBanned,
  isSupabaseAdminConfigured,
  updateUserPasswordAdmin,
} from '../../../../server/supabaseAdmin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const limited = await enforceRateLimit(req, 'authStrict');
  if (limited) return authFail(429, 'Too many requests. Please try again later.');

  const parsed = await parseJsonBody<{ email?: string; token?: string; newPassword?: string; password?: string }>(req);
  if (!parsed.ok) return authFail(parsed.status, parsed.error.message);

  try {
    const email = parsed.data?.email;
    const token = parsed.data?.token;
    const newPassword = parsed.data?.newPassword ?? parsed.data?.password;

    if (!isValidEmail(email)) {
      return authFail(400, 'A valid email address is required.');
    }
    if (!isValidOtpToken(token)) {
      return authFail(400, 'A valid 6-digit verification code is required.');
    }
    const policyError = getPasswordPolicyError(newPassword);
    if (policyError) {
      return authFail(400, policyError);
    }

    const cleanEmail = email.trim().toLowerCase();
    const client = createServiceClient();
    if (!client) {
      return authFail(503, 'Authentication service is not configured.');
    }

    const verifyResult = await verifyOtpDb(client, cleanEmail, String(token).trim());
    if (!verifyResult.success) {
      return authFail(400, verifyResult.error || 'Invalid or expired OTP code');
    }

    const existing = await findProfileByEmail(cleanEmail);
    if (existing) {
      const banCheck = isProfileBanned(existing);
      if (banCheck.isBanned) {
        return authFail(403, banCheck.message, { isBanned: true });
      }
    }

    const passwordHash = await hashPassword(String(newPassword));
    const userId = existing?.id || '';

    if (existing) {
      await client
        .from('profiles')
        .update({ password_hash: passwordHash, has_password_set: true } as Record<string, unknown>)
        .eq('id', existing.id);
    }

    if (isSupabaseAdminConfigured()) {
      const adminRes = await updateUserPasswordAdmin(userId, String(newPassword), cleanEmail);
      if (!adminRes.success && !existing) {
        return authFail(404, 'No account found for this email. Please register instead.');
      }
      if (!adminRes.success && existing) {
        return authFail(500, safeClientError(adminRes.error, 'Failed to reset password'));
      }
    } else if (!existing) {
      return authFail(404, 'No account found for this email. Please register instead.');
    }

    return authJson({
      success: true,
      message: 'Password reset successfully. You can now sign in with your new password.',
    });
  } catch (err: unknown) {
    console.error('[next /api/auth/reset-password]', err);
    return authFail(500, safeClientError(err, 'Failed to reset password'));
  }
}
