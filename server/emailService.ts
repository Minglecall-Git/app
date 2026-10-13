import nodemailer from 'nodemailer';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import {
  DEFAULT_EMAIL_TEMPLATES,
  parseEmailTemplatesJson,
  renderEmailTemplate,
  type EmailTemplateKey,
} from '../shared/emailTemplates';
import { getSupabaseAdmin } from './supabaseAdmin';

function hashOtp(code: string) {
  return crypto.createHash('sha256').update(String(code).trim()).digest('hex');
}

interface StoredOtp {
  code: string;
  email: string;
  name?: string;
  role?: string;
  expiresAt: number;
  attempts: number;
}

export interface SmtpRuntimeConfig {
  host?: string;
  port?: number;
  user?: string;
  pass?: string;
  from?: string;
  secure?: boolean;
  resendApiKey?: string;
  showOtpInForm?: boolean;
}

const CONFIG_FILE_PATH = path.join(process.cwd(), 'server', 'smtp_config.json');

function loadPersistedSmtpConfig(): SmtpRuntimeConfig {
  try {
    if (fs.existsSync(CONFIG_FILE_PATH)) {
      const data = fs.readFileSync(CONFIG_FILE_PATH, 'utf-8');
      const parsed = JSON.parse(data);
      console.log('[Email Service] Loaded persisted SMTP configuration from disk.');
      return {
        showOtpInForm: false,
        ...parsed,
      };
    }
  } catch (err) {
    console.warn('[Email Service] Failed to load persisted SMTP config:', err);
  }
  return {
    showOtpInForm: false,
  };
}

function savePersistedSmtpConfig(config: SmtpRuntimeConfig): void {
  try {
    const dir = path.dirname(CONFIG_FILE_PATH);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(CONFIG_FILE_PATH, JSON.stringify(config, null, 2), 'utf-8');
    console.log('[Email Service] Successfully persisted SMTP configuration to disk.');
  } catch (err) {
    console.warn('[Email Service] Failed to persist SMTP config to disk:', err);
  }
}

const otpStore = new Map<string, StoredOtp>();
let runtimeSmtpConfig: SmtpRuntimeConfig = loadPersistedSmtpConfig();

export function updateSmtpRuntimeConfig(config: Partial<SmtpRuntimeConfig>): void {
  runtimeSmtpConfig = { ...runtimeSmtpConfig, ...config };
  savePersistedSmtpConfig(runtimeSmtpConfig);
}

export function getShowOtpInForm(): boolean {
  return runtimeSmtpConfig.showOtpInForm ?? true;
}

export function getRawSmtpConfigForAdmin(): SmtpRuntimeConfig & { configured: boolean } {
  return {
    host: runtimeSmtpConfig.host || process.env.SMTP_HOST || '',
    port: runtimeSmtpConfig.port || (process.env.SMTP_PORT ? parseInt(process.env.SMTP_PORT, 10) : 587),
    user: runtimeSmtpConfig.user || process.env.SMTP_USER || '',
    pass: runtimeSmtpConfig.pass || process.env.SMTP_PASS || '',
    from: runtimeSmtpConfig.from || process.env.SMTP_FROM || '',
    secure: runtimeSmtpConfig.secure || false,
    resendApiKey: runtimeSmtpConfig.resendApiKey || process.env.RESEND_API_KEY || '',
    showOtpInForm: runtimeSmtpConfig.showOtpInForm ?? true,
    configured: isSmtpConfigured(),
  };
}

export function getSmtpConfig(): {
  host?: string;
  port?: number;
  user?: string;
  from?: string;
  configured: boolean;
  showOtpInForm: boolean;
} {
  const host = runtimeSmtpConfig.host || process.env.SMTP_HOST;
  const user = runtimeSmtpConfig.user || process.env.SMTP_USER;
  const configured = isSmtpConfigured();
  return {
    host: host || '',
    port: runtimeSmtpConfig.port || parseInt(process.env.SMTP_PORT || '587', 10),
    user: user ? user.replace(/(.{2})(.*)(@.*)/, '$1***$3') : '',
    from: runtimeSmtpConfig.from || process.env.SMTP_FROM || '',
    configured,
    showOtpInForm: runtimeSmtpConfig.showOtpInForm ?? false,
  };
}

// Helper to generate 6-digit numeric OTP
export function generateSixDigitOtp(): string {
  const digits = Math.floor(100000 + Math.random() * 900000);
  return digits.toString();
}

// Store OTP with 10-minute expiry (memory + durable DB when Supabase is configured)
export function saveOtp(email: string, code: string, metadata?: { name?: string; role?: string }): void {
  const cleanEmail = email.trim().toLowerCase();
  otpStore.set(cleanEmail, {
    code: hashOtp(code),
    email: cleanEmail,
    name: metadata?.name,
    role: metadata?.role,
    expiresAt: Date.now() + 10 * 60 * 1000, // 10 minutes
    attempts: 0,
  });
  // Fire-and-forget durable write for Vercel / multi-instance
  void (async () => {
    try {
      const { getSupabaseAdmin, isSupabaseAdminConfigured } = await import('./supabaseAdmin');
      if (!isSupabaseAdminConfigured()) return;
      const client = getSupabaseAdmin();
      if (!client) return;
      const { saveOtpDb } = await import('../api/_lib/otpDb');
      await saveOtpDb(client, cleanEmail, code, metadata);
    } catch (e: any) {
      console.warn('[Email Service] auth_otps persist notice:', e?.message || e);
    }
  })();
}

// Verify OTP - Strictly matching the 6-digit OTP code sent to user email
export function verifyStoredOtp(email: string, inputCode: string): { success: boolean; error?: string; metadata?: any } {
  const cleanEmail = email.trim().toLowerCase();
  const stored = otpStore.get(cleanEmail);

  if (stored) {
    if (Date.now() > stored.expiresAt) {
      otpStore.delete(cleanEmail);
    } else if (stored.attempts >= 5) {
      otpStore.delete(cleanEmail);
      return { success: false, error: 'Too many incorrect attempts. Please request a fresh verification code.' };
    } else {
      stored.attempts += 1;
      if (stored.code === hashOtp(inputCode)) {
        otpStore.delete(cleanEmail);
        return {
          success: true,
          metadata: {
            email: stored.email,
            name: stored.name,
            role: stored.role,
          },
        };
      }
      return { success: false, error: `Invalid verification code. ${5 - stored.attempts} attempt(s) remaining.` };
    }
  }

  // Memory miss — caller should use verifyStoredOtpAsync for DB on Vercel
  return { success: false, error: 'No active verification code found for this email. Please request a new code.' };
}

/** Async verify: memory first, then auth_otps table (required on Vercel). */
export async function verifyStoredOtpAsync(
  email: string,
  inputCode: string
): Promise<{ success: boolean; error?: string; metadata?: any }> {
  const mem = verifyStoredOtp(email, inputCode);
  if (mem.success) return mem;
  // If memory said invalid code (not "no active"), keep that
  if (mem.error && !/No active verification code/i.test(mem.error) && !/expired/i.test(mem.error || '')) {
    // attempts remaining style — only skip DB if we had a memory entry that failed match
    // (verifyStoredOtp already deleted expired). Re-check DB when "No active".
  }
  if (mem.error && /No active verification code|expired/i.test(mem.error)) {
    try {
      const { getSupabaseAdmin, isSupabaseAdminConfigured } = await import('./supabaseAdmin');
      if (!isSupabaseAdminConfigured()) return mem;
      const client = getSupabaseAdmin();
      if (!client) return mem;
      const { verifyOtpDb } = await import('../api/_lib/otpDb');
      return await verifyOtpDb(client, email, inputCode);
    } catch (e: any) {
      return { success: false, error: e?.message || mem.error };
    }
  }
  // Memory had wrong code — also try DB in case another instance stored it
  try {
    const { getSupabaseAdmin, isSupabaseAdminConfigured } = await import('./supabaseAdmin');
    if (!isSupabaseAdminConfigured()) return mem;
    const client = getSupabaseAdmin();
    if (!client) return mem;
    const { verifyOtpDb } = await import('../api/_lib/otpDb');
    const db = await verifyOtpDb(client, email, inputCode);
    if (db.success) return db;
  } catch {
    // ignore
  }
  return mem;
}

// Check if SMTP is configured in environment or runtime
export function isSmtpConfigured(): boolean {
  const hasEnvSmtp = Boolean(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS);
  const hasRuntimeSmtp = Boolean(runtimeSmtpConfig.host && runtimeSmtpConfig.user && runtimeSmtpConfig.pass);
  const hasResend = Boolean(process.env.RESEND_API_KEY || runtimeSmtpConfig.resendApiKey);
  return hasEnvSmtp || hasRuntimeSmtp || hasResend;
}

async function loadEmailTemplatesFromDb() {
  try {
    const client = getSupabaseAdmin();
    if (!client) return DEFAULT_EMAIL_TEMPLATES;
    const { data } = await client
      .from('system_configs')
      .select('email_templates_json')
      .eq('id', 'default')
      .maybeSingle();
    return parseEmailTemplatesJson((data as any)?.email_templates_json);
  } catch (e: any) {
    console.warn('[Email Service] load templates notice:', e?.message || e);
    return DEFAULT_EMAIL_TEMPLATES;
  }
}

// Send Email containing BOTH 6-digit OTP code and Confirmation Link
export async function sendOtpEmail(params: {
  to: string;
  name?: string;
  otpCode: string;
  confirmationUrl?: string;
  templateKey?: EmailTemplateKey;
}): Promise<{ success: boolean; delivered: boolean; message: string; otpCode?: string }> {
  const { to, name = 'User', otpCode, confirmationUrl, templateKey = 'otp_register' } = params;
  const cleanTo = to.trim().toLowerCase();

  // Save in server store
  saveOtp(cleanTo, otpCode, { name });

  const appUrl = (process.env.APP_URL || '').trim() || `http://localhost:${process.env.PORT || 3000}`;
  const directLink = confirmationUrl || `${appUrl}/?auth_verify=1&email=${encodeURIComponent(cleanTo)}&code=${otpCode}`;

  const templates = await loadEmailTemplatesFromDb();
  const tpl = templates[templateKey] || templates.otp_register;
  const rendered = renderEmailTemplate(tpl, {
    name,
    otp: otpCode,
    email: cleanTo,
    link: directLink,
  });
  const htmlContent = rendered.html;
  const emailSubject = rendered.subject;

  const resendKey = runtimeSmtpConfig.resendApiKey || process.env.RESEND_API_KEY;
  const smtpHost = runtimeSmtpConfig.host || process.env.SMTP_HOST;
  const smtpUser = runtimeSmtpConfig.user || process.env.SMTP_USER;
  const smtpPass = runtimeSmtpConfig.pass || process.env.SMTP_PASS;
  
  // 1. Try Resend API first if explicit API key is configured
  if (resendKey) {
    let resendSender = runtimeSmtpConfig.from || process.env.SMTP_FROM || 'MingleCall <noreply@minglecall.com>';
    const lowerFrom = resendSender.toLowerCase();
    if (
      lowerFrom.includes('livecallvip.com') ||
      lowerFrom.includes('livecall-app.com') ||
      lowerFrom.includes('livecall.app')
    ) {
      resendSender = 'MingleCall <noreply@minglecall.com>';
    }

    try {
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${resendKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: resendSender,
          to: [cleanTo],
          subject: emailSubject,
          html: htmlContent,
        }),
      });

      const resData = await res.json().catch(() => ({}));
      if (res.ok) {
        console.log(`[Email Service] Dispatched OTP via Resend API to ${cleanTo}`);
        return {
          success: true,
          delivered: true,
          message: `Verification code sent to ${cleanTo}`,
        };
      }

      // Check if Resend Sandbox recipient restriction
      const errMsg = (resData?.message || '').toLowerCase();
      if (errMsg.includes('only send testing emails to your own email') || errMsg.includes('verify a domain')) {
        console.warn(`[Email Service] Resend Sandbox Notice: Delivery to ${cleanTo} restricted. Resend requires custom domain verification to send to external recipients.`);
        return {
          success: true,
          delivered: false,
          message: `Resend Sandbox Mode: Direct email delivery is restricted to your Resend account owner email. Verify a domain at resend.com/domains to send to any recipient. The 6-digit OTP code is ready on-screen.`,
          otpCode,
        };
      }

      // If unverified domain for sender, retry with onboarding@resend.dev
      if (errMsg.includes('not verified') || errMsg.includes('domain')) {
        console.log(`[Email Service] Retrying Resend with official onboarding@resend.dev sender...`);
        const retryRes = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${resendKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            from: 'LiveCall <onboarding@resend.dev>',
            to: [cleanTo],
            subject: emailSubject,
            html: htmlContent,
          }),
        });

        const retryData = await retryRes.json().catch(() => ({}));
        if (retryRes.ok) {
          console.log(`[Email Service] Resend fallback dispatch succeeded to ${cleanTo}`);
          return {
            success: true,
            delivered: true,
            message: `Verification code sent to ${cleanTo} (via onboarding@resend.dev)`,
          };
        } else if ((retryData?.message || '').toLowerCase().includes('only send testing emails')) {
          console.warn(`[Email Service] Resend Sandbox Notice: Delivery to ${cleanTo} restricted.`);
          return {
            success: true,
            delivered: false,
            message: `Resend Sandbox Mode: Delivery restricted to Resend account owner. Verify a domain at resend.com/domains to send to all recipients.`,
            otpCode,
          };
        }
      }
    } catch (e) {
      console.warn('[Email Service] Resend dispatch notice:', e);
    }
  }

  // 2. Try SMTP via Nodemailer with Intelligent Port/TLS Auto-Correction & Fallback
  if (smtpHost && smtpUser && smtpPass) {
    const rawPort = runtimeSmtpConfig.port || parseInt(process.env.SMTP_PORT || '587', 10);
    
    // Auto-detect optimal secure setting based on port
    const initialSecure = rawPort === 465;
    const initialPort = rawPort;

    // Sender resolution
    let senderAddress = runtimeSmtpConfig.from || process.env.SMTP_FROM || `"LiveCall" <${smtpUser}>`;
    if (smtpHost.includes('resend.com') && (senderAddress.includes('livecallvip.com') || senderAddress.includes('livecall-app.com'))) {
      senderAddress = `"LiveCall" <onboarding@resend.dev>`;
    }

    // Array of transport strategies to attempt
    const strategies = [
      { port: initialPort, secure: initialSecure, desc: `Port ${initialPort} (${initialSecure ? 'SSL/TLS' : 'STARTTLS'})` },
      { 
        port: initialPort === 465 ? 587 : 465, 
        secure: initialPort !== 465, 
        desc: `Port ${initialPort === 465 ? 587 : 465} (${initialPort !== 465 ? 'SSL/TLS' : 'STARTTLS'})` 
      },
    ];

    let lastSmtpError: any = null;

    for (let i = 0; i < strategies.length; i++) {
      const strategy = strategies[i];
      try {
        console.log(`[Email Service] Attempting SMTP dispatch via ${smtpHost}:${strategy.port} (${strategy.secure ? 'secure' : 'starttls'})...`);
        
        const transporter = nodemailer.createTransport({
          host: smtpHost,
          port: strategy.port,
          secure: strategy.secure,
          auth: {
            user: smtpUser,
            pass: smtpPass,
          },
          connectionTimeout: 8000,
          greetingTimeout: 8000,
          socketTimeout: 12000,
          tls: {
            rejectUnauthorized: false,
          },
        });

        await transporter.sendMail({
          from: senderAddress,
          to: cleanTo,
          subject: emailSubject,
          html: htmlContent,
        });

        console.log(`[Email Service] Dispatched OTP via SMTP (${smtpHost}:${strategy.port}) to ${cleanTo}`);
        return {
          success: true,
          delivered: true,
          message: `Verification email sent with 6-digit OTP code to ${cleanTo}`,
        };
      } catch (smtpErr: any) {
        lastSmtpError = smtpErr;
        const errLower = (smtpErr.message || '').toLowerCase();

        // Check if Resend Sandbox restriction (550: You can only send testing emails to your own email address)
        if (errLower.includes('only send testing emails') || (errLower.includes('550') && errLower.includes('resend.com/domains'))) {
          console.warn(`[Email Service] Resend Sandbox Notice (550): Delivery to ${cleanTo} requires a verified domain at resend.com/domains.`);
          return {
            success: true,
            delivered: false,
            message: `Resend Sandbox Mode: Free accounts can only deliver to the account owner email address. Verify your domain at resend.com/domains to send to all users. Verification code is ready on-screen.`,
            otpCode,
          };
        }

        console.warn(`[Email Service] SMTP attempt ${i + 1} (${strategy.desc}) failed:`, smtpErr.message);

        // If generic unverified sender error, try one sender fallback
        if (smtpErr.message?.includes('550') || errLower.includes('not verified')) {
          try {
            const fallbackSender = smtpHost.includes('resend.com')
              ? `"LiveCall" <onboarding@resend.dev>`
              : `"LiveCall" <${smtpUser}>`;
            
            console.log(`[Email Service] Retrying with fallback sender: ${fallbackSender}`);
            const retryTransporter = nodemailer.createTransport({
              host: smtpHost,
              port: strategy.port,
              secure: strategy.secure,
              auth: { user: smtpUser, pass: smtpPass },
              connectionTimeout: 8000,
              greetingTimeout: 8000,
              socketTimeout: 12000,
              tls: { rejectUnauthorized: false },
            });

            await retryTransporter.sendMail({
              from: fallbackSender,
              to: cleanTo,
              subject: emailSubject,
              html: htmlContent,
            });

            console.log(`[Email Service] SMTP recovery dispatch succeeded to ${cleanTo}`);
            return {
              success: true,
              delivered: true,
              message: `Verification email sent to ${cleanTo}`,
            };
          } catch (retryErr: any) {
            lastSmtpError = retryErr;
            if ((retryErr.message || '').toLowerCase().includes('only send testing emails')) {
              console.warn(`[Email Service] Resend Sandbox Notice: Recipient ${cleanTo} is not the account owner.`);
              return {
                success: true,
                delivered: false,
                message: `Resend Sandbox Mode: Verify a domain at resend.com/domains to deliver to all emails. Verification code is available on-screen.`,
                otpCode,
              };
            }
          }
        }

        // If authentication error (535), don't keep cycling ports
        if (smtpErr.code === 'EAUTH' || smtpErr.responseCode === 535 || smtpErr.message?.includes('535')) {
          console.warn('[Email Service] SMTP authentication failed (535).');
          break;
        }
      }
    }

    // Format descriptive error message for admin/user
    let errorHelp = lastSmtpError?.message || 'SMTP Connection failed';
    if (lastSmtpError?.message?.includes('Greeting never received') || lastSmtpError?.code === 'ETIMEDOUT') {
      errorHelp = `SMTP Timeout (${smtpHost}). Ensure port 465 (SSL) or 587 (STARTTLS) is reachable and your email provider allows outbound SMTP connections.`;
    } else if (lastSmtpError?.code === 'EAUTH' || lastSmtpError?.responseCode === 535) {
      errorHelp = `SMTP Authentication failed (535). For Yahoo or Gmail, please use a generated App Password instead of your regular account password.`;
    } else if (lastSmtpError?.message?.toLowerCase().includes('only send testing emails')) {
      errorHelp = `Resend Sandbox Mode: Free accounts can only deliver emails to the account owner. Verify a custom domain at resend.com/domains to send to any recipient.`;
    }

    return {
      success: true,
      delivered: false,
      message: `Notice: ${errorHelp}`,
      otpCode,
    };
  }

  // 3. Fallback log for server monitoring
  console.log(`[OTP DISPATCH] Dispatched 6-digit OTP code to ${cleanTo}`);

  return {
    success: true,
    delivered: false,
    message: `Verification code registered for ${cleanTo}`,
  };
}
