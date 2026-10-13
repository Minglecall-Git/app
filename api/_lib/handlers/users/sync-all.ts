import {
  sendJson,
  readJsonBody,
  requireAdminFromBearer,
  createServiceClient,
  type VercelReq,
  type VercelRes,
} from '../../vercelAuth';
import { mapProfileRow } from '../../authHelpers';

/** POST /api/users/sync-all — admin bulk upsert (profiles already in DB preferred). */
export default async function handler(req: VercelReq, res: VercelRes) {
  if (req.method === 'OPTIONS') {
    res.statusCode = 204;
    res.end();
    return;
  }
  if (req.method !== 'POST') {
    return sendJson(res, 405, { success: false, error: 'Method not allowed' });
  }

  const auth = await requireAdminFromBearer(req);
  if (auth.ok === false) {
    return sendJson(res, auth.status, { success: false, error: auth.error });
  }

  const client = createServiceClient();
  if (!client) {
    return sendJson(res, 503, { success: false, error: 'Supabase not configured' });
  }

  const body = await readJsonBody(req);
  const incoming = Array.isArray(body?.users) ? body.users : [];
  let count = 0;
  for (const u of incoming) {
    if (!u?.id) continue;
    const payload: Record<string, any> = {
      id: u.id,
      auth_id: u.authId || u.auth_id || null,
      name: u.name,
      email: u.email,
      role: u.role,
      gender: u.gender,
      avatar_url: u.avatarUrl || u.avatar_url,
      online_status: u.onlineStatus || u.online_status || 'offline',
      updated_at: new Date().toISOString(),
    };
    Object.keys(payload).forEach((k) => payload[k] == null && delete payload[k]);
    const { error } = await client.from('profiles').upsert(payload as any, { onConflict: 'id' });
    if (!error) count += 1;
  }

  const { data } = await client.from('profiles').select('*').limit(500);
  return sendJson(res, 200, {
    success: true,
    count: data?.length || count,
    users: (data || []).map(mapProfileRow),
  });
}
