/**
 * Dual-path account closure:
 * - Soft-close: users with financial history / unpaid earnings (preserve ledgers & settlements)
 * - Hard-wipe: zero-finance users only (CASCADE social rows; Auth deleted LAST)
 *
 * Never delete Auth before DB status / profile wipe succeeds.
 */
import {
  collectProfileMediaObjectKeys,
  purgeUserMediaFromR2,
} from './r2Storage';
import {
  getSupabaseAdmin,
  isSupabaseAdminConfigured,
} from './supabaseAdmin';
import { clearUserRedisState } from '../lib/redis';

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** Roles that always soft-close (finance / agency obligations). */
const FINANCIAL_ROLES = new Set([
  'female_creator',
  'female_host',
  'team_leader',
  'agency_manager',
]);

export type AccountStatus =
  | 'active'
  | 'suspended'
  | 'closed_pending_payout'
  | 'deactivated';

export type ClosureMode = 'soft_close' | 'hard_wipe';

export type ClosureActorRole = 'self' | 'admin' | 'team_leader' | 'system';

export interface UnpaidSnapshot {
  earningsCoins: number;
  pendingSettlementLines: number;
  pendingSettlementBatches: number;
}

export interface DeletionEligibility {
  userId: string;
  mode: ClosureMode;
  role: string;
  hasFinancialHistory: boolean;
  unpaid: UnpaidSnapshot;
  reasons: string[];
  suggestedStatus: 'closed_pending_payout' | 'deactivated';
}

export interface CloseOrDeleteUserResult {
  success: boolean;
  mode: ClosureMode;
  userId: string;
  accountStatus?: AccountStatus;
  authDisabled: boolean;
  authDeleted: boolean;
  profileDeleted: boolean;
  r2DeletedCount: number;
  unpaid: UnpaidSnapshot;
  hasFinancialHistory: boolean;
  warnings: string[];
  error?: string;
  message?: string;
}

export interface CloseOrDeleteOptions {
  actorRole?: ClosureActorRole;
  actorUserId?: string | null;
  reason?: string;
  /** When true, force soft-close even if eligibility says hard_wipe (unused by default). */
  forceSoftClose?: boolean;
}

async function findAuthUserIdsByEmail(
  client: NonNullable<ReturnType<typeof getSupabaseAdmin>>,
  email: string
): Promise<string[]> {
  const clean = email.toLowerCase().trim();
  if (!clean) return [];

  const matches: string[] = [];
  let page = 1;
  const perPage = 1000;

  for (;;) {
    const { data, error } = await client.auth.admin.listUsers({ page, perPage });
    if (error) {
      throw new Error(`Auth email lookup failed: ${error.message}`);
    }
    const users = data?.users || [];
    for (const u of users) {
      if (u.email?.toLowerCase().trim() === clean && UUID_RE.test(u.id)) {
        matches.push(u.id);
      }
    }
    if (users.length < perPage) break;
    page += 1;
    if (page > 50) break;
  }
  return matches;
}

async function authUserStillExists(
  client: NonNullable<ReturnType<typeof getSupabaseAdmin>>,
  authUserId: string
): Promise<boolean> {
  try {
    const { data, error } = await client.auth.admin.getUserById(authUserId);
    if (error) {
      const msg = error.message || '';
      if (/not found|user not found|does not exist/i.test(msg)) return false;
      return true;
    }
    return Boolean(data?.user?.id);
  } catch {
    return true;
  }
}

async function countRows(
  client: NonNullable<ReturnType<typeof getSupabaseAdmin>>,
  table: string,
  column: string,
  userId: string
): Promise<number> {
  try {
    const { count, error } = await client
      .from(table)
      .select('id', { count: 'exact', head: true })
      .eq(column, userId);
    if (error) {
      if (/does not exist|schema cache/i.test(error.message)) return 0;
      console.warn(`[AccountClosure] count ${table}.${column}:`, error.message);
      return 0;
    }
    return Number(count) || 0;
  } catch {
    return 0;
  }
}

function emptyUnpaid(): UnpaidSnapshot {
  return {
    earningsCoins: 0,
    pendingSettlementLines: 0,
    pendingSettlementBatches: 0,
  };
}

/**
 * Pre-deletion financial gate — decide soft-close vs hard-wipe.
 * Does not mutate Auth or profile.
 */
export async function assessDeletionEligibility(
  userId: string
): Promise<DeletionEligibility & { error?: string; profile?: any }> {
  const id = String(userId || '').trim();
  const reasons: string[] = [];
  const unpaid = emptyUnpaid();

  if (!id) {
    return {
      userId: '',
      mode: 'soft_close',
      role: '',
      hasFinancialHistory: true,
      unpaid,
      reasons: ['User ID is required'],
      suggestedStatus: 'deactivated',
      error: 'User ID is required',
    };
  }

  if (!isSupabaseAdminConfigured()) {
    return {
      userId: id,
      mode: 'soft_close',
      role: '',
      hasFinancialHistory: true,
      unpaid,
      reasons: ['Supabase admin not configured'],
      suggestedStatus: 'deactivated',
      error: 'Supabase admin not configured',
    };
  }

  const client = getSupabaseAdmin();
  if (!client) {
    return {
      userId: id,
      mode: 'soft_close',
      role: '',
      hasFinancialHistory: true,
      unpaid,
      reasons: ['Supabase admin client unavailable'],
      suggestedStatus: 'deactivated',
      error: 'Supabase admin client unavailable',
    };
  }

  let profile: any = null;
  {
    const { data, error } = await client
      .from('profiles')
      .select(
        'id, auth_id, email, role, earnings_coins, coin_balance, account_status, avatar_url, gallery, intro_video_url, verification_video_url, kyc_documents, is_banned'
      )
      .eq('id', id)
      .maybeSingle();
    if (error) {
      return {
        userId: id,
        mode: 'soft_close',
        role: '',
        hasFinancialHistory: true,
        unpaid,
        reasons: [error.message],
        suggestedStatus: 'deactivated',
        error: error.message,
      };
    }
    profile = data;
  }

  if (!profile && UUID_RE.test(id)) {
    const { data } = await client
      .from('profiles')
      .select(
        'id, auth_id, email, role, earnings_coins, coin_balance, account_status, avatar_url, gallery, intro_video_url, verification_video_url, kyc_documents, is_banned'
      )
      .eq('auth_id', id)
      .maybeSingle();
    profile = data;
  }

  const profileId = profile?.id ? String(profile.id) : id;
  const role = String(profile?.role || '').toLowerCase();
  unpaid.earningsCoins = Math.max(0, Number(profile?.earnings_coins) || 0);

  if (FINANCIAL_ROLES.has(role)) {
    reasons.push(`role:${role}`);
  }

  const walletLedger = await countRows(client, 'wallet_ledger', 'user_id', profileId);
  if (walletLedger > 0) reasons.push(`wallet_ledger:${walletLedger}`);

  const financialLedgerUser = await countRows(client, 'financial_ledger', 'user_id', profileId);
  if (financialLedgerUser > 0) reasons.push(`financial_ledger.user:${financialLedgerUser}`);

  const financialLedgerTl = await countRows(client, 'financial_ledger', 'team_leader_id', profileId);
  if (financialLedgerTl > 0) reasons.push(`financial_ledger.tl:${financialLedgerTl}`);

  const settlementBatches = await countRows(client, 'settlement_batches', 'payee_user_id', profileId);
  if (settlementBatches > 0) reasons.push(`settlement_batches:${settlementBatches}`);

  const settlementLines = await countRows(client, 'settlement_line_items', 'payee_user_id', profileId);
  if (settlementLines > 0) reasons.push(`settlement_line_items:${settlementLines}`);

  const settlementEvents = await countRows(client, 'settlement_events', 'actor_user_id', profileId);
  if (settlementEvents > 0) reasons.push(`settlement_events:${settlementEvents}`);

  const periodSnapshots = await countRows(client, 'creator_period_snapshots', 'creator_id', profileId);
  if (periodSnapshots > 0) reasons.push(`creator_period_snapshots:${periodSnapshots}`);

  const coinPurchases = await countRows(client, 'coin_purchases', 'user_id', profileId);
  if (coinPurchases > 0) reasons.push(`coin_purchases:${coinPurchases}`);

  const payoutRequests = await countRows(client, 'payout_requests', 'user_id', profileId);
  if (payoutRequests > 0) reasons.push(`payout_requests:${payoutRequests}`);

  if (unpaid.earningsCoins > 0) reasons.push(`earnings_coins:${unpaid.earningsCoins}`);

  // Pending settlement obligations (final payout review queue)
  try {
    const { count: pendingLines, error: plErr } = await client
      .from('settlement_line_items')
      .select('id', { count: 'exact', head: true })
      .eq('payee_user_id', profileId)
      .eq('host_salary_status', 'pending');
    if (!plErr) unpaid.pendingSettlementLines = Number(pendingLines) || 0;
  } catch {
    /* ignore */
  }

  try {
    const { count: pendingBatches, error: pbErr } = await client
      .from('settlement_batches')
      .select('id', { count: 'exact', head: true })
      .eq('payee_user_id', profileId)
      .in('status', ['pending_admin_pay', 'admin_paid']);
    if (!pbErr) unpaid.pendingSettlementBatches = Number(pendingBatches) || 0;
  } catch {
    /* ignore */
  }

  if (unpaid.pendingSettlementLines > 0) {
    reasons.push(`pending_settlement_lines:${unpaid.pendingSettlementLines}`);
  }
  if (unpaid.pendingSettlementBatches > 0) {
    reasons.push(`pending_settlement_batches:${unpaid.pendingSettlementBatches}`);
  }

  const hasFinancialHistory = reasons.length > 0;
  const hasUnpaid =
    unpaid.earningsCoins > 0 ||
    unpaid.pendingSettlementLines > 0 ||
    unpaid.pendingSettlementBatches > 0;

  const mode: ClosureMode = hasFinancialHistory ? 'soft_close' : 'hard_wipe';
  const suggestedStatus: 'closed_pending_payout' | 'deactivated' = hasUnpaid
    ? 'closed_pending_payout'
    : 'deactivated';

  return {
    userId: profileId,
    mode,
    role,
    hasFinancialHistory,
    unpaid,
    reasons,
    suggestedStatus,
    profile,
  };
}

function collectAuthCandidates(profile: any, profileId: string, requestId: string): Set<string> {
  const authIdCandidates = new Set<string>();
  if (profile?.auth_id && UUID_RE.test(String(profile.auth_id))) {
    authIdCandidates.add(String(profile.auth_id));
  }
  if (UUID_RE.test(profileId)) authIdCandidates.add(profileId);
  if (UUID_RE.test(requestId) && requestId !== profileId) authIdCandidates.add(requestId);
  return authIdCandidates;
}

async function disableAuthUsers(
  client: NonNullable<ReturnType<typeof getSupabaseAdmin>>,
  authIds: string[],
  warnings: string[]
): Promise<boolean> {
  let allOk = true;
  for (const aid of authIds) {
    try {
      const { error } = await client.auth.admin.updateUserById(aid, {
        ban_duration: '876000h',
        app_metadata: { account_closed: true },
      } as any);
      if (error) {
        // Fallback: delete Auth login while keeping profile (soft-close already applied)
        const { error: delErr } = await client.auth.admin.deleteUser(aid);
        if (delErr && !/not found|user not found|does not exist/i.test(delErr.message || '')) {
          warnings.push(`Auth disable failed for ${aid}: ${error.message}; delete: ${delErr.message}`);
          allOk = false;
        } else {
          warnings.push(`Auth ban unsupported for ${aid}; Auth user removed after soft-close.`);
        }
      }
    } catch (err: any) {
      warnings.push(`Auth disable exception for ${aid}: ${err?.message || String(err)}`);
      allOk = false;
    }
  }
  return allOk;
}

async function deleteAuthUsersVerified(
  client: NonNullable<ReturnType<typeof getSupabaseAdmin>>,
  authIds: string[],
  profileEmail: string,
  warnings: string[]
): Promise<{ authDeleted: boolean; error?: string }> {
  const failedAuthDeletes: string[] = [];
  let deletedOrAbsentCount = 0;

  for (const aid of authIds) {
    try {
      const { error: authErr } = await client.auth.admin.deleteUser(aid);
      if (authErr) {
        const msg = authErr.message || String(authErr);
        if (/not found|user not found|does not exist/i.test(msg)) {
          deletedOrAbsentCount += 1;
          warnings.push(`Auth user ${aid} already absent.`);
        } else {
          warnings.push(`Auth delete failed for ${aid}: ${msg}`);
          failedAuthDeletes.push(aid);
        }
      } else {
        deletedOrAbsentCount += 1;
      }
    } catch (err: any) {
      warnings.push(`Auth delete exception for ${aid}: ${err?.message || String(err)}`);
      failedAuthDeletes.push(aid);
    }
  }

  const stillPresent: string[] = [];
  for (const aid of authIds) {
    if (await authUserStillExists(client, aid)) stillPresent.push(aid);
  }

  if (profileEmail) {
    try {
      const remainingByEmail = await findAuthUserIdsByEmail(client, profileEmail);
      for (const aid of remainingByEmail) {
        if (!stillPresent.includes(aid)) stillPresent.push(aid);
      }
    } catch (err: any) {
      warnings.push(`Post-delete email Auth check failed: ${err?.message || String(err)}`);
    }
  }

  if (stillPresent.length > 0 || failedAuthDeletes.length > 0) {
    return {
      authDeleted: false,
      error: `Auth user deletion incomplete (${stillPresent.join(', ') || failedAuthDeletes.join(', ')}).`,
    };
  }

  return {
    authDeleted: authIds.length === 0 || deletedOrAbsentCount > 0,
  };
}

/**
 * Soft-close: mark profile closed, clear Redis, disable Auth.
 * Never deletes wallet_ledger / financial_ledger / settlements / snapshots.
 */
export async function softCloseUserAccount(
  userId: string,
  opts: CloseOrDeleteOptions = {},
  eligibility?: DeletionEligibility & { profile?: any; error?: string }
): Promise<CloseOrDeleteUserResult> {
  const warnings: string[] = [];
  const unpaid = eligibility?.unpaid || emptyUnpaid();
  const id = String(userId || '').trim();

  const baseFail = (error: string): CloseOrDeleteUserResult => ({
    success: false,
    mode: 'soft_close',
    userId: id,
    authDisabled: false,
    authDeleted: false,
    profileDeleted: false,
    r2DeletedCount: 0,
    unpaid,
    hasFinancialHistory: true,
    warnings,
    error,
  });

  if (!id) return baseFail('User ID is required');
  if (!isSupabaseAdminConfigured()) return baseFail('Supabase admin not configured');

  const client = getSupabaseAdmin();
  if (!client) return baseFail('Supabase admin client unavailable');

  const assessed =
    eligibility?.userId === id && eligibility.profile
      ? eligibility
      : await assessDeletionEligibility(id);

  if (assessed.error && !assessed.profile) {
    return baseFail(assessed.error);
  }

  const profile = assessed.profile;
  const profileId = assessed.userId || id;
  const profileRole = String(assessed.role || profile?.role || '').toLowerCase();

  if (profileRole === 'admin') {
    return baseFail('Admin accounts cannot be deleted via this path.');
  }

  const accountStatus: AccountStatus =
    assessed.suggestedStatus ||
    (assessed.unpaid.earningsCoins > 0 ||
    assessed.unpaid.pendingSettlementLines > 0 ||
    assessed.unpaid.pendingSettlementBatches > 0
      ? 'closed_pending_payout'
      : 'deactivated');

  const actorRole = opts.actorRole || 'system';
  const reason =
    opts.reason ||
    (accountStatus === 'closed_pending_payout'
      ? `Account closed (${actorRole}); pending payout review`
      : `Account deactivated (${actorRole}); financial history retained`);

  // 1) Profile soft-close FIRST (before Auth)
  if (profile) {
    const { error: updErr } = await client
      .from('profiles')
      .update({
        account_status: accountStatus,
        is_banned: true,
        ban_reason: reason,
        banned_until: null,
        banned_by_id: opts.actorUserId || null,
        banned_by_role: actorRole === 'self' ? 'self' : actorRole,
        online_status: 'offline',
        active_session_id: null,
        closed_at: new Date().toISOString(),
        closed_reason: reason,
        closed_by_id: opts.actorUserId || null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', profileId);

    if (updErr) {
      return baseFail(`Soft-close profile update failed: ${updErr.message}`);
    }
  } else {
    warnings.push('Profile row was already absent; disabling Auth only.');
  }

  // 2) Redis presence + profile cache
  await clearUserRedisState(profileId);

  // 3) Soft-null agency refs pointing at this user as leader (keep their own finance rows)
  try {
    await client.from('profiles').update({ team_leader_id: null }).eq('team_leader_id', profileId);
    await client.from('profiles').update({ created_by_id: null }).eq('created_by_id', profileId);
  } catch (err: any) {
    warnings.push(`Soft-ref cleanup warning: ${err?.message || String(err)}`);
  }

  // 4) Disable Auth login AFTER profile is closed
  const authCandidates = collectAuthCandidates(profile, profileId, id);
  const profileEmail = profile?.email ? String(profile.email).toLowerCase().trim() : '';
  if (profileEmail) {
    try {
      const byEmail = await findAuthUserIdsByEmail(client, profileEmail);
      for (const aid of byEmail) authCandidates.add(aid);
    } catch (err: any) {
      warnings.push(err?.message || 'Auth email lookup failed');
    }
  }

  const authIds = Array.from(authCandidates);
  const authDisabled = authIds.length === 0 ? true : await disableAuthUsers(client, authIds, warnings);

  if (!authDisabled) {
    return {
      success: false,
      mode: 'soft_close',
      userId: profileId,
      accountStatus,
      authDisabled: false,
      authDeleted: false,
      profileDeleted: false,
      r2DeletedCount: 0,
      unpaid: assessed.unpaid,
      hasFinancialHistory: true,
      warnings,
      error:
        'Profile was soft-closed but Auth disable failed. Retry closure; do not hard-delete (finance preserved).',
    };
  }

  const message =
    accountStatus === 'closed_pending_payout'
      ? 'Account closed. Login disabled. Unpaid earnings remain for admin/agency final payout; financial records were preserved.'
      : 'Account deactivated. Login disabled. Financial and settlement records were preserved.';

  return {
    success: true,
    mode: 'soft_close',
    userId: profileId,
    accountStatus,
    authDisabled: true,
    authDeleted: false,
    profileDeleted: false,
    r2DeletedCount: 0,
    unpaid: assessed.unpaid,
    hasFinancialHistory: true,
    warnings,
    message,
  };
}

/**
 * Hard wipe for zero-finance users only.
 * Profile + social CASCADE first; Auth deleted LAST.
 * Never targets wallet_ledger / settlement tables.
 */
export async function hardWipeUserCompletely(
  userId: string,
  opts: CloseOrDeleteOptions = {},
  eligibility?: DeletionEligibility & { profile?: any; error?: string }
): Promise<CloseOrDeleteUserResult> {
  const warnings: string[] = [];
  const unpaid = emptyUnpaid();
  const id = String(userId || '').trim();

  const baseFail = (
    error: string,
    extra?: Partial<CloseOrDeleteUserResult>
  ): CloseOrDeleteUserResult => ({
    success: false,
    mode: 'hard_wipe',
    userId: id,
    authDisabled: false,
    authDeleted: false,
    profileDeleted: false,
    r2DeletedCount: 0,
    unpaid,
    hasFinancialHistory: false,
    warnings,
    error,
    ...extra,
  });

  if (!id) return baseFail('User ID is required');
  if (!isSupabaseAdminConfigured()) return baseFail('Supabase admin not configured');

  const client = getSupabaseAdmin();
  if (!client) return baseFail('Supabase admin client unavailable');

  const assessed =
    eligibility?.userId && eligibility.mode
      ? eligibility
      : await assessDeletionEligibility(id);

  if (assessed.error && !assessed.profile && assessed.mode !== 'hard_wipe') {
    return baseFail(assessed.error);
  }

  // Safety: never hard-wipe financial users — convert to soft-close
  if (assessed.mode === 'soft_close' || assessed.hasFinancialHistory || opts.forceSoftClose) {
    return softCloseUserAccount(id, opts, assessed);
  }

  const profile = assessed.profile;
  const profileId = assessed.userId || id;
  const profileRole = String(assessed.role || profile?.role || '').toLowerCase();
  const profileEmail = profile?.email ? String(profile.email).toLowerCase().trim() : '';

  if (profileRole === 'admin') {
    return baseFail('Admin accounts cannot be deleted via this path.');
  }

  // Collect Auth IDs before profile delete (needed after)
  const authCandidates = collectAuthCandidates(profile, profileId, id);
  if (profileEmail) {
    try {
      const byEmail = await findAuthUserIdsByEmail(client, profileEmail);
      for (const aid of byEmail) authCandidates.add(aid);
    } catch (err: any) {
      return baseFail(
        err?.message || 'Could not look up Auth users by email; delete aborted.',
        { warnings: [...warnings, err?.message || 'Auth email lookup failed'] }
      );
    }
  }
  const authIdsToDelete = Array.from(authCandidates);

  // R2 purge while URL fields still exist
  let r2DeletedCount = 0;
  try {
    const explicitKeys = collectProfileMediaObjectKeys(profile || undefined);
    const r2Res = await purgeUserMediaFromR2({
      userId: profileId,
      authId:
        profile?.auth_id && UUID_RE.test(String(profile.auth_id))
          ? String(profile.auth_id)
          : null,
      explicitKeys,
    });
    r2DeletedCount = r2Res.deletedCount;
    warnings.push(...r2Res.warnings);
  } catch (err: any) {
    warnings.push(`R2 purge failed: ${err?.message || String(err)}`);
  }

  try {
    await client.from('profiles').update({ team_leader_id: null }).eq('team_leader_id', profileId);
    await client.from('profiles').update({ created_by_id: null }).eq('created_by_id', profileId);
    await client.from('profiles').update({ banned_by_id: null }).eq('banned_by_id', profileId);
  } catch (err: any) {
    warnings.push(`Soft-ref cleanup warning: ${err?.message || String(err)}`);
  }

  // Profile delete FIRST (CASCADE social). Finance tables must be empty for this path.
  let profileDeleted = false;
  if (profile) {
    const { error: delErr, count } = await client
      .from('profiles')
      .delete({ count: 'exact' })
      .eq('id', profileId);

    if (delErr) {
      // FK / immutability — fall back to soft-close instead of Auth-first orphan
      warnings.push(`Hard wipe blocked (${delErr.message}); converting to soft-close.`);
      return softCloseUserAccount(id, opts, {
        ...assessed,
        mode: 'soft_close',
        hasFinancialHistory: true,
        reasons: [...(assessed.reasons || []), `hard_wipe_blocked:${delErr.message}`],
        suggestedStatus: assessed.suggestedStatus || 'deactivated',
      });
    }
    profileDeleted = true;
    if (count === 0) warnings.push('Profile row was already absent at delete time.');
  } else {
    profileDeleted = true;
    warnings.push('Profile row was already absent.');
  }

  // Orphan social sweeps — NEVER wallet_ledger / settlements / financial_ledger
  const orphanTables: Array<{ table: string; column: string }> = [
    { table: 'creator_metrics', column: 'creator_id' },
    { table: 'user_daily_rewards', column: 'user_id' },
    { table: 'call_logs', column: 'caller_id' },
    { table: 'call_logs', column: 'receiver_id' },
    { table: 'call_logs', column: 'host_id' },
    { table: 'messages', column: 'sender_id' },
    { table: 'messages', column: 'receiver_id' },
    { table: 'feed_posts', column: 'creator_id' },
  ];

  for (const { table, column } of orphanTables) {
    try {
      const { error } = await client.from(table).delete().eq(column, profileId);
      if (error && !/does not exist|schema cache/i.test(error.message)) {
        warnings.push(`Orphan cleanup ${table}.${column}: ${error.message}`);
      }
    } catch (err: any) {
      warnings.push(`Orphan cleanup ${table}.${column}: ${err?.message || String(err)}`);
    }
  }

  await clearUserRedisState(profileId);

  // Auth delete LAST — only after profile wipe succeeded
  const authResult = await deleteAuthUsersVerified(
    client,
    authIdsToDelete,
    profileEmail,
    warnings
  );

  if (!authResult.authDeleted) {
    return {
      success: false,
      mode: 'hard_wipe',
      userId: profileId,
      authDisabled: false,
      authDeleted: false,
      profileDeleted: true,
      r2DeletedCount,
      unpaid,
      hasFinancialHistory: false,
      warnings,
      error:
        authResult.error ||
        'Profile deleted but Auth cleanup incomplete. Retry Auth orphan cleanup.',
    };
  }

  return {
    success: true,
    mode: 'hard_wipe',
    userId: profileId,
    authDisabled: true,
    authDeleted: true,
    profileDeleted: true,
    r2DeletedCount,
    unpaid,
    hasFinancialHistory: false,
    warnings,
    message: 'Account permanently deleted (no financial history).',
  };
}

/**
 * Authoritative entry: assess → soft-close OR hard-wipe.
 * Hard-delete attempts on financial users convert to soft-close.
 */
export async function closeOrDeleteUserCompletely(
  userId: string,
  opts: CloseOrDeleteOptions = {}
): Promise<CloseOrDeleteUserResult> {
  const assessed = await assessDeletionEligibility(userId);
  if (assessed.error && !assessed.profile) {
    return {
      success: false,
      mode: 'soft_close',
      userId: String(userId || ''),
      authDisabled: false,
      authDeleted: false,
      profileDeleted: false,
      r2DeletedCount: 0,
      unpaid: assessed.unpaid,
      hasFinancialHistory: true,
      warnings: assessed.reasons,
      error: assessed.error,
    };
  }

  if (String(assessed.role || '').toLowerCase() === 'admin') {
    return {
      success: false,
      mode: 'soft_close',
      userId: assessed.userId,
      authDisabled: false,
      authDeleted: false,
      profileDeleted: false,
      r2DeletedCount: 0,
      unpaid: assessed.unpaid,
      hasFinancialHistory: assessed.hasFinancialHistory,
      warnings: [],
      error: 'Admin accounts cannot be deleted via this path.',
    };
  }

  // Already closed — idempotent soft-close refresh (re-disable Auth / Redis)
  const existingStatus = String(assessed.profile?.account_status || 'active').toLowerCase();
  if (
    existingStatus === 'closed_pending_payout' ||
    existingStatus === 'deactivated'
  ) {
    return softCloseUserAccount(assessed.userId, opts, assessed);
  }

  if (opts.forceSoftClose || assessed.mode === 'soft_close') {
    return softCloseUserAccount(assessed.userId, opts, assessed);
  }

  return hardWipeUserCompletely(assessed.userId, opts, assessed);
}
