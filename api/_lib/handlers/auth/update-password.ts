import {
  sendJson,
  readJsonBody,
  requireAuthFromBearer,
  createServiceClient,
  type VercelReq,
  type VercelRes,
} from '../../vercelAuth';
import { getPasswordPolicyError } from '../../authHelpers';

export default async function handler(req: VercelReq, res: VercelRes) {
  if (req.method === 'OPTIONS') {
    res.statusCode = 204;
    res.end();
    return;
  }
  if (req.method !== 'POST') {
    return sendJson(res, 405, { success: false, error: 'Method not allowed' });
  }

  const auth = await requireAuthFromBearer(req);
  if (auth.ok === false) {
    return sendJson(res, auth.status, { success: false, error: auth.error?.message || 'Unauthorized' });
  }

  try {
    const body = await readJsonBody(req);
    const newPassword = body?.newPassword || body?.password;
    const pwError = getPasswordPolicyError(newPassword);
    if (pwError) {
      return sendJson(res, 400, { success: false, error: pwError });
    }

    const client = createServiceClient();
    if (!client) {
      return sendJson(res, 503, { success: false, error: 'Supabase not configured' });
    }

    const { error } = await client.auth.admin.updateUserById(auth.userId, {
      password: newPassword,
    });
    if (error) {
      return sendJson(res, 500, { success: false, error: error.message });
    }

    await client
      .from('profiles')
      .update({ has_password_set: true, updated_at: new Date().toISOString() } as any)
      .eq('id', auth.profileId);

    return sendJson(res, 200, {
      success: true,
      message: 'Password successfully updated and securely hashed.',
    });
  } catch (err: any) {
    console.error('[api/auth/update-password]', err);
    return sendJson(res, 500, { success: false, error: err?.message || 'Update failed' });
  }
}
