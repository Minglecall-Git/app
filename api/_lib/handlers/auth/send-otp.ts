import {
  sendJson,
  readJsonBody,
  createServiceClient,
  type VercelReq,
  type VercelRes,
} from '../../vercelAuth';
import { isValidEmail, sanitizePublicSignupRole, getPasswordPolicyError } from '../../authHelpers';
import { generateSixDigitOtp, sendOtpEmailVercel, isSmtpConfigured } from '../../mail';
import { saveOtpDb, savePendingSignupDb } from '../../otpDb';
import { createHash } from 'crypto';

function hashPasswordSync(password: string): string {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const bcrypt = require('bcryptjs');
    return bcrypt.hashSync(password, 10);
  } catch {
    return `sha256:${createHash('sha256').update(password).digest('hex')}`;
  }
}

async function getAllowSkipOtp(
  client: NonNullable<ReturnType<typeof createServiceClient>>
): Promise<{ allowCreateWithoutOtp: boolean; emailRegisterEnabled: boolean; emailShowOtpFallback: boolean }> {
  try {
    const { data } = await client
      .from('system_configs')
      .select('email_register_enabled, allow_create_without_otp, email_show_otp_fallback')
      .limit(1)
      .maybeSingle();
    return {
      emailRegisterEnabled: data?.email_register_enabled != null ? Boolean(data.email_register_enabled) : true,
      allowCreateWithoutOtp: Boolean(data?.allow_create_without_otp),
      emailShowOtpFallback: Boolean(data?.email_show_otp_fallback),
    };
  } catch {
    return { emailRegisterEnabled: true, allowCreateWithoutOtp: false, emailShowOtpFallback: false };
  }
}

export default async function handler(req: VercelReq, res: VercelRes) {
  if (req.method === 'OPTIONS') {
    res.statusCode = 204;
    res.end();
    return;
  }
  if (req.method !== 'POST') {
    return sendJson(res, 405, { success: false, error: 'Method not allowed' });
  }

  try {
    const body = await readJsonBody(req);
    const { email, name, role, confirmationUrl, password } = body || {};
    if (!isValidEmail(email)) {
      return sendJson(res, 400, { success: false, error: 'A valid email address is required' });
    }

    const cleanEmail = email.toLowerCase().trim();
    const client = createServiceClient();
    if (!client) {
      return sendJson(res, 503, { success: false, error: 'Supabase is not configured on this deployment.' });
    }

    const policy = await getAllowSkipOtp(client);

    const { data: existing } = await client
      .from('profiles')
      .select('id, is_banned, banned_until, ban_reason')
      .ilike('email', cleanEmail)
      .maybeSingle();

    if (existing?.is_banned) {
      const until = existing.banned_until ? new Date(existing.banned_until).getTime() : 0;
      if (!until || until > Date.now()) {
        return sendJson(res, 403, {
          success: false,
          isBanned: true,
          error: existing.ban_reason || 'This account is suspended.',
        });
      }
    }

    if (password !== undefined && password !== null && password !== '') {
      const policyError = getPasswordPolicyError(password);
      if (policyError) {
        return sendJson(res, 400, { success: false, error: policyError });
      }
    }

    // Store pending signup credentials only — Auth/profile are created after OTP verify
    // (or immediately via register-bootstrap when skipOtp is true on the client).
    if (password && !existing) {
      await savePendingSignupDb(client, cleanEmail, hashPasswordSync(password), {
        name: name || undefined,
        role: sanitizePublicSignupRole(role),
      });
    }

    if (policy.allowCreateWithoutOtp || !policy.emailRegisterEnabled) {
      return sendJson(res, 200, {
        success: true,
        delivered: false,
        skipOtp: true,
        message: policy.allowCreateWithoutOtp
          ? 'OTP skipped — admin allows account creation without email verification.'
          : 'Registration emails are disabled by admin. Completing signup without OTP.',
        showOtpInForm: false,
        smtpConfigured: isSmtpConfigured(),
        confirmationUrl: confirmationUrl || undefined,
      });
    }

    const otpCode = generateSixDigitOtp();
    await saveOtpDb(client, cleanEmail, otpCode, {
      name: name || undefined,
      role: sanitizePublicSignupRole(role),
    });

    const sendResult = await sendOtpEmailVercel({
      to: cleanEmail,
      name: name || 'User',
      otpCode,
    });

    const showOtpInForm =
      process.env.OTP_DEBUG === 'true' || policy.emailShowOtpFallback || !sendResult.delivered;
    return sendJson(res, 200, {
      success: true,
      delivered: sendResult.delivered,
      skipOtp: false,
      message: sendResult.message,
      showOtpInForm,
      otpCode: showOtpInForm ? otpCode : undefined,
      smtpConfigured: isSmtpConfigured(),
      confirmationUrl: confirmationUrl || undefined,
    });
  } catch (err: any) {
    console.error('[api/auth/send-otp]', err);
    return sendJson(res, 500, { success: false, error: err?.message || 'Failed to dispatch verification email' });
  }
}
