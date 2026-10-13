import { NextRequest } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getR2RuntimeConfig, isR2Configured, testR2Connectivity } from '../../../server/r2Storage';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 30;

function clean(v: unknown): string {
  return String(v || '')
    .trim()
    .replace(/^["']|["']$/g, '');
}

function json(status: number, body: Record<string, unknown>) {
  return Response.json(body, {
    status,
    headers: { 'Cache-Control': 'no-store' },
  });
}

function bearer(req: NextRequest): string | null {
  const h = req.headers.get('authorization') || req.headers.get('Authorization');
  if (!h) return null;
  const m = h.match(/^Bearer\s+(.+)$/i);
  return m ? m[1].trim() : null;
}

async function assertAdmin(req: NextRequest): Promise<Response | null> {
  const supabaseUrl = clean(
    process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL
  );
  const serviceKey = clean(process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY);

  if (!supabaseUrl || !serviceKey) {
    return json(503, {
      success: false,
      message:
        'Missing Supabase server env (NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SECRET_KEY). Check .env.local and restart Next.js.',
    });
  }

  const token = bearer(req);
  if (!token) {
    return json(401, { success: false, message: 'Missing Authorization Bearer token.' });
  }

  const admin = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: userData, error: userErr } = await admin.auth.getUser(token);
  if (userErr || !userData?.user) {
    return json(401, {
      success: false,
      message: 'Invalid or expired admin session. Sign in again.',
    });
  }

  const authUser = userData.user;
  const { data: profile } = await admin
    .from('profiles')
    .select('id, role, email')
    .or(`auth_id.eq.${authUser.id},id.eq.${authUser.id}`)
    .maybeSingle();

  const role = String(profile?.role || authUser.app_metadata?.role || '').toLowerCase();
  const email = String(profile?.email || authUser.email || '').toLowerCase();
  const isAdmin =
    role === 'admin' ||
    email === 'admin@livecall.app' ||
    email === 'superadmin@minglecall.com' ||
    email === 'sadmin@minglecall.com';

  if (!isAdmin) {
    return json(403, { success: false, message: 'Admin role required.' });
  }

  return null;
}

async function handle(req: NextRequest) {
  try {
    if (req.method === 'OPTIONS') {
      return new Response(null, { status: 204 });
    }
    if (req.method !== 'POST' && req.method !== 'GET') {
      return json(405, { success: false, message: 'Method not allowed' });
    }

    const denied = await assertAdmin(req);
    if (denied) return denied;

    const cfg = getR2RuntimeConfig();
    const present = {
      R2_ACCOUNT_ID: Boolean(clean(cfg.accountId)),
      R2_ACCESS_KEY_ID: Boolean(clean(cfg.accessKeyId)),
      R2_SECRET_ACCESS_KEY: Boolean(clean(cfg.secretAccessKey)),
      R2_BUCKET_NAME: Boolean(clean(process.env.R2_BUCKET_NAME)),
    };

    if (!isR2Configured(cfg)) {
      return json(503, {
        success: false,
        configured: false,
        present,
        message:
          'R2 env incomplete. Set R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET_NAME in .env.local (no quotes), then restart Next.js.',
        endpoint: `https://${clean(cfg.accountId) || 'ACCOUNT_ID'}.r2.cloudflarestorage.com`,
      });
    }

    const result = await testR2Connectivity();
    return json(200, {
      ...result,
      present,
      source: 'environment',
    });
  } catch (err: any) {
    console.error('[api/r2-test] fatal:', err);
    console.error(err?.stack || String(err));
    return json(500, {
      success: false,
      message: err?.message || 'R2 connectivity test failed',
      detail: String(err?.name || ''),
    });
  }
}

export const GET = handle;
export const POST = handle;
export const OPTIONS = handle;
