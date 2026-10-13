/**
 * /api/r2-test — R2 connectivity probe without AWS SDK.
 */
import { createHash, createHmac } from 'crypto';
import { createClient } from '@supabase/supabase-js';
import type { VercelReq, VercelRes } from '../vercelAuth';

function send(res: VercelRes, status: number, body: unknown) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(body));
}

function clean(v: unknown): string {
  return String(v || '')
    .trim()
    .replace(/^["']|["']$/g, '');
}

function bearer(req: VercelReq): string | null {
  const h = req.headers.authorization || (req.headers as any).Authorization;
  if (!h || typeof h !== 'string') return null;
  const m = h.match(/^Bearer\s+(.+)$/i);
  return m ? m[1].trim() : null;
}

function hmac(key: string | Buffer, data: string) {
  return createHmac('sha256', key).update(data, 'utf8').digest();
}

function sha256Hex(data: string) {
  return createHash('sha256').update(data, 'utf8').digest('hex');
}

async function r2ListObjectsProbe(opts: {
  accountId: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucketName: string;
}) {
  const { accountId, accessKeyId, secretAccessKey, bucketName } = opts;
  const host = `${accountId}.r2.cloudflarestorage.com`;
  const region = 'auto';
  const service = 's3';
  const method = 'GET';
  const canonicalUri = `/${encodeURIComponent(bucketName)}`;
  const canonicalQuerystring = 'list-type=2&max-keys=1';
  const amzDate = new Date().toISOString().replace(/[:-]|\.\d{3}/g, '');
  const dateStamp = amzDate.slice(0, 8);
  const payloadHash = sha256Hex('');
  const canonicalHeaders =
    `host:${host}\n` + `x-amz-content-sha256:${payloadHash}\n` + `x-amz-date:${amzDate}\n`;
  const signedHeaders = 'host;x-amz-content-sha256;x-amz-date';
  const canonicalRequest = [
    method,
    canonicalUri,
    canonicalQuerystring,
    canonicalHeaders,
    signedHeaders,
    payloadHash,
  ].join('\n');
  const credentialScope = `${dateStamp}/${region}/${service}/aws4_request`;
  const stringToSign = ['AWS4-HMAC-SHA256', amzDate, credentialScope, sha256Hex(canonicalRequest)].join(
    '\n'
  );
  const kDate = hmac('AWS4' + secretAccessKey, dateStamp);
  const kRegion = hmac(kDate, region);
  const kService = hmac(kRegion, service);
  const kSigning = hmac(kService, 'aws4_request');
  const signature = createHmac('sha256', kSigning).update(stringToSign, 'utf8').digest('hex');
  const authorization =
    `AWS4-HMAC-SHA256 Credential=${accessKeyId}/${credentialScope}, ` +
    `SignedHeaders=${signedHeaders}, Signature=${signature}`;

  const url = `https://${host}${canonicalUri}?${canonicalQuerystring}`;
  const response = await fetch(url, {
    method,
    headers: {
      'x-amz-content-sha256': payloadHash,
      'x-amz-date': amzDate,
      Authorization: authorization,
    },
  });

  if (response.ok) {
    return { ok: true as const, status: response.status };
  }

  const text = (await response.text().catch(() => '')).slice(0, 400);
  return {
    ok: false as const,
    status: response.status,
    detail: text || response.statusText || 'R2 request failed',
  };
}

export default async function handler(req: VercelReq, res: VercelRes) {
  try {
    if (req.method === 'OPTIONS') {
      res.statusCode = 204;
      res.end();
      return;
    }
    if (req.method !== 'POST' && req.method !== 'GET') {
      return send(res, 405, { success: false, message: 'Method not allowed' });
    }

    const supabaseUrl = clean(process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL);
    const serviceKey = clean(process.env.SUPABASE_SERVICE_ROLE_KEY);
    const accountId = clean(process.env.R2_ACCOUNT_ID);
    const accessKeyId = clean(process.env.R2_ACCESS_KEY_ID);
    const secretAccessKey = clean(process.env.R2_SECRET_ACCESS_KEY);
    const bucketName = clean(process.env.R2_BUCKET_NAME) || 'datingappbucket';

    const present = {
      VITE_SUPABASE_URL: Boolean(supabaseUrl),
      SUPABASE_SERVICE_ROLE_KEY: Boolean(serviceKey),
      R2_ACCOUNT_ID: Boolean(accountId),
      R2_ACCESS_KEY_ID: Boolean(accessKeyId),
      R2_SECRET_ACCESS_KEY: Boolean(secretAccessKey),
      R2_BUCKET_NAME: Boolean(clean(process.env.R2_BUCKET_NAME)),
    };

    if (!supabaseUrl || !serviceKey) {
      return send(res, 503, {
        success: false,
        present,
        message:
          'Missing Supabase server env on this deployment (VITE_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY).',
      });
    }

    const token = bearer(req);
    if (!token) {
      return send(res, 401, { success: false, message: 'Missing Authorization Bearer token.' });
    }

    const admin = createClient(supabaseUrl, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: userData, error: userErr } = await admin.auth.getUser(token);
    if (userErr || !userData || !userData.user) {
      return send(res, 401, {
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

    const role = String((profile && profile.role) || '').toLowerCase();
    const email = String((profile && profile.email) || authUser.email || '').toLowerCase();
    const isAdmin =
      role === 'admin' || email === 'admin@livecall.app' || email === 'superadmin@minglecall.com';
    if (!isAdmin) {
      return send(res, 403, { success: false, message: 'Admin role required.' });
    }

    if (!accountId || !accessKeyId || !secretAccessKey) {
      return send(res, 503, {
        success: false,
        configured: false,
        present,
        message:
          'R2 env incomplete for this Production deployment. Confirm R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET_NAME exist for Production (not only Preview/Development), with no quotes, then Redeploy.',
      });
    }

    const started = Date.now();
    const probe = await r2ListObjectsProbe({
      accountId,
      accessKeyId,
      secretAccessKey,
      bucketName,
    });

    if (!probe.ok) {
      let message = `R2 returned HTTP ${probe.status}.`;
      if (probe.status === 404) {
        message = `Bucket not found for R2_BUCKET_NAME="${bucketName}". Create it in Cloudflare R2 or fix the env value.`;
      } else if (probe.status === 403) {
        message =
          'R2 authentication failed (403). Recreate the R2 API token and update R2_ACCESS_KEY_ID / R2_SECRET_ACCESS_KEY in Vercel Production env (no quotes), then Redeploy.';
      } else if (probe.detail) {
        message = `${message} ${probe.detail}`;
      }
      return send(res, 200, {
        success: false,
        configured: true,
        present,
        bucket: bucketName,
        httpStatus: probe.status,
        message,
      });
    }

    return send(res, 200, {
      success: true,
      configured: true,
      present,
      bucket: bucketName,
      latencyMs: Date.now() - started,
      message: `Cloudflare R2 bucket "${bucketName}" is reachable using Vercel environment credentials.`,
    });
  } catch (err: any) {
    console.error('[api/r2-test]', err);
    return send(res, 200, {
      success: false,
      message: (err && err.message) || 'R2 connectivity test failed',
      detail: String((err && err.name) || ''),
    });
  }
}
