import { NextRequest } from 'next/server';
import { getPasswordPolicyError } from '../../../../shared/passwordPolicy';
import { createServiceClient, sanitizePublicSignupRole } from '../../../../lib/nextAuth';
import { enforceRateLimit } from '../../../../lib/nextRateLimit';
import { parseJsonBody } from '../../../../lib/nextRequest';
import { authFail, authJson, findProfileByEmail, isValidEmail, safeClientError } from '../../../../lib/authHelpers';
import { saveOtpDb } from '../../../../lib/otpDb';
import { setPendingSignup } from '../../../../lib/redis';
import {
  generateSixDigitOtp,
  getShowOtpInForm,
  sendOtpEmail,
} from '../../../../server/emailService';
import { hashPassword, isProfileBanned } from '../../../../server/supabaseAdmin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const limited = await enforceRateLimit(req, 'otpSend');
  if (limited) return authFail(429, 'Too many requests. Please try again later.');

  const parsed = await parseJsonBody<{
    email?: string;
    name?: string;
    role?: string;
    confirmationUrl?: string;
    password?: string;
  }>(req);
  if (!parsed.ok) return authFail(parsed.status, parsed.error.message);

  try {
    const { email, name, role, confirmationUrl, password } = parsed.data || {};
    if (!isValidEmail(email)) {
      return authFail(400, 'A valid email address is required');
    }

    const cleanEmail = email.toLowerCase().trim();
    const client = createServiceClient();
    if (!client) {
      return authFail(503, 'Authentication service is not configured.');
    }

    const existing = await findProfileByEmail(cleanEmail);
    if (existing) {
      const banCheck = isProfileBanned(existing);
      if (banCheck.isBanned) {
        return authFail(403, banCheck.message, { isBanned: true });
      }
    }

    if (password !== undefined && password !== null && password !== '') {
      const policyError = getPasswordPolicyError(password);
      if (policyError) {
        return authFail(400, policyError);
      }
    }

    if (password && !existing) {
      const hashedPassword = await hashPassword(password);
      const stored = await setPendingSignup(cleanEmail, {
        passwordHash: hashedPassword,
        name: typeof name === 'string' ? name : undefined,
        role: sanitizePublicSignupRole(role),
      });
      if (!stored) {
        console.warn('[send-otp] Redis unavailable — pending signup not stored for', cleanEmail);
      }
    }

    let allowCreateWithoutOtp = false;
    let emailRegisterEnabled = true;
    try {
      const { data: cfg } = await client
        .from('system_configs')
        .select('allow_create_without_otp, email_register_enabled')
        .limit(1)
        .maybeSingle();
      allowCreateWithoutOtp = Boolean(cfg?.allow_create_without_otp);
      if (cfg?.email_register_enabled != null) {
        emailRegisterEnabled = Boolean(cfg.email_register_enabled);
      }
    } catch (e: unknown) {
      console.warn('[send-otp] email policy notice:', (e as Error)?.message || e);
    }

    if (allowCreateWithoutOtp || !emailRegisterEnabled) {
      return authJson({
        success: true,
        delivered: false,
        skipOtp: true,
        message: allowCreateWithoutOtp
          ? 'OTP skipped — admin allows account creation without email verification.'
          : 'Registration emails are disabled by admin. Completing signup without OTP.',
        showOtpInForm: false,
      });
    }

    const otpCode = generateSixDigitOtp();
    await saveOtpDb(client, cleanEmail, otpCode, {
      name: typeof name === 'string' ? name : undefined,
      role: sanitizePublicSignupRole(role),
    });

    const showOtpInForm = process.env.OTP_DEBUG === 'true' && getShowOtpInForm();
    const sendResult = await sendOtpEmail({
      to: email,
      name: name || 'User',
      otpCode,
      confirmationUrl,
    });

    return authJson({
      success: true,
      delivered: sendResult.delivered,
      skipOtp: false,
      message: sendResult.message,
      showOtpInForm: showOtpInForm || !sendResult.delivered,
      otpCode: showOtpInForm || !sendResult.delivered ? otpCode : undefined,
    });
  } catch (err: unknown) {
    console.error('[next /api/auth/send-otp]', err);
    return authFail(500, safeClientError(err, 'Failed to dispatch verification email'));
  }
}
