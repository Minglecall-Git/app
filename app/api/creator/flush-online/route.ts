import { NextRequest } from 'next/server';
import { flushCreatorOnlineSeconds } from '../../../../lib/creatorOnlineAccrual';
import { createServiceClient, jsonErr, jsonOk, requireAuth } from '../../../../lib/nextAuth';
import { parseJsonBody } from '../../../../lib/nextRequest';
import { isRedisConfigured } from '../../../../lib/redis';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * POST /api/creator/flush-online — flush Redis pending online seconds into Postgres.
 * Intended for logout / session-end / pagehide (not every heartbeat tick).
 */
export async function POST(req: NextRequest) {
  try {
    const auth = await requireAuth(req);
    if (!auth.ok) { return jsonErr(auth.status, auth.error.message, auth.error.code); }

    await parseJsonBody(req);

    if (!isRedisConfigured()) {
      return jsonErr(503, 'Redis is not configured', 'REDIS_UNAVAILABLE');
    }

    const client = createServiceClient();
    if (!client) return jsonErr(503, 'Supabase not configured', 'NO_SUPABASE');

    const result = await flushCreatorOnlineSeconds(client, auth.profileId);
    if (!result.success && result.code === 'REDIS_UNAVAILABLE') {
      return jsonErr(503, result.error || 'Redis unavailable', 'REDIS_UNAVAILABLE');
    }
    if (!result.success && result.code === 'ACCRUE_RPC_FAILED') {
      return jsonErr(500, result.error || 'Flush RPC failed', 'ACCRUE_RPC_FAILED');
    }

    return jsonOk({
      success: result.success,
      flushedSeconds: result.flushedSeconds,
      metrics: result.metrics,
      runtime: 'next-native',
    });
  } catch (err: any) {
    console.error('[next /api/creator/flush-online]', err);
    return jsonErr(500, err?.message || 'Flush failed', 'INTERNAL_ERROR');
  }
}
