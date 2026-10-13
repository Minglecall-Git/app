import { NextRequest } from 'next/server';
import { requireAdmin } from '../../../../lib/nextAuth';
import { parseJsonBody } from '../../../../lib/nextRequest';
import { authFail, authJson, isValidEmail, safeClientError } from '../../../../lib/authHelpers';
import { generateSixDigitOtp, sendOtpEmail } from '../../../../server/emailService';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (!auth.ok) return authFail(auth.status, auth.error.message);

  const parsed = await parseJsonBody<{ email?: string; name?: string }>(req);
  if (!parsed.ok) return authFail(parsed.status, parsed.error.message);

  try {
    const { email, name } = parsed.data || {};
    if (!isValidEmail(email)) {
      return authFail(400, 'Destination email is required');
    }

    const testCode = generateSixDigitOtp();
    const sendResult = await sendOtpEmail({
      to: email,
      name: name || 'Admin Tester',
      otpCode: testCode,
    });

    return authJson({
      success: true,
      delivered: sendResult.delivered,
      message: sendResult.message,
    });
  } catch (err: unknown) {
    console.error('[next /api/auth/test-email]', err);
    return authFail(500, safeClientError(err, 'Failed to send test email'));
  }
}
