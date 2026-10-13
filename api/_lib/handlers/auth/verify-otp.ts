import { sendJson, readJsonBody, createServiceClient, type VercelReq, type VercelRes } from '../../vercelAuth';
import {
  isValidEmail,
  isValidOtpToken,
  sanitizePublicSignupRole,
  getPasswordPolicyError,
  findProfileByEmail,
  findAuthUserByEmail,
} from '../../authHelpers';
import { verifyOtpDb, peekPendingSignupDb, deletePendingSignupDb } from '../../otpDb';

async function resolveAuthUserId(
  client: NonNullable<ReturnType<typeof createServiceClient>>,
  cleanEmail: string
): Promise<string | null> {
  let page = 1;
  const perPage = 1000;
  for (;;) {
    const { data, error } = await client.auth.admin.listUsers({ page, perPage });
    if (error) {
      console.warn('[api/auth/verify-otp] listUsers notice:', error.message);
      return null;
    }
    const matched = findAuthUserByEmail(data?.users as any, cleanEmail);
    if (matched?.id) return matched.id;
    if (!data?.users?.length || data.users.length < perPage) return null;
    page += 1;
    if (page > 50) return null;
  }
}

function genderFromRole(role: string): 'male' | 'female' | 'other' {
  if (role === 'female_user' || role === 'female_creator' || role === 'female_host') return 'female';
  if (role === 'other_user') return 'other';
  return 'male';
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
    const { email, token, password } = body || {};
    if (!isValidEmail(email) || !isValidOtpToken(token)) {
      return sendJson(res, 400, {
        success: false,
        error: 'A valid email and 6-digit OTP code are required',
      });
    }

    const client = createServiceClient();
    if (!client) {
      return sendJson(res, 503, { success: false, error: 'Supabase is not configured' });
    }

    const cleanEmail = email.toLowerCase().trim();
    const existing = await findProfileByEmail(cleanEmail);
    if (existing?.is_banned) {
      return sendJson(res, 403, {
        success: false,
        isBanned: true,
        error: existing.ban_reason || 'This account is suspended.',
      });
    }

    const verifyResult = await verifyOtpDb(client, cleanEmail, token.trim());
    if (!verifyResult.success) {
      return sendJson(res, 400, {
        success: false,
        error: verifyResult.error || 'Invalid or expired OTP code',
      });
    }

    const pending = await peekPendingSignupDb(client, cleanEmail);
    const hasPassword = typeof password === 'string' && password.length > 0;
    let resolvedAuthId: string | null =
      (typeof existing?.auth_id === 'string' && existing.auth_id) ||
      (typeof existing?.id === 'string' && existing.id) ||
      null;

    if (hasPassword && pending) {
      const policyError = getPasswordPolicyError(password);
      if (policyError) {
        return sendJson(res, 400, { success: false, error: policyError });
      }
      const safeRole = sanitizePublicSignupRole(pending.role || verifyResult.metadata?.role);
      const displayName =
        pending.name || verifyResult.metadata?.name || cleanEmail.split('@')[0] || 'User';
      const gender = genderFromRole(safeRole);
      const userMetadata = {
        full_name: displayName,
        display_name: displayName,
        name: displayName,
        role: safeRole,
        gender,
        is_onboarded: false,
      };

      const { data: created, error: createErr } = await client.auth.admin.createUser({
        email: cleanEmail,
        password,
        email_confirm: true,
        user_metadata: userMetadata,
      });
      if (!createErr && created?.user?.id) {
        resolvedAuthId = created.user.id;
        await deletePendingSignupDb(client, cleanEmail);
      } else if (createErr && /already/i.test(createErr.message)) {
        const matchedId = await resolveAuthUserId(client, cleanEmail);
        if (matchedId) {
          resolvedAuthId = matchedId;
          await client.auth.admin.updateUserById(matchedId, {
            password,
            email_confirm: true,
            user_metadata: userMetadata,
          });
          await deletePendingSignupDb(client, cleanEmail);
        } else {
          return sendJson(res, 500, {
            success: false,
            error: 'Account activation failed. Please try registering again.',
          });
        }
      } else if (createErr) {
        const matchedId = await resolveAuthUserId(client, cleanEmail);
        if (matchedId) {
          resolvedAuthId = matchedId;
          await client.auth.admin.updateUserById(matchedId, {
            password,
            email_confirm: true,
            user_metadata: userMetadata,
          });
          await deletePendingSignupDb(client, cleanEmail);
        } else {
          return sendJson(res, 500, {
            success: false,
            error: createErr.message || 'Account activation failed',
          });
        }
      }
    } else {
      const matchedId = await resolveAuthUserId(client, cleanEmail);
      if (matchedId) {
        resolvedAuthId = matchedId;
        await client.auth.admin.updateUserById(matchedId, { email_confirm: true });
      }
      if (pending) await deletePendingSignupDb(client, cleanEmail);
    }

    if (!resolvedAuthId) {
      resolvedAuthId = await resolveAuthUserId(client, cleanEmail);
    }

    if (!resolvedAuthId && hasPassword) {
      return sendJson(res, 500, {
        success: false,
        error: 'Email verified, but account creation failed. Please try again.',
      });
    }

    return sendJson(res, 200, {
      success: true,
      message: 'OTP Code verified successfully',
      emailConfirmed: true,
      authId: resolvedAuthId,
      userId: resolvedAuthId,
      metadata: {
        ...(verifyResult.metadata || {}),
        name: verifyResult.metadata?.name || pending?.name,
        role: sanitizePublicSignupRole(verifyResult.metadata?.role || pending?.role),
      },
    });
  } catch (err: any) {
    console.error('[api/auth/verify-otp]', err);
    return sendJson(res, 500, { success: false, error: err?.message || 'Verification failed' });
  }
}
