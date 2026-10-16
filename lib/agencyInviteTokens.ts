/**
 * Agency invite tokens — single-use TL host signup links.
 */
import { randomBytes } from 'crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import { ensureActiveAgencyMembership } from './agencyMemberships';

export const DEFAULT_INVITE_EXPIRY_DAYS = 90;
export const INVITE_HOST_ROLE = 'female_creator' as const;

export type AgencyInviteTokenRow = {
  id: string;
  token: string;
  team_leader_id: string;
  max_uses: number | null;
  used_count: number;
  is_used: boolean;
  used_by_user_id: string | null;
  expires_at: string | null;
  is_active: boolean;
  created_at?: string;
  updated_at?: string;
};

export type InviteListItem = AgencyInviteTokenRow & {
  inviteUrl: string;
  status: 'active' | 'used' | 'expired' | 'inactive';
  signupStatus: 'pending' | 'registered';
  usedByName: string | null;
  usedByEmail: string | null;
};

export type InviteValidationError = 'INVITE_INVALID' | 'INVITE_EXPIRED' | 'INVITE_EXHAUSTED';

export type ValidatedInvite = {
  row: AgencyInviteTokenRow;
  teamLeaderId: string;
  agencyName: string | null;
};

export type InviteOpts = {
  expiresInDays?: number;
};

const TL_ROLES = new Set(['team_leader', 'agency_manager', 'admin']);

export function generateInviteToken(): string {
  return randomBytes(32).toString('base64url');
}

function isExpired(expiresAt: string | null | undefined): boolean {
  if (!expiresAt) return false;
  const t = Date.parse(expiresAt);
  if (!Number.isFinite(t)) return false;
  return t <= Date.now();
}

function mapRow(raw: any): AgencyInviteTokenRow {
  const usedCount = Number(raw.used_count || 0);
  const maxUses = raw.max_uses == null ? 1 : Number(raw.max_uses);
  const isUsed =
    raw.is_used === true ||
    usedCount >= (Number.isFinite(maxUses) && maxUses > 0 ? maxUses : 1);
  return {
    id: String(raw.id),
    token: String(raw.token),
    team_leader_id: String(raw.team_leader_id),
    max_uses: raw.max_uses == null ? 1 : Number(raw.max_uses),
    used_count: usedCount,
    is_used: isUsed,
    used_by_user_id: raw.used_by_user_id ? String(raw.used_by_user_id) : null,
    expires_at: raw.expires_at ? String(raw.expires_at) : null,
    is_active: Boolean(raw.is_active),
    created_at: raw.created_at ? String(raw.created_at) : undefined,
    updated_at: raw.updated_at ? String(raw.updated_at) : undefined,
  };
}

export function deriveInviteStatus(
  row: Pick<AgencyInviteTokenRow, 'is_used' | 'is_active' | 'expires_at'>
): InviteListItem['status'] {
  if (row.is_used) return 'used';
  if (isExpired(row.expires_at)) return 'expired';
  if (!row.is_active) return 'inactive';
  return 'active';
}

export function buildInviteUrl(token: string, baseUrl?: string | null): string {
  const raw =
    (baseUrl && String(baseUrl).trim()) ||
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.APP_URL ||
    '';
  const origin = String(raw).replace(/\/$/, '') || '';
  const path = `/?token=${encodeURIComponent(token)}`;
  return origin ? `${origin}${path}` : path;
}

export function invitePublicPayload(row: AgencyInviteTokenRow, baseUrl?: string | null) {
  const status = deriveInviteStatus(row);
  return {
    id: row.id,
    token: row.token,
    inviteUrl: buildInviteUrl(row.token, baseUrl),
    expiresAt: row.expires_at,
    maxUses: row.max_uses ?? 1,
    usedCount: row.used_count,
    isUsed: row.is_used,
    usedByUserId: row.used_by_user_id,
    isActive: row.is_active,
    status,
    createdAt: row.created_at || null,
  };
}

/** Create a fresh single-use invite token for the Team Leader. */
export async function createSingleUseInvite(
  client: SupabaseClient,
  teamLeaderId: string,
  opts?: InviteOpts
): Promise<{ success: true; row: AgencyInviteTokenRow } | { success: false; error: string }> {
  const leaderId = String(teamLeaderId || '').trim();
  if (!leaderId) return { success: false, error: 'teamLeaderId required' };

  const expiresInDays =
    typeof opts?.expiresInDays === 'number' && Number.isFinite(opts.expiresInDays)
      ? Math.max(1, Math.min(365, Math.round(opts.expiresInDays)))
      : DEFAULT_INVITE_EXPIRY_DAYS;
  const expiresAt = new Date(Date.now() + expiresInDays * 24 * 60 * 60 * 1000).toISOString();
  const nowIso = new Date().toISOString();
  const token = generateInviteToken();

  const { data, error } = await client
    .from('agency_invite_tokens')
    .insert({
      token,
      team_leader_id: leaderId,
      max_uses: 1,
      used_count: 0,
      is_used: false,
      used_by_user_id: null,
      expires_at: expiresAt,
      is_active: true,
      updated_at: nowIso,
    })
    .select('*')
    .single();

  if (error || !data) {
    return { success: false, error: error?.message || 'Failed to create invite token' };
  }
  return { success: true, row: mapRow(data) };
}

/** @deprecated Prefer createSingleUseInvite — kept for older callers. */
export async function getOrCreateActiveInvite(
  client: SupabaseClient,
  teamLeaderId: string,
  opts?: InviteOpts & { regenerate?: boolean; maxUses?: number | null }
): Promise<{ success: true; row: AgencyInviteTokenRow } | { success: false; error: string }> {
  return createSingleUseInvite(client, teamLeaderId, {
    expiresInDays: opts?.expiresInDays,
  });
}

/** @deprecated Prefer listInvitesForLeader. */
export async function getActiveInviteForLeader(
  client: SupabaseClient,
  teamLeaderId: string
): Promise<AgencyInviteTokenRow | null> {
  const listed = await listInvitesForLeader(client, teamLeaderId);
  return listed.find((r) => deriveInviteStatus(r) === 'active') || null;
}

/** List all invite tokens for a Team Leader (newest first). */
export async function listInvitesForLeader(
  client: SupabaseClient,
  teamLeaderId: string
): Promise<AgencyInviteTokenRow[]> {
  const leaderId = String(teamLeaderId || '').trim();
  if (!leaderId) return [];

  const { data, error } = await client
    .from('agency_invite_tokens')
    .select('*')
    .eq('team_leader_id', leaderId)
    .order('created_at', { ascending: false })
    .limit(200);

  if (error) {
    console.warn('[agencyInviteTokens] listInvitesForLeader:', error.message);
    return [];
  }
  return (data || []).map(mapRow);
}

/** List invites with signup user details for the dashboard table. */
export async function listInviteManagementRows(
  client: SupabaseClient,
  teamLeaderId: string,
  baseUrl?: string | null
): Promise<InviteListItem[]> {
  const rows = await listInvitesForLeader(client, teamLeaderId);
  const usedIds = Array.from(
    new Set(rows.map((r) => r.used_by_user_id).filter((id): id is string => Boolean(id)))
  );

  const profileById = new Map<string, { name: string | null; email: string | null }>();
  if (usedIds.length) {
    const { data: profiles } = await client
      .from('profiles')
      .select('id, name, email')
      .in('id', usedIds);
    for (const p of profiles || []) {
      profileById.set(String(p.id), {
        name: p.name ? String(p.name) : null,
        email: p.email ? String(p.email) : null,
      });
    }
  }

  return rows.map((row) => {
    const status = deriveInviteStatus(row);
    const used = profileById.get(row.used_by_user_id || '') || null;
    return {
      ...row,
      inviteUrl: buildInviteUrl(row.token, baseUrl),
      status,
      signupStatus: row.is_used || row.used_by_user_id ? 'registered' : 'pending',
      usedByName: used?.name || null,
      usedByEmail: used?.email || null,
    };
  });
}

export async function validateInviteToken(
  client: SupabaseClient,
  token: string
): Promise<
  | { ok: true; data: ValidatedInvite }
  | { ok: false; code: InviteValidationError; message: string }
> {
  const clean = String(token || '').trim();
  if (!clean || clean.length < 16) {
    return { ok: false, code: 'INVITE_INVALID', message: 'Invalid invite link.' };
  }

  const { data, error } = await client
    .from('agency_invite_tokens')
    .select('*')
    .eq('token', clean)
    .maybeSingle();

  if (error || !data) {
    return { ok: false, code: 'INVITE_INVALID', message: 'Invalid or unknown invite link.' };
  }

  const row = mapRow(data);
  if (row.is_used) {
    return {
      ok: false,
      code: 'INVITE_EXHAUSTED',
      message: 'This invite link has already been used.',
    };
  }
  if (!row.is_active) {
    return { ok: false, code: 'INVITE_INVALID', message: 'This invite link is no longer active.' };
  }
  if (isExpired(row.expires_at)) {
    return { ok: false, code: 'INVITE_EXPIRED', message: 'This invite link has expired.' };
  }

  const { data: leader, error: leaderErr } = await client
    .from('profiles')
    .select('id, role, agency_name')
    .eq('id', row.team_leader_id)
    .maybeSingle();

  if (leaderErr || !leader?.id) {
    return { ok: false, code: 'INVITE_INVALID', message: 'Invite agency owner was not found.' };
  }
  if (!TL_ROLES.has(String(leader.role || ''))) {
    return {
      ok: false,
      code: 'INVITE_INVALID',
      message: 'Invite agency owner is not an active team leader.',
    };
  }

  return {
    ok: true,
    data: {
      row,
      teamLeaderId: String(leader.id),
      agencyName: leader.agency_name ? String(leader.agency_name) : null,
    },
  };
}

/**
 * Atomically mark invite used by hostProfileId.
 * Fails if already used / inactive / expired.
 */
export async function consumeInviteToken(
  client: SupabaseClient,
  tokenId: string,
  usedByUserId: string
): Promise<{ success: boolean; error?: string; code?: InviteValidationError }> {
  const id = String(tokenId || '').trim();
  const hostId = String(usedByUserId || '').trim();
  if (!id) return { success: false, error: 'tokenId required', code: 'INVITE_INVALID' };
  if (!hostId) return { success: false, error: 'usedByUserId required', code: 'INVITE_INVALID' };

  const nowIso = new Date().toISOString();
  const { data: updated, error: updErr } = await client
    .from('agency_invite_tokens')
    .update({
      is_used: true,
      used_by_user_id: hostId,
      used_count: 1,
      is_active: false,
      updated_at: nowIso,
    })
    .eq('id', id)
    .eq('is_used', false)
    .eq('is_active', true)
    .select('id, expires_at')
    .maybeSingle();

  if (updErr) {
    return { success: false, error: updErr.message, code: 'INVITE_INVALID' };
  }
  if (!updated?.id) {
    const { data: current } = await client
      .from('agency_invite_tokens')
      .select('is_used, is_active, expires_at')
      .eq('id', id)
      .maybeSingle();
    if (current?.is_used) {
      return {
        success: false,
        error: 'This invite link has already been used.',
        code: 'INVITE_EXHAUSTED',
      };
    }
    if (current && isExpired(current.expires_at)) {
      return { success: false, error: 'This invite link has expired.', code: 'INVITE_EXPIRED' };
    }
    return {
      success: false,
      error: 'Invite could not be consumed (already used or invalid).',
      code: 'INVITE_EXHAUSTED',
    };
  }

  return { success: true };
}

/**
 * Force host role + agency mapping + membership, then atomically consume invite.
 */
export async function applyAgencyInviteOnSignup(
  client: SupabaseClient,
  params: {
    inviteToken: string;
    hostProfileId: string;
    displayName?: string;
    email?: string;
  }
): Promise<
  | {
      ok: true;
      teamLeaderId: string;
      agencyName: string | null;
      role: typeof INVITE_HOST_ROLE;
    }
  | { ok: false; code: InviteValidationError | 'INVITE_APPLY_FAILED'; message: string }
> {
  const hostId = String(params.hostProfileId || '').trim();
  if (!hostId) {
    return { ok: false, code: 'INVITE_APPLY_FAILED', message: 'Host profile id required.' };
  }

  const validated = await validateInviteToken(client, params.inviteToken);
  if (!validated.ok) {
    return { ok: false, code: validated.code, message: validated.message };
  }

  const { row, teamLeaderId, agencyName } = validated.data;

  // Consume first (atomic reserve) so concurrent signups cannot reuse the same token.
  const consumed = await consumeInviteToken(client, row.id, hostId);
  if (!consumed.success) {
    return {
      ok: false,
      code: consumed.code || 'INVITE_EXHAUSTED',
      message: consumed.error || 'Invite could not be consumed.',
    };
  }

  const nowIso = new Date().toISOString();
  const patch: Record<string, unknown> = {
    role: INVITE_HOST_ROLE,
    gender: 'female',
    gender_locked: true,
    team_leader_id: teamLeaderId,
    created_by_id: teamLeaderId,
    agency_name: agencyName,
    hourly_coin_rate: 10,
    updated_at: nowIso,
  };
  if (params.displayName?.trim()) patch.name = params.displayName.trim();
  if (params.email?.trim()) patch.email = params.email.trim().toLowerCase();

  const { data: existing } = await client
    .from('profiles')
    .select('id')
    .eq('id', hostId)
    .maybeSingle();

  if (existing?.id) {
    const { error: forceErr } = await client.from('profiles').update(patch).eq('id', hostId);
    if (forceErr) {
      return {
        ok: false,
        code: 'INVITE_APPLY_FAILED',
        message: forceErr.message || 'Failed to set agency fields on profile.',
      };
    }
  } else {
    const { error: insErr } = await client.from('profiles').insert({
      id: hostId,
      auth_id: hostId,
      name: params.displayName?.trim() || 'Host',
      email: params.email?.trim().toLowerCase() || null,
      gender: 'female',
      gender_locked: true,
      role: INVITE_HOST_ROLE,
      team_leader_id: teamLeaderId,
      created_by_id: teamLeaderId,
      agency_name: agencyName,
      hourly_coin_rate: 10,
      is_onboarded: false,
      online_status: 'online',
      coin_balance: 0,
      updated_at: nowIso,
    } as Record<string, unknown>);
    if (insErr) {
      return {
        ok: false,
        code: 'INVITE_APPLY_FAILED',
        message: insErr.message || 'Failed to create host profile for invite.',
      };
    }
  }

  const mem = await ensureActiveAgencyMembership(client, hostId, teamLeaderId, teamLeaderId);
  if (!mem.success) {
    return {
      ok: false,
      code: 'INVITE_APPLY_FAILED',
      message: mem.error || 'Failed to create agency membership.',
    };
  }

  return {
    ok: true,
    teamLeaderId,
    agencyName,
    role: INVITE_HOST_ROLE,
  };
}
