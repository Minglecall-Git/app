/**
 * Auth helpers for Next.js App Router (Web Request).
 * supabase-js uses PostgREST (HTTPS) — already pooled server-side.
 * Raw SQL drivers must use getPooledDatabaseUrl() (port 6543).
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { NextRequest } from 'next/server';
import { getPooledDatabaseUrl } from './supabaseDb';
import {
  getSupabaseApiEnv,
  isServerAdminApiKey,
} from '../shared/supabaseApiKeys';

export const PUBLIC_SIGNUP_ROLES = new Set([
  'male_user',
  'female_user',
  'female_creator',
  'female_host',
  'other_user',
]);

export const TEAM_LEADER_ROLES = new Set(['team_leader', 'agency_manager', 'admin']);

/**
 * Auth result shape. When ok is true, user fields are set; when false, status/error are set.
 * Structural (not a strict discriminant) so one-liner `if (!auth.ok) return jsonErr(auth.status!…)` typechecks.
 */
export type AuthResult = {
  ok: boolean;
  userId: string;
  profileId: string;
  role: string;
  email?: string;
  teamLeaderId?: string | null;
  authId?: string;
  status: number;
  error: { message: string; code: string };
};

/** Alias for authenticated caller context after a successful requireAuth check. */
export type AuthOk = AuthResult;
export type AuthFail = AuthResult;

export function getSupabaseEnv() {
  return getSupabaseApiEnv();
}

export function createServiceClient(): SupabaseClient | null {
  const { url, secretKey } = getSupabaseEnv();
  if (!url || !secretKey || !isServerAdminApiKey(secretKey)) return null;
  // Touch pooler env early so misconfigured DATABASE_URL is logged once per cold start
  void getPooledDatabaseUrl();
  return createClient(url, secretKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    db: { schema: 'public' },
    global: { headers: { 'X-Client-Info': 'minglecall-next-service' } },
  });
}

export function extractBearer(req: NextRequest): string | null {
  const header = req.headers.get('authorization') || req.headers.get('Authorization');
  if (!header) return null;
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match ? match[1].trim() : null;
}

/** Prefer Authorization header; fall back to body.accessToken for sendBeacon unload paths. */
export function extractAccessToken(req: NextRequest, body?: Record<string, unknown>): string | null {
  const bearer = extractBearer(req);
  if (bearer) return bearer;
  const bodyToken = body?.accessToken;
  if (typeof bodyToken === 'string' && bodyToken.trim().length > 0) {
    return bodyToken.trim();
  }
  return null;
}

const AUTH_OK_PLACEHOLDER = { status: 0, error: { message: '', code: '' } };

export async function requireAuth(req: NextRequest, body?: Record<string, unknown>): Promise<AuthResult> {
  const token = extractAccessToken(req, body);
  if (!token) {
    return {
      ok: false,
      userId: '',
      profileId: '',
      role: '',
      status: 401,
      error: { message: 'Missing bearer token', code: 'UNAUTHORIZED' },
    };
  }
  const { url, publishableKey, anonKey, secretKey } = getSupabaseEnv();
  const publicKey = publishableKey || anonKey;
  if (!url || !publicKey) {
    return {
      ok: false,
      userId: '',
      profileId: '',
      role: '',
      status: 503,
      error: { message: 'Supabase not configured', code: 'NO_SUPABASE' },
    };
  }
  const anon = createClient(url, publicKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: userData, error } = await anon.auth.getUser(token);
  if (error || !userData?.user) {
    return {
      ok: false,
      userId: '',
      profileId: '',
      role: '',
      status: 401,
      error: { message: 'Invalid session', code: 'UNAUTHORIZED' },
    };
  }
  const userId = userData.user.id;
  const email = userData.user.email || undefined;
  const appRole = (userData.user.app_metadata as any)?.role;
  const service = secretKey ? createServiceClient() : null;
  let profileId = userId;
  let role = typeof appRole === 'string' && appRole ? appRole : 'male_user';
  let teamLeaderId: string | null = null;
  if (service) {
    const { data: profile } = await service
      .from('profiles')
      .select('id, role, auth_id, email, team_leader_id')
      .or(`id.eq.${userId},auth_id.eq.${userId}`)
      .maybeSingle();
    if (profile?.id) {
      profileId = String(profile.id);
      role = String(profile.role || role);
      teamLeaderId = profile.team_leader_id ? String(profile.team_leader_id) : null;
    }
  }
  return {
    ok: true,
    userId,
    profileId,
    role,
    email,
    teamLeaderId,
    authId: userId,
    ...AUTH_OK_PLACEHOLDER,
  };
}

export function jsonOk(data: Record<string, unknown>, status = 200) {
  return Response.json(data, { status, headers: { 'Cache-Control': 'no-store' } });
}

export function jsonErr(status: number, message: string, code: string, extra?: Record<string, unknown>) {
  return Response.json(
    { success: false, error: { message, code }, ...extra },
    { status, headers: { 'Cache-Control': 'no-store' } }
  );
}

function isAdminIdentity(role: string, email?: string): boolean {
  const e = String(email || '').toLowerCase();
  return (
    role === 'admin' ||
    e === 'admin@livecall.app' ||
    e === 'superadmin@minglecall.com' ||
    e === 'sadmin@minglecall.com'
  );
}

export async function requireAdmin(req: NextRequest): Promise<AuthResult> {
  const auth = await requireAuth(req);
  if (!auth.ok) return auth;
  if (!isAdminIdentity(auth.role, auth.email)) {
    return {
      ok: false,
      userId: auth.userId,
      profileId: auth.profileId,
      role: auth.role,
      email: auth.email,
      status: 403,
      error: { message: 'Admin privileges required', code: 'FORBIDDEN' },
    };
  }
  return auth;
}

export async function requireRole(req: NextRequest, roles: string[]): Promise<AuthResult> {
  const auth = await requireAuth(req);
  if (!auth.ok) return auth;
  const allowed = new Set(roles);
  if (!allowed.has(auth.role) && auth.role !== 'admin' && !isAdminIdentity(auth.role, auth.email)) {
    return {
      ok: false,
      userId: auth.userId,
      profileId: auth.profileId,
      role: auth.role,
      email: auth.email,
      status: 403,
      error: {
        message: `Insufficient role privileges (role: ${auth.role || 'none'}).`,
        code: 'FORBIDDEN',
      },
    };
  }
  return auth;
}

export async function requireTeamLeader(req: NextRequest): Promise<AuthResult> {
  return requireRole(req, ['team_leader', 'agency_manager', 'admin']);
}

export function sanitizePublicSignupRole(role: unknown): string {
  const value = String(role || 'male_user');
  return PUBLIC_SIGNUP_ROLES.has(value) ? value : 'male_user';
}
