/**
 * Minimal OTP email sender for Vercel (Resend API or SMTP via nodemailer when available).
 */
export function generateSixDigitOtp(): string {
  return String(Math.floor(100000 + Math.random() * 900000));
}

export function isSmtpConfigured(): boolean {
  const hasEnvSmtp = Boolean(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS);
  const hasResend = Boolean(process.env.RESEND_API_KEY);
  return hasEnvSmtp || hasResend;
}

export async function sendOtpEmailVercel(params: {
  to: string;
  name?: string;
  otpCode: string;
}): Promise<{ success: boolean; delivered: boolean; message: string }> {
  const to = params.to.trim().toLowerCase();
  const name = params.name || 'User';
  const otpCode = params.otpCode;
  const from = (process.env.SMTP_FROM || process.env.RESEND_FROM || 'noreply@minglecall.com').trim();
  const subject = 'Your LiveCall verification code';
  const html = `<p>Hello <strong>${name}</strong>,</p><p>Your 6-digit OTP is:</p><p style="font-size:28px;letter-spacing:6px;font-weight:800">${otpCode}</p><p>Valid for 10 minutes.</p>`;

  const resendKey = (process.env.RESEND_API_KEY || '').trim();
  if (resendKey) {
    try {
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${resendKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ from, to: [to], subject, html }),
      });
      if (!res.ok) {
        const t = await res.text().catch(() => '');
        return {
          success: true,
          delivered: false,
          message: `Email provider error (${res.status}). ${t.slice(0, 120)}`,
        };
      }
      return { success: true, delivered: true, message: 'Verification code sent.' };
    } catch (e: any) {
      return { success: true, delivered: false, message: e?.message || 'Email send failed' };
    }
  }

  // Fallback: try nodemailer if present (Express local / Node with SMTP)
  try {
    const nodemailer = await import('nodemailer');
    const host = process.env.SMTP_HOST || '';
    const user = process.env.SMTP_USER || '';
    const pass = process.env.SMTP_PASS || '';
    if (!host || !user || !pass) {
      return {
        success: true,
        delivered: false,
        message: 'SMTP not configured; OTP stored server-side only.',
      };
    }
    const port = parseInt(process.env.SMTP_PORT || '465', 10);
    const secure = String(process.env.SMTP_SECURE || 'true') === 'true' || port === 465;
    const transporter = nodemailer.createTransport({ host, port, secure, auth: { user, pass } });
    await transporter.sendMail({ from, to, subject, html });
    return { success: true, delivered: true, message: 'Verification code sent.' };
  } catch (e: any) {
    return { success: true, delivered: false, message: e?.message || 'Email send failed' };
  }
}
