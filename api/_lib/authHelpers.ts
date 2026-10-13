/**
 * Shared helpers for Vercel auth + profile routes.
 */
import { createClient } from '@supabase/supabase-js';
import { createServiceClient, getSupabaseEnv } from './vercelAuth';
import { getPasswordPolicyError } from './passwordPolicy';

export function isValidEmail(email: unknown): email is string {
  return typeof email === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}

export function isValidOtpToken(token: unknown): token is string {
  return typeof token === 'string' && /^\d{6}$/.test(token.trim());
}

const PUBLIC_ROLES = new Set([
  'male_user',
  'female_user',
  'female_creator',
  'female_host',
  'other_user',
]);

export function sanitizePublicSignupRole(role: unknown): string {
  const r = String(role || '').trim();
  return PUBLIC_ROLES.has(r) ? r : 'male_user';
}

export function mapProfileRow(p: any) {
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
    countryCode: (p.country_code || 'US').toUpperCase(),
    spokenLanguages: Array.isArray(p.spoken_languages) ? p.spoken_languages : ['English'],
    bio: p.bio || '',
    interests: Array.isArray(p.interests) ? p.interests : [],
    tags: Array.isArray(p.tags) ? p.tags : [],
    avatarUrl:
      p.avatar_url ||
      'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&q=80&w=400',
    gallery: Array.isArray(p.gallery) ? p.gallery : [],
    isVerified: Boolean(p.is_verified),
    isOnboarded: p.is_onboarded !== false,
    onlineStatus: p.online_status || 'offline',
    coinBalance: Number(p.coin_balance) || 0,
    hourlyCoinRate: Number(p.hourly_coin_rate) || 0,
    earningsCoins: Number(p.earnings_coins) || 0,
    hasPasswordSet: Boolean(p.has_password_set),
    isBanned: Boolean(p.is_banned),
    banReason: p.ban_reason || undefined,
    bannedUntil: p.banned_until || undefined,
    agencyName: p.agency_name || undefined,
    teamLeaderId: p.team_leader_id || p.created_by_id || undefined,
    createdById: p.created_by_id || p.team_leader_id || undefined,
    commissionPercent: p.commission_percent != null ? Number(p.commission_percent) : undefined,
    createdAt: p.created_at,
  };
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

export async function signInWithPassword(email: string, password: string) {
  const { url, anonKey } = getSupabaseEnv();
  if (!url || !anonKey) {
    return { success: false as const, error: 'Supabase anon key not configured' };
  }
  const client = createClient(url, anonKey, {
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

export { getPasswordPolicyError };

/** Find Auth user by email — typed for Vercel serverless TS (listUsers users can infer as never). */
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
