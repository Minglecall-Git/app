/**
 * Dedicated Next.js R2 probe — minimal imports (avoids heavy boot failures on this route).
 * Uses SigV4 ListObjectsV2 against https://<ACCOUNT_ID>.r2.cloudflarestorage.com
 */
import { createHash, createHmac } from 'crypto';
import { NextRequest } from 'next/server';
import { createClient } from '@supabase/supabase-js';

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
  // Path-style: /bucket?list-type=2
  const canonicalUri = `/${bucketName}`;
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
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10_000);
  try {
    const response = await fetch(url, {
      method,
      headers: {
        'x-amz-content-sha256': payloadHash,
        'x-amz-date': amzDate,
        Authorization: authorization,
      },
      signal: controller.signal,
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
  } finally {
    clearTimeout(timer);
  }
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

    const accountId = clean(process.env.R2_ACCOUNT_ID);
    const accessKeyId = clean(process.env.R2_ACCESS_KEY_ID);
    const secretAccessKey = clean(process.env.R2_SECRET_ACCESS_KEY);
    const bucketName = clean(process.env.R2_BUCKET_NAME) || 'minglecall-bucket';
    const endpoint = accountId
      ? `https://${accountId}.r2.cloudflarestorage.com`
      : 'https://ACCOUNT_ID.r2.cloudflarestorage.com';

    const present = {
      R2_ACCOUNT_ID: Boolean(accountId),
      R2_ACCESS_KEY_ID: Boolean(accessKeyId),
      R2_SECRET_ACCESS_KEY: Boolean(secretAccessKey),
      R2_BUCKET_NAME: Boolean(clean(process.env.R2_BUCKET_NAME)),
    };

    if (!accountId || !accessKeyId || !secretAccessKey) {
      return json(503, {
        success: false,
        configured: false,
        present,
        endpoint,
        message:
          'R2 env incomplete. Set R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET_NAME in .env.local, then restart Next.js.',
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
          `R2 Access Denied (403) for bucket "${bucketName}". Keys are present but Cloudflare rejected them. ` +
          `In Cloudflare → R2 → Manage R2 API Tokens, create a new S3 API token with Object Read & Write on "${bucketName}", ` +
          `update R2_ACCESS_KEY_ID / R2_SECRET_ACCESS_KEY in .env.local, confirm R2_ACCOUNT_ID owns that bucket, restart Next.js.`;
      } else if (probe.detail) {
        message = `${message} ${probe.detail}`;
      }
      return json(200, {
        success: false,
        configured: true,
        present,
        bucket: bucketName,
        endpoint,
        httpStatus: probe.status,
        latencyMs: Date.now() - started,
        message,
        source: 'environment',
      });
    }

    return json(200, {
      success: true,
      configured: true,
      present,
      bucket: bucketName,
      endpoint,
      latencyMs: Date.now() - started,
      message: `Cloudflare R2 bucket "${bucketName}" is reachable.`,
      source: 'environment',
    });
  } catch (err: any) {
    console.error('[api/r2-test] fatal:', err);
    console.error(err?.stack || String(err));
    const aborted = err?.name === 'AbortError';
    return json(200, {
      success: false,
      message: aborted
        ? 'R2 probe timed out after 10s contacting Cloudflare.'
        : err?.message || 'R2 connectivity test failed',
      detail: String(err?.name || ''),
    });
  }
}

export const GET = handle;
export const POST = handle;
export const OPTIONS = handle;
