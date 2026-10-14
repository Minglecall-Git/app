import { NextRequest } from 'next/server';
import { loadCreatorMetricsWithPending } from '../../../../lib/creatorOnlineAccrual';
import { createServiceClient, jsonErr, jsonOk, requireAuth } from '../../../../lib/nextAuth';
import { parseJsonBody } from '../../../../lib/nextRequest';
import {
  accrueCreatorOnlineTick,
  CREATOR_ONLINE_TICK_SEC,
  isRedisConfigured,
  RedisUnavailableError,
  setPresence,
} from '../../../../lib/redis';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * POST /api/creator/heartbeat — Redis presence + ephemeral online-seconds accrual.
 * Does NOT write creator_metrics on every tick (flush on logout / cron).
 */
export async function POST(req: NextRequest) {
  try {
    const auth = await requireAuth(req);
    if (!auth.ok) { return jsonErr(auth.status, auth.error.message, auth.error.code); }

    await parseJsonBody(req);

    if (!isRedisConfigured()) {
      return jsonErr(
        503,
        'Presence service unavailable — Redis is not configured',
        'REDIS_UNAVAILABLE'
      );
    }

    const creatorId = auth.profileId;
    try {
      await setPresence(creatorId, 'online');
      await accrueCreatorOnlineTick(creatorId, CREATOR_ONLINE_TICK_SEC);
    } catch (err: any) {
      if (err instanceof RedisUnavailableError) {
        return jsonErr(503, err.message, 'REDIS_UNAVAILABLE');
      }
      throw err;
    }

    const client = createServiceClient();
    const metrics = client ? await loadCreatorMetricsWithPending(client, creatorId) : null;

    return jsonOk({ success: true, metrics, redis: true, runtime: 'next-native' });
  } catch (err: any) {
    console.error('[next /api/creator/heartbeat]', err);
    return jsonErr(500, err?.message || 'Heartbeat failed', 'INTERNAL_ERROR');
  }
}
