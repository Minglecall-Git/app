import type { AuthOk } from '../nextAuth';
import type { ServerRuntime } from '../serverRuntime';
import { hardDeleteUserCompletely } from '../../server/userHardDelete';
import {
  authenticateUserWithPasswordAdmin,
  isSupabaseAdminConfigured,
} from '../../server/supabaseAdmin';
import { err, ok, type HandlerResult } from './handlerResult';

/** POST /api/users/me/delete */
export async function handleUsersMeDelete(
  ctx: ServerRuntime,
  auth: AuthOk,
  body: Record<string, unknown>
): Promise<HandlerResult> {
  try {
    const profileId = auth.profileId;
    const role = String(auth.role || '').toLowerCase();

    if (!profileId) {
      return err(401, {
        success: false,
        error: { message: 'Not authenticated', code: 'UNAUTHORIZED' },
      });
    }
    if (role === 'admin') {
      return err(403, {
        success: false,
        error: { message: 'Admin accounts cannot be self-deleted.', code: 'ADMIN_DELETE_FORBIDDEN' },
      });
    }

    const confirmPhrase = String(body?.confirmPhrase || body?.confirmation || '')
      .trim()
      .toUpperCase();
    const password = typeof body?.password === 'string' ? body.password : '';
    const email = String(auth.email || '').trim().toLowerCase();

    if (confirmPhrase !== 'DELETE' && confirmPhrase !== email.toUpperCase()) {
      return err(400, {
        success: false,
        error: {
          message: 'Type DELETE (or your email) to confirm permanent account deletion.',
          code: 'CONFIRMATION_REQUIRED',
        },
      });
    }

    if (!password || password.trim().length === 0) {
      return err(400, {
        success: false,
        error: { message: 'Password is required to delete your account.', code: 'PASSWORD_REQUIRED' },
      });
    }

    if (!email) {
      return err(400, {
        success: false,
        error: { message: 'Account email is missing; cannot verify password.', code: 'EMAIL_REQUIRED' },
      });
    }

    const authCheck = await authenticateUserWithPasswordAdmin(email, password);
    if (!authCheck.success) {
      return err(401, {
        success: false,
        error: {
          message: authCheck.error || 'Password verification failed.',
          code: 'PASSWORD_INVALID',
        },
      });
    }

    if (!isSupabaseAdminConfigured()) {
      return err(503, {
        success: false,
        error: { message: 'Account deletion is temporarily unavailable.', code: 'SUPABASE_NOT_CONFIGURED' },
      });
    }

    const hard = await hardDeleteUserCompletely(profileId);
    if (!hard.success || !hard.profileDeleted || !hard.authDeleted) {
      return err(500, {
        success: false,
        error: {
          message:
            hard.error ||
            'Could not fully delete your account (Auth or profile). Please contact support.',
          code: 'DELETE_INCOMPLETE',
        },
        data: {
          authDeleted: hard.authDeleted,
          profileDeleted: hard.profileDeleted,
          warnings: hard.warnings,
        },
      });
    }

    ctx.purgeUserRuntimeState(profileId);
    if (hard.userId && hard.userId !== profileId) {
      ctx.purgeUserRuntimeState(hard.userId);
    }

    ctx.broadcastAll({
      type: 'users:deleted',
      userId: profileId,
      users: ctx.getFormattedUsers(),
    });
    ctx.broadcastPresence();
    ctx.broadcastUsers();

    return ok({
      success: true,
      message: 'Your account has been permanently deleted.',
      data: {
        userId: hard.userId,
        authDeleted: hard.authDeleted,
        profileDeleted: hard.profileDeleted,
        r2DeletedCount: hard.r2DeletedCount,
      },
      runtime: 'next-native',
    });
  } catch (e: any) {
    console.error('Error in POST /api/users/me/delete:', e);
    return err(500, { success: false, error: e.message });
  }
}

/** POST /api/users/sync-all */
export async function handleUsersSyncAll(
  ctx: ServerRuntime,
  body: Record<string, unknown>
): Promise<HandlerResult> {
  try {
    const incomingUsers = body?.users;
    const overwrite = body?.overwrite;
    if (Array.isArray(incomingUsers)) {
      if (overwrite) {
        ctx.serverUsers.clear();
      }
      for (const u of incomingUsers) {
        if (u && (u as any).id && !ctx.isUserHardDeleted((u as any).id)) {
          ctx.serverUsers.set((u as any).id, ctx.normalizeUserProfile(u));
        }
      }
      ctx.broadcastUsers();
      return ok({ success: true, count: ctx.serverUsers.size, runtime: 'next-native' });
    }
    return err(400, { success: false, error: 'Invalid users array' });
  } catch (e: any) {
    return err(500, { success: false, error: e.message });
  }
}

/** DELETE /api/users/:id */
export async function handleDeleteUserById(
  ctx: ServerRuntime,
  userId: string
): Promise<HandlerResult> {
  try {
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
      message: `User ${userName} (${userId}) was permanently deleted from database and system.`,
      data: deleteResult,
      runtime: 'next-native',
    });
  } catch (e: any) {
    console.error('Error in DELETE /api/users/:id:', e);
    return err(500, { success: false, error: e.message });
  }
}
