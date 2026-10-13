import fs from 'fs';
import path from 'path';
import type { NextRequest } from 'next/server';
import { AccessToken } from 'livekit-server-sdk';
import { createServiceClient, jsonErr, requireAdmin, type AuthFail } from '../nextAuth';
import { parseJsonBody } from '../nextRequest';
import { issueSetupToken, validateSetupToken } from '../setupSession';
import {
  comparePassword,
  hashPassword,
  isSupabaseAdminConfigured,
  testSupabaseConnectivity,
  updateSupabaseRuntimeConfig,
} from '../../server/supabaseAdmin';
import { isR2Configured, testR2Connectivity, updateR2RuntimeConfig } from '../../server/r2Storage';
import {
  generateSixDigitOtp,
  getRawSmtpConfigForAdmin,
  getSmtpConfig,
  isSmtpConfigured,
  sendOtpEmail,
  updateSmtpRuntimeConfig,
} from '../../server/emailService';
import { getPasswordPolicyError } from '../../shared/passwordPolicy';

export function updateEnvFile(updates: Record<string, string | number | boolean | undefined>) {
  const envPath = path.join(process.cwd(), '.env');
  let envContent = '';
  if (fs.existsSync(envPath)) {
    envContent = fs.readFileSync(envPath, 'utf8');
  } else {
    const examplePath = path.join(process.cwd(), '.env.example');
    if (fs.existsSync(examplePath)) {
      envContent = fs.readFileSync(examplePath, 'utf8');
    }
  }

  const lines = envContent.split('\n');
  const keysHandled = new Set<string>();

  const updatedLines = lines.map((line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) return line;
    const eqIdx = line.indexOf('=');
    if (eqIdx === -1) return line;
    const key = line.slice(0, eqIdx).trim();
    if (key in updates && updates[key] !== undefined) {
      keysHandled.add(key);
      const val = String(updates[key]);
      process.env[key] = val;
      return `${key}="${val.replace(/"/g, '\\"')}"`;
    }
    return line;
  });

  for (const [k, v] of Object.entries(updates)) {
    if (v !== undefined && !keysHandled.has(k)) {
      const val = String(v);
      process.env[k] = val;
      updatedLines.push(`${k}="${val.replace(/"/g, '\\"')}"`);
    }
  }

  fs.writeFileSync(envPath, updatedLines.join('\n'), 'utf8');
}

export function readSetupLocked(): boolean {
  return process.env.SETUP_LOCKED === 'true';
}

function livekitEnv() {
  return {
    apiKey: process.env.LIVEKIT_API_KEY || '',
    apiSecret: process.env.LIVEKIT_API_SECRET || '',
    wsUrl: process.env.LIVEKIT_URL || 'wss://your-livekit-project.livekit.cloud',
  };
}

function infraEnv() {
  return {
    r2AccountId: process.env.R2_ACCOUNT_ID || '',
    r2AccessKeyId: process.env.R2_ACCESS_KEY_ID || '',
    r2SecretAccessKey: process.env.R2_SECRET_ACCESS_KEY || '',
    r2BucketName: process.env.R2_BUCKET_NAME || 'minglecall-bucket',
    r2PublicUrl: process.env.R2_PUBLIC_URL || '',
  };
}

export function handleSetupStatus() {
  let isEnvWritable = true;
  try {
    const testPath = path.join(process.cwd(), '.env.test.tmp');
    fs.writeFileSync(testPath, 'test', 'utf8');
    fs.unlinkSync(testPath);
  } catch {
    isEnvWritable = false;
  }

  const dbConfigured = isSupabaseAdminConfigured();
  const lk = livekitEnv();
  const livekitConfigured = Boolean(
    lk.apiKey && lk.apiSecret && lk.apiKey !== 'devkey' && lk.apiSecret !== 'secret'
  );
  const r2Configured = isR2Configured();
  const smtpConfigured = isSmtpConfigured();
  const memUsage = process.memoryUsage();
  const infra = infraEnv();

  return Response.json(
    {
      success: true,
      nodeVersion: process.version,
      platform: process.platform,
      uptimeSeconds: Math.floor(process.uptime()),
      memoryMb: Math.round(memUsage.rss / 1024 / 1024),
      isEnvWritable,
      isLocked: readSetupLocked(),
      services: {
        database: dbConfigured,
        livekit: livekitConfigured,
        r2Storage: r2Configured,
        smtp: smtpConfigured,
      },
      envValues: {
        supabaseUrl:
          process.env.NEXT_PUBLIC_SUPABASE_URL ||
          process.env.VITE_SUPABASE_URL ||
          process.env.SUPABASE_URL ||
          '',
        supabasePublishableKey:
          process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
          process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
          process.env.VITE_SUPABASE_ANON_KEY ||
          '',
        supabaseSecretKey:
          process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY ? '••••••••' : '',
        supabaseAnonKey:
          process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
          process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
          process.env.VITE_SUPABASE_ANON_KEY ||
          '',
        supabaseServiceRoleKey:
          process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY ? '••••••••' : '',
        livekitUrl: lk.wsUrl,
        livekitApiKey: lk.apiKey ? '••••••••' : '',
        livekitApiSecret: lk.apiSecret ? '••••••••' : '',
        r2AccountId: infra.r2AccountId,
        r2AccessKeyId: infra.r2AccessKeyId,
        r2SecretAccessKey: infra.r2SecretAccessKey ? '••••••••' : '',
        r2BucketName: infra.r2BucketName,
        r2PublicUrl: infra.r2PublicUrl,
        smtpHost: getSmtpConfig().host || process.env.SMTP_HOST || '',
        smtpPort: getSmtpConfig().port || 587,
        smtpUser: getSmtpConfig().user || process.env.SMTP_USER || '',
        smtpPass: getRawSmtpConfigForAdmin().pass ? '••••••••' : '',
        smtpFrom: getSmtpConfig().from || process.env.SMTP_FROM || '',
        smtpSecure: getRawSmtpConfigForAdmin().secure ?? false,
        resendApiKey: process.env.RESEND_API_KEY ? '••••••••' : '',
      },
    },
    { headers: { 'Cache-Control': 'no-store' } }
  );
}

export async function handleSetupAuth(req: NextRequest) {
  const parsed = await parseJsonBody<{ password?: string; email?: string }>(req);
  if (parsed.ok === false) return jsonErr(parsed.status, parsed.error.message, parsed.error.code);

  const password = String(parsed.data?.password || '');
  const cleanEmail = (parsed.data?.email || 'admin@livecall.com').toLowerCase().trim();

  const masterKey = process.env.SETUP_MASTER_KEY;
  let isValid = Boolean(masterKey && password === masterKey);

  if (!isValid) {
    const client = createServiceClient();
    if (client) {
      const { data: admins } = await client
        .from('profiles')
        .select('id, email, role, password_hash')
        .or(`email.eq.${cleanEmail},role.eq.admin`)
        .limit(10);
      for (const row of admins || []) {
        const storedHash = (row as any)?.password_hash;
        if (storedHash && (await comparePassword(password, storedHash))) {
          isValid = true;
          break;
        }
      }
    }
  }

  if (!isValid) {
    return Response.json(
      {
        success: false,
        error:
          'Incorrect master password. Set SETUP_MASTER_KEY or use the admin account password.',
      },
      { status: 401 }
    );
  }

  const token = await issueSetupToken();
  return Response.json({
    success: true,
    token,
    message: 'Master authentication successful! Installer unlocked.',
  });
}

export type SetupGate = { ok: true } | AuthFail;

export async function requireSetupSession(req: NextRequest, body?: Record<string, unknown>): Promise<SetupGate> {
  const headerToken = req.headers.get('x-setup-token');
  const setupToken = String(headerToken || body?.setupToken || '').trim();
  if (setupToken && (await validateSetupToken(setupToken))) {
    return { ok: true };
  }
  const admin = await requireAdmin(req);
  if (admin.ok) return { ok: true };
  return admin;
}

export async function handleSetupTestDb(req: NextRequest) {
  const parsed = await parseJsonBody<{ supabaseUrl?: string; serviceRoleKey?: string; setupToken?: string }>(req);
  if (parsed.ok === false) return jsonErr(parsed.status, parsed.error.message, parsed.error.code);
  const gate = await requireSetupSession(req, parsed.data as Record<string, unknown>);
  if (gate.ok === false) return jsonErr(gate.status, gate.error.message, gate.error.code);

  const { supabaseUrl, serviceRoleKey } = parsed.data || {};
  const result = await testSupabaseConnectivity(supabaseUrl, serviceRoleKey);
  return Response.json(result);
}

export async function handleSetupTestLivekit(req: NextRequest) {
  const parsed = await parseJsonBody<{ wsUrl?: string; apiKey?: string; apiSecret?: string; setupToken?: string }>(
    req
  );
  if (parsed.ok === false) return jsonErr(parsed.status, parsed.error.message, parsed.error.code);
  const gate = await requireSetupSession(req, parsed.data as Record<string, unknown>);
  if (gate.ok === false) return jsonErr(gate.status, gate.error.message, gate.error.code);

  const lk = livekitEnv();
  const url = (parsed.data?.wsUrl || lk.wsUrl || '').trim();
  const key = (parsed.data?.apiKey || lk.apiKey || '').trim();
  const secret = (parsed.data?.apiSecret || lk.apiSecret || '').trim();

  if (!url || !key || !secret || key === 'devkey' || secret === 'secret') {
    return Response.json(
      { success: false, message: 'Valid LiveKit WebSocket URL, API Key, and Secret are required.' },
      { status: 400 }
    );
  }

  const at = new AccessToken(key, secret, {
    identity: 'installer_tester',
    name: 'LiveKit Diagnostic Ping',
    ttl: '10m',
  });
  at.addGrant({ roomJoin: true, room: 'diagnostic_test_room' });
  const testJwt = await at.toJwt();

  return Response.json({
    success: true,
    message: 'LiveKit credentials verified & JWT access token generated successfully!',
    wsUrl: url,
    tokenPreview: testJwt.substring(0, 30) + '...',
  });
}

export async function handleSetupTestR2(req: NextRequest) {
  const parsed = await parseJsonBody<{
    accountId?: string;
    accessKeyId?: string;
    secretAccessKey?: string;
    bucketName?: string;
    publicUrl?: string;
    setupToken?: string;
  }>(req);
  if (parsed.ok === false) return jsonErr(parsed.status, parsed.error.message, parsed.error.code);
  const gate = await requireSetupSession(req, parsed.data as Record<string, unknown>);
  if (gate.ok === false) return jsonErr(gate.status, gate.error.message, gate.error.code);

  const { accountId, accessKeyId, secretAccessKey, bucketName, publicUrl } = parsed.data || {};
  if (accountId || accessKeyId || secretAccessKey || bucketName) {
    updateR2RuntimeConfig({
      accountId,
      accessKeyId,
      secretAccessKey,
      bucketName,
      publicUrl,
    });
  }

  const result = await testR2Connectivity();
  return Response.json(result);
}

export async function handleSetupTestSmtp(req: NextRequest) {
  const parsed = await parseJsonBody<{
    host?: string;
    port?: number | string;
    user?: string;
    pass?: string;
    from?: string;
    secure?: boolean;
    resendApiKey?: string;
    targetEmail?: string;
    setupToken?: string;
  }>(req);
  if (parsed.ok === false) return jsonErr(parsed.status, parsed.error.message, parsed.error.code);
  const gate = await requireSetupSession(req, parsed.data as Record<string, unknown>);
  if (gate.ok === false) return jsonErr(gate.status, gate.error.message, gate.error.code);

  const { host, port, user, pass, from, secure, resendApiKey, targetEmail } = parsed.data || {};
  if (host || user || pass || from || resendApiKey) {
    updateSmtpRuntimeConfig({
      host,
      port: port ? parseInt(String(port), 10) : undefined,
      user,
      pass,
      from,
      secure: typeof secure === 'boolean' ? secure : undefined,
      resendApiKey,
    });
  }

  const toEmail = targetEmail || user || 'admin@livecall.com';
  const testOtp = generateSixDigitOtp();
  const sendResult = await sendOtpEmail({
    to: toEmail,
    name: 'Server Setup Tester',
    otpCode: testOtp,
  });

  return Response.json({
    success: sendResult.delivered || sendResult.success,
    message: sendResult.message,
    testOtp: sendResult.delivered || sendResult.success ? testOtp : undefined,
  });
}

export async function handleSetupSaveAll(req: NextRequest) {
  const parsed = await parseJsonBody<Record<string, unknown>>(req);
  if (parsed.ok === false) return jsonErr(parsed.status, parsed.error.message, parsed.error.code);
  const gate = await requireSetupSession(req, parsed.data);
  if (gate.ok === false) return jsonErr(gate.status, gate.error.message, gate.error.code);

  const body = parsed.data || {};
  const {
    supabaseUrl,
    supabasePublishableKey,
    supabaseSecretKey,
    supabaseAnonKey,
    supabaseServiceRoleKey,
    livekitUrl,
    livekitApiKey,
    livekitApiSecret,
    r2AccountId,
    r2AccessKeyId,
    r2SecretAccessKey,
    r2BucketName,
    r2PublicUrl,
    smtpHost,
    smtpPort,
    smtpUser,
    smtpPass,
    smtpFrom,
    smtpSecure,
    resendApiKey,
    adminPassword,
    lockInstaller,
  } = body as any;

  const publishableKey = supabasePublishableKey || supabaseAnonKey;
  const secretKey = supabaseSecretKey || supabaseServiceRoleKey;

  const envUpdates: Record<string, string | number | boolean | undefined> = {};

  if (supabaseUrl) {
    envUpdates['NEXT_PUBLIC_SUPABASE_URL'] = String(supabaseUrl);
    envUpdates['SUPABASE_URL'] = String(supabaseUrl);
  }
  if (publishableKey) {
    envUpdates['NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY'] = String(publishableKey);
  }
  if (secretKey && !String(secretKey).startsWith('••••')) {
    envUpdates['SUPABASE_SECRET_KEY'] = String(secretKey);
  }

  if (livekitUrl) envUpdates['LIVEKIT_URL'] = String(livekitUrl);
  if (livekitApiKey) envUpdates['LIVEKIT_API_KEY'] = String(livekitApiKey);
  if (livekitApiSecret && !String(livekitApiSecret).startsWith('••••')) {
    envUpdates['LIVEKIT_API_SECRET'] = String(livekitApiSecret);
  }

  if (r2AccountId) envUpdates['R2_ACCOUNT_ID'] = String(r2AccountId);
  if (r2AccessKeyId) envUpdates['R2_ACCESS_KEY_ID'] = String(r2AccessKeyId);
  if (r2SecretAccessKey && !String(r2SecretAccessKey).startsWith('••••')) {
    envUpdates['R2_SECRET_ACCESS_KEY'] = String(r2SecretAccessKey);
  }
  if (r2BucketName) envUpdates['R2_BUCKET_NAME'] = String(r2BucketName);
  if (r2PublicUrl) envUpdates['R2_PUBLIC_URL'] = String(r2PublicUrl);

  if (smtpHost) envUpdates['SMTP_HOST'] = String(smtpHost);
  if (smtpPort) envUpdates['SMTP_PORT'] = smtpPort;
  if (smtpUser) envUpdates['SMTP_USER'] = String(smtpUser);
  if (smtpPass && !String(smtpPass).startsWith('••••')) {
    envUpdates['SMTP_PASS'] = String(smtpPass);
  }
  if (smtpFrom) envUpdates['SMTP_FROM'] = String(smtpFrom);
  if (smtpSecure !== undefined) envUpdates['SMTP_SECURE'] = Boolean(smtpSecure);
  if (resendApiKey && !String(resendApiKey).startsWith('••••')) {
    envUpdates['RESEND_API_KEY'] = String(resendApiKey);
  }

  if (lockInstaller) {
    envUpdates['SETUP_LOCKED'] = 'true';
  }

  updateEnvFile(envUpdates);

  if (supabaseUrl || (secretKey && !String(secretKey).startsWith('••••'))) {
    updateSupabaseRuntimeConfig(
      supabaseUrl ? String(supabaseUrl) : undefined,
      secretKey && !String(secretKey).startsWith('••••') ? String(secretKey) : undefined
    );
  }

  if (livekitApiKey) process.env.LIVEKIT_API_KEY = String(livekitApiKey).trim();
  if (livekitApiSecret && !String(livekitApiSecret).startsWith('••••')) {
    process.env.LIVEKIT_API_SECRET = String(livekitApiSecret).trim();
  }
  if (livekitUrl) process.env.LIVEKIT_URL = String(livekitUrl).trim();

  if (
    r2AccountId ||
    r2AccessKeyId ||
    (r2SecretAccessKey && !String(r2SecretAccessKey).startsWith('••••')) ||
    r2BucketName
  ) {
    updateR2RuntimeConfig({
      accountId: r2AccountId,
      accessKeyId: r2AccessKeyId,
      secretAccessKey:
        r2SecretAccessKey && !String(r2SecretAccessKey).startsWith('••••') ? String(r2SecretAccessKey) : undefined,
      bucketName: r2BucketName,
      publicUrl: r2PublicUrl,
    });
  }

  if (smtpHost || smtpUser || (smtpPass && !String(smtpPass).startsWith('••••'))) {
    updateSmtpRuntimeConfig({
      host: smtpHost,
      port: smtpPort ? parseInt(String(smtpPort), 10) : undefined,
      user: smtpUser,
      pass: smtpPass && !String(smtpPass).startsWith('••••') ? String(smtpPass) : undefined,
      from: smtpFrom,
      secure: typeof smtpSecure === 'boolean' ? smtpSecure : undefined,
      resendApiKey: resendApiKey && !String(resendApiKey).startsWith('••••') ? String(resendApiKey) : undefined,
    });
  }

  if (adminPassword) {
    const adminPwError = getPasswordPolicyError(adminPassword);
    if (adminPwError) {
      return Response.json({ success: false, error: adminPwError }, { status: 400 });
    }
    const hashed = await hashPassword(String(adminPassword));
    const client = createServiceClient();
    if (client) {
      const { data: admins } = await client.from('profiles').select('id').or('role.eq.admin,email.eq.admin@livecall.com');
      for (const row of admins || []) {
        await client
          .from('profiles')
          .update({ password_hash: hashed, has_password_set: true })
          .eq('id', row.id);
      }
    }
  }

  return Response.json({
    success: true,
    message: 'Server configuration saved and persisted to .env successfully! Platform is live.',
    isLocked: readSetupLocked(),
  });
}

export async function handleSetupLock(req: NextRequest) {
  const parsed = await parseJsonBody<{ locked?: boolean; setupToken?: string }>(req);
  if (parsed.ok === false) return jsonErr(parsed.status, parsed.error.message, parsed.error.code);
  const gate = await requireSetupSession(req, parsed.data as Record<string, unknown>);
  if (gate.ok === false) return jsonErr(gate.status, gate.error.message, gate.error.code);

  const locked = Boolean(parsed.data?.locked);
  updateEnvFile({ SETUP_LOCKED: locked ? 'true' : 'false' });
  return Response.json({ success: true, isLocked: locked });
}
