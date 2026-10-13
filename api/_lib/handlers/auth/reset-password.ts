import { sendJson, readJsonBody, createServiceClient, type VercelReq, type VercelRes } from '../../vercelAuth';
import { isValidEmail, isValidOtpToken, getPasswordPolicyError, findAuthUserByEmail } from '../../authHelpers';
import { verifyOtpDb } from '../../otpDb';

export default async function handler(req: VercelReq, res: VercelRes) {
  if (req.method === 'OPTIONS') {
    res.statusCode = 204;
    res.end();
    return;
  }
  if (req.method !== 'POST') {
    return sendJson(res, 405, { success: false, error: 'Method not allowed' });
  }

  try {
    const body = await readJsonBody(req);
    const email = String(body?.email || '').trim().toLowerCase();
    const token = body?.token;
    const newPassword = body?.newPassword || body?.password;

    if (!isValidEmail(email) || !isValidOtpToken(token)) {
      return sendJson(res, 400, { success: false, error: 'Email and 6-digit OTP required' });
    }
    const pwError = getPasswordPolicyError(newPassword);
    if (pwError) {
      return sendJson(res, 400, { success: false, error: pwError });
    }

    const client = createServiceClient();
    if (!client) {
      return sendJson(res, 503, { success: false, error: 'Supabase not configured' });
    }

    const verify = await verifyOtpDb(client, email, String(token).trim());
    if (!verify.success) {
      return sendJson(res, 400, { success: false, error: verify.error });
    }

    const { data: list } = await client.auth.admin.listUsers({ perPage: 1000 });
    const matched = findAuthUserByEmail(list?.users as any, email);
    if (!matched) {
      return sendJson(res, 404, { success: false, error: 'No auth user found for this email' });
    }

    const { error } = await client.auth.admin.updateUserById(matched.id, {
      password: newPassword,
      email_confirm: true,
    });
    if (error) {
      return sendJson(res, 500, { success: false, error: error.message });
    }

    await client
      .from('profiles')
      .update({ has_password_set: true, updated_at: new Date().toISOString() } as any)
      .ilike('email', email);

    return sendJson(res, 200, { success: true, message: 'Password reset successfully.' });
  } catch (err: any) {
    console.error('[api/auth/reset-password]', err);
    return sendJson(res, 500, { success: false, error: err?.message || 'Reset failed' });
  }
}
