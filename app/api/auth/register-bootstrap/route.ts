import { NextRequest } from 'next/server';
import { getPasswordPolicyError } from '../../../../shared/passwordPolicy';
import {
  INVITE_HOST_ROLE,
  applyAgencyInviteOnSignup,
  validateInviteToken,
} from '../../../../lib/agencyInviteTokens';
import { createServiceClient, sanitizePublicSignupRole } from '../../../../lib/nextAuth';
import { enforceRateLimit } from '../../../../lib/nextRateLimit';
import { parseJsonBody } from '../../../../lib/nextRequest';
import {
  AUTH_UUID_RE,
  authFail,
  authJson,
  findAuthUserIdByEmail,
  genderFromPublicRole,
  isValidEmail,
  safeClientError,
} from '../../../../lib/authHelpers';
import {
  getSupabaseAdmin,
  hashPassword,
  isSupabaseAdminConfigured,
  linkProfileAuthIdAdmin,
  upsertProfileAdmin,
} from '../../../../server/supabaseAdmin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const limited = await enforceRateLimit(req, 'authStrict');
  if (limited) return authFail(429, 'Too many requests. Please try again later.');

  const parsed = await parseJsonBody<{
    email?: string;
    password?: string;
    name?: string;
    role?: string;
    invite_token?: string;
  }>(req);
  if (!parsed.ok) return authFail(parsed.status, parsed.error.message);

  try {
    const { email, password, name, role, invite_token } = parsed.data || {};
    if (!isValidEmail(email)) {
      return authFail(400, 'A valid email address is required');
    }
    const pwError = getPasswordPolicyError(password);
    if (pwError || typeof password !== 'string') {
      return authFail(400, pwError || 'Password is required.');
    }
    if (!isSupabaseAdminConfigured()) {
      return authFail(503, 'Authentication service is not configured.');
    }

    const cleanEmail = String(email).trim().toLowerCase();
    const inviteTokenRaw =
      typeof invite_token === 'string' && invite_token.trim() ? invite_token.trim() : '';

    const client = getSupabaseAdmin() || createServiceClient();
    if (!client) {
      return authFail(503, 'Authentication service is not configured.');
    }

    let safeRole = sanitizePublicSignupRole(role);
    if (inviteTokenRaw) {
      const validated = await validateInviteToken(client, inviteTokenRaw);
      if (!validated.ok) {
        return authFail(400, validated.message, { code: validated.code });
      }
      safeRole = INVITE_HOST_ROLE;
    }

    const gender = genderFromPublicRole(safeRole);
    const displayName =
      typeof name === 'string' && name.trim() ? name.trim() : cleanEmail.split('@')[0] || 'User';

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
      console.warn('[register-bootstrap] email policy notice:', (e as Error)?.message || e);
    }
    if (!allowCreateWithoutOtp && emailRegisterEnabled) {
      return authFail(400, 'Complete email OTP verification to create your account.', { code: 'OTP_REQUIRED' });
    }

    const { data: existingProfile } = await client
      .from('profiles')
      .select('id, role, auth_id')
      .ilike('email', cleanEmail)
      .maybeSingle();

    if (existingProfile?.id) {
      return authFail(409, 'An account with this email is already registered. Please log in or use Forgot Password.', {
        code: 'ALREADY_REGISTERED',
      });
    }

    let authUserId: string | null = null;
    try {
      authUserId = await findAuthUserIdByEmail(client, cleanEmail);
    } catch (e: unknown) {
      console.warn('[register-bootstrap] Auth email lookup:', (e as Error)?.message || e);
    }

    const userMetadata = {
      full_name: displayName,
      display_name: displayName,
      name: displayName,
      role: safeRole,
      gender,
      is_onboarded: false,
    };

    if (authUserId) {
      const { error: updErr } = await client.auth.admin.updateUserById(authUserId, {
        password,
        email_confirm: true,
        user_metadata: userMetadata,
      });
      if (updErr) {
        return authFail(500, safeClientError(updErr.message, 'Could not update existing Auth account.'));
      }
    } else {
      const { data: created, error: createErr } = await client.auth.admin.createUser({
        email: cleanEmail,
        password,
        email_confirm: true,
        user_metadata: userMetadata,
      });
      if (createErr || !created?.user?.id) {
        const lower = (createErr?.message || '').toLowerCase();
        if (lower.includes('already') || lower.includes('registered')) {
          return authFail(409, 'An account with this email is already registered. Please log in or use Forgot Password.', {
            code: 'ALREADY_REGISTERED',
          });
        }
        return authFail(500, safeClientError(createErr?.message, 'Could not create Auth account.'));
      }
      authUserId = created.user.id;
    }

    if (!authUserId || !AUTH_UUID_RE.test(authUserId)) {
      return authFail(500, 'Could not resolve Auth user id.');
    }

    const passwordHash = await hashPassword(password);
    await upsertProfileAdmin({
      id: authUserId,
      authId: authUserId,
      name: displayName,
      email: cleanEmail,
      gender,
      genderLocked: true,
      role: safeRole,
      isOnboarded: false,
      isVerified: false,
      onlineStatus: 'online',
      coinBalance: gender === 'female' ? 0 : 50,
      hourlyCoinRate: safeRole === 'female_creator' ? 10 : 0,
      password_hash: passwordHash,
      has_password_set: true,
      agencyName: null,
      commissionPercent: null,
    });

    await linkProfileAuthIdAdmin({
      authUserId,
      profileId: authUserId,
      email: cleanEmail,
    });

    await client
      .from('profiles')
      .update({
        role: safeRole,
        gender,
        gender_locked: true,
        auth_id: authUserId,
        agency_name: null,
        commission_percent: null,
        updated_at: new Date().toISOString(),
      } as Record<string, unknown>)
      .ilike('email', cleanEmail);

    let inviteTeamLeaderId: string | undefined;
    let inviteAgencyName: string | null | undefined;

    if (inviteTokenRaw) {
      const applied = await applyAgencyInviteOnSignup(client, {
        inviteToken: inviteTokenRaw,
        hostProfileId: authUserId,
        displayName,
        email: cleanEmail,
      });
      if (!applied.ok) {
        return authFail(400, applied.message, { code: applied.code });
      }
      safeRole = applied.role;
      inviteTeamLeaderId = applied.teamLeaderId;
      inviteAgencyName = applied.agencyName;
    }

    return authJson({
      success: true,
      authId: authUserId,
      userId: authUserId,
      role: safeRole,
      gender: genderFromPublicRole(safeRole),
      ...(inviteTeamLeaderId
        ? { teamLeaderId: inviteTeamLeaderId, agencyName: inviteAgencyName ?? null }
        : {}),
      message: 'Auth account ready for OTP verification.',
    });
  } catch (err: unknown) {
    console.error('[next /api/auth/register-bootstrap]', err);
    return authFail(500, safeClientError(err, 'Registration bootstrap failed'));
  }
}
