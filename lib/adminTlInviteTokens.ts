/**
 * Admin → Team Leader invite tokens — single-use TL signup links.
 */
import { randomBytes } from 'crypto';
import type { SupabaseClient } from '@supabase/supabase-js';

export const DEFAULT_TL_INVITE_EXPIRY_DAYS = 90;
export const INVITE_TL_ROLE = 'team_leader' as const;

export type AdminTlInviteRow = {
  id: string;
  token: string;
  created_by_admin_id: string;
  target_role: typeof INVITE_TL_ROLE;
  invite_type: typeof INVITE_TL_ROLE;
  is_used: boolean;
  used_by_user_id: string | null;
  expires_at: string | null;
  is_active: boolean;
  created_at?: string;
  updated_at?: string;
};

export type AdminTlInviteListItem = AdminTlInviteRow & {
  inviteUrl: string;
  status: 'active' | 'used' | 'expired' | 'inactive';
  signupStatus: 'pending' | 'registered';
  usedByName: string | null;
  usedByEmail: string | null;
  createdByName: string | null;
  createdByEmail: string | null;
};

export type AdminTlInviteValidationError = 'INVITE_INVALID' | 'INVITE_EXPIRED' | 'INVITE_EXHAUSTED';

export type ValidatedAdminTlInvite = {
  row: AdminTlInviteRow;
  targetRole: typeof INVITE_TL_ROLE;
};

export type AdminTlInviteOpts = {
  expiresInDays?: number;
};

export function generateAdminTlInviteToken(): string {
  return randomBytes(32).toString('base64url');
}

function isExpired(expiresAt: string | null | undefined): boolean {
  if (!expiresAt) return false;
  const t = Date.parse(expiresAt);
  if (!Number.isFinite(t)) return false;
  return t <= Date.now();
}

function mapRow(raw: any): AdminTlInviteRow {
  return {
    id: String(raw.id),
    token: String(raw.token),
    created_by_admin_id: String(raw.created_by_admin_id),
    target_role: INVITE_TL_ROLE,
    invite_type: INVITE_TL_ROLE,
    is_used: raw.is_used === true,
    used_by_user_id: raw.used_by_user_id ? String(raw.used_by_user_id) : null,
    expires_at: raw.expires_at ? String(raw.expires_at) : null,
    is_active: Boolean(raw.is_active),
    created_at: raw.created_at ? String(raw.created_at) : undefined,
    updated_at: raw.updated_at ? String(raw.updated_at) : undefined,
  };
}

export function deriveAdminTlInviteStatus(
  row: Pick<AdminTlInviteRow, 'is_used' | 'is_active' | 'expires_at'>
): AdminTlInviteListItem['status'] {
  if (row.is_used) return 'used';
  if (isExpired(row.expires_at)) return 'expired';
  if (!row.is_active) return 'inactive';
  return 'active';
}

/** TL invites use ?tl_invite= to distinguish from host ?token= links. */
export function buildAdminTlInviteUrl(token: string, baseUrl?: string | null): string {
  const raw =
    (baseUrl && String(baseUrl).trim()) ||
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.APP_URL ||
    '';
  const origin = String(raw).replace(/\/$/, '') || '';
  const path = `/?tl_invite=${encodeURIComponent(token)}`;
  return origin ? `${origin}${path}` : path;
}

export function adminTlInvitePublicPayload(row: AdminTlInviteRow, baseUrl?: string | null) {
  const status = deriveAdminTlInviteStatus(row);
  return {
    id: row.id,
    token: row.token,
    inviteUrl: buildAdminTlInviteUrl(row.token, baseUrl),
    targetRole: row.target_role,
    inviteType: row.invite_type,
    expiresAt: row.expires_at,
    isUsed: row.is_used,
    usedByUserId: row.used_by_user_id,
    isActive: row.is_active,
    status,
    createdAt: row.created_at || null,
    createdByAdminId: row.created_by_admin_id,
  };
}

export async function createAdminTlInvite(
  client: SupabaseClient,
  createdByAdminId: string,
  opts?: AdminTlInviteOpts
): Promise<{ success: true; row: AdminTlInviteRow } | { success: false; error: string }> {
  const adminId = String(createdByAdminId || '').trim();
  if (!adminId) return { success: false, error: 'createdByAdminId required' };

  const expiresInDays =
    typeof opts?.expiresInDays === 'number' && Number.isFinite(opts.expiresInDays)
      ? Math.max(1, Math.min(365, Math.round(opts.expiresInDays)))
      : DEFAULT_TL_INVITE_EXPIRY_DAYS;
  const expiresAt = new Date(Date.now() + expiresInDays * 24 * 60 * 60 * 1000).toISOString();
  const nowIso = new Date().toISOString();
  const token = generateAdminTlInviteToken();

  const { data, error } = await client
    .from('admin_tl_invites')
    .insert({
      token,
      created_by_admin_id: adminId,
      target_role: INVITE_TL_ROLE,
      invite_type: INVITE_TL_ROLE,
      is_used: false,
      used_by_user_id: null,
      expires_at: expiresAt,
      is_active: true,
      updated_at: nowIso,
    })
    .select('*')
    .single();

  if (error || !data) {
    return { success: false, error: error?.message || 'Failed to create TL invite token' };
  }
  return { success: true, row: mapRow(data) };
}

export async function listAdminTlInvites(client: SupabaseClient): Promise<AdminTlInviteRow[]> {
  const { data, error } = await client
    .from('admin_tl_invites')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(300);

  if (error) {
    console.warn('[adminTlInviteTokens] listAdminTlInvites:', error.message);
    return [];
  }
  return (data || []).map(mapRow);
}

export async function listAdminTlInviteManagementRows(
  client: SupabaseClient,
  baseUrl?: string | null
): Promise<AdminTlInviteListItem[]> {
  const rows = await listAdminTlInvites(client);
  const profileIds = Array.from(
    new Set(
      rows
        .flatMap((r) => [r.used_by_user_id, r.created_by_admin_id])
        .filter((id): id is string => Boolean(id))
    )
  );

  const profileById = new Map<string, { name: string | null; email: string | null }>();
  if (profileIds.length) {
    const { data: profiles } = await client
      .from('profiles')
      .select('id, name, email')
      .in('id', profileIds);
    for (const p of profiles || []) {
      profileById.set(String(p.id), {
        name: p.name ? String(p.name) : null,
        email: p.email ? String(p.email) : null,
      });
    }
  }

  return rows.map((row) => {
    const status = deriveAdminTlInviteStatus(row);
    const used = profileById.get(row.used_by_user_id || '') || null;
    const createdBy = profileById.get(row.created_by_admin_id) || null;
    return {
      ...row,
      inviteUrl: buildAdminTlInviteUrl(row.token, baseUrl),
      status,
      signupStatus: row.is_used || row.used_by_user_id ? 'registered' : 'pending',
      usedByName: used?.name || null,
      usedByEmail: used?.email || null,
      createdByName: createdBy?.name || null,
      createdByEmail: createdBy?.email || null,
    };
  });
}

export async function validateAdminTlInviteToken(
  client: SupabaseClient,
  token: string
): Promise<
  | { ok: true; data: ValidatedAdminTlInvite }
  | { ok: false; code: AdminTlInviteValidationError; message: string }
> {
  const clean = String(token || '').trim();
  if (!clean || clean.length < 16) {
    return { ok: false, code: 'INVITE_INVALID', message: 'Invalid Team Leader invite link.' };
  }

  const { data, error } = await client
    .from('admin_tl_invites')
    .select('*')
    .eq('token', clean)
    .maybeSingle();

  if (error || !data) {
    return { ok: false, code: 'INVITE_INVALID', message: 'Invalid or unknown Team Leader invite link.' };
  }

  const row = mapRow(data);
  if (row.is_used) {
    return {
      ok: false,
      code: 'INVITE_EXHAUSTED',
      message: 'This Team Leader invite link has already been used.',
    };
  }
  if (!row.is_active) {
    return {
      ok: false,
      code: 'INVITE_INVALID',
      message: 'This Team Leader invite link is no longer active.',
    };
  }
  if (isExpired(row.expires_at)) {
    return {
      ok: false,
      code: 'INVITE_EXPIRED',
      message: 'This Team Leader invite link has expired.',
    };
  }

  return {
    ok: true,
    data: { row, targetRole: INVITE_TL_ROLE },
  };
}

export async function consumeAdminTlInviteToken(
  client: SupabaseClient,
  tokenId: string,
  usedByUserId: string
): Promise<{ success: boolean; error?: string; code?: AdminTlInviteValidationError }> {
  const id = String(tokenId || '').trim();
  const userId = String(usedByUserId || '').trim();
  if (!id) return { success: false, error: 'tokenId required', code: 'INVITE_INVALID' };
  if (!userId) return { success: false, error: 'usedByUserId required', code: 'INVITE_INVALID' };

  const nowIso = new Date().toISOString();
  const { data: updated, error: updErr } = await client
    .from('admin_tl_invites')
    .update({
      is_used: true,
      used_by_user_id: userId,
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
      .from('admin_tl_invites')
      .select('is_used, is_active, expires_at')
      .eq('id', id)
      .maybeSingle();
    if (current?.is_used) {
      return {
        success: false,
        error: 'This Team Leader invite link has already been used.',
        code: 'INVITE_EXHAUSTED',
      };
    }
    if (current && isExpired(current.expires_at)) {
      return {
        success: false,
        error: 'This Team Leader invite link has expired.',
        code: 'INVITE_EXPIRED',
      };
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
 * Force team_leader role on the new profile, then atomically consume the invite.
 */
export async function applyAdminTlInviteOnSignup(
  client: SupabaseClient,
  params: {
    inviteToken: string;
    profileId: string;
    displayName?: string;
    email?: string;
    agencyName?: string;
  }
): Promise<
  | {
      ok: true;
      role: typeof INVITE_TL_ROLE;
      agencyName: string | null;
    }
  | {
      ok: false;
      code: AdminTlInviteValidationError | 'INVITE_APPLY_FAILED';
      message: string;
    }
> {
  const profileId = String(params.profileId || '').trim();
  if (!profileId) {
    return { ok: false, code: 'INVITE_APPLY_FAILED', message: 'Profile id required.' };
  }

  const validated = await validateAdminTlInviteToken(client, params.inviteToken);
  if (!validated.ok) {
    return { ok: false, code: validated.code, message: validated.message };
  }

  const { row } = validated.data;

  // Consume first so concurrent signups cannot reuse the same token.
  const consumed = await consumeAdminTlInviteToken(client, row.id, profileId);
  if (!consumed.success) {
    return {
      ok: false,
      code: consumed.code || 'INVITE_EXHAUSTED',
      message: consumed.error || 'Invite could not be consumed.',
    };
  }

  const nowIso = new Date().toISOString();
  const agencyName =
    (params.agencyName && params.agencyName.trim()) ||
    (params.displayName && params.displayName.trim()
      ? `${params.displayName.trim()} Agency`
      : 'Talent Agency');

  const patch: Record<string, unknown> = {
    role: INVITE_TL_ROLE,
    gender: 'female',
    gender_locked: true,
    agency_name: agencyName,
    commission_percent: 15,
    hourly_coin_rate: 10,
    is_verified: true,
    updated_at: nowIso,
  };
  if (params.displayName?.trim()) patch.name = params.displayName.trim();
  if (params.email?.trim()) patch.email = params.email.trim().toLowerCase();

  const { data: existing } = await client
    .from('profiles')
    .select('id')
    .eq('id', profileId)
    .maybeSingle();

  if (existing?.id) {
    const { error: forceErr } = await client.from('profiles').update(patch).eq('id', profileId);
    if (forceErr) {
      return {
        ok: false,
        code: 'INVITE_APPLY_FAILED',
        message: forceErr.message || 'Failed to set Team Leader fields on profile.',
      };
    }
  } else {
    const { error: insErr } = await client.from('profiles').insert({
      id: profileId,
      auth_id: profileId,
      name: params.displayName?.trim() || 'Team Leader',
      email: params.email?.trim().toLowerCase() || null,
      gender: 'female',
      gender_locked: true,
      role: INVITE_TL_ROLE,
      agency_name: agencyName,
      commission_percent: 15,
      hourly_coin_rate: 10,
      is_onboarded: false,
      is_verified: true,
      online_status: 'online',
      coin_balance: 0,
      updated_at: nowIso,
    } as Record<string, unknown>);
    if (insErr) {
      return {
        ok: false,
        code: 'INVITE_APPLY_FAILED',
        message: insErr.message || 'Failed to create Team Leader profile for invite.',
      };
    }
  }

  return {
    ok: true,
    role: INVITE_TL_ROLE,
    agencyName,
  };
}
