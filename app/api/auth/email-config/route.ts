import { NextRequest } from 'next/server';
import { requireAdmin } from '../../../../lib/nextAuth';
import { authFail, authJson } from '../../../../lib/authHelpers';
import { getShowOtpInForm, getSmtpConfig } from '../../../../server/emailService';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (!auth.ok) return authFail(auth.status, auth.error.message);

  const smtpInfo = getSmtpConfig();
  return authJson({
    success: true,
    smtpConfigured: smtpInfo.configured,
    resendConfigured: Boolean(process.env.RESEND_API_KEY),
    senderEmail: smtpInfo.from || process.env.SMTP_FROM || 'LiveCall <noreply@livecall-app.com>',
    host: smtpInfo.host || process.env.SMTP_HOST || 'Not configured',
    port: smtpInfo.port || 587,
    user: smtpInfo.user || '',
    showOtpInForm: smtpInfo.showOtpInForm ?? getShowOtpInForm(),
  });
}
