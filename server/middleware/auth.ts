import type { Request, Response, NextFunction } from 'express';
import { getSupabaseAdmin, isSupabaseAdminConfigured } from '../supabaseAdmin';

export const PUBLIC_SIGNUP_ROLES = new Set([
  'male_user',
  'female_user',
  'female_creator',
  'female_host',
  'other_user',
]);

export const ADMIN_ROLES = new Set(['admin']);
export const TEAM_LEADER_ROLES = new Set(['team_leader', 'agency_manager', 'admin']);

export type AuthUser = {
  id: string;
  email?: string | null;
  user_metadata?: Record<string, any>;
  app_metadata?: Record<string, any>;
};

export type ResolvedProfile = {
  id: string;
  authId?: string | null;
  role: string;
  email?: string | null;
  teamLeaderId?: string | null;
  createdById?: string | null;
  agencyName?: string | null;
};

const PRIVILEGED_PROFILE_KEYS = new Set([
  'coinBalance',
  'coin_balance',
  'earningsCoins',
  'earnings_coins',
  'coinEarnOverrideRate',
  'coin_earn_override_rate',
  'role',
  'password',
  'password_hash',
  'hasPasswordSet',
  'has_password_set',
  'isBanned',
  'is_banned',
  'banReason',
  'ban_reason',
  'bannedUntil',
  'banned_until',
  'bannedById',
  'banned_by_id',
  'bannedByRole',
  'banned_by_role',
  'isVerified',
  'is_verified',
  'kycStatus',
  'kyc_status',
  'totalLifetimeEarnedUSD',
  'total_lifetime_earned_usd',
]);

export function extractBearerToken(req: Request): string | null {
  const header = req.headers.authorization || req.headers.Authorization;
  if (!header || typeof header !== 'string') return null;
  const match = header.match(/^Bearer\s+(.+)$/i);
  if (!match) return null;
  const token = match[1].trim();
  return token.length > 0 ? token : null;
}

/** Prefer Authorization header; fall back to body.accessToken for sendBeacon unload paths. */
export function extractAccessToken(req: Request): string | null {
  const bearer = extractBearerToken(req);
  if (bearer) return bearer;
  const bodyToken = (req.body as any)?.accessToken;
  if (typeof bodyToken === 'string' && bodyToken.trim().length > 0) {
    return bodyToken.trim();
  }
  return null;
}

export function sendUnauthorized(res: Response, message: string) {
  return res.status(401).json({
    success: false,
    error: {
      message,
      code: 'UNAUTHORIZED',
    },
  });
}

export function sendForbidden(res: Response, message: string) {
  return res.status(403).json({
    success: false,
    error: {
      message,
      code: 'FORBIDDEN',
    },
  });
}

export async function verifyAccessToken(token: string): Promise<{
  user: AuthUser;
  profile: ResolvedProfile | null;
} | null> {
  if (!token || !isSupabaseAdminConfigured()) return null;
  const supabaseAdmin = getSupabaseAdmin();
  if (!supabaseAdmin) return null;

  const { data, error } = await supabaseAdmin.auth.getUser(token);
  if (error || !data?.user) return null;

  const user = data.user as AuthUser;
  const profile = await lookupProfileForAuthUser(user);
  return { user, profile };
}

export async function lookupProfileForAuthUser(authUser: AuthUser): Promise<ResolvedProfile | null> {
  const supabaseAdmin = getSupabaseAdmin();
  if (!supabaseAdmin) return null;

  const { data: byAuthId } = await supabaseAdmin
    .from('profiles')
    .select('id, auth_id, role, email, team_leader_id, created_by_id, agency_name')
    .eq('auth_id', authUser.id)
    .maybeSingle();

  const row =
    byAuthId ||
    (
      await supabaseAdmin
        .from('profiles')
        .select('id, auth_id, role, email, team_leader_id, created_by_id, agency_name')
        .eq('id', authUser.id)
        .maybeSingle()
    ).data ||
    (authUser.email
      ? (
          await supabaseAdmin
            .from('profiles')
            .select('id, auth_id, role, email, team_leader_id, created_by_id, agency_name')
            .ilike('email', authUser.email.trim().toLowerCase())
            .maybeSingle()
        ).data
      : null);

  if (!row) return null;

  return {
    id: String(row.id),
    authId: row.auth_id ? String(row.auth_id) : authUser.id,
    role: String(row.role || 'male_user'),
    email: row.email,
    teamLeaderId: row.team_leader_id,
    createdById: row.created_by_id,
    agencyName: row.agency_name,
  };
}

async function authenticateRequest(req: Request, res: Response): Promise<AuthUser | null> {
  const existing = (req as any).user as AuthUser | undefined;
  if (existing?.id) return existing;

  const token = extractAccessToken(req);
  if (!token) {
    sendUnauthorized(res, 'Missing or invalid Authorization Bearer token.');
    return null;
  }

  const verified = await verifyAccessToken(token);
  if (!verified) {
    sendUnauthorized(res, 'Invalid or expired authentication token.');
    return null;
  }

  (req as any).user = verified.user;
  (req as any).accessToken = token;
  (req as any).profile = verified.profile;
  (req as any).profileId = verified.profile?.id || verified.user.id;
  return verified.user;
}

export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  try {
    const user = await authenticateRequest(req, res);
    if (!user) return;
    return next();
  } catch (err: any) {
    console.error('[Auth Middleware] requireAuth error:', err);
    return sendUnauthorized(res, 'Authentication failed.');
  }
}

function isAdminRole(role?: string | null) {
  return role === 'admin';
}

export async function requireAdmin(req: Request, res: Response, next: NextFunction) {
  try {
    const authUser = await authenticateRequest(req, res);
    if (!authUser) return;

    const appRole = authUser.app_metadata?.role;
    const profile = (req as any).profile as ResolvedProfile | undefined;

    if (isAdminRole(appRole) || isAdminRole(profile?.role)) {
      (req as any).isAdmin = true;
      (req as any).adminProfile = profile || null;
      return next();
    }

    return sendForbidden(res, 'Admin privileges required.');
  } catch (err: any) {
    console.error('[Auth Middleware] requireAdmin error:', err);
    return sendForbidden(res, 'Admin verification failed.');
  }
}

export function requireRole(roles: string[]) {
  const allowed = new Set(roles);
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const authUser = await authenticateRequest(req, res);
      if (!authUser) return;
      const profile = (req as any).profile as ResolvedProfile | undefined;
      if (!profile?.id) {
        return sendForbidden(
          res,
          'No profile is linked to this login. Sign out and sign in again, or contact support.'
        );
      }
      const role = profile?.role || '';
      if (!allowed.has(role) && !isAdminRole(role)) {
        return sendForbidden(
          res,
          `Insufficient role privileges (role: ${role || 'none'}). Team leader access required.`
        );
      }
      return next();
    } catch (err: any) {
      console.error('[Auth Middleware] requireRole error:', err);
      return sendForbidden(res, 'Role verification failed.');
    }
  };
}

export const requireTeamLeader = requireRole(['team_leader', 'agency_manager', 'admin']);

export function sanitizePublicSignupRole(role: unknown): string {
  const value = String(role || 'male_user');
  return PUBLIC_SIGNUP_ROLES.has(value) ? value : 'male_user';
}

export function stripPrivilegedProfileFields<T extends Record<string, any>>(body: T): Partial<T> {
  const next: Record<string, any> = { ...body };
  for (const key of PRIVILEGED_PROFILE_KEYS) {
    delete next[key];
  }
  return next as Partial<T>;
}

/** Ownership by profile IDs only — never agencyName string match (avoids cross-agency leakage). */
export function callerOwnsCreator(
  leader: ResolvedProfile,
  creator: { teamLeaderId?: string | null; createdById?: string | null; agencyName?: string | null }
) {
  if (leader.role === 'admin') return true;
  const leaderIds = [leader.id, leader.authId].filter(Boolean);
  if (creator.teamLeaderId && leaderIds.includes(creator.teamLeaderId)) return true;
  if (creator.createdById && leaderIds.includes(creator.createdById)) return true;
  return false;
}

export function ownsCreatorByLeaderId(
  leaderId: string,
  creator: { teamLeaderId?: string | null; createdById?: string | null },
  leaderAuthId?: string | null
) {
  if (!leaderId && !leaderAuthId) return false;
  const ids = [leaderId, leaderAuthId].filter(Boolean) as string[];
  return (
    (Boolean(creator.teamLeaderId) && ids.includes(String(creator.teamLeaderId))) ||
    (Boolean(creator.createdById) && ids.includes(String(creator.createdById)))
  );
}
