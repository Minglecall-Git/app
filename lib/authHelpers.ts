/**
 * Shared auth helpers for native Next.js Route Handlers.
 */
import { createClient } from '@supabase/supabase-js';
import { createServiceClient, getSupabaseEnv } from './nextAuth';

export const AUTH_UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isValidEmail(email: unknown): email is string {
  return typeof email === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}

export function isValidOtpToken(token: unknown): token is string {
  return typeof token === 'string' && /^\d{6}$/.test(token.trim());
}

export function genderFromPublicRole(role: string): 'male' | 'female' | 'other' {
  if (role === 'female_user' || role === 'female_creator' || role === 'female_host') return 'female';
  if (role === 'other_user') return 'other';
  return 'male';
}

/** Avoid leaking stack traces / provider internals to clients. */
export function safeClientError(err: unknown, fallback: string): string {
  if (!err) return fallback;
  const message = typeof err === 'string' ? err : (err as { message?: string })?.message;
  if (typeof message !== 'string' || !message.trim()) return fallback;
  const lower = message.toLowerCase();
  if (
    lower.includes('stack') ||
    lower.includes('supabase') ||
    lower.includes('postgres') ||
    lower.includes('smtp') ||
    lower.includes('service_role') ||
    lower.includes('econn') ||
    lower.includes('enotfound') ||
    message.length > 180
  ) {
    return fallback;
  }
  return message;
}

export function findAuthUserByEmail(
  users: Array<{ id: string; email?: string | null }> | null | undefined,
  email: string
): { id: string; email?: string | null } | undefined {
  const target = String(email || '')
    .trim()
    .toLowerCase();
  if (!target || !Array.isArray(users)) return undefined;
  return users.find((u) => String(u?.email || '').toLowerCase() === target);
}

export async function findAuthUserIdByEmail(
  client: NonNullable<ReturnType<typeof createServiceClient>>,
  email: string
): Promise<string | null> {
  const clean = email.toLowerCase().trim();
  let page = 1;
  const perPage = 1000;
  for (;;) {
    const { data, error } = await client.auth.admin.listUsers({ page, perPage });
    if (error) throw new Error(error.message);
    const users = data?.users || [];
    const matched = users.find((u) => u.email?.toLowerCase().trim() === clean);
    if (matched?.id) return matched.id;
    if (users.length < perPage) return null;
    page += 1;
    if (page > 50) return null;
  }
}

export async function findProfileByEmail(email: string) {
  const client = createServiceClient();
  if (!client) return null;
  const { data } = await client
    .from('profiles')
    .select('*')
    .ilike('email', email.trim().toLowerCase())
    .maybeSingle();
  return data;
}

export function mapProfileRow(p: Record<string, unknown> | null) {
  if (!p) return null;
  return {
    id: p.id,
    authId: p.auth_id || p.id,
    name: p.name || 'Member',
    email: p.email || '',
    gender: p.gender || 'male',
    genderLocked: p.gender_locked ?? true,
    role: p.role || 'male_user',
    age: Number(p.age) || 24,
    nationality: p.nationality || 'United States',
    countryCode: String(p.country_code || 'US').toUpperCase(),
    spokenLanguages: Array.isArray(p.spoken_languages) ? p.spoken_languages : ['English'],
    bio: p.bio || '',
    interests: Array.isArray(p.interests) ? p.interests : [],
    tags: Array.isArray(p.tags) ? p.tags : [],
    avatarUrl:
      p.avatar_url ||
      'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&q=80&w=400',
    gallery: Array.isArray(p.gallery) ? p.gallery : [],
    isVerified: Boolean(p.is_verified),
    isOnboarded: Boolean(p.is_onboarded),
    onlineStatus: p.online_status || 'offline',
    coinBalance: Number(p.coin_balance) || 0,
    hourlyCoinRate: Number(p.hourly_coin_rate) || 0,
    earningsCoins: Number(p.earnings_coins) || 0,
    hasPasswordSet: Boolean(p.has_password_set),
    isBanned: Boolean(p.is_banned),
    banReason: p.ban_reason || undefined,
    bannedUntil: p.banned_until || undefined,
    accountStatus: (p.account_status || 'active') as
      | 'active'
      | 'suspended'
      | 'closed_pending_payout'
      | 'deactivated',
    closedAt: p.closed_at || undefined,
    closedReason: p.closed_reason || undefined,
    agencyName: p.agency_name || undefined,
    teamLeaderId: p.team_leader_id || p.created_by_id || undefined,
    createdById: p.created_by_id || p.team_leader_id || undefined,
    commissionPercent: p.commission_percent != null ? Number(p.commission_percent) : undefined,
    createdAt: p.created_at,
  };
}

/** Auth Route Handler JSON shape ({ success, error: string }). */
export function authJson(data: Record<string, unknown>, status = 200) {
  return Response.json(data, { status, headers: { 'Cache-Control': 'no-store' } });
}

export function authFail(status: number, error: string, extra?: Record<string, unknown>) {
  return authJson({ success: false, error, ...extra }, status);
}

export async function signInWithPassword(email: string, password: string) {
  const { url, publishableKey, anonKey } = getSupabaseEnv();
  const publicKey = publishableKey || anonKey;
  if (!url || !publicKey) {
    return { success: false as const, error: 'Supabase publishable key not configured' };
  }
  const client = createClient(url, publicKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await client.auth.signInWithPassword({
    email: email.trim().toLowerCase(),
    password,
  });
  if (error || !data.user) {
    return { success: false as const, error: error?.message || 'Invalid email or password' };
  }
  return {
    success: true as const,
    session: data.session,
    user: data.user,
  };
}
