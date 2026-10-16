/**
 * Agency invite tokens — TL host signup links.
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
  expires_at: string | null;
  is_active: boolean;
  created_at?: string;
  updated_at?: string;
};

export type InviteValidationError = 'INVITE_INVALID' | 'INVITE_EXPIRED' | 'INVITE_EXHAUSTED';

export type ValidatedInvite = {
  row: AgencyInviteTokenRow;
  teamLeaderId: string;
  agencyName: string | null;
};

export type InviteOpts = {
  regenerate?: boolean;
  maxUses?: number | null;
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

function isExhausted(row: Pick<AgencyInviteTokenRow, 'max_uses' | 'used_count'>): boolean {
  if (row.max_uses == null) return false;
  return Number(row.used_count || 0) >= Number(row.max_uses);
}

function mapRow(raw: any): AgencyInviteTokenRow {
  return {
    id: String(raw.id),
    token: String(raw.token),
    team_leader_id: String(raw.team_leader_id),
    max_uses: raw.max_uses == null ? null : Number(raw.max_uses),
    used_count: Number(raw.used_count || 0),
    expires_at: raw.expires_at ? String(raw.expires_at) : null,
    is_active: Boolean(raw.is_active),
    created_at: raw.created_at ? String(raw.created_at) : undefined,
    updated_at: raw.updated_at ? String(raw.updated_at) : undefined,
  };
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
  return {
    token: row.token,
    inviteUrl: buildInviteUrl(row.token, baseUrl),
    expiresAt: row.expires_at,
    maxUses: row.max_uses,
    usedCount: row.used_count,
    isActive: row.is_active,
  };
}

async function deactivateLeaderInvites(
  client: SupabaseClient,
  teamLeaderId: string
): Promise<{ success: boolean; error?: string }> {
  const nowIso = new Date().toISOString();
  const { error } = await client
    .from('agency_invite_tokens')
    .update({ is_active: false, updated_at: nowIso })
    .eq('team_leader_id', teamLeaderId)
    .eq('is_active', true);
  if (error) return { success: false, error: error.message };
  return { success: true };
}

async function insertInvite(
  client: SupabaseClient,
  teamLeaderId: string,
  opts?: InviteOpts
): Promise<{ success: true; row: AgencyInviteTokenRow } | { success: false; error: string }> {
  const expiresInDays =
    typeof opts?.expiresInDays === 'number' && Number.isFinite(opts.expiresInDays)
      ? Math.max(1, Math.min(365, Math.round(opts.expiresInDays)))
      : DEFAULT_INVITE_EXPIRY_DAYS;
  const maxUses =
    opts?.maxUses === null
      ? null
      : typeof opts?.maxUses === 'number' && Number.isFinite(opts.maxUses) && opts.maxUses > 0
        ? Math.round(opts.maxUses)
        : null;
  const expiresAt = new Date(Date.now() + expiresInDays * 24 * 60 * 60 * 1000).toISOString();
  const nowIso = new Date().toISOString();
  const token = generateInviteToken();

  const { data, error } = await client
    .from('agency_invite_tokens')
    .insert({
      token,
      team_leader_id: teamLeaderId,
      max_uses: maxUses,
      used_count: 0,
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

/** Return current active non-expired invite for a TL, or null. */
export async function getActiveInviteForLeader(
  client: SupabaseClient,
  teamLeaderId: string
): Promise<AgencyInviteTokenRow | null> {
  const leaderId = String(teamLeaderId || '').trim();
  if (!leaderId) return null;

  const { data, error } = await client
    .from('agency_invite_tokens')
    .select('*')
    .eq('team_leader_id', leaderId)
    .eq('is_active', true)
    .order('created_at', { ascending: false })
    .limit(5);

  if (error) {
    console.warn('[agencyInviteTokens] getActiveInviteForLeader:', error.message);
    return null;
  }

  for (const raw of data || []) {
    const row = mapRow(raw);
    if (!isExpired(row.expires_at) && !isExhausted(row)) return row;
  }
  return null;
}

/**
 * Get or create the TL's active invite link.
 * regenerate=true deactivates prior tokens and issues a new one.
 */
export async function getOrCreateActiveInvite(
  client: SupabaseClient,
  teamLeaderId: string,
  opts?: InviteOpts
): Promise<{ success: true; row: AgencyInviteTokenRow } | { success: false; error: string }> {
  const leaderId = String(teamLeaderId || '').trim();
  if (!leaderId) return { success: false, error: 'teamLeaderId required' };

  if (!opts?.regenerate) {
    const existing = await getActiveInviteForLeader(client, leaderId);
    if (existing) return { success: true, row: existing };
  } else {
    const deactivated = await deactivateLeaderInvites(client, leaderId);
    if (!deactivated.success) {
      return { success: false, error: deactivated.error || 'Failed to deactivate prior invites' };
    }
  }

  return insertInvite(client, leaderId, opts);
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
  if (!row.is_active) {
    return { ok: false, code: 'INVITE_INVALID', message: 'This invite link is no longer active.' };
  }
  if (isExpired(row.expires_at)) {
    return { ok: false, code: 'INVITE_EXPIRED', message: 'This invite link has expired.' };
  }
  if (isExhausted(row)) {
    return {
      ok: false,
      code: 'INVITE_EXHAUSTED',
      message: 'This invite link has reached its maximum number of uses.',
    };
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

/** Atomic used_count++ with the same validity predicates. */
export async function consumeInviteToken(
  client: SupabaseClient,
  tokenId: string
): Promise<{ success: boolean; error?: string; code?: InviteValidationError }> {
  const id = String(tokenId || '').trim();
  if (!id) return { success: false, error: 'tokenId required', code: 'INVITE_INVALID' };

  const nowIso = new Date().toISOString();
  const { data: current, error: readErr } = await client
    .from('agency_invite_tokens')
    .select('*')
    .eq('id', id)
    .maybeSingle();

  if (readErr || !current) {
    return { success: false, error: 'Invite token not found', code: 'INVITE_INVALID' };
  }
  const row = mapRow(current);
  if (!row.is_active) {
    return { success: false, error: 'Invite inactive', code: 'INVITE_INVALID' };
  }
  if (isExpired(row.expires_at)) {
    return { success: false, error: 'Invite expired', code: 'INVITE_EXPIRED' };
  }
  if (isExhausted(row)) {
    return { success: false, error: 'Invite exhausted', code: 'INVITE_EXHAUSTED' };
  }

  const nextCount = row.used_count + 1;
  let query = client
    .from('agency_invite_tokens')
    .update({ used_count: nextCount, updated_at: nowIso })
    .eq('id', id)
    .eq('is_active', true)
    .eq('used_count', row.used_count);

  if (row.max_uses != null) {
    query = query.lt('used_count', row.max_uses);
  }

  const { data: updated, error: updErr } = await query.select('id').maybeSingle();
  if (updErr) {
    return { success: false, error: updErr.message, code: 'INVITE_INVALID' };
  }
  if (!updated?.id) {
    return {
      success: false,
      error: 'Invite could not be consumed (race or exhausted).',
      code: 'INVITE_EXHAUSTED',
    };
  }
  return { success: true };
}

/**
 * Force host role + agency mapping + membership, then consume invite.
 * Shared by verify-otp and register-bootstrap.
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

  // Targeted update only — never full upsert (would wipe existing profile fields).
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
    const { error: forceErr } = await client
      .from('profiles')
      .update(patch)
      .eq('id', hostId);
    if (forceErr) {
      return {
        ok: false,
        code: 'INVITE_APPLY_FAILED',
        message: forceErr.message || 'Failed to set agency fields on profile.',
      };
    }
  } else {
    // Auth user exists but profile row not yet written — insert minimal host row.
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

  const consumed = await consumeInviteToken(client, row.id);
  if (!consumed.success) {
    return {
      ok: false,
      code: consumed.code || 'INVITE_EXHAUSTED',
      message: consumed.error || 'Invite could not be consumed.',
    };
  }

  return {
    ok: true,
    teamLeaderId,
    agencyName,
    role: INVITE_HOST_ROLE,
  };
}
