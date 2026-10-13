/**
 * Native admin handlers (generated from server/routes/admin.routes.ts — no Express).
 */
import type { ServerRuntime } from '../../server/runtimeTypes';
import type { AuthOk } from '../nextAuth';
import { ok, err, type HandlerResult } from './handlerResult';
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
import type { UserProfile } from '../../src/types';
import { loadAdminSchemaPayload } from '../../server/schemaLoader';
import {
  getRawSmtpConfigForAdmin,
  updateSmtpRuntimeConfig,
} from '../../server/emailService';
import {
  isSupabaseAdminConfigured,
  granularResetSupabaseAdmin,
  isSupabaseSecretConfigured,
  backfillMissingAuthIdsAdmin,
  authenticateUserWithPasswordAdmin,
  updateSupabaseRuntimeConfig,
  updateUserPasswordAdmin,
  upsertProfileAdmin,
  getSupabaseAdmin,
} from '../../server/supabaseAdmin';
import { hardDeleteUserCompletely, cleanupOrphanAuthUsersAdmin } from '../../server/userHardDelete';
import { isR2Configured, updateR2RuntimeConfig } from '../../server/r2Storage';
import {
  collectInfraStatus,
  listServerDiagnosticModules,
  runServerDiagnostic,
} from '../systemDiagnostics';
import { listK6SmokeScenarios, runK6Smoke } from '../k6Smoke';
import { getPasswordPolicyError } from '../../shared/passwordPolicy';
import {
  DEFAULT_EMAIL_TEMPLATES,
  parseEmailTemplatesJson,
} from '../../shared/emailTemplates';
/** Read ALLOW_FACTORY_RESET from live .env (so edits apply without full restart) + process.env. */
function getAllowFactoryResetRaw(): string {
  try {
    const envPath = path.resolve(process.cwd(), '.env');
    if (fs.existsSync(envPath)) {
      const parsed = dotenv.parse(fs.readFileSync(envPath));
      if (Object.prototype.hasOwnProperty.call(parsed, 'ALLOW_FACTORY_RESET')) {
        const fromFile = String(parsed.ALLOW_FACTORY_RESET ?? '').trim();
        process.env.ALLOW_FACTORY_RESET = fromFile;
        return fromFile;
      }
    }
  } catch {
    // fall through to process.env
  }
  return String(process.env.ALLOW_FACTORY_RESET ?? '').trim();
}

/** Destructive factory/mock reset is refused unless explicitly allowlisted. */
function isFactoryResetAllowed(): boolean {
  const raw = getAllowFactoryResetRaw().replace(/^['"]|['"]$/g, '').trim();
  return /^(1|true|yes|on)$/i.test(raw);
}

function refuseFactoryReset(): HandlerResult {
  return err(403, {
    success: false,
    error: {
      message:
        'Factory / destructive data reset is disabled. Set ALLOW_FACTORY_RESET=true in the server .env (then retry — no full restart required for this flag), run the wipe, and set it back to false.',
      code: 'FACTORY_RESET_DISABLED',
    },
  });
}



function matchSegments(segments: string[], pattern: string[]): Record<string, string> | null {
  if (segments.length !== pattern.length) return null;
  const params: Record<string, string> = {};
  for (let i = 0; i < pattern.length; i++) {
    const p = pattern[i];
    if (p.startsWith(':')) params[p.slice(1)] = segments[i];
    else if (p !== segments[i]) return null;
  }
  return params;
}

async function admin_GET_factory_reset_status(ctx: ServerRuntime, auth: AuthOk, params: {  }, body: Record<string, unknown>, headers: Record<string, string>): Promise<HandlerResult> {
    const raw = getAllowFactoryResetRaw();
    const allowed = isFactoryResetAllowed();
    return ok({
      success: true,
      data: {
        allowed,
        envValue: raw,
        hint: allowed
          ? 'Factory reset is enabled. Type DELETE below to unlock Factory Wipe, then set ALLOW_FACTORY_RESET=false after the wipe.'
          : 'Set ALLOW_FACTORY_RESET=true in the server .env file (not .env.example), reopen this modal, run the wipe, then set it back to false.',
      },
    });
}

async function admin_GET_schema(ctx: ServerRuntime, auth: AuthOk, params: {  }, body: Record<string, unknown>, headers: Record<string, string>): Promise<HandlerResult> {
    try {
      const payload = loadAdminSchemaPayload();
      return ok(payload);
    } catch (e: any) {
      console.error('Error reading canonical schema file:', e);
      return err(404, {
        success: false,
        error: e.message || 'Canonical schema file not found on server',
      });
    }
  
}

async function admin_POST_reset_mock_data(ctx: ServerRuntime, auth: AuthOk, params: {  }, body: Record<string, unknown>, headers: Record<string, string>): Promise<HandlerResult> {
    try {
      if (!isFactoryResetAllowed()) {
        return refuseFactoryReset();
      }

      const { mockIds } = body;
      const idsToRemove: string[] = Array.isArray(mockIds) ? mockIds : [];

      let count = 0;
      for (const id of idsToRemove) {
        if (ctx.serverUsers.has(id)) {
          ctx.serverUsers.delete(id);
          ctx.presenceMap.delete(id);
          ctx.userLastSeen.delete(id);
          count++;
        }
      }

      ctx.broadcastAll({
        type: 'users:all',
        users: ctx.getFormattedUsers(),
      });
      ctx.broadcastPresence();

      return ok({
        success: true,
        removedCount: count,
        remainingCount: ctx.serverUsers.size,
        message: `Purged ${count} accounts. Server now holds ${ctx.serverUsers.size} live users.`,
      });
    } catch (e: any) {
      return err(500, { error: e.message });
    }
  
}

async function admin_POST_granular_reset(ctx: ServerRuntime, auth: AuthOk, params: {  }, body: Record<string, unknown>, headers: Record<string, string>): Promise<HandlerResult> {
    try {
      if (!isFactoryResetAllowed()) {
        return refuseFactoryReset();
      }

      const options = body || {};

      // 1. Reset volatile in-memory state (calls, presence, metrics, quick-match, users)
      const shouldClearUsers = Boolean(options.clearAllUsers);
      const adminUser =
        Array.from(ctx.serverUsers.values()).find((u) => u.role === 'admin') ||
        ({
          id: 'admin_user',
          name: 'Super Admin',
          email: 'admin@livecall.app',
          gender: 'male',
          role: 'admin',
          coinBalance: 0,
          isVerified: true,
          onlineStatus: 'online',
        } as UserProfile);

      ctx.resetVolatileRuntimeState({
        clearUsers: shouldClearUsers,
        adminUser: shouldClearUsers ? adminUser : null,
        clearActiveCalls: Boolean(options.clearActiveCalls || options.callLogs || options.clearAllUsers),
        clearPresence: options.clearPresence !== false,
      });

      if (!shouldClearUsers && options.mockIds && Array.isArray(options.mockIds)) {
        for (const id of options.mockIds) {
          ctx.purgeUserRuntimeState(String(id));
        }
      }

      ctx.broadcastActiveCalls();
      ctx.broadcastPresence();
      ctx.broadcastUsers();
      ctx.broadcastCreatorMetrics();

      // 2. If Supabase Admin is configured, perform complete cascading database purge
      let supabaseResult: any = { success: true, clearedTables: [], warnings: [] };
      if (isSupabaseAdminConfigured()) {
        if (!isSupabaseSecretConfigured()) {
          return err(503, {
            success: false,
            error: {
              message:
                'Database reset requires SUPABASE_SECRET_KEY (sb_secret_…). A publishable/anon key cannot bypass RLS, so tables would not actually be purged.',
              code: 'SECRET_KEY_REQUIRED',
            },
          });
        }
        supabaseResult = await granularResetSupabaseAdmin({
          mockIds: Array.isArray(options.mockIds) ? (options.mockIds as string[]) : undefined,
          clearAllUsers: Boolean(options.clearAllUsers),
          clearMockUsers: Boolean(options.clearMockUsers),
          clearAdmin: Boolean(options.clearAdmin),
          chatMessages: Boolean(options.chatMessages),
          callLogs: Boolean(options.callLogs),
          friendRequests: Boolean(options.friendRequests),
          payoutRequests: Boolean(options.payoutRequests),
          moderationReports: Boolean(options.moderationReports),
          creatorAnalytics: Boolean(options.creatorAnalytics),
          creatorReviews: Boolean(options.creatorReviews),
          dailyRewardsAndQuests: Boolean(options.dailyRewardsAndQuests),
          taxonomiesAndFlags: Boolean(options.taxonomiesAndFlags),
          purgeR2MediaStorage: Boolean(options.purgeR2MediaStorage),
          purgeAllR2Uploads: Boolean(options.purgeAllR2Uploads),
          homeBanners: Boolean(options.homeBanners),
          homeQuickLinks: Boolean(options.homeQuickLinks),
          cmsPolicies: Boolean(options.cmsPolicies),
          systemSettings: Boolean(options.systemSettings),
          coinPackages: Boolean(options.coinPackages),
          virtualGiftsCatalog: Boolean(options.virtualGiftsCatalog),
          feedPosts: Boolean(options.feedPosts),
          favorites: Boolean(options.favorites),
          blockedUsers: Boolean(options.blockedUsers),
          creatorGoals: Boolean(options.creatorGoals),
          walletLedger: Boolean(options.walletLedger),
          resetBalances: options.resetBalances,
        });
        if (!supabaseResult?.success) {
          return err(500, {
            success: false,
            error: supabaseResult?.error || 'Database reset failed.',
            clearedTables: supabaseResult?.clearedTables || [],
            warnings: supabaseResult?.warnings || [],
          });
        }
      }

      return ok({
        success: true,
        message: 'Server and database state reset successfully.',
        clearedTables: supabaseResult.clearedTables || [],
        warnings: supabaseResult.warnings || [],
      });
    } catch (e: any) {
      console.error('[API Reset] Error during granular reset:', e);
      return err(500, { success: false, error: e.message });
    }
  
}

async function admin_POST_delete_user(ctx: ServerRuntime, auth: AuthOk, params: {  }, body: Record<string, unknown>, headers: Record<string, string>): Promise<HandlerResult> {
    try {
      const userId = String(body.userId || '').trim();
      if (!userId) {
        return err(400, { success: false, error: 'User ID is required' });
      }

      const existing = ctx.serverUsers.get(userId);
      if (existing?.role === 'admin') {
        return err(403, {
          success: false,
          error: 'Admin accounts cannot be deleted.',
          data: { authDeleted: false, profileDeleted: false },
        });
      }

      const userName = existing?.name || userId;

      let deleteResult = {
        userId: String(userId),
        authDeleted: false,
        profileDeleted: false,
        r2DeletedCount: 0,
        warnings: [] as string[],
      };

      if (isSupabaseAdminConfigured()) {
        const hard = await hardDeleteUserCompletely(String(userId));
        deleteResult = {
          userId: hard.userId,
          authDeleted: hard.authDeleted,
          profileDeleted: hard.profileDeleted,
          r2DeletedCount: hard.r2DeletedCount,
          warnings: hard.warnings,
        };
        if (!hard.success || !hard.profileDeleted || !hard.authDeleted) {
          return err(500, {
            success: false,
            error:
              hard.error ||
              (!hard.authDeleted
                ? 'Auth user was not deleted — account may still be able to sign in. Retry delete.'
                : 'Failed to delete profile'),
            data: deleteResult,
          });
        }
      } else {
        deleteResult.warnings.push('Supabase admin not configured; deleted from server memory only.');
        deleteResult.profileDeleted = true;
        deleteResult.authDeleted = false;
        return err(503, {
          success: false,
          error: 'Supabase admin is not configured; cannot safely delete Auth + profile.',
          data: deleteResult,
        });
      }

      ctx.purgeUserRuntimeState(String(userId));
      if (deleteResult.userId && deleteResult.userId !== String(userId)) {
        ctx.purgeUserRuntimeState(String(deleteResult.userId));
      }

      ctx.broadcastAll({
        type: 'users:deleted',
        userId,
        users: ctx.getFormattedUsers(),
      });
      ctx.broadcastPresence();
      ctx.broadcastUsers();

      return ok({
        success: true,
        message: `User ${userName} was permanently deleted from database and system.`,
        data: deleteResult,
      });
    } catch (e: any) {
      console.error('Error in POST /api/admin/delete-user:', e);
      return err(500, { success: false, error: e.message });
    }
  
}

async function admin_POST_create_team_leader(ctx: ServerRuntime, auth: AuthOk, params: {  }, body: Record<string, unknown>, headers: Record<string, string>): Promise<HandlerResult> {
    try {
      if (!isSupabaseAdminConfigured()) {
        return err(503, {
          success: false,
          error: {
            message: 'Supabase admin is not configured',
            code: 'SUPABASE_NOT_CONFIGURED',
          },
        });
      }

      const name = String(body.name || '').trim();
      const email = String(body.email || '')
        .trim()
        .toLowerCase();
      const password = typeof body.password === 'string' ? body.password : '';
      const agencyName = String(body.agencyName || body.agency_name || 'Talent Agency').trim();
      const commissionPercent = Number(body.commissionPercent ?? body.commission_percent ?? 15);
      const nationality = String(body.nationality || 'United States').trim();
      const countryCode = String(body.countryCode || body.country_code || 'US')
        .trim()
        .toUpperCase() || 'US';
      const bio = String(body.bio || 'Talent Management & Creator Agency Director').trim();
      const avatarUrl =
        String(body.avatarUrl || body.avatar_url || '').trim() ||
        'https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?auto=format&fit=crop&q=80&w=400';
      const spokenLanguages = Array.isArray(body.spokenLanguages)
        ? body.spokenLanguages.map((s: any) => String(s).trim()).filter(Boolean)
        : String(body.spokenLanguages || 'English')
            .split(',')
            .map((s) => s.trim())
            .filter(Boolean);

      if (!name) {
        return err(400, {
          success: false,
          error: { message: 'Name is required.', code: 'NAME_REQUIRED' },
        });
      }
      if (!email || !email.includes('@')) {
        return err(400, {
          success: false,
          error: { message: 'A valid login email is required.', code: 'EMAIL_REQUIRED' },
        });
      }
      const pwError = getPasswordPolicyError(password);
      if (pwError) {
        return err(400, {
          success: false,
          error: { message: pwError, code: 'PASSWORD_POLICY' },
        });
      }

      const admin = getSupabaseAdmin();
      if (!admin) {
        return err(503, {
          success: false,
          error: { message: 'Supabase admin client unavailable', code: 'SUPABASE_NOT_CONFIGURED' },
        });
      }

      const { data: existingProfile } = await admin
        .from('profiles')
        .select('id, email')
        .ilike('email', email)
        .maybeSingle();
      if (existingProfile?.id) {
        return err(409, {
          success: false,
          error: {
            message: `A profile already exists for ${email}. Use a different email.`,
            code: 'EMAIL_EXISTS',
          },
        });
      }

      const { data: createdAuth, error: createErr } = await admin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: {
          role: 'team_leader',
          gender: 'female',
          name,
          full_name: name,
        },
      });
      if (createErr || !createdAuth?.user?.id) {
        const msg = createErr?.message || 'Failed to create Auth user';
        const code = /already/i.test(msg) ? 'EMAIL_EXISTS' : 'AUTH_CREATE_FAILED';
        return err(code === 'EMAIL_EXISTS' ? 409 : 500, {
          success: false,
          error: { message: msg, code },
        });
      }

      const authUserId = createdAuth.user.id;
      const now = new Date().toISOString();
      const profilePayload: Partial<UserProfile> & Record<string, any> = {
        id: authUserId,
        authId: authUserId,
        name,
        email,
        gender: 'female',
        genderLocked: true,
        role: 'team_leader',
        age: 28,
        nationality,
        countryCode,
        bio,
        interests: ['Talent Growth', 'Creator Mentorship'],
        tags: ['Team Leader', 'VIP Agency'],
        spokenLanguages: spokenLanguages.length ? spokenLanguages : ['English'],
        avatarUrl,
        gallery: [avatarUrl],
        isVerified: true,
        isOnboarded: true,
        agreedToTerms: true,
        onlineStatus: 'offline',
        coinBalance: 0,
        hourlyCoinRate: 10,
        earningsCoins: 0,
        agencyName,
        commissionPercent: Number.isFinite(commissionPercent) ? commissionPercent : 15,
        hasPasswordSet: true,
        password,
        createdAt: now,
      };

      const upsert = await upsertProfileAdmin(profilePayload);
      if (!upsert.success) {
        try {
          await admin.auth.admin.deleteUser(authUserId);
        } catch {
          // ignore
        }
        return err(500, {
          success: false,
          error: {
            message: upsert.error || 'Failed to create team leader profile',
            code: 'PROFILE_UPSERT_FAILED',
          },
        });
      }

      await updateUserPasswordAdmin(authUserId, password, email, {
        role: 'team_leader',
        gender: 'female',
        name,
      });

      await admin
        .from('profiles')
        .update({
          role: 'team_leader',
          gender: 'female',
          gender_locked: true,
          auth_id: authUserId,
          updated_at: new Date().toISOString(),
        } as any)
        .eq('id', authUserId);

      const normalized = {
        id: authUserId,
        authId: authUserId,
        name,
        email,
        role: 'team_leader' as const,
        gender: 'female' as const,
        genderLocked: true,
        agencyName,
        commissionPercent: Number.isFinite(commissionPercent) ? commissionPercent : 15,
        avatarUrl,
        gallery: [avatarUrl],
        spokenLanguages: spokenLanguages.length ? spokenLanguages : ['English'],
        nationality,
        countryCode,
        bio,
        isVerified: true,
        isOnboarded: true,
        hasPasswordSet: true,
        coinBalance: 0,
        hourlyCoinRate: 10,
        earningsCoins: 0,
        onlineStatus: 'offline' as const,
        createdAt: now,
      };

      ctx.serverUsers.set(authUserId, { ...(ctx.serverUsers.get(authUserId) || {}), ...normalized } as UserProfile);
      ctx.broadcastUsers();
      ctx.broadcastAll({
        type: 'users:updated',
        user: normalized,
        users: ctx.getFormattedUsers(),
      });

      return ok({
        success: true,
        user: normalized,
        message: `Team leader ${name} created in Supabase Auth + profiles. They can sign in with ${email}.`,
      });
    } catch (e: any) {
      console.error('Error in POST /api/admin/create-team-leader:', e);
      return err(500, {
        success: false,
        error: { message: e?.message || 'Failed to create team leader', code: 'INTERNAL' },
      });
    }
  
}

async function admin_POST_users_backfill_auth_ids(ctx: ServerRuntime, auth: AuthOk, params: {  }, body: Record<string, unknown>, headers: Record<string, string>): Promise<HandlerResult> {
    try {
      if (!isSupabaseAdminConfigured()) {
        return err(503, {
          success: false,
          error: { message: 'Supabase admin is not configured', code: 'SUPABASE_NOT_CONFIGURED' },
        });
      }
      const result = await backfillMissingAuthIdsAdmin();
      if (!result.success) {
        return err(500, {
          success: false,
          error: { message: result.error || 'Backfill failed', code: 'BACKFILL_FAILED' },
          data: { linked: result.linked, skipped: result.skipped },
        });
      }

      try {
        const { fetchProfilesAdmin } = await import('../../server/supabaseAdmin');
        const refreshed = await fetchProfilesAdmin();
        if (refreshed.success && refreshed.profiles) {
          for (const p of refreshed.profiles) {
            if (p?.id && p.auth_id) {
              const existing = ctx.serverUsers.get(p.id);
              if (existing) {
                ctx.serverUsers.set(p.id, { ...existing, authId: p.auth_id });
              }
            }
          }
          ctx.broadcastUsers();
        }
      } catch {
        // memory refresh is best-effort
      }

      return ok({
        success: true,
        data: {
          linked: result.linked,
          skipped: result.skipped,
          skippedCount: result.skipped.length,
        },
        message: `Linked ${result.linked} profile(s); skipped ${result.skipped.length}.`,
      });
    } catch (e: any) {
      console.error('Error in POST /api/admin/users/backfill-auth-ids:', e);
      return err(500, { success: false, error: e.message });
    }
  
}

async function admin_POST_users_cleanup_orphan_auth(ctx: ServerRuntime, auth: AuthOk, params: {  }, body: Record<string, unknown>, headers: Record<string, string>): Promise<HandlerResult> {
    try {
      if (!isSupabaseAdminConfigured()) {
        return err(503, {
          success: false,
          error: { message: 'Supabase admin is not configured', code: 'SUPABASE_NOT_CONFIGURED' },
        });
      }
      const result = await cleanupOrphanAuthUsersAdmin();
      if (!result.success) {
        return err(500, {
          success: false,
          error: { message: result.error || 'Cleanup failed', code: 'ORPHAN_CLEANUP_FAILED' },
          data: { deleted: result.deleted, skipped: result.skipped },
        });
      }
      return ok({
        success: true,
        data: {
          deleted: result.deleted,
          skipped: result.skipped,
          skippedCount: result.skipped.length,
        },
        message: `Deleted ${result.deleted} orphan Auth user(s); skipped ${result.skipped.length}.`,
      });
    } catch (e: any) {
      console.error('Error in POST /api/admin/users/cleanup-orphan-auth:', e);
      return err(500, { success: false, error: e.message });
    }
  
}

async function admin_GET_email_config(ctx: ServerRuntime, auth: AuthOk, params: {  }, body: Record<string, unknown>, headers: Record<string, string>): Promise<HandlerResult> {
    const rawConfig = getRawSmtpConfigForAdmin();
    return ok({
      success: true,
      config: {
        ...rawConfig,
        pass: rawConfig.pass ? '••••••••' : '',
        resendApiKey: rawConfig.resendApiKey ? `${String(rawConfig.resendApiKey).slice(0, 5)}…` : '',
        source: 'environment',
        message:
          'Email credentials are loaded from server environment variables. Set RESEND_API_KEY / SMTP_* in Vercel or .env.',
      },
    });
  
}

async function admin_POST_email_config(ctx: ServerRuntime, auth: AuthOk, params: {  }, body: Record<string, unknown>, headers: Record<string, string>): Promise<HandlerResult> {
    try {
      const { showOtpInForm } = body || {};
      if (typeof showOtpInForm === 'boolean') {
        updateSmtpRuntimeConfig({ showOtpInForm });
      }
      const client = getSupabaseAdmin();
      if (client && body) {
        const payload: Record<string, unknown> = {
          id: 'default',
          updated_at: new Date().toISOString(),
        };
        if (typeof body.emailRegisterEnabled === 'boolean') {
          payload.email_register_enabled = body.emailRegisterEnabled;
        }
        if (typeof body.emailAccountCreateEnabled === 'boolean') {
          payload.email_account_create_enabled = body.emailAccountCreateEnabled;
        }
        if (typeof body.emailAccountDeleteEnabled === 'boolean') {
          payload.email_account_delete_enabled = body.emailAccountDeleteEnabled;
        }
        if (typeof body.allowCreateWithoutOtp === 'boolean') {
          payload.allow_create_without_otp = body.allowCreateWithoutOtp;
        }
        if (typeof body.emailShowOtpFallback === 'boolean' || typeof showOtpInForm === 'boolean') {
          const v =
            typeof body.emailShowOtpFallback === 'boolean'
              ? body.emailShowOtpFallback
              : showOtpInForm;
          payload.email_show_otp_fallback = v;
          payload.smtp_show_otp = v;
        }
        if (Object.keys(payload).length > 2) {
          await client.from('system_configs').upsert(payload as any, { onConflict: 'id' });
        }
      }
      const updatedRaw = getRawSmtpConfigForAdmin();
      return ok({
        success: true,
        message:
          'Email policy updated. SMTP/Resend API keys are read from environment variables only — not saved from this UI.',
        config: {
          ...updatedRaw,
          pass: updatedRaw.pass ? '••••••••' : '',
          resendApiKey: updatedRaw.resendApiKey ? `${String(updatedRaw.resendApiKey).slice(0, 5)}…` : '',
          source: 'environment',
        },
      });
    } catch (e: any) {
      return err(500, { error: e.message || 'Failed to update email policy' });
    }
  
}

async function admin_GET_email(ctx: ServerRuntime, auth: AuthOk, params: {  }, body: Record<string, unknown>, headers: Record<string, string>): Promise<HandlerResult> {
    try {
      const raw = getRawSmtpConfigForAdmin();
      const client = getSupabaseAdmin();
      let policy = {
        emailRegisterEnabled: true,
        emailAccountCreateEnabled: true,
        emailAccountDeleteEnabled: false,
        allowCreateWithoutOtp: false,
        emailShowOtpFallback: Boolean(raw.showOtpInForm),
      };
      let logs: any[] = [];
      let templates = parseEmailTemplatesJson('');
      if (client) {
        const { data: cfg } = await client
          .from('system_configs')
          .select(
            'email_register_enabled, email_account_create_enabled, email_account_delete_enabled, allow_create_without_otp, email_show_otp_fallback, smtp_show_otp, email_templates_json'
          )
          .eq('id', 'default')
          .maybeSingle();
        if (cfg) {
          policy = {
            emailRegisterEnabled: cfg.email_register_enabled ?? true,
            emailAccountCreateEnabled: cfg.email_account_create_enabled ?? true,
            emailAccountDeleteEnabled: cfg.email_account_delete_enabled ?? false,
            allowCreateWithoutOtp: cfg.allow_create_without_otp ?? false,
            emailShowOtpFallback: cfg.email_show_otp_fallback ?? cfg.smtp_show_otp ?? false,
          };
          templates = parseEmailTemplatesJson((cfg as any).email_templates_json || '');
        }
        const { data: logRows } = await client
          .from('email_dispatch_log')
          .select(
            'id, purpose, recipient_email, recipient_name, subject, provider, status, error_message, meta, created_at'
          )
          .order('created_at', { ascending: false })
          .limit(100);
        logs = logRows || [];
      }
      return ok({
        success: true,
        data: {
          env: {
            source: 'environment',
            resendConfigured: Boolean(raw.resendApiKey || process.env.RESEND_API_KEY),
            resendApiKeyPreview: raw.resendApiKey
              ? `${String(raw.resendApiKey).slice(0, 5)}…`
              : process.env.RESEND_API_KEY
                ? `${String(process.env.RESEND_API_KEY).slice(0, 5)}…`
                : '',
            smtpConfigured: Boolean(raw.host && raw.user && raw.pass),
            smtpHost: raw.host || '',
            smtpPort: String(raw.port || ''),
            smtpUser: raw.user ? String(raw.user).replace(/(.{2})(.*)(@.*)/, '$1***$3') : '',
            smtpFrom: raw.from || '',
            smtpPassConfigured: Boolean(raw.pass),
            configured: Boolean(raw.configured),
            vercel: Boolean(process.env.VERCEL),
            message:
              'Email credentials are loaded from environment variables (RESEND_API_KEY / SMTP_*).',
          },
          policy,
          templates,
          defaults: DEFAULT_EMAIL_TEMPLATES,
          logs,
          configured: Boolean(raw.configured),
        },
      });
    } catch (e: any) {
      return err(500, { success: false, error: e.message });
    }
  
}

async function admin_POST_email_templates(ctx: ServerRuntime, auth: AuthOk, params: {  }, body: Record<string, unknown>, headers: Record<string, string>): Promise<HandlerResult> {
    try {
      const client = getSupabaseAdmin();
      if (!client) {
        return err(503, { success: false, error: 'Supabase not configured' });
      }
      const incoming = body?.templates || body || {};
      const templates = parseEmailTemplatesJson(JSON.stringify(incoming));
      const { error } = await client.from('system_configs').upsert(
        {
          id: 'default',
          email_templates_json: JSON.stringify(templates),
          updated_at: new Date().toISOString(),
        } as any,
        { onConflict: 'id' }
      );
      if (error) {
        return err(500, { success: false, error: error.message });
      }
      return ok({
        success: true,
        data: { templates },
        message: 'Email templates saved. OTP and transactional emails will use these.',
      });
    } catch (e: any) {
      return err(500, { success: false, error: e.message });
    }
  
}

async function admin_POST_email_settings(ctx: ServerRuntime, auth: AuthOk, params: {  }, body: Record<string, unknown>, headers: Record<string, string>): Promise<HandlerResult> {
    try {
      if (body.resendApiKey || body.pass || body.smtpPass) {
        return err(400, {
          success: false,
          error: {
            message:
              'Email secrets cannot be saved from the Admin UI. Set them in Vercel / .env.',
            code: 'ENV_ONLY',
          },
        });
      }
      const client = getSupabaseAdmin();
      if (!client) {
        return err(503, { success: false, error: 'Supabase not configured' });
      }
      const payload = {
        id: 'default',
        email_register_enabled: Boolean(body.emailRegisterEnabled),
        email_account_create_enabled: Boolean(body.emailAccountCreateEnabled),
        email_account_delete_enabled: Boolean(body.emailAccountDeleteEnabled),
        allow_create_without_otp: Boolean(body.allowCreateWithoutOtp),
        email_show_otp_fallback: Boolean(body.emailShowOtpFallback),
        smtp_show_otp: Boolean(body.emailShowOtpFallback),
        updated_at: new Date().toISOString(),
      };
      if (typeof body.emailShowOtpFallback === 'boolean') {
        updateSmtpRuntimeConfig({ showOtpInForm: body.emailShowOtpFallback });
      }
      const { error } = await client.from('system_configs').upsert(payload as any, { onConflict: 'id' });
      if (error) throw new Error(error.message);
      return ok({
        success: true,
        data: {
          policy: {
            emailRegisterEnabled: payload.email_register_enabled,
            emailAccountCreateEnabled: payload.email_account_create_enabled,
            emailAccountDeleteEnabled: payload.email_account_delete_enabled,
            allowCreateWithoutOtp: payload.allow_create_without_otp,
            emailShowOtpFallback: payload.email_show_otp_fallback,
          },
        },
        message: 'Email notification policy saved.',
      });
    } catch (e: any) {
      return err(500, { success: false, error: e.message });
    }
  
}

async function admin_POST_email_test(ctx: ServerRuntime, auth: AuthOk, params: {  }, body: Record<string, unknown>, headers: Record<string, string>): Promise<HandlerResult> {
    try {
      const { generateSixDigitOtp, sendOtpEmail, isSmtpConfigured } = await import('../../server/emailService');
      if (!isSmtpConfigured()) {
        return err(502, {
          success: true,
          data: {
            ok: false,
            message: 'Set RESEND_API_KEY or SMTP_* in environment variables first.',
          },
        });
      }
      const to = String(body?.to || '').trim().toLowerCase();
      if (!to || !to.includes('@')) {
        return ok({
          success: true,
          data: {
            ok: true,
            message: 'Email provider env looks configured. Provide a recipient to send a live test.',
          },
        });
      }
      const otp = generateSixDigitOtp();
      const result = await sendOtpEmail({
        to,
        name: String(body?.name || 'Admin'),
        otpCode: otp,
      });
      return ok(
        {
          success: true,
          data: {
            ok: Boolean(result.delivered),
            delivered: result.delivered,
            message: result.message,
            recipient: to,
            provider: process.env.RESEND_API_KEY ? 'resend' : 'smtp',
          },
        },
        result.delivered ? 200 : 502
      );
    } catch (e: any) {
      return err(500, { success: false, error: e.message });
    }
  
}

async function admin_GET_email_logs(ctx: ServerRuntime, auth: AuthOk, params: {  }, body: Record<string, unknown>, headers: Record<string, string>): Promise<HandlerResult> {
    try {
      const client = getSupabaseAdmin();
      if (!client) {
        return ok({ success: true, data: { logs: [] } });
      }
      const { data, error } = await client
        .from('email_dispatch_log')
        .select(
          'id, purpose, recipient_email, recipient_name, subject, provider, status, error_message, meta, created_at'
        )
        .order('created_at', { ascending: false })
        .limit(200);
      if (error) throw new Error(error.message);
      return ok({ success: true, data: { logs: data || [] } });
    } catch (e: any) {
      return err(500, { success: false, error: e.message });
    }
  
}

async function admin_GET_active_calls(ctx: ServerRuntime, auth: AuthOk, params: {  }, body: Record<string, unknown>, headers: Record<string, string>): Promise<HandlerResult> {
    return ok({
      success: true,
      activeCalls: ctx.getFormattedActiveCalls(),
      timestamp: Date.now(),
    });
  
}

async function admin_GET_infra_config(ctx: ServerRuntime, auth: AuthOk, params: {  }, body: Record<string, unknown>, headers: Record<string, string>): Promise<HandlerResult> {
    const mask = (v?: string) => (v ? '••••••••' : '');
    return ok({
      success: true,
      config: {
        supabaseUrl: ctx.infraConfig.supabaseUrl,
        supabasePublishableKey: mask(
          (ctx.infraConfig as any).supabasePublishableKey || ctx.infraConfig.supabaseAnonKey
        ),
        supabaseAnonKey: mask(
          (ctx.infraConfig as any).supabasePublishableKey || ctx.infraConfig.supabaseAnonKey
        ),
        r2AccountId: ctx.infraConfig.r2AccountId,
        r2AccessKeyId: ctx.infraConfig.r2AccessKeyId ? `${String(ctx.infraConfig.r2AccessKeyId).slice(0, 4)}…` : '',
        r2SecretAccessKey: mask(ctx.infraConfig.r2SecretAccessKey),
        r2BucketName: ctx.infraConfig.r2BucketName,
        r2PublicUrl: ctx.infraConfig.r2PublicUrl,
        supabaseConfigured: Boolean(
          ctx.infraConfig.supabaseUrl &&
          !ctx.infraConfig.supabaseUrl.includes('placeholder') &&
          !ctx.infraConfig.supabaseUrl.includes('your-project-ref')
        ),
        r2Configured: isR2Configured(),
      },
    });
  
}

async function admin_POST_infra_config(ctx: ServerRuntime, auth: AuthOk, params: {  }, body: Record<string, unknown>, headers: Record<string, string>): Promise<HandlerResult> {
    try {
      const updates = body || {};
      Object.assign(ctx.infraConfig, updates);

      const nextUrl =
        updates.supabaseUrl !== undefined ? String(updates.supabaseUrl).trim() : undefined;
      const rawPublishable =
        updates.supabasePublishableKey !== undefined
          ? updates.supabasePublishableKey
          : updates.supabaseAnonKey;
      const nextPublishable =
        rawPublishable !== undefined && !String(rawPublishable).startsWith('••••')
          ? String(rawPublishable).trim()
          : undefined;

      if (nextUrl !== undefined) {
        // Do not assign process.env.NEXT_PUBLIC_* — Next webpack inlines those
        // identifiers as string literals, which becomes `"…" = value` (SyntaxError).
        process.env.SUPABASE_URL = nextUrl;
        ctx.infraConfig.supabaseUrl = nextUrl;
      }
      if (nextPublishable !== undefined) {
        process.env.SUPABASE_ANON_KEY = nextPublishable;
        (ctx.infraConfig as any).supabasePublishableKey = nextPublishable;
        ctx.infraConfig.supabaseAnonKey = nextPublishable;
      }
      if (updates.r2AccountId !== undefined) process.env.R2_ACCOUNT_ID = String(updates.r2AccountId);
      if (updates.r2AccessKeyId !== undefined) process.env.R2_ACCESS_KEY_ID = String(updates.r2AccessKeyId);
      if (
        updates.r2SecretAccessKey !== undefined &&
        !String(updates.r2SecretAccessKey).startsWith('••••')
      ) {
        process.env.R2_SECRET_ACCESS_KEY = String(updates.r2SecretAccessKey);
      }
      if (updates.r2BucketName !== undefined) process.env.R2_BUCKET_NAME = String(updates.r2BucketName);
      if (updates.r2PublicUrl !== undefined) process.env.R2_PUBLIC_URL = String(updates.r2PublicUrl);

      // Keep admin Supabase client pointed at the URL the admin just saved.
      // Secret key stays from env (never accept SUPABASE_SECRET_KEY from the browser).
      if (nextUrl !== undefined) {
        updateSupabaseRuntimeConfig(nextUrl, undefined);
      }

      // Dynamically update R2 active runtime config
      updateR2RuntimeConfig({
        accountId: ctx.infraConfig.r2AccountId,
        accessKeyId: ctx.infraConfig.r2AccessKeyId,
        secretAccessKey: ctx.infraConfig.r2SecretAccessKey,
        bucketName: ctx.infraConfig.r2BucketName,
        publicUrl: ctx.infraConfig.r2PublicUrl,
      });

      return ok({
        success: true,
        message:
          'Infrastructure parameters updated for this server instance. On Vercel, also set NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY / SUPABASE_SECRET_KEY in Project Settings → Environment Variables and redeploy for a permanent client build.',
        config: {
          r2Configured: isR2Configured(),
          supabaseConfigured: Boolean(ctx.infraConfig.supabaseUrl),
          vercel: Boolean(process.env.VERCEL),
        },
      });
    } catch (e: any) {
      return err(500, { error: e.message || 'Failed to update infrastructure parameters' });
    }
  
}

async function admin_GET_infra_status(ctx: ServerRuntime, auth: AuthOk, params: {  }, body: Record<string, unknown>, headers: Record<string, string>): Promise<HandlerResult> {
    const profileId = String(auth.profileId || '').trim();
    try {
      const data = await collectInfraStatus({ profileId });
      return ok({ success: true, data });
    } catch (e: any) {
      console.error('[infra-status]', e?.message || e);
      return err(500, {
        success: false,
        error: { message: 'Infra status probe failed', code: 'INFRA_STATUS_FAILED' },
      });
    }
  
}

async function admin_POST_system_diagnostics(ctx: ServerRuntime, auth: AuthOk, params: {  }, body: Record<string, unknown>, headers: Record<string, string>): Promise<HandlerResult> {
    const moduleId = String(body?.moduleId || '').trim();
    const profileId = String(auth.profileId || '').trim();
    try {
      const result = await runServerDiagnostic(moduleId, {
        profileId,
        channel: body?.channel as string | undefined,
        nonce: body?.nonce as string | undefined,
        token: body?.token as string | undefined,
      });
      if (!result) {
        return err(400, {
          success: false,
          error: {
            message: `Unknown diagnostic module. Known: ${listServerDiagnosticModules().join(', ')}`,
            code: 'UNKNOWN_MODULE',
          },
        });
      }
      return ok({ success: true, data: result });
    } catch (e: any) {
      console.error('[system-diagnostics]', moduleId, e?.message || e);
      return err(500, {
        success: false,
        error: { message: 'Diagnostic failed', code: 'DIAGNOSTIC_FAILED' },
      });
    }
  
}

async function admin_POST_k6_smoke(ctx: ServerRuntime, auth: AuthOk, params: {  }, body: Record<string, unknown>, headers: Record<string, string>): Promise<HandlerResult> {
    const scenarioId = String(body?.scenarioId || '').trim();
    const host = String(headers['x-forwarded-host'] || headers['host'] || '');
    const proto = String(headers['x-forwarded-proto'] || 'http');
    const authorization = String(headers['authorization'] || '');
    try {
      const result = await runK6Smoke(scenarioId, {
        authorization,
        concurrency: body?.concurrency as number | undefined,
        baseUrl: body?.baseUrl as string | undefined,
        host,
        proto,
      });
      if (!result) {
        return err(400, {
          success: false,
          error: {
            message: `Unknown k6 smoke scenario. Known: ${listK6SmokeScenarios().join(', ')}`,
            code: 'UNKNOWN_SCENARIO',
          },
        });
      }
      return ok({ success: true, data: result });
    } catch (e: any) {
      console.error('[k6-smoke]', scenarioId, e?.message || e);
      return err(500, {
        success: false,
        error: { message: 'k6 smoke failed', code: 'K6_SMOKE_FAILED' },
      });
    }
  
}

export async function dispatchAdminCore(
  method: string,
  segments: string[],
  body: Record<string, unknown>,
  ctx: ServerRuntime,
  auth: AuthOk,
  headers: Record<string, string>
): Promise<HandlerResult | null> {
  if (method === 'GET') {
    const params = matchSegments(segments, ['factory-reset-status']);
    if (params) return admin_GET_factory_reset_status(ctx, auth, {  }, body, headers);
  }
  if (method === 'GET') {
    const params = matchSegments(segments, ['schema']);
    if (params) return admin_GET_schema(ctx, auth, {  }, body, headers);
  }
  if (method === 'POST') {
    const params = matchSegments(segments, ['reset-mock-data']);
    if (params) return admin_POST_reset_mock_data(ctx, auth, {  }, body, headers);
  }
  if (method === 'POST') {
    const params = matchSegments(segments, ['granular-reset']);
    if (params) return admin_POST_granular_reset(ctx, auth, {  }, body, headers);
  }
  if (method === 'POST') {
    const params = matchSegments(segments, ['delete-user']);
    if (params) return admin_POST_delete_user(ctx, auth, {  }, body, headers);
  }
  if (method === 'POST') {
    const params = matchSegments(segments, ['create-team-leader']);
    if (params) return admin_POST_create_team_leader(ctx, auth, {  }, body, headers);
  }
  if (method === 'POST') {
    const params = matchSegments(segments, ['users', 'backfill-auth-ids']);
    if (params) return admin_POST_users_backfill_auth_ids(ctx, auth, {  }, body, headers);
  }
  if (method === 'POST') {
    const params = matchSegments(segments, ['users', 'cleanup-orphan-auth']);
    if (params) return admin_POST_users_cleanup_orphan_auth(ctx, auth, {  }, body, headers);
  }
  if (method === 'GET') {
    const params = matchSegments(segments, ['email-config']);
    if (params) return admin_GET_email_config(ctx, auth, {  }, body, headers);
  }
  if (method === 'POST') {
    const params = matchSegments(segments, ['email-config']);
    if (params) return admin_POST_email_config(ctx, auth, {  }, body, headers);
  }
  if (method === 'GET') {
    const params = matchSegments(segments, ['email']);
    if (params) return admin_GET_email(ctx, auth, {  }, body, headers);
  }
  if (method === 'POST') {
    const params = matchSegments(segments, ['email', 'templates']);
    if (params) return admin_POST_email_templates(ctx, auth, {  }, body, headers);
  }
  if (method === 'POST') {
    const params = matchSegments(segments, ['email', 'settings']);
    if (params) return admin_POST_email_settings(ctx, auth, {  }, body, headers);
  }
  if (method === 'POST') {
    const params = matchSegments(segments, ['email', 'test']);
    if (params) return admin_POST_email_test(ctx, auth, {  }, body, headers);
  }
  if (method === 'GET') {
    const params = matchSegments(segments, ['email', 'logs']);
    if (params) return admin_GET_email_logs(ctx, auth, {  }, body, headers);
  }
  if (method === 'GET') {
    const params = matchSegments(segments, ['active-calls']);
    if (params) return admin_GET_active_calls(ctx, auth, {  }, body, headers);
  }
  if (method === 'GET') {
    const params = matchSegments(segments, ['infra-config']);
    if (params) return admin_GET_infra_config(ctx, auth, {  }, body, headers);
  }
  if (method === 'POST') {
    const params = matchSegments(segments, ['infra-config']);
    if (params) return admin_POST_infra_config(ctx, auth, {  }, body, headers);
  }
  if (method === 'GET') {
    const params = matchSegments(segments, ['infra-status']);
    if (params) return admin_GET_infra_status(ctx, auth, {  }, body, headers);
  }
  if (method === 'POST') {
    const params = matchSegments(segments, ['system-diagnostics']);
    if (params) return admin_POST_system_diagnostics(ctx, auth, {  }, body, headers);
  }
  if (method === 'POST') {
    const params = matchSegments(segments, ['k6-smoke']);
    if (params) return admin_POST_k6_smoke(ctx, auth, {  }, body, headers);
  }
  return null;
}
