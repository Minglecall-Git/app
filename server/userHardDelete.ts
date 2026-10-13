import {
  collectProfileMediaObjectKeys,
  purgeUserMediaFromR2,
} from './r2Storage';
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
      // Ambiguous — treat as still present so we do not quietly succeed
      return true;
    }
    return Boolean(data?.user?.id);
  } catch {
    return true;
  }
}

/**
 * Authoritative hard-delete pipeline (service role):
 * 1) Load profile (by id, then auth_id)
 * 2) Collect ALL Auth candidate IDs (auth_id, profile id if UUID, email lookup)
 * 3) Delete Auth users FIRST and verify they are gone
 * 4) Purge R2 + soft refs + delete profiles row
 *
 * Never reports quiet success when an Auth user that could re-login remains.
 * Callers must purge in-memory maps and broadcast after this returns.
 */
export async function hardDeleteUserCompletely(userId: string): Promise<HardDeleteUserResult> {
  const warnings: string[] = [];
  const id = String(userId || '').trim();

  if (!id) {
    return {
      success: false,
      userId: '',
      authDeleted: false,
      profileDeleted: false,
      r2DeletedCount: 0,
      warnings,
      error: 'User ID is required',
    };
  }

  if (!isSupabaseAdminConfigured()) {
    return {
      success: false,
      userId: id,
      authDeleted: false,
      profileDeleted: false,
      r2DeletedCount: 0,
      warnings,
      error: 'Supabase admin not configured',
    };
  }

  const client = getSupabaseAdmin();
  if (!client) {
    return {
      success: false,
      userId: id,
      authDeleted: false,
      profileDeleted: false,
      r2DeletedCount: 0,
      warnings,
      error: 'Supabase admin client unavailable',
    };
  }

  // 1) Load profile by id, then by auth_id
  let profile: any = null;
  {
    const { data, error: loadErr } = await client
      .from('profiles')
      .select(
        'id, auth_id, email, role, avatar_url, gallery, intro_video_url, verification_video_url, kyc_documents'
      )
      .eq('id', id)
      .maybeSingle();
    if (loadErr) warnings.push(`Profile load warning: ${loadErr.message}`);
    profile = data;
  }

  if (!profile && UUID_RE.test(id)) {
    const { data } = await client
      .from('profiles')
      .select(
        'id, auth_id, email, role, avatar_url, gallery, intro_video_url, verification_video_url, kyc_documents'
      )
      .eq('auth_id', id)
      .maybeSingle();
    profile = data;
  }

  const profileId = profile?.id ? String(profile.id) : id;
  const profileEmail = profile?.email ? String(profile.email).toLowerCase().trim() : '';
  const profileRole = String(profile?.role || '').toLowerCase();

  if (profileRole === 'admin') {
    return {
      success: false,
      userId: profileId,
      authDeleted: false,
      profileDeleted: false,
      r2DeletedCount: 0,
      warnings,
      error: 'Admin accounts cannot be deleted via this path.',
    };
  }

  // 2) Collect ALL candidate Auth IDs
  const authIdCandidates = new Set<string>();
  if (profile?.auth_id && UUID_RE.test(String(profile.auth_id))) {
    authIdCandidates.add(String(profile.auth_id));
  }
  if (UUID_RE.test(profileId)) {
    authIdCandidates.add(profileId);
  }
  if (UUID_RE.test(id) && id !== profileId) {
    authIdCandidates.add(id);
  }

  if (profileEmail) {
    try {
      const byEmail = await findAuthUserIdsByEmail(client, profileEmail);
      for (const aid of byEmail) authIdCandidates.add(aid);
    } catch (err: any) {
      warnings.push(err?.message || 'Auth email lookup failed');
      return {
        success: false,
        userId: profileId,
        authDeleted: false,
        profileDeleted: false,
        r2DeletedCount: 0,
        warnings,
        error: err?.message || 'Could not look up Auth users by email; delete aborted to avoid orphan login.',
      };
    }
  }

  // 3) Delete Auth FIRST — before profile delete
  const authIdsToDelete = Array.from(authIdCandidates);
  const failedAuthDeletes: string[] = [];
  let deletedOrAbsentCount = 0;

  for (const aid of authIdsToDelete) {
    try {
      const { error: authErr } = await client.auth.admin.deleteUser(aid);
      if (authErr) {
        const msg = authErr.message || String(authErr);
        if (/not found|user not found|does not exist/i.test(msg)) {
          deletedOrAbsentCount += 1;
          warnings.push(`Auth user ${aid} already absent.`);
        } else {
          console.error(`[HardDelete] Auth delete failed for ${aid}:`, msg);
          warnings.push(`Auth delete failed for ${aid}: ${msg}`);
          failedAuthDeletes.push(aid);
        }
      } else {
        deletedOrAbsentCount += 1;
        console.log(`[HardDelete] Deleted auth user ${aid}`);
      }
    } catch (err: any) {
      console.error(`[HardDelete] Auth delete exception for ${aid}:`, err);
      warnings.push(`Auth delete exception for ${aid}: ${err?.message || String(err)}`);
      failedAuthDeletes.push(aid);
    }
  }

  // Verify no candidate Auth user remains (prevents re-login orphans)
  const stillPresent: string[] = [];
  for (const aid of authIdsToDelete) {
    if (await authUserStillExists(client, aid)) {
      stillPresent.push(aid);
    }
  }

  // Also re-check by email after deletes
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
      success: false,
      userId: profileId,
      authDeleted: false,
      profileDeleted: false,
      r2DeletedCount: 0,
      warnings,
      error: `Auth user deletion incomplete (${stillPresent.join(', ') || failedAuthDeletes.join(', ')}). Profile was NOT deleted so you can retry.`,
    };
  }

  const authDeleted =
    authIdsToDelete.length === 0 || deletedOrAbsentCount > 0 || stillPresent.length === 0;

  // 4) R2 media purge (before DB delete so we still have URL fields)
  let r2DeletedCount = 0;
  try {
    const explicitKeys = collectProfileMediaObjectKeys(profile || undefined);
    const r2Res = await purgeUserMediaFromR2({
      userId: profileId,
      authId: profile?.auth_id && UUID_RE.test(String(profile.auth_id)) ? String(profile.auth_id) : null,
      explicitKeys,
    });
    r2DeletedCount = r2Res.deletedCount;
    warnings.push(...r2Res.warnings);
  } catch (err: any) {
    warnings.push(`R2 purge failed: ${err?.message || String(err)}`);
    console.error('[HardDelete] R2 purge error:', err);
  }

  // Soft FK cleanup
  try {
    await client.from('profiles').update({ team_leader_id: null }).eq('team_leader_id', profileId);
    await client.from('profiles').update({ created_by_id: null }).eq('created_by_id', profileId);
    await client.from('profiles').update({ banned_by_id: null }).eq('banned_by_id', profileId);
  } catch (err: any) {
    warnings.push(`Soft-ref cleanup warning: ${err?.message || String(err)}`);
  }

  // 5) Delete profile row (CASCADE child tables)
  let profileDeleted = false;
  if (profile) {
    const { error: delErr, count } = await client
      .from('profiles')
      .delete({ count: 'exact' })
      .eq('id', profileId);

    if (delErr) {
      console.error('[HardDelete] Profile delete error:', delErr.message);
      return {
        success: false,
        userId: profileId,
        authDeleted: true,
        profileDeleted: false,
        r2DeletedCount,
        warnings,
        error: `Auth deleted but profile delete failed: ${delErr.message}`,
      };
    }
    profileDeleted = true;
    if (count === 0) {
      warnings.push('Profile row was already absent at delete time.');
    }
  } else {
    // No profile row — Auth cleanup alone is success if we deleted/verified Auth
    profileDeleted = true;
    warnings.push('Profile row was already absent.');
  }

  // Optional orphan sweeps for tables that may lack FKs in older DBs
  const orphanTables: Array<{ table: string; column: string }> = [
    { table: 'creator_metrics', column: 'creator_id' },
    { table: 'user_daily_rewards', column: 'user_id' },
    { table: 'wallet_ledger', column: 'user_id' },
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

  return {
    success: profileDeleted && authDeleted,
    userId: profileId,
    authDeleted: true,
    profileDeleted,
    r2DeletedCount,
    warnings,
  };
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
          .select('id, role')
          .eq('auth_id', authId)
          .maybeSingle();
        if (byAuth) {
          skipped.push({ authId, email, reason: 'has_profile_by_auth_id' });
          continue;
        }

        const { data: byId } = await client
          .from('profiles')
          .select('id, role')
          .eq('id', authId)
          .maybeSingle();
        if (byId) {
          skipped.push({ authId, email, reason: 'has_profile_by_id' });
          continue;
        }

        if (email) {
          const { data: byEmail } = await client
            .from('profiles')
            .select('id, role')
            .ilike('email', email)
            .maybeSingle();
          if (byEmail) {
            skipped.push({ authId, email, reason: 'has_profile_by_email' });
            continue;
          }
        }

        // Never delete Auth for an admin profile path (already skipped if profile exists)
        const metaRole = String(u.user_metadata?.role || '').toLowerCase();
        if (metaRole === 'admin') {
          skipped.push({ authId, email, reason: 'admin_metadata_protected' });
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
