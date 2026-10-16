/**
 * Backward-compatible hard-delete entry points.
 * Authoritative dual-path logic lives in userAccountClosure.ts:
 * soft-close (finance) vs hard-wipe (zero-finance, Auth last).
 */
import {
  closeOrDeleteUserCompletely,
  type CloseOrDeleteUserResult,
  type ClosureActorRole,
} from './userAccountClosure';
import {
  getSupabaseAdmin,
  isSupabaseAdminConfigured,
} from './supabaseAdmin';

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export interface HardDeleteUserResult {
  success: boolean;
  userId: string;
  authDeleted: boolean;
  profileDeleted: boolean;
  r2DeletedCount: number;
  warnings: string[];
  error?: string;
  /** Dual-path fields (soft-close vs hard-wipe). */
  mode?: 'soft_close' | 'hard_wipe';
  accountStatus?: string;
  authDisabled?: boolean;
  hasFinancialHistory?: boolean;
  unpaid?: {
    earningsCoins: number;
    pendingSettlementLines: number;
    pendingSettlementBatches: number;
  };
  message?: string;
}

function toHardDeleteResult(r: CloseOrDeleteUserResult): HardDeleteUserResult {
  // Soft-close success: profile retained; treat as success for callers that
  // previously required profileDeleted && authDeleted (handlers updated to use mode).
  return {
    success: r.success,
    userId: r.userId,
    authDeleted: r.authDeleted || (r.mode === 'soft_close' && r.authDisabled),
    profileDeleted: r.mode === 'hard_wipe' ? r.profileDeleted : r.success,
    r2DeletedCount: r.r2DeletedCount,
    warnings: r.warnings,
    error: r.error,
    mode: r.mode,
    accountStatus: r.accountStatus,
    authDisabled: r.authDisabled,
    hasFinancialHistory: r.hasFinancialHistory,
    unpaid: r.unpaid,
    message: r.message,
  };
}

/**
 * Dual-path account closure (preferred entry for all delete routes).
 * Financial users → soft-close; zero-finance → hard wipe with Auth last.
 */
export async function hardDeleteUserCompletely(
  userId: string,
  opts?: {
    actorRole?: ClosureActorRole;
    actorUserId?: string | null;
    reason?: string;
    forceSoftClose?: boolean;
  }
): Promise<HardDeleteUserResult> {
  const result = await closeOrDeleteUserCompletely(userId, opts || {});
  return toHardDeleteResult(result);
}

/**
 * Admin utility: delete auth.users that have no matching profiles row
 * (by auth id or email). Does not delete profiles.
 */
export async function cleanupOrphanAuthUsersAdmin(): Promise<{
  success: boolean;
  deleted: number;
  skipped: Array<{ authId: string; email: string | null; reason: string }>;
  error?: string;
}> {
  const client = getSupabaseAdmin();
  if (!client || !isSupabaseAdminConfigured()) {
    return { success: false, deleted: 0, skipped: [], error: 'Supabase admin not configured' };
  }

  const skipped: Array<{ authId: string; email: string | null; reason: string }> = [];
  let deleted = 0;

  try {
    let page = 1;
    const perPage = 1000;
    for (;;) {
      const { data, error } = await client.auth.admin.listUsers({ page, perPage });
      if (error) {
        return { success: false, deleted, skipped, error: error.message };
      }
      const users = data?.users || [];
      for (const u of users) {
        const authId = u.id;
        const email = u.email?.toLowerCase().trim() || null;

        const { data: byAuth } = await client
          .from('profiles')
          .select('id, role, account_status')
          .eq('auth_id', authId)
          .maybeSingle();
        if (byAuth) {
          skipped.push({ authId, email, reason: 'has_profile_by_auth_id' });
          continue;
        }

        const { data: byId } = await client
          .from('profiles')
          .select('id, role, account_status')
          .eq('id', authId)
          .maybeSingle();
        if (byId) {
          skipped.push({ authId, email, reason: 'has_profile_by_id' });
          continue;
        }

        if (email) {
          const { data: byEmail } = await client
            .from('profiles')
            .select('id, role, account_status')
            .ilike('email', email)
            .maybeSingle();
          if (byEmail) {
            skipped.push({ authId, email, reason: 'has_profile_by_email' });
            continue;
          }
        }

        const metaRole = String(u.user_metadata?.role || '').toLowerCase();
        if (metaRole === 'admin') {
          skipped.push({ authId, email, reason: 'admin_metadata_protected' });
          continue;
        }

        // Skip Auth users flagged closed (soft-close may keep or remove Auth)
        if ((u.app_metadata as any)?.account_closed) {
          skipped.push({ authId, email, reason: 'soft_closed_auth' });
          continue;
        }

        if (!UUID_RE.test(authId)) {
          skipped.push({ authId, email, reason: 'invalid_auth_id' });
          continue;
        }

        const { error: delErr } = await client.auth.admin.deleteUser(authId);
        if (delErr) {
          skipped.push({ authId, email, reason: delErr.message });
        } else {
          deleted += 1;
          console.log(`[HardDelete] Cleaned orphan Auth user ${authId} (${email || 'no-email'})`);
        }
      }
      if (users.length < perPage) break;
      page += 1;
      if (page > 50) break;
    }

    return { success: true, deleted, skipped };
  } catch (err: any) {
    return { success: false, deleted, skipped, error: err?.message || 'orphan cleanup failed' };
  }
}

export {
  closeOrDeleteUserCompletely,
  assessDeletionEligibility,
  softCloseUserAccount,
  hardWipeUserCompletely,
} from './userAccountClosure';
