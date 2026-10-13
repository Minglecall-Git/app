import { Router } from 'express';
import type { ServerRuntime } from '../runtimeTypes';
import {
  generateSixDigitOtp,
  sendOtpEmail,
  verifyStoredOtp,
  verifyStoredOtpAsync,
  getSmtpConfig,
  getShowOtpInForm,
} from '../emailService';
import {
  updateUserPasswordAdmin,
  confirmUserEmailAdmin,
  authenticateUserWithPasswordAdmin,
  isProfileBanned,
  hashPassword,
  isSupabaseAdminConfigured,
  getSupabaseAdmin,
  upsertProfileAdmin,
  linkProfileAuthIdAdmin,
  claimExclusiveSessionAdmin,
} from '../supabaseAdmin';
import { requireAuth, requireAdmin, sanitizePublicSignupRole } from '../middleware/auth';
import {
  authStrictLimiter,
  authOtpSendLimiter,
  authVerifyLimiter,
  clearAuthBackoff,
} from '../middleware/rateLimit';
import { getPasswordPolicyError } from '../../shared/passwordPolicy';

const AUTH_UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const PENDING_SIGNUP_TTL_MS = 60 * 60 * 1000; // 1 hour

function genderFromPublicRole(role: string): 'male' | 'female' | 'other' {
  if (role === 'female_user' || role === 'female_creator' || role === 'female_host') return 'female';
  if (role === 'other_user') return 'other';
  return 'male';
}

async function findAuthUserIdByEmail(
  client: NonNullable<ReturnType<typeof getSupabaseAdmin>>,
  email: string
): Promise<string | null> {
  const clean = email.toLowerCase().trim();
  let page = 1;
  const perPage = 1000;
  for (;;) {
    const { data, error } = await client.auth.admin.listUsers({ page, perPage });
    if (error) throw new Error(error.message);
    const users = data?.users || [];
    const matched = users.find((u) => u.email?.toLowerCase().trim() === clean);
    if (matched?.id) return matched.id;
    if (users.length < perPage) return null;
    page += 1;
    if (page > 50) return null;
  }
}

/** Pending signup secrets keyed by email — never create orphan profiles with random UUIDs. */
const pendingSignupByEmail = new Map<
  string,
  { passwordHash: string; name?: string; role?: string; updatedAt: number }
>();

function cleanupStalePendingSignups() {
  const now = Date.now();
  for (const [email, pending] of pendingSignupByEmail.entries()) {
    if (now - pending.updatedAt > PENDING_SIGNUP_TTL_MS) {
      pendingSignupByEmail.delete(email);
    }
  }
}

function isValidEmail(email: unknown): email is string {
  return typeof email === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}

function isValidOtpToken(token: unknown): token is string {
  return typeof token === 'string' && /^\d{6}$/.test(token.trim());
}

/** Avoid leaking stack traces / provider internals to clients. */
function safeClientError(err: unknown, fallback: string): string {
  if (!err) return fallback;
  const message = typeof err === 'string' ? err : (err as any)?.message;
  if (typeof message !== 'string' || !message.trim()) return fallback;
  const lower = message.toLowerCase();
  if (
    lower.includes('stack') ||
    lower.includes('supabase') ||
    lower.includes('postgres') ||
    lower.includes('smtp') ||
    lower.includes('service_role') ||
    lower.includes('econn') ||
    lower.includes('enotfound') ||
    message.length > 180
  ) {
    return fallback;
  }
  return message;
}

export function consumePendingSignup(email: string) {
  cleanupStalePendingSignups();
  const key = email.trim().toLowerCase();
  const pending = pendingSignupByEmail.get(key);
  if (pending) pendingSignupByEmail.delete(key);
  return pending || null;
}

export function createAuthRouter(ctx: ServerRuntime): Router {
  const router = Router();
  const { serverUsers, normalizeUserProfile } = ctx;

  /**
   * Public registration bootstrap (no privilege escalation).
   * Creates/confirms Auth via service role OR detects existing Auth by email,
   * then links/creates a profile with sanitized public role only.
   * Never accepts team_leader / admin.
   */
  router.post('/register-bootstrap', authStrictLimiter, async (req, res) => {
    try {
      const { email, password, name, role } = req.body || {};
      if (!isValidEmail(email)) {
        return res.status(400).json({ success: false, error: 'A valid email address is required' });
      }
      const pwError = getPasswordPolicyError(password);
      if (pwError || typeof password !== 'string') {
        return res.status(400).json({ success: false, error: pwError || 'Password is required.' });
      }
      if (!isSupabaseAdminConfigured()) {
        return res.status(503).json({ success: false, error: 'Authentication service is not configured.' });
      }

      const cleanEmail = String(email).trim().toLowerCase();
      const safeRole = sanitizePublicSignupRole(role);
      const gender = genderFromPublicRole(safeRole);
      const displayName =
        typeof name === 'string' && name.trim() ? name.trim() : cleanEmail.split('@')[0] || 'User';

      const client = getSupabaseAdmin();
      if (!client) {
        return res.status(503).json({ success: false, error: 'Authentication service is not configured.' });
      }

      // Deferred registration: Auth/profile are created after OTP verify.
      // Bootstrap is only allowed when admin policy skips OTP.
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
      if (!allowCreateWithoutOtp && emailRegisterEnabled) {
        return res.status(400).json({
          success: false,
          code: 'OTP_REQUIRED',
          error: 'Complete email OTP verification to create your account.',
        });
      }

      // Existing profile with this email → must log in (do not hijack TL/admin accounts)
      const { data: existingProfile } = await client
        .from('profiles')
        .select('id, role, auth_id')
        .ilike('email', cleanEmail)
        .maybeSingle();

      if (existingProfile?.id) {
        const existingRole = String(existingProfile.role || '').toLowerCase();
        if (['admin', 'team_leader', 'agency_manager'].includes(existingRole)) {
          return res.status(409).json({
            success: false,
            code: 'ALREADY_REGISTERED',
            error: 'An account with this email is already registered. Please log in or use Forgot Password.',
          });
        }
        return res.status(409).json({
          success: false,
          code: 'ALREADY_REGISTERED',
          error: 'An account with this email is already registered. Please log in or use Forgot Password.',
        });
      }

      let authUserId: string | null = null;
      try {
        authUserId = await findAuthUserIdByEmail(client, cleanEmail);
      } catch (e: any) {
        console.warn('[register-bootstrap] Auth email lookup:', e?.message || e);
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
        // Orphan Auth (no profile) — set password + metadata so registration can continue
        const { error: updErr } = await client.auth.admin.updateUserById(authUserId, {
          password,
          email_confirm: true,
          user_metadata: userMetadata,
        });
        if (updErr) {
          return res.status(500).json({
            success: false,
            error: safeClientError(updErr.message, 'Could not update existing Auth account.'),
          });
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
            return res.status(409).json({
              success: false,
              code: 'ALREADY_REGISTERED',
              error: 'An account with this email is already registered. Please log in or use Forgot Password.',
            });
          }
          return res.status(500).json({
            success: false,
            error: safeClientError(createErr?.message, 'Could not create Auth account.'),
          });
        }
        authUserId = created.user.id;
      }

      if (!authUserId || !AUTH_UUID_RE.test(authUserId)) {
        return res.status(500).json({ success: false, error: 'Could not resolve Auth user id.' });
      }

      const passwordHash = await hashPassword(password);
      const upsertRes = await upsertProfileAdmin({
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

      // Belt-and-suspenders: force public role/gender on linked row
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
        } as any)
        .ilike('email', cleanEmail);

      if (upsertRes.success && upsertRes.data) {
        const normalized = normalizeUserProfile({
          ...upsertRes.data,
          role: safeRole,
          gender,
          authId: authUserId,
        });
        serverUsers.set(normalized.id, normalized);
      }

      return res.json({
        success: true,
        authId: authUserId,
        userId: authUserId,
        role: safeRole,
        gender,
        message: 'Auth account ready for OTP verification.',
      });
    } catch (err: any) {
      console.error('Error in /api/auth/register-bootstrap:', err);
      return res.status(500).json({
        success: false,
        error: safeClientError(err, 'Registration bootstrap failed'),
      });
    }
  });

  // POST Dispatch 6-digit OTP code & confirmation link via email
  // Signup: stores pending credentials only — Auth/profile are created after OTP verify
  // (or via register-bootstrap when admin skip-OTP policy applies).
  router.post('/send-otp', authOtpSendLimiter, async (req, res) => {
    try {
      cleanupStalePendingSignups();
      const { email, name, role, confirmationUrl, password } = req.body;
      if (!isValidEmail(email)) {
        return res.status(400).json({ success: false, error: 'A valid email address is required' });
      }

      const cleanEmail = email.toLowerCase().trim();
      const existing = Array.from(serverUsers.values()).find(
        (u) => u.email?.toLowerCase().trim() === cleanEmail
      );

      // Check if user is suspended/banned before sending OTP
      if (existing) {
        const banCheck = isProfileBanned(existing);
        if (banCheck.isBanned) {
          return res.status(403).json({ success: false, isBanned: true, error: banCheck.message });
        }
      }

      // Signup only: validate password policy before generating OTP
      if (password !== undefined && password !== null && password !== '') {
        const policyError = getPasswordPolicyError(password);
        if (policyError) {
          return res.status(400).json({ success: false, error: policyError });
        }
      }

      // Signup only: store pending hash for NEW emails. Never apply password to existing
      // accounts here — that would allow unauthenticated resets. Use /reset-password after OTP.
      if (password && !existing) {
        const hashedPassword = await hashPassword(password);
        pendingSignupByEmail.set(cleanEmail, {
          passwordHash: hashedPassword,
          name: name || undefined,
          role: sanitizePublicSignupRole(role),
          updatedAt: Date.now(),
        });
      }

      // Admin policy: skip OTP email (client will call register-bootstrap to create Auth)
      let allowCreateWithoutOtp = false;
      let emailRegisterEnabled = true;
      if (isSupabaseAdminConfigured()) {
        try {
          const admin = getSupabaseAdmin();
          if (admin) {
            const { data: cfg } = await admin
              .from('system_configs')
              .select('allow_create_without_otp, email_register_enabled')
              .limit(1)
              .maybeSingle();
            allowCreateWithoutOtp = Boolean(cfg?.allow_create_without_otp);
            if (cfg?.email_register_enabled != null) {
              emailRegisterEnabled = Boolean(cfg.email_register_enabled);
            }
          }
        } catch (e: any) {
          console.warn('[send-otp] email policy notice:', e?.message || e);
        }
      }

      if (allowCreateWithoutOtp || !emailRegisterEnabled) {
        return res.json({
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
      const showOtpInForm = process.env.OTP_DEBUG === 'true' && getShowOtpInForm();
      const sendResult = await sendOtpEmail({
        to: email,
        name: name || 'User',
        otpCode,
        confirmationUrl,
      });

      return res.json({
        success: true,
        delivered: sendResult.delivered,
        skipOtp: false,
        message: sendResult.message,
        showOtpInForm: showOtpInForm || !sendResult.delivered,
        otpCode: showOtpInForm || !sendResult.delivered ? otpCode : undefined,
      });
    } catch (err: any) {
      console.error('Error in /api/auth/send-otp:', err);
      return res
        .status(500)
        .json({ success: false, error: safeClientError(err, 'Failed to dispatch verification email') });
    }
  });

  // POST Verify 6-digit OTP Code
  // Optional password: after custom OTP success, sync Auth password + confirm email
  // so first login works when Supabase "Confirm email" is enabled (forgot-password path already does this).
  router.post('/verify-otp', authVerifyLimiter, async (req, res) => {
    try {
      const { email, token, password } = req.body;
      if (!isValidEmail(email) || !isValidOtpToken(token)) {
        return res.status(400).json({
          success: false,
          error: 'A valid email and 6-digit OTP code are required',
        });
      }

      const cleanEmail = email.toLowerCase().trim();
      const existing = Array.from(serverUsers.values()).find(
        (u) => u.email?.toLowerCase().trim() === cleanEmail
      );
      if (existing) {
        const banCheck = isProfileBanned(existing);
        if (banCheck.isBanned) {
          return res.status(403).json({ success: false, isBanned: true, error: banCheck.message });
        }
      }

      const verifyResult = await verifyStoredOtpAsync(email, token.trim());
      if (!verifyResult.success) {
        return res.status(400).json({
          success: false,
          error: verifyResult.error || 'Invalid or expired OTP code',
        });
      }

      const pending = pendingSignupByEmail.get(cleanEmail);
      const hasPassword = typeof password === 'string' && password.length > 0;
      const wasPendingSignup = Boolean(pending && hasPassword);
      let resolvedAuthId: string | undefined =
        (existing?.authId && AUTH_UUID_RE.test(existing.authId) && existing.authId) ||
        (existing?.id && AUTH_UUID_RE.test(existing.id) && existing.id) ||
        undefined;

      // Only apply password when this OTP belongs to an in-progress signup.
      // Password resets must use /reset-password (prevents OTP hijack of existing accounts).
      // Creates Auth user here if it does not exist yet (deferred from registration start).
      if (hasPassword && pending) {
        const policyError = getPasswordPolicyError(password);
        if (policyError) {
          return res.status(400).json({ success: false, error: policyError });
        }

        const safeRole = sanitizePublicSignupRole(pending.role || verifyResult.metadata?.role);
        if (isSupabaseAdminConfigured()) {
          const adminRes = await updateUserPasswordAdmin(
            existing?.id || '',
            password,
            cleanEmail,
            {
              name: pending.name || verifyResult.metadata?.name,
              role: safeRole,
              gender: genderFromPublicRole(safeRole),
            }
          );
          if (!adminRes.success) {
            return res.status(500).json({
              success: false,
              error: safeClientError(adminRes.error, 'Email verified, but account activation failed. Please try again.'),
            });
          }
          if (adminRes.authUserId && AUTH_UUID_RE.test(adminRes.authUserId)) {
            resolvedAuthId = adminRes.authUserId;
          }
        }

        if (existing) {
          const passwordHash = await hashPassword(password);
          (existing as any).password_hash = passwordHash;
          delete (existing as any).password;
          existing.hasPasswordSet = true;
          serverUsers.set(existing.id, existing);
        }
        pendingSignupByEmail.delete(cleanEmail);
      } else if (isSupabaseAdminConfigured()) {
        // Confirm Auth email so password sign-in is not blocked after custom OTP
        const confirmRes = await confirmUserEmailAdmin(cleanEmail, existing?.id);
        if (!confirmRes.success) {
          console.warn('[verify-otp] email confirm notice:', confirmRes.error);
        } else if (confirmRes.authUserId && AUTH_UUID_RE.test(confirmRes.authUserId)) {
          resolvedAuthId = confirmRes.authUserId;
        }
        if (pending) {
          pendingSignupByEmail.delete(cleanEmail);
        }
      } else if (pending) {
        pendingSignupByEmail.delete(cleanEmail);
      }

      // Always resolve Auth id for the client — custom OTP leaves no browser session,
      // and profiles SELECT is authenticated-only under RLS.
      if (!resolvedAuthId && isSupabaseAdminConfigured()) {
        const admin = getSupabaseAdmin();
        if (admin) {
          try {
            resolvedAuthId = (await findAuthUserIdByEmail(admin, cleanEmail)) || undefined;
          } catch (e: any) {
            console.warn('[verify-otp] auth id lookup notice:', e?.message || e);
          }
        }
      }

      if (!resolvedAuthId && wasPendingSignup) {
        return res.status(500).json({
          success: false,
          error: 'Email verified, but account creation failed. Please try again.',
        });
      }

      clearAuthBackoff('otp_verify', req);
      return res.json({
        success: true,
        message: 'OTP Code verified successfully',
        emailConfirmed: true,
        authId: resolvedAuthId || null,
        userId: resolvedAuthId || null,
        metadata: {
          ...(verifyResult.metadata || {}),
          name: verifyResult.metadata?.name || pending?.name,
          role: sanitizePublicSignupRole(verifyResult.metadata?.role || pending?.role),
        },
      });
    } catch (err: any) {
      console.error('Error in /api/auth/verify-otp:', err);
      return res
        .status(500)
        .json({ success: false, error: safeClientError(err, 'Verification processing failed') });
    }
  });

  // POST Login with Password — Supabase Auth only (no in-memory / hash fallback)
  router.post('/login-password', authStrictLimiter, async (req, res) => {
    try {
      const { email, password } = req.body;
      if (!isValidEmail(email) || typeof password !== 'string' || !password) {
        return res.status(400).json({ success: false, error: 'Email and password are required' });
      }
      if (password.trim().length === 0) {
        return res
          .status(401)
          .json({ success: false, error: 'Invalid email or password. Please check your credentials.' });
      }
      const cleanEmail = String(email).trim().toLowerCase();

      if (!isSupabaseAdminConfigured()) {
        return res.status(503).json({ success: false, error: 'Authentication service is not configured.' });
      }

      const authRes = await authenticateUserWithPasswordAdmin(cleanEmail, password);
      if (authRes.success && authRes.user) {
        const normalized = normalizeUserProfile(authRes.user);
        serverUsers.set(normalized.id, normalized);
        clearAuthBackoff('auth_strict', req);
        // Kick every other device for this account
        const claimed = await claimExclusiveSessionAdmin(normalized.id);
        return res.json({
          success: true,
          user: normalized,
          session: authRes.session,
          activeSessionId: claimed.sessionId || null,
        });
      }
      if (authRes.error && (authRes.error.includes('suspended') || authRes.error.includes('banned'))) {
        return res.status(403).json({ success: false, isBanned: true, error: authRes.error });
      }
      if (authRes.error && /not found or was deleted/i.test(authRes.error)) {
        return res.status(401).json({ success: false, error: authRes.error });
      }

      return res
        .status(401)
        .json({
          success: false,
          error: authRes.error || 'Invalid email or password. Please check your credentials.',
        });
    } catch (err: any) {
      console.error('Error in /api/auth/login-password:', err);
      return res
        .status(500)
        .json({ success: false, error: safeClientError(err, 'Authentication error') });
    }
  });

  // POST Claim exclusive login session (single-device). Call after password login / hydrate.
  router.post('/claim-session', requireAuth, async (req, res) => {
    try {
      const profileId = String((req as any).profileId || (req as any).user?.id || '');
      if (!profileId) {
        return res.status(400).json({ success: false, error: 'Authenticated profile required' });
      }
      const preferred =
        (typeof req.body?.sessionId === 'string' && req.body.sessionId) ||
        (typeof req.body?.activeSessionId === 'string' && req.body.activeSessionId) ||
        null;
      const claimed = await claimExclusiveSessionAdmin(profileId, preferred);
      if (!claimed.success || !claimed.sessionId) {
        return res.status(500).json({
          success: false,
          error: claimed.error || 'Failed to claim exclusive session',
        });
      }
      return res.json({ success: true, activeSessionId: claimed.sessionId });
    } catch (err: any) {
      console.error('Error in /api/auth/claim-session:', err);
      return res
        .status(500)
        .json({ success: false, error: safeClientError(err, 'Failed to claim session') });
    }
  });

  // POST Update User Password (authenticated — bcrypt hash & Supabase sync)
  router.post('/update-password', requireAuth, async (req, res) => {
    try {
      const { newPassword } = req.body;
      const userId = String((req as any).profileId || (req as any).user?.id || '');
      const email = (req as any).user?.email || (req as any).profile?.email;
      const policyError = getPasswordPolicyError(newPassword);
      if (policyError) {
        return res.status(400).json({ success: false, error: policyError });
      }

      const passwordHash = await hashPassword(newPassword);

      // Update in server memory (store only hash, never plain text!)
      if (userId && serverUsers.has(userId)) {
        const u = serverUsers.get(userId)!;
        (u as any).password_hash = passwordHash;
        delete (u as any).password;
        u.hasPasswordSet = true;
        serverUsers.set(userId, u);
      }

      // Also search by email in server memory
      if (email) {
        const cleanEmail = String(email).toLowerCase().trim();
        for (const [id, u] of serverUsers.entries()) {
          if (u.email?.toLowerCase().trim() === cleanEmail) {
            (u as any).password_hash = passwordHash;
            delete (u as any).password;
            u.hasPasswordSet = true;
            serverUsers.set(id, u);
          }
        }
      }

      // Update in Supabase Auth via Admin
      if (isSupabaseAdminConfigured()) {
        const adminRes = await updateUserPasswordAdmin(userId, newPassword, email);
        if (!adminRes.success) {
          return res.status(500).json({
            success: false,
            error: safeClientError(adminRes.error, 'Failed to update password'),
          });
        }
      }

      return res.json({ success: true, message: 'Password successfully updated and securely hashed.' });
    } catch (err: any) {
      console.error('Error in /api/auth/update-password:', err);
      return res
        .status(500)
        .json({ success: false, error: safeClientError(err, 'Failed to update password') });
    }
  });

  // POST Password reset via email OTP (unauthenticated; OTP required)
  router.post('/reset-password', authStrictLimiter, async (req, res) => {
    try {
      const { email, token, newPassword } = req.body;
      if (!isValidEmail(email)) {
        return res.status(400).json({ success: false, error: 'A valid email address is required.' });
      }
      if (!isValidOtpToken(token)) {
        return res.status(400).json({ success: false, error: 'A valid 6-digit verification code is required.' });
      }
      const policyError = getPasswordPolicyError(newPassword);
      if (policyError) {
        return res.status(400).json({ success: false, error: policyError });
      }

      const cleanEmail = email.trim().toLowerCase();
      const verifyResult = await verifyStoredOtpAsync(cleanEmail, token.trim());
      if (!verifyResult.success) {
        return res.status(400).json({
          success: false,
          error: verifyResult.error || 'Invalid or expired OTP code',
        });
      }

      const existing = Array.from(serverUsers.values()).find(
        (u) => u.email?.toLowerCase().trim() === cleanEmail
      );
      if (existing) {
        const banCheck = isProfileBanned(existing);
        if (banCheck.isBanned) {
          return res.status(403).json({ success: false, isBanned: true, error: banCheck.message });
        }
      }

      const passwordHash = await hashPassword(newPassword);
      const userId = existing?.id || '';

      if (existing) {
        (existing as any).password_hash = passwordHash;
        delete (existing as any).password;
        existing.hasPasswordSet = true;
        serverUsers.set(existing.id, existing);
      }

      if (isSupabaseAdminConfigured()) {
        const adminRes = await updateUserPasswordAdmin(userId, newPassword, cleanEmail);
        if (!adminRes.success && !existing) {
          return res.status(404).json({
            success: false,
            error: 'No account found for this email. Please register instead.',
          });
        }
        if (!adminRes.success && existing) {
          return res.status(500).json({
            success: false,
            error: safeClientError(adminRes.error, 'Failed to reset password'),
          });
        }
      } else if (!existing) {
        return res.status(404).json({
          success: false,
          error: 'No account found for this email. Please register instead.',
        });
      }

      return res.json({
        success: true,
        message: 'Password reset successfully. You can now sign in with your new password.',
      });
    } catch (err: any) {
      console.error('Error in /api/auth/reset-password:', err);
      return res
        .status(500)
        .json({ success: false, error: safeClientError(err, 'Failed to reset password') });
    }
  });

  // GET Email & SMTP Configuration Status
  router.get('/email-config', requireAdmin, (req, res) => {
    const smtpInfo = getSmtpConfig();
    res.json({
      success: true,
      smtpConfigured: smtpInfo.configured,
      resendConfigured: Boolean(process.env.RESEND_API_KEY),
      senderEmail: smtpInfo.from || process.env.SMTP_FROM || 'LiveCall <noreply@livecall-app.com>',
      host: smtpInfo.host || process.env.SMTP_HOST || 'Not configured',
      port: smtpInfo.port || 587,
      user: smtpInfo.user || '',
      showOtpInForm: smtpInfo.showOtpInForm,
    });
  });

  // POST Test Email Dispatch
  router.post('/test-email', requireAdmin, async (req, res) => {
    try {
      const { email, name } = req.body;
      if (!isValidEmail(email)) {
        return res.status(400).json({ success: false, error: 'Destination email is required' });
      }

      const testCode = generateSixDigitOtp();
      const sendResult = await sendOtpEmail({
        to: email,
        name: name || 'Admin Tester',
        otpCode: testCode,
      });

      return res.json({
        success: true,
        delivered: sendResult.delivered,
        message: sendResult.message,
      });
    } catch (err: any) {
      console.error('Error in /api/auth/test-email:', err);
      return res
        .status(500)
        .json({ success: false, error: safeClientError(err, 'Failed to send test email') });
    }
  });

  return router;
}
