import { NextRequest } from 'next/server';
import { getPasswordPolicyError } from '../../../../shared/passwordPolicy';
import {
  INVITE_HOST_ROLE,
  applyAgencyInviteOnSignup,
} from '../../../../lib/agencyInviteTokens';
import { createServiceClient, sanitizePublicSignupRole } from '../../../../lib/nextAuth';
import { enforceRateLimit } from '../../../../lib/nextRateLimit';
import { parseJsonBody } from '../../../../lib/nextRequest';
import {
  AUTH_UUID_RE,
  authFail,
  authJson,
  findAuthUserIdByEmail,
  findProfileByEmail,
  genderFromPublicRole,
  isValidEmail,
  isValidOtpToken,
  safeClientError,
} from '../../../../lib/authHelpers';
import { verifyOtpDb } from '../../../../lib/otpDb';
import { deletePendingSignup, getPendingSignup } from '../../../../lib/redis';
import {
  confirmUserEmailAdmin,
  hashPassword,
  isProfileBanned,
  isSupabaseAdminConfigured,
  updateUserPasswordAdmin,
} from '../../../../server/supabaseAdmin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const limited = await enforceRateLimit(req, 'otpVerify');
  if (limited) return authFail(429, 'Too many requests. Please try again later.');

  const parsed = await parseJsonBody<{
    email?: string;
    token?: string;
    password?: string;
    invite_token?: string;
  }>(req);
  if (!parsed.ok) return authFail(parsed.status, parsed.error.message);

  try {
    const { email, token, password, invite_token } = parsed.data || {};
    if (!isValidEmail(email) || !isValidOtpToken(token)) {
      return authFail(400, 'A valid email and 6-digit OTP code are required');
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

    const verifyResult = await verifyOtpDb(client, cleanEmail, token.trim());
    if (!verifyResult.success) {
      return authFail(400, verifyResult.error || 'Invalid or expired OTP code');
    }

    const pendingRedis = await getPendingSignup(cleanEmail);
    const bodyInvite =
      typeof invite_token === 'string' && invite_token.trim() ? invite_token.trim() : '';
    const pendingInvite = pendingRedis?.inviteToken?.trim() || '';
    const inviteTokenToApply = pendingInvite || bodyInvite || '';

    const pending = pendingRedis
      ? {
          passwordHash: pendingRedis.passwordHash,
          name: pendingRedis.name,
          role: inviteTokenToApply ? INVITE_HOST_ROLE : pendingRedis.role,
          inviteToken: inviteTokenToApply || undefined,
        }
      : null;

    const hasPassword = typeof password === 'string' && password.length > 0;
    const wasPendingSignup = Boolean(pending && hasPassword);
    let resolvedAuthId: string | undefined =
      (existing?.auth_id && AUTH_UUID_RE.test(String(existing.auth_id)) && String(existing.auth_id)) ||
      (existing?.id && AUTH_UUID_RE.test(String(existing.id)) && String(existing.id)) ||
      undefined;

    let safeRole = sanitizePublicSignupRole(
      pending?.role || verifyResult.metadata?.role
    );
    if (inviteTokenToApply) safeRole = INVITE_HOST_ROLE;

    if (hasPassword && pending) {
      const policyError = getPasswordPolicyError(password);
      if (policyError) {
        return authFail(400, policyError);
      }

      if (isSupabaseAdminConfigured()) {
        const adminRes = await updateUserPasswordAdmin(existing?.id || '', password, cleanEmail, {
          name: pending.name || verifyResult.metadata?.name,
          role: safeRole,
          gender: genderFromPublicRole(safeRole),
        });
        if (!adminRes.success) {
          return authFail(
            500,
            safeClientError(adminRes.error, 'Email verified, but account activation failed. Please try again.')
          );
        }
        if (adminRes.authUserId && AUTH_UUID_RE.test(adminRes.authUserId)) {
          resolvedAuthId = adminRes.authUserId;
        }
      }

      if (existing && pending.passwordHash) {
        await client
          .from('profiles')
          .update({ password_hash: pending.passwordHash, has_password_set: true } as Record<string, unknown>)
          .eq('id', existing.id);
      } else if (existing && hasPassword) {
        const passwordHash = await hashPassword(password);
        await client
          .from('profiles')
          .update({ password_hash: passwordHash, has_password_set: true } as Record<string, unknown>)
          .eq('id', existing.id);
      }

      await deletePendingSignup(cleanEmail);
    } else if (isSupabaseAdminConfigured()) {
      const confirmRes = await confirmUserEmailAdmin(cleanEmail, existing?.id);
      if (!confirmRes.success) {
        console.warn('[verify-otp] email confirm notice:', confirmRes.error);
      } else if (confirmRes.authUserId && AUTH_UUID_RE.test(confirmRes.authUserId)) {
        resolvedAuthId = confirmRes.authUserId;
      }
      if (pending) {
        await deletePendingSignup(cleanEmail);
      }
    } else if (pending) {
      await deletePendingSignup(cleanEmail);
    }

    if (!resolvedAuthId && isSupabaseAdminConfigured()) {
      try {
        resolvedAuthId = (await findAuthUserIdByEmail(client, cleanEmail)) || undefined;
      } catch (e: unknown) {
        console.warn('[verify-otp] auth id lookup notice:', (e as Error)?.message || e);
      }
    }

    if (!resolvedAuthId && wasPendingSignup) {
      return authFail(500, 'Email verified, but account creation failed. Please try again.');
    }

    let inviteMeta: {
      teamLeaderId?: string;
      agencyName?: string | null;
      role?: string;
    } = {};

    if (inviteTokenToApply && resolvedAuthId) {
      const applied = await applyAgencyInviteOnSignup(client, {
        inviteToken: inviteTokenToApply,
        hostProfileId: resolvedAuthId,
        displayName: pending?.name || verifyResult.metadata?.name,
        email: cleanEmail,
      });
      if (!applied.ok) {
        return authFail(400, applied.message, { code: applied.code });
      }
      safeRole = applied.role;
      inviteMeta = {
        teamLeaderId: applied.teamLeaderId,
        agencyName: applied.agencyName,
        role: applied.role,
      };
    }

    return authJson({
      success: true,
      message: 'OTP Code verified successfully',
      emailConfirmed: true,
      authId: resolvedAuthId || null,
      userId: resolvedAuthId || null,
      metadata: {
        ...(verifyResult.metadata || {}),
        name: verifyResult.metadata?.name || pending?.name,
        role: inviteMeta.role || safeRole,
        ...(inviteMeta.teamLeaderId
          ? {
              teamLeaderId: inviteMeta.teamLeaderId,
              agencyName: inviteMeta.agencyName ?? null,
            }
          : {}),
      },
    });
  } catch (err: unknown) {
    console.error('[next /api/auth/verify-otp]', err);
    return authFail(500, safeClientError(err, 'Verification processing failed'));
  }
}
