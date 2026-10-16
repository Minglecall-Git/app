/**
 * Unified signup invite resolver — agency host invites vs admin TL invites.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  INVITE_HOST_ROLE,
  applyAgencyInviteOnSignup,
  validateInviteToken,
  type InviteValidationError,
} from './agencyInviteTokens';
import {
  INVITE_TL_ROLE,
  applyAdminTlInviteOnSignup,
  validateAdminTlInviteToken,
  type AdminTlInviteValidationError,
} from './adminTlInviteTokens';

export type SignupInviteKind = 'female_host' | 'team_leader';

export type SignupInviteValidationError =
  | InviteValidationError
  | AdminTlInviteValidationError;

export type ResolvedSignupInvite =
  | { kind: 'female_host'; role: typeof INVITE_HOST_ROLE }
  | { kind: 'team_leader'; role: typeof INVITE_TL_ROLE };

/**
 * Validate a signup invite token against host (agency) then TL (admin) tables.
 */
export async function validateSignupInviteToken(
  client: SupabaseClient,
  token: string
): Promise<
  | { ok: true; data: ResolvedSignupInvite }
  | { ok: false; code: SignupInviteValidationError; message: string }
> {
  const clean = String(token || '').trim();
  if (!clean || clean.length < 16) {
    return { ok: false, code: 'INVITE_INVALID', message: 'Invalid invite link.' };
  }

  const host = await validateInviteToken(client, clean);
  if (host.ok) {
    return { ok: true, data: { kind: 'female_host', role: INVITE_HOST_ROLE } };
  }

  const tl = await validateAdminTlInviteToken(client, clean);
  if (tl.ok) {
    return { ok: true, data: { kind: 'team_leader', role: INVITE_TL_ROLE } };
  }

  // Prefer a specific used/expired error over generic invalid when either table matched that case.
  if (host.code === 'INVITE_EXHAUSTED' || host.code === 'INVITE_EXPIRED') {
    return { ok: false, code: host.code, message: host.message };
  }
  if (tl.code === 'INVITE_EXHAUSTED' || tl.code === 'INVITE_EXPIRED') {
    return { ok: false, code: tl.code, message: tl.message };
  }
  if (tl.code !== 'INVITE_INVALID') {
    return { ok: false, code: tl.code, message: tl.message };
  }
  return { ok: false, code: host.code, message: host.message };
}

export async function applySignupInviteOnRegistration(
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
      kind: SignupInviteKind;
      role: typeof INVITE_HOST_ROLE | typeof INVITE_TL_ROLE;
      teamLeaderId?: string;
      agencyName?: string | null;
    }
  | {
      ok: false;
      code: SignupInviteValidationError | 'INVITE_APPLY_FAILED';
      message: string;
    }
> {
  const resolved = await validateSignupInviteToken(client, params.inviteToken);
  if (!resolved.ok) {
    return { ok: false, code: resolved.code, message: resolved.message };
  }

  if (resolved.data.kind === 'female_host') {
    const applied = await applyAgencyInviteOnSignup(client, {
      inviteToken: params.inviteToken,
      hostProfileId: params.profileId,
      displayName: params.displayName,
      email: params.email,
    });
    if (!applied.ok) {
      return { ok: false, code: applied.code, message: applied.message };
    }
    return {
      ok: true,
      kind: 'female_host',
      role: applied.role,
      teamLeaderId: applied.teamLeaderId,
      agencyName: applied.agencyName,
    };
  }

  const applied = await applyAdminTlInviteOnSignup(client, {
    inviteToken: params.inviteToken,
    profileId: params.profileId,
    displayName: params.displayName,
    email: params.email,
    agencyName: params.agencyName,
  });
  if (!applied.ok) {
    return { ok: false, code: applied.code, message: applied.message };
  }
  return {
    ok: true,
    kind: 'team_leader',
    role: applied.role,
    agencyName: applied.agencyName,
  };
}
