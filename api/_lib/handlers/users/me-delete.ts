/**
 * POST /api/users/me/delete — soft/hard delete own account (Vercel).
 */
import {
  sendJson,
  readJsonBody,
  requireAuthFromBearer,
  createServiceClient,
  type VercelReq,
  type VercelRes,
} from '../../vercelAuth';

export default async function handler(req: VercelReq, res: VercelRes) {
  if (req.method === 'OPTIONS') {
    res.statusCode = 204;
    res.end();
    return;
  }
  if (req.method !== 'POST') {
    return sendJson(res, 405, { success: false, error: { message: 'Method not allowed' } });
  }

  const auth = await requireAuthFromBearer(req);
  if (auth.ok === false) {
    return sendJson(res, auth.status, { success: false, error: auth.error });
  }

  const client = createServiceClient();
  if (!client) {
    return sendJson(res, 503, { success: false, error: { message: 'Supabase not configured' } });
  }

  await readJsonBody(req);
  const profileId = auth.profileId;
  const authId = auth.userId;
  const warnings: string[] = [];

  const { error: updErr } = await client
    .from('profiles')
    .update({
      online_status: 'offline',
      is_banned: true,
      ban_reason: 'Account deleted by user',
      updated_at: new Date().toISOString(),
    })
    .eq('id', profileId);

  if (updErr) warnings.push(updErr.message);

  const { error: delProf } = await client.from('profiles').delete().eq('id', profileId);
  if (delProf) {
    return sendJson(res, 500, {
      success: false,
      error: { message: delProf.message, code: 'DELETE_FAILED' },
      warnings,
    });
  }

  if (authId) {
    const { error: delAuth } = await client.auth.admin.deleteUser(authId);
    if (delAuth) warnings.push(delAuth.message);
  }

  return sendJson(res, 200, {
    success: true,
    message: 'Account deleted',
    data: { profileDeleted: true, warnings },
  });
}
