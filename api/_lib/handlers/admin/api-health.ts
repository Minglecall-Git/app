/**
 * GET /api/admin/api-health
 * Vercel-only deep health for Admin API Health panel (no Express process).
 */
import {
  sendJson,
  requireAdminFromBearer,
  getSupabaseEnv,
  getR2Env,
  getLiveKitEnv,
  type VercelReq,
  type VercelRes,
} from '../../vercelAuth';

type CheckRow = {
  id: string;
  label: string;
  ok: boolean;
  latencyMs?: number | null;
  detail?: string;
  source?: 'server';
};

export default async function handler(req: VercelReq, res: VercelRes) {
  try {
    if (req.method === 'OPTIONS') {
      res.statusCode = 204;
      res.end();
      return;
    }
    if (req.method !== 'GET') {
      return sendJson(res, 405, {
        success: false,
        error: { message: 'Method not allowed', code: 'METHOD_NOT_ALLOWED' },
      });
    }

    const auth = await requireAdminFromBearer(req);
    if (auth.ok === false) {
      return sendJson(res, auth.status, { success: false, error: auth.error });
    }

    const checks: CheckRow[] = [];
    const tAll = Date.now();

    {
      const t0 = Date.now();
      const { url, serviceKey, anonKey } = getSupabaseEnv();
      checks.push({
        id: 'supabase',
        label: 'Supabase env',
        ok: Boolean(url && serviceKey && anonKey),
        latencyMs: Date.now() - t0,
        detail: url ? `URL set · service=${Boolean(serviceKey)} · anon=${Boolean(anonKey)}` : 'Missing Supabase URL/keys',
        source: 'server',
      });
    }

    {
      const t0 = Date.now();
      const r2 = getR2Env();
      const ok = Boolean(r2.accountId && r2.accessKeyId && r2.secretAccessKey && r2.bucketName);
      checks.push({
        id: 'r2',
        label: 'Cloudflare R2 env',
        ok,
        latencyMs: Date.now() - t0,
        detail: ok ? `bucket=${r2.bucketName}` : 'Missing R2_* env vars',
        source: 'server',
      });
    }

    {
      const t0 = Date.now();
      const lk = getLiveKitEnv();
      const ok = Boolean(lk.wsUrl && lk.apiKey && lk.apiSecret);
      checks.push({
        id: 'livekit',
        label: 'LiveKit env',
        ok,
        latencyMs: Date.now() - t0,
        detail: ok ? lk.wsUrl : 'Missing LIVEKIT_* env vars',
        source: 'server',
      });
    }

    {
      const t0 = Date.now();
      const smtpOk = Boolean(
        process.env.RESEND_API_KEY || (process.env.SMTP_HOST && process.env.SMTP_PASS)
      );
      checks.push({
        id: 'smtp',
        label: 'Email (SMTP/Resend)',
        ok: smtpOk,
        latencyMs: Date.now() - t0,
        detail: smtpOk
          ? process.env.RESEND_API_KEY
            ? 'RESEND_API_KEY set'
            : 'SMTP_* set'
          : 'Missing RESEND_API_KEY or SMTP_*',
        source: 'server',
      });
    }

    checks.push({
      id: 'signaling',
      label: 'Signaling',
      ok: true,
      latencyMs: 0,
      detail: 'Supabase Realtime (Broadcast + Presence) — no Express /ws on Vercel',
      source: 'server',
    });

    checks.push({
      id: 'vercel',
      label: 'Vercel runtime',
      ok: true,
      latencyMs: Date.now() - tAll,
      detail: `node=${process.version} · vercel=${Boolean(process.env.VERCEL)}`,
      source: 'server',
    });

    const services = {
      supabase: checks.find((c) => c.id === 'supabase')?.ok === true,
      r2: checks.find((c) => c.id === 'r2')?.ok === true,
      livekit: checks.find((c) => c.id === 'livekit')?.ok === true,
      smtp: checks.find((c) => c.id === 'smtp')?.ok === true,
      realtime: true,
    };

    return sendJson(res, 200, {
      success: true,
      mode: 'vercel',
      status: 'ok',
      timestamp: new Date().toISOString(),
      latencyMs: Date.now() - tAll,
      checks,
      services,
      runtime: {
        platform: 'vercel-serverless',
        signaling: 'supabase-realtime',
        sameOriginApi: true,
      },
    });
  } catch (e: any) {
    return sendJson(res, 500, {
      success: false,
      error: { message: e?.message || 'Health check failed', code: 'ADMIN_HEALTH_FAILED' },
    });
  }
}
