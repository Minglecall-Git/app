/**
 * Deployment readiness probe — Vercel-only same-origin APIs + env flags.
 */
import type { VercelReq, VercelRes } from '../vercelAuth';

export default async function handler(_req: VercelReq, res: VercelRes) {
  const available = {
    health: true,
    authSendOtp: true,
    authVerifyOtp: true,
    authLoginPassword: true,
    users: true,
    presence: true,
    messages: true,
    v1Social: true,
    giftsSend: true,
    callsSync: true,
    livekit: true,
    storage: true,
    r2Test: true,
    createTeamLeader: true,
  };

  res.statusCode = 200;
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Cache-Control', 'no-store');
  res.end(
    JSON.stringify({
      success: true,
      ok: true,
      mode: 'vercel',
      vercel: Boolean(process.env.VERCEL),
      node: process.version,
      time: new Date().toISOString(),
      env: {
        supabase: Boolean(
          (process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL) &&
            process.env.SUPABASE_SERVICE_ROLE_KEY
        ),
        supabaseAnon: Boolean(process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY),
        r2: Boolean(
          process.env.R2_ACCOUNT_ID && process.env.R2_ACCESS_KEY_ID && process.env.R2_SECRET_ACCESS_KEY
        ),
        livekit: Boolean(
          process.env.LIVEKIT_URL && process.env.LIVEKIT_API_KEY && process.env.LIVEKIT_API_SECRET
        ),
        smtp: Boolean(process.env.RESEND_API_KEY || (process.env.SMTP_HOST && process.env.SMTP_PASS)),
      },
      api: {
        mode: 'vercel-same-origin',
        available,
        signaling: 'supabase-realtime',
        note: 'Connect minglecall.com to this Vercel project. Leave VITE_API_BASE_URL unset. Enable Supabase Realtime for profiles/messages.',
      },
    })
  );
}
