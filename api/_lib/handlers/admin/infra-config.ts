/**
 * Admin infrastructure status — reads secrets from Vercel/server env only.
 * Browser never needs to paste service-role / R2 secrets.
 */
import {
  sendJson,
  readJsonBody,
  requireAdminFromBearer,
  getSupabaseEnv,
  getR2Env,
  getLiveKitEnv,
  isMaskedSecret,
  type VercelReq,
  type VercelRes,
} from '../../vercelAuth';

export default async function handler(req: VercelReq, res: VercelRes) {
  try {
    if (req.method === 'OPTIONS') {
      res.statusCode = 204;
      res.end();
      return;
    }

    if (req.method !== 'GET' && req.method !== 'POST') {
      return sendJson(res, 405, {
        success: false,
        error: { message: 'Method not allowed', code: 'METHOD_NOT_ALLOWED' },
      });
    }

    const auth = await requireAdminFromBearer(req);
    if (auth.ok === false) {
      return sendJson(res, auth.status, { success: false, error: auth.error });
    }

    const supabase = getSupabaseEnv();
    const r2 = getR2Env();
    const livekit = getLiveKitEnv();

    const supabaseConfigured = Boolean(
      supabase.url &&
        supabase.anonKey &&
        !supabase.url.includes('placeholder') &&
        !supabase.url.includes('your-project')
    );
    const r2Configured = Boolean(r2.accountId && r2.accessKeyId && r2.secretAccessKey && r2.bucketName);
    const livekitConfigured = Boolean(
      livekit.wsUrl &&
        livekit.apiKey &&
        livekit.apiSecret &&
        livekit.apiKey !== 'devkey' &&
        livekit.apiSecret !== 'secret'
    );

    if (req.method === 'GET') {
      return sendJson(res, 200, {
        success: true,
        config: {
          source: 'environment',
          supabaseUrl: supabase.url,
          // Never return real secrets — only configured flags + public URL
          supabaseAnonKey: supabase.anonKey ? '••••••••' : '',
          supabaseAnonKeyConfigured: Boolean(supabase.anonKey),
          supabaseServiceRoleConfigured: Boolean(supabase.serviceKey),
          supabaseConfigured,
          r2AccountId: r2.accountId ? `${r2.accountId.slice(0, 4)}…` : '',
          r2AccessKeyId: r2.accessKeyId ? `${r2.accessKeyId.slice(0, 4)}…` : '',
          r2SecretAccessKey: r2.secretAccessKey ? '••••••••' : '',
          r2BucketName: r2.bucketName,
          r2PublicUrl: r2.publicUrl,
          r2Configured,
          livekitWsUrl: livekit.wsUrl,
          livekitConfigured,
          vercel: Boolean(process.env.VERCEL),
        },
        message:
          'Credentials are loaded from server environment variables. Set them in Vercel → Settings → Environment Variables (not in this form).',
      });
    }

    // POST: acknowledge client-side public overrides only; secrets stay in env
    const body = await readJsonBody(req);
    const notes: string[] = [];

    if (typeof body.supabaseUrl === 'string' && body.supabaseUrl.trim() && !isMaskedSecret(body.supabaseUrl)) {
      notes.push('supabaseUrl noted for this instance only');
    }
    if (typeof body.supabaseAnonKey === 'string' && body.supabaseAnonKey.trim() && !isMaskedSecret(body.supabaseAnonKey)) {
      notes.push('supabaseAnonKey noted for this instance only');
    }

    return sendJson(res, 200, {
      success: true,
      message:
        notes.length > 0
          ? `Accepted ephemeral public overrides (${notes.join(', ')}). Permanent secrets must live in Vercel Environment Variables, then Redeploy.`
          : 'Using server environment credentials. No secrets were changed. Configure VITE_SUPABASE_*, SUPABASE_SERVICE_ROLE_KEY, R2_*, and LIVEKIT_* in Vercel → Environment Variables.',
      config: {
        source: 'environment',
        supabaseConfigured,
        r2Configured,
        livekitConfigured,
        vercel: Boolean(process.env.VERCEL),
      },
    });
  } catch (err: any) {
    console.error('[api/admin/infra-config]', err);
    return sendJson(res, 500, {
      success: false,
      error: { message: err?.message || 'Infrastructure config handler failed', code: 'HANDLER_FAILED' },
    });
  }
}
