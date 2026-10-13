/**
 * Shared auth helpers for lightweight Vercel API routes.
 * Uses SUPABASE_SERVICE_ROLE_KEY from server env — never from the browser body.
 */
import type { IncomingMessage, ServerResponse } from 'http';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

export type VercelReq = IncomingMessage & { method?: string; body?: any };
export type VercelRes = ServerResponse;

export function sendJson(res: ServerResponse, status: number, body: unknown) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(body));
}

export async function readJsonBody(req: IncomingMessage): Promise<any> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  if (chunks.length === 0) return {};
  const raw = Buffer.concat(chunks).toString('utf8');
  if (!raw.trim()) return {};
  try {
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

export function extractBearer(req: IncomingMessage): string | null {
  const header = req.headers.authorization || (req.headers as any).Authorization;
  if (!header || typeof header !== 'string') return null;
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match ? match[1].trim() : null;
}

export function getSupabaseEnv() {
  const clean = (v: string) => v.trim().replace(/^["']|["']$/g, '');
  const url = clean(process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || '');
  const anonKey = clean(process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY || '');
  const serviceKey = clean(process.env.SUPABASE_SERVICE_ROLE_KEY || '');
  return { url, anonKey, serviceKey };
}

export function getR2Env() {
  const clean = (v: string) => v.trim().replace(/^["']|["']$/g, '');
  return {
    accountId: clean(process.env.R2_ACCOUNT_ID || ''),
    accessKeyId: clean(process.env.R2_ACCESS_KEY_ID || ''),
    secretAccessKey: clean(process.env.R2_SECRET_ACCESS_KEY || ''),
    bucketName: clean(process.env.R2_BUCKET_NAME || 'datingappbucket') || 'datingappbucket',
    publicUrl: clean(process.env.R2_PUBLIC_URL || '').replace(/\/$/, ''),
  };
}

export function getLiveKitEnv() {
  const clean = (v: string) => v.trim().replace(/^["']|["']$/g, '');
  return {
    wsUrl: clean(process.env.LIVEKIT_URL || ''),
    apiKey: clean(process.env.LIVEKIT_API_KEY || ''),
    apiSecret: clean(process.env.LIVEKIT_API_SECRET || ''),
  };
}

export function createServiceClient(): SupabaseClient | null {
  const { url, serviceKey } = getSupabaseEnv();
  if (!url || !serviceKey) return null;
  return createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export async function requireAuthFromBearer(
  req: IncomingMessage
): Promise<
  | { ok: true; userId: string; profileId: string; role: string; email?: string; user: any; profile: any }
  | { ok: false; status: number; error: any }
> {
  const { url, serviceKey } = getSupabaseEnv();
  if (!url || !serviceKey) {
    return {
      ok: false,
      status: 503,
      error: {
        message:
          'Missing VITE_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in server environment (Vercel Project Settings).',
        code: 'ENV_MISSING',
      },
    };
  }

  const token = extractBearer(req);
  if (!token) {
    return {
      ok: false,
      status: 401,
      error: { message: 'Missing Authorization Bearer token.', code: 'UNAUTHORIZED' },
    };
  }

  const admin = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: userData, error: userErr } = await admin.auth.getUser(token);
  if (userErr || !userData?.user) {
    let hint = '';
    try {
      const parts = String(token).split('.');
      if (parts.length >= 2) {
        const b64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
        const payload = JSON.parse(Buffer.from(b64, 'base64').toString('utf8'));
        const iss = String(payload.iss || '').replace(/\/$/, '');
        const expected = String(url || '').replace(/\/$/, '');
        if (payload.exp && Number(payload.exp) * 1000 < Date.now()) {
          hint = ' Session expired — sign out and sign in again.';
        } else if (iss && expected && !iss.startsWith(expected)) {
          hint =
            ' Browser session project does not match server SUPABASE URL. On Vercel, VITE_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be from the same project, then Redeploy.';
        } else if (userErr?.message) {
          hint = ` (${String(userErr.message).slice(0, 120)})`;
        }
      }
    } catch {
      /* ignore */
    }
    return {
      ok: false,
      status: 401,
      error: {
        message: `Invalid or expired authentication token.${hint}`,
        code: 'UNAUTHORIZED',
      },
    };
  }

  const authUser = userData.user;
  const { data: profile } = await admin
    .from('profiles')
    .select('id, role, email')
    .or(`auth_id.eq.${authUser.id},id.eq.${authUser.id}`)
    .maybeSingle();

  const profileId = String(profile?.id || authUser.id);
  const role = String(profile?.role || '').toLowerCase();
  const email = String(profile?.email || authUser.email || '').toLowerCase();

  return {
    ok: true,
    userId: authUser.id,
    profileId,
    role,
    email: email || undefined,
    user: authUser,
    profile,
  };
}

export async function requireAdminFromBearer(
  req: IncomingMessage
): Promise<{ ok: true; userId: string; email?: string } | { ok: false; status: number; error: any }> {
  const auth = await requireAuthFromBearer(req);
  if (auth.ok === false) return auth;

  const isAdmin =
    auth.role === 'admin' ||
    auth.email === 'admin@livecall.app' ||
    auth.email === 'superadmin@minglecall.com';

  if (!isAdmin) {
    return {
      ok: false,
      status: 403,
      error: { message: 'Admin role required.', code: 'FORBIDDEN' },
    };
  }

  return {
    ok: true,
    userId: auth.profileId,
    email: auth.email,
  };
}

export async function requireTeamLeaderFromBearer(
  req: IncomingMessage
): Promise<
  | { ok: true; userId: string; profileId: string; role: string; email?: string; user: any; profile: any }
  | { ok: false; status: number; error: any }
> {
  const auth = await requireAuthFromBearer(req);
  if (auth.ok === false) return auth;

  const role = String(auth.role || '').toLowerCase();
  const allowed =
    role === 'team_leader' ||
    role === 'agency_manager' ||
    role === 'admin' ||
    auth.email === 'admin@livecall.app' ||
    auth.email === 'superadmin@minglecall.com';

  if (!allowed) {
    return {
      ok: false,
      status: 403,
      error: { message: 'Team leader role required.', code: 'FORBIDDEN' },
    };
  }

  // Load fuller profile for agencyName / commission
  const client = createServiceClient();
  let profile = auth.profile;
  if (client) {
    const { data } = await client.from('profiles').select('*').eq('id', auth.profileId).maybeSingle();
    if (data) profile = data;
  }

  return {
    ok: true,
    userId: auth.userId,
    profileId: auth.profileId,
    role: role || String(profile?.role || ''),
    email: auth.email,
    user: auth.user,
    profile,
  };
}

export function isMaskedSecret(value: unknown): boolean {
  return typeof value === 'string' && (value.startsWith('••••') || value.includes('…'));
}
