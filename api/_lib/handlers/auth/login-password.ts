import { sendJson, readJsonBody, createServiceClient, type VercelReq, type VercelRes } from '../../vercelAuth';
import {
  isValidEmail,
  signInWithPassword,
  mapProfileRow,
  findProfileByEmail,
} from '../../authHelpers';

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
    const { email, password } = body || {};
    if (!isValidEmail(email) || typeof password !== 'string' || !password) {
      return sendJson(res, 400, { success: false, error: 'Email and password are required' });
    }

    const cleanEmail = email.trim().toLowerCase();
    const profile = await findProfileByEmail(cleanEmail);
    if (profile?.is_banned) {
      const until = profile.banned_until ? new Date(profile.banned_until).getTime() : 0;
      if (!until || until > Date.now()) {
        return sendJson(res, 403, {
          success: false,
          isBanned: true,
          error: profile.ban_reason || 'This account is suspended.',
        });
      }
    }

    const authRes = await signInWithPassword(cleanEmail, password);
    if (!authRes.success) {
      return sendJson(res, 401, {
        success: false,
        error: authRes.error || 'Invalid email or password. Please check your credentials.',
      });
    }

    const client = createServiceClient();
    let row = profile;
    if (client && authRes.user) {
      const { data } = await client
        .from('profiles')
        .select('*')
        .or(`auth_id.eq.${authRes.user.id},id.eq.${authRes.user.id}`)
        .maybeSingle();
      if (data) row = data;
    }

    if (!row) {
      return sendJson(res, 401, {
        success: false,
        error: 'Account not found or was deleted. Please register again.',
      });
    }

    return sendJson(res, 200, {
      success: true,
      user: mapProfileRow(row),
      session: authRes.session,
    });
  } catch (err: any) {
    console.error('[api/auth/login-password]', err);
    return sendJson(res, 500, { success: false, error: err?.message || 'Authentication error' });
  }
}
