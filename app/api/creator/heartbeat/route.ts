import { NextRequest } from 'next/server';
import { mapCreatorMetricsRow } from '../../../../lib/handlers/creatorMetricsMap';
import { createServiceClient, jsonErr, jsonOk, requireAuth } from '../../../../lib/nextAuth';
import { parseJsonBody } from '../../../../lib/nextRequest';
import { isRedisConfigured, RedisUnavailableError, setPresence } from '../../../../lib/redis';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** POST /api/creator/heartbeat — Redis presence + creator_metrics (native Next). */
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
    } catch (err: any) {
      if (err instanceof RedisUnavailableError) {
        return jsonErr(503, err.message, 'REDIS_UNAVAILABLE');
      }
      throw err;
    }

    const client = createServiceClient();
    if (client) {
      try {
        const { data: cm } = await client
          .from('creator_metrics')
          .select('creator_id, active_online_seconds')
          .eq('creator_id', creatorId)
          .maybeSingle();
        if (cm) {
          const secs = Number(cm.active_online_seconds || 0) + 45;
          await client
            .from('creator_metrics')
            .update({
              active_online_seconds: secs,
              active_online_hours: Number((secs / 3600).toFixed(2)),
              last_active_date: new Date().toISOString().slice(0, 10),
              updated_at: new Date().toISOString(),
            })
            .eq('creator_id', creatorId);
        }
      } catch {
        /* optional */
      }
    }

    let metrics = null;
    if (client) {
      const { data: rows } = await client
        .from('creator_metrics')
        .select('*')
        .eq('creator_id', creatorId)
        .maybeSingle();
      metrics = rows ? mapCreatorMetricsRow(rows as Record<string, unknown>) : null;
    }

    return jsonOk({ success: true, metrics, redis: true, runtime: 'next-native' });
  } catch (err: any) {
    console.error('[next /api/creator/heartbeat]', err);
    return jsonErr(500, err?.message || 'Heartbeat failed', 'INTERNAL_ERROR');
  }
}
