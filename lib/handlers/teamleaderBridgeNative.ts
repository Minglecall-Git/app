import type { NextRequest } from 'next/server';
import { ensureActiveAgencyMembership, listActiveHostIdsForLeader } from '../agencyMemberships';
import type { AuthOk } from '../nextAuth';
import type { ServerRuntime } from '../serverRuntime';
import {
  callerOwnsCreator,
  ownsCreatorByLeaderId,
  stripPrivilegedProfileFields,
} from '../profileGuards';
import {
  ensureValidUuid,
  getSupabaseAdmin,
  hashPassword,
  isSupabaseAdminConfigured,
  updateUserPasswordAdmin,
  upsertProfileAdmin,
} from '../../server/supabaseAdmin';
import { getPasswordPolicyError } from '../../shared/passwordPolicy';
import { hardDeleteUserCompletely } from '../../server/userHardDelete';
import { err, ok, type HandlerResult } from './handlerResult';

const DISPOSABLE_CREATOR_EMAIL_SUFFIXES = [
  '@livecall.app',
  '@minglecall.local',
  '@example.com',
  '@test.local',
];

function isFemaleHostProfile(u: { gender?: string; role?: string }) {
  return (
    u.gender === 'female' ||
    (u.role as string) === 'female_creator' ||
    (u.role as string) === 'female_host'
  );
}

function resolveTeamLeaderScope(
  req: NextRequest,
  leader: { id?: string; role?: string; authId?: string }
): { scopeLeaderId: string; allMode: boolean } {
  const url = new URL(req.url);
  const isAdmin = leader?.role === 'admin';
  const allMode =
    isAdmin && (url.searchParams.get('all') === '1' || url.searchParams.get('all') === 'true');
  const queryLeaderId =
    isAdmin && url.searchParams.get('leaderId') ? String(url.searchParams.get('leaderId')) : '';
  const scopeLeaderId = allMode ? '' : queryLeaderId || String(leader?.id || '');
  return { scopeLeaderId, allMode };
}

function leaderProfile(auth: AuthOk) {
  return {
    id: auth.profileId,
    authId: auth.authId || auth.userId,
    role: auth.role,
    agencyName: null as string | null,
    commissionPercent: undefined as number | undefined,
  };
}

/** GET /api/teamleader/creators */
export async function handleTeamleaderCreators(
  ctx: ServerRuntime,
  req: NextRequest,
  auth: AuthOk
): Promise<HandlerResult> {
  try {
    const leader = leaderProfile(auth);
    const isAdmin = leader.role === 'admin';
    const { scopeLeaderId, allMode } = resolveTeamLeaderScope(req, leader);
    const url = new URL(req.url);
    const listAllMode = allMode || (isAdmin && !url.searchParams.get('leaderId'));
    const allUsers = ctx.getFormattedUsers();

    // Formal agency_memberships (active) ∪ legacy team_leader_id / created_by_id
    let membershipHostIds = new Set<string>();
    if (!listAllMode && isSupabaseAdminConfigured()) {
      try {
        const admin = getSupabaseAdmin();
        if (admin) {
          const effectiveLeaderId = scopeLeaderId || String(leader.id || '');
          const ids = await listActiveHostIdsForLeader(admin, effectiveLeaderId);
          membershipHostIds = new Set(ids);
        }
      } catch {
        /* fall back to profile pointers */
      }
    }

    const creators = allUsers.filter((u) => {
      if (!isFemaleHostProfile(u)) return false;
      if (u.role === 'team_leader' || u.role === 'agency_manager' || u.role === 'admin') return false;
      if (listAllMode) return true;
      const effectiveLeaderId = scopeLeaderId || String(leader.id || '');
      if (u.id === effectiveLeaderId) return false;
      if (membershipHostIds.has(u.id)) return true;
      return ownsCreatorByLeaderId(effectiveLeaderId, u, leader.authId);
    });

    return ok({
      success: true,
      creators,
      count: creators.length,
      leaderId: scopeLeaderId || String(leader.id || ''),
      agencyName: leader.agencyName,
      allMode: listAllMode,
      membershipScoped: membershipHostIds.size > 0,
      runtime: 'next-native',
    });
  } catch (e: any) {
    return err(500, { success: false, error: e.message });
  }
}

/** GET /api/teamleader/stats */
export async function handleTeamleaderStats(
  ctx: ServerRuntime,
  req: NextRequest,
  auth: AuthOk
): Promise<HandlerResult> {
  try {
    const leader = leaderProfile(auth);
    const { scopeLeaderId, allMode } = resolveTeamLeaderScope(req, leader);
    const allUsers = ctx.getFormattedUsers();

    let membershipHostIds = new Set<string>();
    if (!allMode && isSupabaseAdminConfigured()) {
      try {
        const admin = getSupabaseAdmin();
        if (admin) {
          const ids = await listActiveHostIdsForLeader(admin, scopeLeaderId || String(leader.id || ''));
          membershipHostIds = new Set(ids);
        }
      } catch {
        /* fall back */
      }
    }

    const managedCreators = allUsers.filter((u) => {
      if (!isFemaleHostProfile(u)) return false;
      if (u.role === 'team_leader' || u.role === 'agency_manager' || u.role === 'admin') return false;
      if (allMode) return true;
      if (membershipHostIds.has(u.id)) return true;
      return ownsCreatorByLeaderId(scopeLeaderId, u, leader.authId);
    });
    const managedIds = new Set(managedCreators.map((c) => c.id));

    let totalCalls = 0;
    let totalMinutes = 0;
    let hostEarningsCoins = 0;
    let teamLeaderEarnedCoins = 0;
    let totalCoinsSpent = 0;
    let statsSource: 'call_logs' | 'wallet_ledger' | 'profile_fallback' | 'empty' = 'empty';

    let femalePayoutRatioUSD = 0.003;
    let teamLeaderSharePercent = 10;

    if (isSupabaseAdminConfigured()) {
      const supabase = getSupabaseAdmin();
      if (supabase) {
        const { data: cfg } = await supabase
          .from('system_configs')
          .select('coin_usd_peg, female_payout_ratio_usd, team_leader_share_percent')
          .eq('id', 'default')
          .maybeSingle();
        if (cfg) {
          femalePayoutRatioUSD =
            Number((cfg as any).coin_usd_peg) ||
            Number(cfg.female_payout_ratio_usd) ||
            femalePayoutRatioUSD;
          teamLeaderSharePercent = Number(cfg.team_leader_share_percent) || teamLeaderSharePercent;
        }

        let logs: any[] = [];

        if (allMode) {
          const { data, error: logsErr } = await supabase
            .from('call_logs')
            .select(
              'id, receiver_id, host_id, team_leader_id, team_leader_earned_coins, coins_earned, coins_spent, duration_seconds'
            )
            .limit(20000);
          if (!logsErr && Array.isArray(data)) logs = data;
        } else if (scopeLeaderId) {
          const managedIdList = [...managedIds];
          const { data: byTl, error: tlErr } = await supabase
            .from('call_logs')
            .select(
              'id, receiver_id, host_id, team_leader_id, team_leader_earned_coins, coins_earned, coins_spent, duration_seconds'
            )
            .eq('team_leader_id', scopeLeaderId)
            .limit(20000);
          if (!tlErr && Array.isArray(byTl)) logs.push(...byTl);

          if (managedIdList.length > 0) {
            const { data: byReceiver, error: rxErr } = await supabase
              .from('call_logs')
              .select(
                'id, receiver_id, host_id, team_leader_id, team_leader_earned_coins, coins_earned, coins_spent, duration_seconds'
              )
              .in('receiver_id', managedIdList)
              .limit(20000);
            if (!rxErr && Array.isArray(byReceiver)) logs.push(...byReceiver);
          }
        }

        if (logs.length > 0) {
          statsSource = 'call_logs';
          const seen = new Set<string>();
          for (const row of logs) {
            const id = String(row.id || '');
            if (id && seen.has(id)) continue;
            if (id) seen.add(id);

            const hostId = String(row.receiver_id || row.host_id || '');
            const logTlId = row.team_leader_id ? String(row.team_leader_id) : '';
            const belongs =
              allMode ||
              (scopeLeaderId && logTlId === scopeLeaderId) ||
              (hostId && managedIds.has(hostId));
            if (!belongs) continue;

            totalCalls += 1;
            totalMinutes += Math.round((Number(row.duration_seconds) || 0) / 60);
            hostEarningsCoins += Math.max(0, Number(row.coins_earned) || 0);
            totalCoinsSpent += Math.max(0, Number(row.coins_spent) || 0);
            if (allMode || (scopeLeaderId && logTlId === scopeLeaderId)) {
              teamLeaderEarnedCoins += Math.max(0, Number(row.team_leader_earned_coins) || 0);
            }
          }
        }

        if (scopeLeaderId && !allMode) {
          const { data: ledgerRows } = await supabase
            .from('wallet_ledger')
            .select('amount')
            .eq('user_id', scopeLeaderId)
            .eq('transaction_type', 'TL_EARN')
            .limit(20000);
          if (Array.isArray(ledgerRows) && ledgerRows.length > 0) {
            const ledgerSum = ledgerRows.reduce(
              (acc, r) => acc + Math.max(0, Number(r.amount) || 0),
              0
            );
            if (ledgerSum > teamLeaderEarnedCoins) {
              teamLeaderEarnedCoins = ledgerSum;
              if (statsSource === 'empty') statsSource = 'wallet_ledger';
            }
          }
        }
      }
    }

    if (teamLeaderEarnedCoins <= 0 && scopeLeaderId && !allMode) {
      const tlProfile =
        ctx.serverUsers.get(scopeLeaderId) || allUsers.find((u) => u.id === scopeLeaderId);
      const profileTl = Math.max(0, Number(tlProfile?.earningsCoins) || 0);
      if (profileTl > 0) {
        teamLeaderEarnedCoins = profileTl;
        statsSource = statsSource === 'empty' ? 'profile_fallback' : statsSource;
      }
    }

    if (hostEarningsCoins <= 0) {
      hostEarningsCoins = managedCreators.reduce(
        (acc, c) => acc + Math.max(0, Number(c.earningsCoins) || 0),
        0
      );
    }
    if (totalCalls <= 0) {
      totalCalls = managedCreators.reduce(
        (acc, c) => acc + Math.max(0, Number(c.totalCallsHosted) || 0),
        0
      );
    }
    if (totalMinutes <= 0) {
      totalMinutes = managedCreators.reduce(
        (acc, c) => acc + Math.max(0, Number(c.totalCallMinutes) || 0),
        0
      );
    }

    const hostEarningsUSD = hostEarningsCoins * femalePayoutRatioUSD;
    const teamLeaderEarnedUSD = teamLeaderEarnedCoins * femalePayoutRatioUSD;

    return ok({
      success: true,
      data: {
        leaderId: scopeLeaderId || String(leader.id || ''),
        agencyName: leader.agencyName || null,
        allMode,
        managedCreatorCount: managedCreators.length,
        totalCalls,
        totalMinutes,
        hostEarningsCoins,
        hostEarningsUSD,
        teamLeaderEarnedCoins,
        teamLeaderEarnedUSD,
        totalCoinsSpent,
        teamLeaderSharePercent,
        femalePayoutRatioUSD,
        statsSource,
      },
      runtime: 'next-native',
    });
  } catch (e: any) {
    return err(500, { success: false, error: e.message });
  }
}

/** POST /api/teamleader/creators */
export async function handleTeamleaderCreateCreator(
  ctx: ServerRuntime,
  auth: AuthOk,
  body: Record<string, unknown>
): Promise<HandlerResult> {
  try {
    const leaderId = auth.profileId;
    const leader = leaderProfile(auth);
    const payload = body;
    if (!payload || !String(payload.name || '').trim()) {
      return err(400, { success: false, error: 'Creator name is required' });
    }

    const creatorEmail = String(payload.email || '')
      .trim()
      .toLowerCase();
    if (!creatorEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(creatorEmail)) {
      return err(400, { success: false, error: 'A valid email address is required' });
    }
    if (DISPOSABLE_CREATOR_EMAIL_SUFFIXES.some((suffix) => creatorEmail.endsWith(suffix))) {
      return err(400, {
        success: false,
        error: 'Disposable or placeholder emails are not allowed. Use a real email address.',
      });
    }

    const creatorPassword = String(payload.password || '');
    const creatorPasswordError = getPasswordPolicyError(creatorPassword);
    if (creatorPasswordError) {
      return err(400, { success: false, error: creatorPasswordError });
    }

    const emailTaken = ctx.getFormattedUsers().some(
      (u) => u.email && u.email.trim().toLowerCase() === creatorEmail && u.id !== payload.id
    );
    if (emailTaken) {
      return err(409, { success: false, error: 'An account with this email already exists' });
    }

    const validId = (payload.id as string) || ensureValidUuid('');
    const passwordHash = await hashPassword(creatorPassword);

    const normalizedCreator = ctx.normalizeUserProfile({
      ...stripPrivilegedProfileFields(payload as Record<string, any>),
      id: validId,
      name: String(payload.name).trim(),
      email: creatorEmail,
      gender: 'female',
      genderLocked: true,
      role: 'female_creator',
      isOnboarded: true,
      agreedToTerms: true,
      agreedToHostTerms: true,
      hasPasswordSet: true,
      teamLeaderId: leaderId,
      createdById: leaderId,
      agencyName: leader.agencyName || null,
      coinEarnOverrideRate: null,
    });
    normalizedCreator.role = 'female_creator';
    normalizedCreator.gender = 'female';
    normalizedCreator.teamLeaderId = leaderId;
    normalizedCreator.createdById = leaderId;
    normalizedCreator.email = creatorEmail;

    (normalizedCreator as any).password_hash = passwordHash;
    ctx.serverUsers.set(normalizedCreator.id, normalizedCreator);

    if (isSupabaseAdminConfigured()) {
      const firstUpsert = await upsertProfileAdmin({
        ...normalizedCreator,
        role: 'female_creator',
        password_hash: passwordHash,
        has_password_set: true,
      });
      if (!firstUpsert.success) {
        ctx.serverUsers.delete(normalizedCreator.id);
        return err(500, {
          success: false,
          error: firstUpsert.error || 'Failed to persist creator profile',
        });
      }

      const pwRes = await updateUserPasswordAdmin(
        normalizedCreator.id,
        creatorPassword,
        creatorEmail,
        {
          role: 'female_creator',
          gender: 'female',
          name: normalizedCreator.name,
        }
      );
      if (!pwRes.success || !pwRes.authUserId) {
        ctx.serverUsers.delete(normalizedCreator.id);
        return err(500, {
          success: false,
          error: pwRes.error || 'Failed to create Auth account for creator',
        });
      }

      const priorClientId = normalizedCreator.id;
      normalizedCreator.authId = pwRes.authUserId;
      const ownedUpsert = await upsertProfileAdmin({
        id: pwRes.authUserId,
        authId: pwRes.authUserId,
        name: normalizedCreator.name,
        email: creatorEmail,
        gender: 'female',
        genderLocked: true,
        role: 'female_creator',
        teamLeaderId: leaderId,
        createdById: leaderId,
        agencyName: leader.agencyName || null,
        avatarUrl: normalizedCreator.avatarUrl,
        gallery: normalizedCreator.gallery,
        spokenLanguages: normalizedCreator.spokenLanguages,
        tags: normalizedCreator.tags,
        bio: normalizedCreator.bio,
        age: normalizedCreator.age,
        nationality: normalizedCreator.nationality,
        countryCode: normalizedCreator.countryCode,
        isOnboarded: true,
        isVerified: true,
        hasPasswordSet: true,
        password_hash: passwordHash,
      });
      if (!ownedUpsert.success) {
        ctx.serverUsers.delete(priorClientId);
        return err(500, {
          success: false,
          error: ownedUpsert.error || 'Failed to link creator to Auth account',
        });
      }
      if (pwRes.authUserId !== priorClientId) {
        ctx.serverUsers.delete(priorClientId);
        normalizedCreator.id = pwRes.authUserId;
      }
      ctx.serverUsers.set(normalizedCreator.id, normalizedCreator);

      // Formal membership audit row (active, end_date null)
      try {
        const admin = getSupabaseAdmin();
        if (admin) {
          await ensureActiveAgencyMembership(
            admin,
            normalizedCreator.id,
            leaderId,
            leaderId
          );
        }
      } catch (memErr: any) {
        console.warn('[teamleader/create-creator] agency_memberships:', memErr?.message);
      }
    }

    ctx.broadcastAll({
      type: 'users:updated',
      user: normalizedCreator,
      users: ctx.getFormattedUsers(),
    });
    ctx.broadcastPresence();

    return ok({
      success: true,
      creator: normalizedCreator,
      message: `Successfully created and persisted creator ${normalizedCreator.name}`,
      runtime: 'next-native',
    });
  } catch (e: any) {
    return err(500, { success: false, error: e.message });
  }
}

/** POST /api/teamleader/override-rate — disabled legacy */
export function handleTeamleaderOverrideRateDisabled(): HandlerResult {
  return err(403, {
    success: false,
    error:
      'Team Leaders cannot override earning rates. Only administrators may set individual overrides.',
  });
}

/** POST /api/teamleader/ban-creator */
export async function handleTeamleaderBanCreator(
  ctx: ServerRuntime,
  auth: AuthOk,
  body: Record<string, unknown>
): Promise<HandlerResult> {
  try {
    const leaderId = auth.profileId;
    const leader = leaderProfile(auth);
    const creatorId = String(body.creatorId || '');
    const days = body.days;
    const reason = body.reason;
    if (!creatorId) {
      return err(400, { success: false, error: 'Creator ID is required' });
    }
    const target = ctx.serverUsers.get(creatorId);
    if (target && !callerOwnsCreator(leader as any, target)) {
      return err(403, { success: false, error: 'Not authorized for this creator.' });
    }

    const banDays = Number(days) || 7;
    const banReason = (reason as string) || 'Suspended by Team Leader for policy review';
    const bannedUntil = new Date(Date.now() + banDays * 24 * 60 * 60 * 1000).toISOString();

    let updatedUser: any = ctx.serverUsers.get(creatorId);
    if (updatedUser) {
      updatedUser.isBanned = true;
      updatedUser.is_banned = true;
      updatedUser.banReason = banReason;
      updatedUser.ban_reason = banReason;
      updatedUser.bannedUntil = bannedUntil;
      updatedUser.banned_until = bannedUntil;
      updatedUser.bannedById = leaderId || null;
      updatedUser.banned_by_id = leaderId || null;
      updatedUser.bannedByRole = 'team_leader';
      updatedUser.banned_by_role = 'team_leader';
      updatedUser.onlineStatus = 'offline';
      ctx.serverUsers.set(creatorId, updatedUser);
      ctx.presenceMap.set(creatorId, 'offline');
    }

    if (isSupabaseAdminConfigured()) {
      await upsertProfileAdmin({
        id: creatorId,
        is_banned: true,
        ban_reason: banReason,
        banned_until: bannedUntil,
        banned_by_id: leaderId || null,
        banned_by_role: 'team_leader',
        online_status: 'offline',
      });
    }

    ctx.broadcastAll({
      type: 'users:updated',
      user: updatedUser,
      users: ctx.getFormattedUsers(),
    });
    ctx.broadcastPresence();

    return ok({
      success: true,
      message: `Female host suspended successfully for ${banDays} days until ${new Date(bannedUntil).toLocaleString()}.`,
      bannedUntil,
      banReason,
      user: updatedUser,
      runtime: 'next-native',
    });
  } catch (e: any) {
    return err(500, { success: false, error: e.message });
  }
}

/** POST /api/teamleader/unban-creator */
export async function handleTeamleaderUnbanCreator(
  ctx: ServerRuntime,
  auth: AuthOk,
  body: Record<string, unknown>
): Promise<HandlerResult> {
  try {
    const creatorId = String(body.creatorId || '');
    if (!creatorId) {
      return err(400, { success: false, error: 'Creator ID is required' });
    }

    let updatedUser: any = ctx.serverUsers.get(creatorId);
    const leader = leaderProfile(auth);
    if (updatedUser && !callerOwnsCreator(leader as any, updatedUser)) {
      return err(403, { success: false, error: 'Not authorized for this creator.' });
    }
    if (updatedUser) {
      updatedUser.isBanned = false;
      updatedUser.is_banned = false;
      updatedUser.banReason = null;
      updatedUser.ban_reason = null;
      updatedUser.bannedUntil = null;
      updatedUser.banned_until = null;
      updatedUser.bannedById = null;
      updatedUser.banned_by_id = null;
      updatedUser.bannedByRole = null;
      updatedUser.banned_by_role = null;
      ctx.serverUsers.set(creatorId, updatedUser);
    }

    if (isSupabaseAdminConfigured()) {
      await upsertProfileAdmin({
        id: creatorId,
        is_banned: false,
        ban_reason: null,
        banned_until: null,
        banned_by_id: null,
        banned_by_role: null,
      });
    }

    ctx.broadcastAll({
      type: 'users:updated',
      user: updatedUser,
      users: ctx.getFormattedUsers(),
    });

    return ok({
      success: true,
      message: 'Female host suspension lifted successfully. Account is now active.',
      user: updatedUser,
      runtime: 'next-native',
    });
  } catch (e: any) {
    return err(500, { success: false, error: e.message });
  }
}

/** POST /api/teamleader/delete-creator */
export async function handleTeamleaderDeleteCreator(
  ctx: ServerRuntime,
  auth: AuthOk,
  body: Record<string, unknown>
): Promise<HandlerResult> {
  try {
    const creatorId = String(body.creatorId || '');
    if (!creatorId) {
      return err(400, { success: false, error: 'Creator ID is required' });
    }

    const existing = ctx.serverUsers.get(creatorId);
    const leader = leaderProfile(auth);
    if (existing && !callerOwnsCreator(leader as any, existing)) {
      return err(403, { success: false, error: 'Not authorized for this creator.' });
    }
    const creatorName = existing?.name || 'Female Host';

    if (!isSupabaseAdminConfigured()) {
      return err(503, {
        success: false,
        error: 'Supabase admin is not configured; cannot safely close creator account.',
        data: {
          userId: String(creatorId),
          authDeleted: false,
          profileDeleted: false,
          warnings: [],
        },
      });
    }

    // Creators/hosts always soft-close when financial history exists (forced soft-close for agency safety).
    const hard = await hardDeleteUserCompletely(String(creatorId), {
      actorRole: 'team_leader',
      actorUserId: auth.profileId || null,
      reason: 'Host removed by team leader',
      forceSoftClose: true,
    });

    const deleteResult = {
      userId: hard.userId,
      mode: hard.mode || 'soft_close',
      accountStatus: hard.accountStatus || null,
      authDeleted: hard.authDeleted,
      authDisabled: hard.authDisabled ?? hard.authDeleted,
      profileDeleted: hard.profileDeleted,
      r2DeletedCount: hard.r2DeletedCount,
      hasFinancialHistory: hard.hasFinancialHistory ?? true,
      unpaid: hard.unpaid || null,
      warnings: hard.warnings,
      message: hard.message || null,
    };

    const okClose =
      hard.success &&
      (hard.mode === 'soft_close'
        ? Boolean(hard.authDisabled || hard.authDeleted)
        : Boolean(hard.profileDeleted && (hard.authDeleted || hard.authDisabled)));

    if (!okClose) {
      return err(500, {
        success: false,
        error: hard.error || 'Failed to close creator account',
        data: deleteResult,
      });
    }

    ctx.purgeUserRuntimeState(String(creatorId));

    ctx.broadcastAll({
      type: 'users:deleted',
      userId: creatorId,
      mode: hard.mode,
      accountStatus: hard.accountStatus,
      users: ctx.getFormattedUsers(),
    });
    ctx.broadcastPresence();
    ctx.broadcastUsers();

    const soft = hard.mode === 'soft_close';
    return ok({
      success: true,
      message:
        hard.message ||
        (soft
          ? `Host ${creatorName} was soft-closed. Login disabled; earnings/settlements preserved for final payout.`
          : `Host ${creatorName} was permanently deleted from your agency and the platform.`),
      data: deleteResult,
      runtime: 'next-native',
    });
  } catch (e: any) {
    return err(500, { success: false, error: e.message });
  }
}

/** Dispatch /api/teamleader/* */
export async function dispatchTeamleaderNative(
  req: NextRequest,
  segments: string[],
  auth: AuthOk
): Promise<HandlerResult> {
  const ctx = await import('../serverRuntime').then((m) => m.getServerRuntime());
  const runtime = await ctx;
  const path = segments.join('/');

  if (path === 'creators' && req.method === 'GET') {
    return handleTeamleaderCreators(runtime, req, auth);
  }
  if (path === 'stats' && req.method === 'GET') {
    return handleTeamleaderStats(runtime, req, auth);
  }
  if (path === 'creators' && req.method === 'POST') {
    const { parseJsonBody } = await import('../nextRequest');
    const parsed = await parseJsonBody<Record<string, unknown>>(req);
    if (!parsed.ok) {
      return err(parsed.status, {
        success: false,
        error: { message: parsed.error.message, code: parsed.error.code },
      });
    }
    return handleTeamleaderCreateCreator(runtime, auth, parsed.data || {});
  }
  if (path === 'override-rate' && req.method === 'POST') {
    return handleTeamleaderOverrideRateDisabled();
  }
  if (path === 'ban-creator' && req.method === 'POST') {
    const { parseJsonBody } = await import('../nextRequest');
    const parsed = await parseJsonBody<Record<string, unknown>>(req);
    if (!parsed.ok) {
      return err(parsed.status, {
        success: false,
        error: { message: parsed.error.message, code: parsed.error.code },
      });
    }
    return handleTeamleaderBanCreator(runtime, auth, parsed.data || {});
  }
  if (path === 'unban-creator' && req.method === 'POST') {
    const { parseJsonBody } = await import('../nextRequest');
    const parsed = await parseJsonBody<Record<string, unknown>>(req);
    if (!parsed.ok) {
      return err(parsed.status, {
        success: false,
        error: { message: parsed.error.message, code: parsed.error.code },
      });
    }
    return handleTeamleaderUnbanCreator(runtime, auth, parsed.data || {});
  }
  if (path === 'delete-creator' && req.method === 'POST') {
    const { parseJsonBody } = await import('../nextRequest');
    const parsed = await parseJsonBody<Record<string, unknown>>(req);
    if (!parsed.ok) {
      return err(parsed.status, {
        success: false,
        error: { message: parsed.error.message, code: parsed.error.code },
      });
    }
    return handleTeamleaderDeleteCreator(runtime, auth, parsed.data || {});
  }

  return err(404, {
    success: false,
    error: { message: 'Team leader route not found', code: 'NOT_FOUND' },
  });
}
