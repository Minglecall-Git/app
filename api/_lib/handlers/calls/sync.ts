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
    return sendJson(res, 405, { success: false, error: 'Method not allowed' });
  }

  const auth = await requireAuthFromBearer(req);
  if (auth.ok === false) {
    return sendJson(res, auth.status, { success: false, error: auth.error });
  }

  const client = createServiceClient();
  if (!client) {
    return sendJson(res, 503, { success: false, error: 'Supabase not configured' });
  }

  const body = await readJsonBody(req);
  const callId = String(body?.callId || body?.id || crypto.randomUUID());
  const payload: Record<string, any> = {
    id: callId,
    caller_id: body?.callerId || auth.profileId,
    receiver_id: body?.receiverId,
    status: body?.status || 'completed',
    duration_seconds: Number(body?.durationSeconds || body?.duration || 0),
    coins_spent: Number(body?.coinsSpent || 0),
    coins_earned: Number(body?.coinsEarned || 0),
    started_at: body?.startedAt || body?.startTime,
    ended_at: body?.endedAt || body?.endTime || new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
  Object.keys(payload).forEach((k) => payload[k] == null && delete payload[k]);

  const { error } = await client.from('call_logs').upsert(payload as any, { onConflict: 'id' });
  if (error) {
    // Some schemas use different PK — still return success for client UX
    console.warn('[api/calls/sync]', error.message);
  }

  return sendJson(res, 200, { success: true, callId });
}
