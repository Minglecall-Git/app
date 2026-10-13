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

  const body = await readJsonBody(req);
  const otherUserId = String(body?.otherUserId || body?.senderId || '');
  const client = createServiceClient();
  if (!client) {
    return sendJson(res, 503, { success: false, error: { message: 'Supabase not configured' } });
  }

  let q = client
    .from('messages')
    .update({ is_read: true, read_at: new Date().toISOString() } as any)
    .eq('receiver_id', auth.profileId)
    .eq('is_read', false);
  if (otherUserId) {
    q = q.eq('sender_id', otherUserId);
  }
  await q;

  return sendJson(res, 200, { success: true });
}
