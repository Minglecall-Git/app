import { sendJson, readJsonBody, createServiceClient, type VercelReq, type VercelRes } from '../../vercelAuth';
import {
  isValidEmail,
  sanitizePublicSignupRole,
  getPasswordPolicyError,
  findAuthUserByEmail,
} from '../../authHelpers';

async function resolveAuthUserId(
  client: NonNullable<ReturnType<typeof createServiceClient>>,
  email: string
): Promise<string | null> {
  let page = 1;
  const perPage = 1000;
  for (;;) {
    const { data, error } = await client.auth.admin.listUsers({ page, perPage });
    if (error) {
      console.warn('[register-bootstrap] listUsers notice:', error.message);
      return null;
    }
    const matched = findAuthUserByEmail(data?.users as any, email);
    if (matched?.id) return matched.id;
    if (!data?.users?.length || data.users.length < perPage) return null;
    page += 1;
    if (page > 50) return null;
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
    const email = String(body?.email || '').trim().toLowerCase();
    const password = body?.password;
    const name = String(body?.name || '').trim();
    const role = sanitizePublicSignupRole(body?.role);

    if (!isValidEmail(email)) {
      return sendJson(res, 400, { success: false, error: 'Valid email required' });
    }
    const pwError = getPasswordPolicyError(password);
    if (pwError) {
      return sendJson(res, 400, { success: false, error: pwError });
    }

    const client = createServiceClient();
    if (!client) {
      return sendJson(res, 503, { success: false, error: 'Supabase not configured' });
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
    } catch (e: any) {
      console.warn('[register-bootstrap] email policy notice:', e?.message || e);
    }
    const skipOtp = allowCreateWithoutOtp || !emailRegisterEnabled;

    // Deferred registration: Auth/profile are created after OTP verify.
    // Bootstrap is only allowed when admin policy skips OTP.
    if (!skipOtp) {
      return sendJson(res, 400, {
        success: false,
        code: 'OTP_REQUIRED',
        error: 'Complete email OTP verification to create your account.',
      });
    }

    const gender =
      role === 'female_user' || role === 'female_creator' || role === 'female_host'
        ? 'female'
        : role === 'other_user'
          ? 'other'
          : 'male';
    const displayName = name || email.split('@')[0] || 'User';

    const { data: existingProfile } = await client
      .from('profiles')
      .select('id, role, auth_id')
      .ilike('email', email)
      .maybeSingle();
    if (existingProfile?.id) {
      return sendJson(res, 409, {
        success: false,
        code: 'ALREADY_REGISTERED',
        error: 'An account with this email is already registered. Please log in or use Forgot Password.',
      });
    }

    const userMetadata = {
      full_name: displayName,
      display_name: displayName,
      name: displayName,
      role,
      gender,
      is_onboarded: false,
    };

    let authUserId = await resolveAuthUserId(client, email);
    if (authUserId) {
      // Orphan Auth (profile deleted) — reclaim with the new password
      const { error: updErr } = await client.auth.admin.updateUserById(authUserId, {
        password,
        email_confirm: true,
        user_metadata: userMetadata,
      });
      if (updErr) {
        return sendJson(res, 500, {
          success: false,
          error: updErr.message || 'Could not update existing Auth account.',
        });
      }
    } else {
      const { data: created, error } = await client.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: userMetadata,
      });
      if (error) {
        const lower = String(error.message || '').toLowerCase();
        if (lower.includes('already') || lower.includes('registered')) {
          authUserId = await resolveAuthUserId(client, email);
          if (authUserId) {
            const { error: updErr } = await client.auth.admin.updateUserById(authUserId, {
              password,
              email_confirm: true,
              user_metadata: userMetadata,
            });
            if (updErr) {
              return sendJson(res, 500, {
                success: false,
                error: updErr.message || 'Could not update existing Auth account.',
              });
            }
          } else {
            return sendJson(res, 409, {
              success: false,
              code: 'ALREADY_REGISTERED',
              error:
                'An account with this email is already registered. Please log in or use Forgot Password.',
            });
          }
        } else {
          return sendJson(res, 400, { success: false, error: error.message });
        }
      } else if (created?.user?.id) {
        authUserId = created.user.id;
      }
    }

    if (!authUserId) {
      return sendJson(res, 500, {
        success: false,
        error: 'Could not resolve Auth user id.',
      });
    }

    return sendJson(res, 200, {
      success: true,
      authId: authUserId,
      userId: authUserId,
      email,
      role,
      gender,
      skipOtp: true,
      emailConfirmed: true,
      message: 'Account created without email OTP (admin policy).',
    });
  } catch (err: any) {
    console.error('[api/auth/register-bootstrap]', err);
    return sendJson(res, 500, { success: false, error: err?.message || 'Registration bootstrap failed' });
  }
}
