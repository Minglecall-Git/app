/**
 * /api/auth/* handlers — CommonJS for Vercel Hobby router.
 */
const {
  send,
  readJsonBody,
  createServiceClient,
  getSupabaseEnv,
  createClient,
  isValidEmail,
  isValidOtpToken,
  sanitizePublicSignupRole,
  getPasswordPolicyError,
  mapProfileRow,
  findAuthUserByEmail,
  requireAuth,
  isAdminRole,
  saveOtpDb,
  verifyOtpDb,
  savePendingSignupDb,
  peekPendingSignupDb,
  deletePendingSignupDb,
  generateSixDigitOtp,
  isSmtpConfigured,
  sendOtpEmailVercel,
  getEmailPolicy,
  logEmailDispatch,
  hashPasswordSync,
} = require('./helpers');

async function emailPolicy(req, res) {
  if (req.method !== 'GET') return send(res, 405, { success: false, error: 'Method not allowed' });
  try {
    const client = createServiceClient();
    const policy = await getEmailPolicy(client);
    return send(res, 200, {
      success: true,
      data: {
        emailRegisterEnabled: policy.emailRegisterEnabled,
        allowCreateWithoutOtp: policy.allowCreateWithoutOtp,
        smtpConfigured: isSmtpConfigured(),
      },
    });
  } catch (err) {
    return send(res, 200, {
      success: true,
      data: {
        emailRegisterEnabled: true,
        allowCreateWithoutOtp: false,
        smtpConfigured: isSmtpConfigured(),
      },
    });
  }
}

async function sendOtp(req, res) {
  if (req.method !== 'POST') return send(res, 405, { success: false, error: 'Method not allowed' });
  try {
    const body = await readJsonBody(req);
    const { email, name, role, confirmationUrl, password } = body || {};
    if (!isValidEmail(email)) {
      return send(res, 400, { success: false, error: 'A valid email address is required' });
    }
    const cleanEmail = email.toLowerCase().trim();
    const client = createServiceClient();
    if (!client) {
      return send(res, 503, {
        success: false,
        error: 'Supabase is not configured on this deployment.',
      });
    }

    const policy = await getEmailPolicy(client);

    const { data: existing } = await client
      .from('profiles')
      .select('id, is_banned, banned_until, ban_reason')
      .ilike('email', cleanEmail)
      .maybeSingle();

    if (existing && existing.is_banned) {
      const until = existing.banned_until ? new Date(existing.banned_until).getTime() : 0;
      if (!until || until > Date.now()) {
        return send(res, 403, {
          success: false,
          isBanned: true,
          error: existing.ban_reason || 'This account is suspended.',
        });
      }
    }

    if (password !== undefined && password !== null && password !== '') {
      const policyError = getPasswordPolicyError(password);
      if (policyError) return send(res, 400, { success: false, error: policyError });
    }

    // Admin enabled password-only signup (no OTP email required)
    if (policy.allowCreateWithoutOtp || !policy.emailRegisterEnabled) {
      if (password && !existing) {
        await savePendingSignupDb(client, cleanEmail, hashPasswordSync(password), {
          name: name || undefined,
          role: sanitizePublicSignupRole(role),
        });
      }
      await logEmailDispatch(client, {
        purpose: 'otp_register',
        recipientEmail: cleanEmail,
        recipientName: name || 'User',
        subject: 'OTP skipped by admin policy',
        provider: 'none',
        status: 'skipped',
        meta: {
          reason: policy.allowCreateWithoutOtp ? 'allow_create_without_otp' : 'email_register_disabled',
        },
      });
      return send(res, 200, {
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

    if (password && !existing) {
      await savePendingSignupDb(client, cleanEmail, hashPasswordSync(password), {
        name: name || undefined,
        role: sanitizePublicSignupRole(role),
      });
    }

    const sendResult = await sendOtpEmailVercel({
      to: cleanEmail,
      name: name || 'User',
      otpCode,
    });
    const showOtpInForm =
      process.env.OTP_DEBUG === 'true' ||
      policy.emailShowOtpFallback ||
      !sendResult.delivered;
    return send(res, 200, {
      success: true,
      delivered: sendResult.delivered,
      skipOtp: false,
      message: sendResult.message,
      showOtpInForm,
      otpCode: showOtpInForm ? otpCode : undefined,
      smtpConfigured: isSmtpConfigured(),
      confirmationUrl: confirmationUrl || undefined,
    });
  } catch (err) {
    console.error('[api/auth/send-otp]', err);
    return send(res, 500, {
      success: false,
      error: (err && err.message) || 'Failed to dispatch verification email',
    });
  }
}

async function verifyOtp(req, res) {
  if (req.method !== 'POST') return send(res, 405, { success: false, error: 'Method not allowed' });
  try {
    const body = await readJsonBody(req);
    const { email, token, password } = body || {};
    if (!isValidEmail(email) || !isValidOtpToken(token)) {
      return send(res, 400, {
        success: false,
        error: 'A valid email and 6-digit OTP code are required',
      });
    }
    const client = createServiceClient();
    if (!client) return send(res, 503, { success: false, error: 'Supabase is not configured' });

    const cleanEmail = email.toLowerCase().trim();
    const { data: existing } = await client
      .from('profiles')
      .select('*')
      .ilike('email', cleanEmail)
      .maybeSingle();
    if (existing && existing.is_banned) {
      return send(res, 403, {
        success: false,
        isBanned: true,
        error: existing.ban_reason || 'This account is suspended.',
      });
    }

    const verifyResult = await verifyOtpDb(client, cleanEmail, token.trim());
    if (!verifyResult.success) {
      return send(res, 400, {
        success: false,
        error: verifyResult.error || 'Invalid or expired OTP code',
      });
    }

    // Peek only — delete pending after Auth create succeeds (avoids losing signup on create failure)
    const pending = await peekPendingSignupDb(client, cleanEmail);
    const hasPassword = typeof password === 'string' && password.length > 0;
    let resolvedAuthId =
      (existing && existing.auth_id) || (existing && existing.id) || null;

    async function lookupAuthId() {
      let page = 1;
      const perPage = 1000;
      for (;;) {
        const { data: list, error: listErr } = await client.auth.admin.listUsers({
          page,
          perPage,
        });
        if (listErr) {
          console.warn('[api/auth/verify-otp] listUsers notice:', listErr.message);
          return null;
        }
        const matched = findAuthUserByEmail(list && list.users, cleanEmail);
        if (matched && matched.id) return matched.id;
        if (!list || !list.users || list.users.length < perPage) return null;
        page += 1;
        if (page > 50) return null;
      }
    }

    if (hasPassword && pending) {
      const policyError = getPasswordPolicyError(password);
      if (policyError) return send(res, 400, { success: false, error: policyError });
      const safeRole = sanitizePublicSignupRole(
        pending.role || (verifyResult.metadata && verifyResult.metadata.role)
      );
      const displayName =
        pending.name ||
        (verifyResult.metadata && verifyResult.metadata.name) ||
        cleanEmail.split('@')[0] ||
        'User';
      const gender =
        safeRole === 'female_user' || safeRole === 'female_creator' || safeRole === 'female_host'
          ? 'female'
          : safeRole === 'other_user'
            ? 'other'
            : 'male';
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
      if (!createErr && created && created.user && created.user.id) {
        resolvedAuthId = created.user.id;
        await deletePendingSignupDb(client, cleanEmail);
      } else if (createErr) {
        const matchedId = await lookupAuthId();
        if (matchedId) {
          resolvedAuthId = matchedId;
          await client.auth.admin.updateUserById(matchedId, {
            password,
            email_confirm: true,
            user_metadata: userMetadata,
          });
          await deletePendingSignupDb(client, cleanEmail);
        } else if (!/already/i.test(createErr.message)) {
          return send(res, 500, {
            success: false,
            error: createErr.message || 'Account activation failed',
          });
        } else {
          return send(res, 500, {
            success: false,
            error: 'Account activation failed. Please try registering again.',
          });
        }
      }
    } else {
      const matchedId = await lookupAuthId();
      if (matchedId) {
        resolvedAuthId = matchedId;
        await client.auth.admin.updateUserById(matchedId, { email_confirm: true });
      }
      if (pending) await deletePendingSignupDb(client, cleanEmail);
    }

    if (!resolvedAuthId) {
      resolvedAuthId = await lookupAuthId();
    }

    // Signup OTP without Auth create is a hard failure — do not claim success
    if (!resolvedAuthId && hasPassword) {
      return send(res, 500, {
        success: false,
        error: 'Email verified, but account creation failed. Please try again.',
      });
    }

    return send(res, 200, {
      success: true,
      message: 'OTP Code verified successfully',
      emailConfirmed: true,
      authId: resolvedAuthId,
      userId: resolvedAuthId,
      metadata: {
        ...(verifyResult.metadata || {}),
        name: (verifyResult.metadata && verifyResult.metadata.name) || (pending && pending.name),
        role: sanitizePublicSignupRole(
          (verifyResult.metadata && verifyResult.metadata.role) || (pending && pending.role)
        ),
      },
    });
  } catch (err) {
    console.error('[api/auth/verify-otp]', err);
    return send(res, 500, {
      success: false,
      error: (err && err.message) || 'Verification failed',
    });
  }
}

async function registerBootstrap(req, res) {
  if (req.method !== 'POST') return send(res, 405, { success: false, error: 'Method not allowed' });
  try {
    const body = await readJsonBody(req);
    const email = String((body && body.email) || '')
      .trim()
      .toLowerCase();
    const password = body && body.password;
    const name = String((body && body.name) || '').trim();
    const role = sanitizePublicSignupRole(body && body.role);
    if (!isValidEmail(email)) {
      return send(res, 400, { success: false, error: 'Valid email required' });
    }
    const pwError = getPasswordPolicyError(password);
    if (pwError) return send(res, 400, { success: false, error: pwError });

    const client = createServiceClient();
    if (!client) return send(res, 503, { success: false, error: 'Supabase not configured' });

    const policy = await getEmailPolicy(client);
    const skipOtp = Boolean(policy.allowCreateWithoutOtp || !policy.emailRegisterEnabled);

    // Deferred registration: Auth/profile are created after OTP verify.
    // Bootstrap is only allowed when admin policy skips OTP.
    if (!skipOtp) {
      return send(res, 400, {
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

    // Existing profile → must log in (do not reclaim active accounts)
    const { data: existingProfile } = await client
      .from('profiles')
      .select('id, role, auth_id')
      .ilike('email', email)
      .maybeSingle();
    if (existingProfile && existingProfile.id) {
      return send(res, 409, {
        success: false,
        code: 'ALREADY_REGISTERED',
        error: 'An account with this email is already registered. Please log in or use Forgot Password.',
      });
    }

    async function lookupAuthId() {
      let page = 1;
      const perPage = 1000;
      for (;;) {
        const { data: list, error: listErr } = await client.auth.admin.listUsers({
          page,
          perPage,
        });
        if (listErr) {
          console.warn('[register-bootstrap] listUsers notice:', listErr.message);
          return null;
        }
        const matched = findAuthUserByEmail(list && list.users, email);
        if (matched && matched.id) return matched.id;
        if (!list || !list.users || list.users.length < perPage) return null;
        page += 1;
        if (page > 50) return null;
      }
    }

    const userMetadata = {
      full_name: displayName,
      display_name: displayName,
      name: displayName,
      role,
      gender,
      is_onboarded: false,
    };

    let authUserId = await lookupAuthId();
    if (authUserId) {
      // Orphan Auth (profile deleted) — reclaim with the new password
      const { error: updErr } = await client.auth.admin.updateUserById(authUserId, {
        password,
        email_confirm: skipOtp,
        user_metadata: userMetadata,
      });
      if (updErr) {
        return send(res, 500, {
          success: false,
          error: updErr.message || 'Could not update existing Auth account.',
        });
      }
    } else {
      const { data: created, error } = await client.auth.admin.createUser({
        email,
        password,
        email_confirm: skipOtp,
        user_metadata: userMetadata,
      });
      if (error) {
        const lower = String(error.message || '').toLowerCase();
        if (lower.includes('already') || lower.includes('registered')) {
          // Race: Auth appeared between lookup and create — reclaim it
          authUserId = await lookupAuthId();
          if (authUserId) {
            const { error: updErr } = await client.auth.admin.updateUserById(authUserId, {
              password,
              email_confirm: skipOtp,
              user_metadata: userMetadata,
            });
            if (updErr) {
              return send(res, 500, {
                success: false,
                error: updErr.message || 'Could not update existing Auth account.',
              });
            }
          } else {
            return send(res, 409, {
              success: false,
              code: 'ALREADY_REGISTERED',
              error:
                'An account with this email is already registered. Please log in or use Forgot Password.',
            });
          }
        } else {
          return send(res, 400, { success: false, error: error.message });
        }
      } else if (created && created.user && created.user.id) {
        authUserId = created.user.id;
      }
    }

    if (!authUserId) {
      return send(res, 500, {
        success: false,
        error: 'Could not resolve Auth user id.',
      });
    }

    return send(res, 200, {
      success: true,
      authId: authUserId,
      userId: authUserId,
      email,
      role,
      gender,
      skipOtp,
      emailConfirmed: skipOtp,
      message: skipOtp
        ? 'Account created without email OTP (admin policy).'
        : 'Auth account ready for OTP verification.',
    });
  } catch (err) {
    console.error('[api/auth/register-bootstrap]', err);
    return send(res, 500, {
      success: false,
      error: (err && err.message) || 'Registration bootstrap failed',
    });
  }
}

async function loginPassword(req, res) {
  if (req.method !== 'POST') return send(res, 405, { success: false, error: 'Method not allowed' });
  try {
    const body = await readJsonBody(req);
    const { email, password } = body || {};
    if (!isValidEmail(email) || typeof password !== 'string' || !password) {
      return send(res, 400, { success: false, error: 'Email and password are required' });
    }
    const cleanEmail = email.trim().toLowerCase();
    const client = createServiceClient();
    if (!client) return send(res, 503, { success: false, error: 'Supabase not configured' });

    const { data: profile } = await client
      .from('profiles')
      .select('*')
      .ilike('email', cleanEmail)
      .maybeSingle();
    if (profile && profile.is_banned) {
      const until = profile.banned_until ? new Date(profile.banned_until).getTime() : 0;
      if (!until || until > Date.now()) {
        return send(res, 403, {
          success: false,
          isBanned: true,
          error: profile.ban_reason || 'This account is suspended.',
        });
      }
    }

    const { url, anonKey } = getSupabaseEnv();
    if (!url || !anonKey) {
      return send(res, 503, { success: false, error: 'Supabase anon key not configured' });
    }
    const anon = createClient(url, anonKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data, error } = await anon.auth.signInWithPassword({
      email: cleanEmail,
      password,
    });
    if (error || !data || !data.user) {
      return send(res, 401, {
        success: false,
        error: (error && error.message) || 'Invalid email or password. Please check your credentials.',
      });
    }

    let row = profile;
    const { data: byAuth } = await client
      .from('profiles')
      .select('*')
      .or(`auth_id.eq.${data.user.id},id.eq.${data.user.id}`)
      .maybeSingle();
    if (byAuth) row = byAuth;
    if (!row) {
      return send(res, 401, {
        success: false,
        error: 'Account not found or was deleted. Please register again.',
      });
    }

    // Single-device login: replace any prior active_session_id
    const sessionId =
      typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
        ? crypto.randomUUID()
        : `sess_${Date.now()}_${Math.random().toString(36).slice(2, 12)}`;
    try {
      await client
        .from('profiles')
        .update({
          active_session_id: sessionId,
          updated_at: new Date().toISOString(),
        })
        .eq('id', row.id);
    } catch (claimErr) {
      console.warn('[api/auth/login-password] claim session notice:', claimErr);
    }

    return send(res, 200, {
      success: true,
      user: mapProfileRow(row),
      session: data.session,
      activeSessionId: sessionId,
    });
  } catch (err) {
    console.error('[api/auth/login-password]', err);
    return send(res, 500, {
      success: false,
      error: (err && err.message) || 'Authentication error',
    });
  }
}

async function claimSession(req, res) {
  if (req.method !== 'POST') return send(res, 405, { success: false, error: 'Method not allowed' });
  const auth = await requireAuth(req);
  if (auth.ok === false) {
    return send(res, auth.status, {
      success: false,
      error: (auth.error && auth.error.message) || 'Unauthorized',
    });
  }
  try {
    const body = (req.body && typeof req.body === 'object' ? req.body : null) || (await readJsonBody(req));
    const preferred = String(
      (body && (body.sessionId || body.activeSessionId)) || ''
    ).trim();
    const sessionIdRe =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    const sessionId =
      preferred && (sessionIdRe.test(preferred) || preferred.startsWith('sess_'))
        ? preferred
        : typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
          ? crypto.randomUUID()
          : `sess_${Date.now()}_${Math.random().toString(36).slice(2, 12)}`;
    const { error } = await auth.client
      .from('profiles')
      .update({
        active_session_id: sessionId,
        updated_at: new Date().toISOString(),
      })
      .eq('id', auth.profileId);
    if (error) {
      return send(res, 500, { success: false, error: error.message || 'Failed to claim session' });
    }
    return send(res, 200, { success: true, activeSessionId: sessionId });
  } catch (err) {
    console.error('[api/auth/claim-session]', err);
    return send(res, 500, {
      success: false,
      error: (err && err.message) || 'Failed to claim session',
    });
  }
}

async function resetPassword(req, res) {
  if (req.method !== 'POST') return send(res, 405, { success: false, error: 'Method not allowed' });
  try {
    const body = await readJsonBody(req);
    const email = String((body && body.email) || '')
      .trim()
      .toLowerCase();
    const token = body && body.token;
    const newPassword = (body && (body.newPassword || body.password)) || '';
    if (!isValidEmail(email) || !isValidOtpToken(token)) {
      return send(res, 400, { success: false, error: 'Email and 6-digit OTP required' });
    }
    const pwError = getPasswordPolicyError(newPassword);
    if (pwError) return send(res, 400, { success: false, error: pwError });
    const client = createServiceClient();
    if (!client) return send(res, 503, { success: false, error: 'Supabase not configured' });
    const verify = await verifyOtpDb(client, email, String(token).trim());
    if (!verify.success) return send(res, 400, { success: false, error: verify.error });
    const { data: list } = await client.auth.admin.listUsers({ perPage: 1000 });
    const matched = findAuthUserByEmail(list && list.users, email);
    if (!matched) {
      return send(res, 404, { success: false, error: 'No auth user found for this email' });
    }
    const { error } = await client.auth.admin.updateUserById(matched.id, {
      password: newPassword,
      email_confirm: true,
    });
    if (error) return send(res, 500, { success: false, error: error.message });
    await client
      .from('profiles')
      .update({ has_password_set: true, updated_at: new Date().toISOString() })
      .ilike('email', email);
    return send(res, 200, { success: true, message: 'Password reset successfully.' });
  } catch (err) {
    console.error('[api/auth/reset-password]', err);
    return send(res, 500, { success: false, error: (err && err.message) || 'Reset failed' });
  }
}

async function updatePassword(req, res) {
  if (req.method !== 'POST') return send(res, 405, { success: false, error: 'Method not allowed' });
  const auth = await requireAuth(req);
  if (auth.ok === false) {
    return send(res, auth.status, {
      success: false,
      error: (auth.error && auth.error.message) || 'Unauthorized',
    });
  }
  try {
    const body = await readJsonBody(req);
    const newPassword = (body && (body.newPassword || body.password)) || '';
    const pwError = getPasswordPolicyError(newPassword);
    if (pwError) return send(res, 400, { success: false, error: pwError });
    const { error } = await auth.client.auth.admin.updateUserById(auth.userId, {
      password: newPassword,
    });
    if (error) return send(res, 500, { success: false, error: error.message });
    await auth.client
      .from('profiles')
      .update({ has_password_set: true, updated_at: new Date().toISOString() })
      .eq('id', auth.profileId);
    return send(res, 200, {
      success: true,
      message: 'Password successfully updated and securely hashed.',
    });
  } catch (err) {
    console.error('[api/auth/update-password]', err);
    return send(res, 500, { success: false, error: (err && err.message) || 'Update failed' });
  }
}

/**
 * POST /api/auth/test-email — same contract as Express auth.routes test-email.
 * Uses Vercel env SMTP/Resend via sendOtpEmailVercel (no duplicate admin/email/test path).
 */
async function testEmail(req, res) {
  if (req.method !== 'POST') return send(res, 405, { success: false, error: 'Method not allowed' });
  try {
    const auth = await requireAuth(req);
    if (auth.ok === false) return send(res, auth.status, { success: false, error: auth.error });
    if (!isAdminRole(auth.role, auth.email)) {
      return send(res, 403, { success: false, error: 'Admin role required' });
    }
    const body = await readJsonBody(req);
    const email = String((body && body.email) || '').trim().toLowerCase();
    const name = String((body && body.name) || 'Admin Tester').trim() || 'Admin Tester';
    if (!isValidEmail(email)) {
      return send(res, 400, { success: false, error: 'Destination email is required' });
    }
    const testCode = generateSixDigitOtp();
    const sendResult = await sendOtpEmailVercel({
      to: email,
      name,
      otpCode: testCode,
    });
    return send(res, 200, {
      success: true,
      delivered: Boolean(sendResult && sendResult.delivered),
      message: (sendResult && sendResult.message) || 'Test email dispatch attempted',
      // Admin UI toast shows the OTP; same value was emailed (local Express omitted this field).
      code: testCode,
    });
  } catch (err) {
    console.error('[api/auth/test-email]', err);
    return send(res, 500, {
      success: false,
      error: (err && err.message) || 'Failed to send test email',
    });
  }
}

async function handleAuth(path, req, res) {
  if (path === 'auth/email-policy') return emailPolicy(req, res);
  if (path === 'auth/send-otp') return sendOtp(req, res);
  if (path === 'auth/verify-otp') return verifyOtp(req, res);
  if (path === 'auth/register-bootstrap') return registerBootstrap(req, res);
  if (path === 'auth/login-password') return loginPassword(req, res);
  if (path === 'auth/claim-session') return claimSession(req, res);
  if (path === 'auth/reset-password') return resetPassword(req, res);
  if (path === 'auth/update-password') return updatePassword(req, res);
  if (path === 'auth/test-email') return testEmail(req, res);
  return null;
}

module.exports = { handleAuth };
