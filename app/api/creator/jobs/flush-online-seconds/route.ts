import { NextRequest } from 'next/server';
import { flushDirtyCreatorOnlineSeconds } from '../../../../../lib/creatorOnlineAccrual';
import { requireFinanceJobAuth } from '../../../../../lib/financeJobAuth';
import { createServiceClient, jsonErr, jsonOk } from '../../../../../lib/nextAuth';
import { isRedisConfigured } from '../../../../../lib/redis';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET|POST /api/creator/jobs/flush-online-seconds
 * Cron / job-secret batch flush of Redis creator online seconds → Postgres.
 */
async function handle(req: NextRequest) {
  try {
    const jobAuth = await requireFinanceJobAuth(req);
    if (!jobAuth.ok) {
      return jsonErr(jobAuth.status, jobAuth.error.message, jobAuth.error.code);
    }

    if (!isRedisConfigured()) {
      return jsonErr(503, 'Redis is not configured', 'REDIS_UNAVAILABLE');
    }

    const client = createServiceClient();
    if (!client) return jsonErr(503, 'Supabase not configured', 'NO_SUPABASE');

    const limitParam = Number(req.nextUrl.searchParams.get('limit') || 200);
    const limit = Number.isFinite(limitParam) ? Math.max(1, Math.min(500, Math.floor(limitParam))) : 200;
    const summary = await flushDirtyCreatorOnlineSeconds(client, limit);

    return jsonOk({
      success: true,
      data: {
        flushedSeconds: summary.flushed,
        creatorsProcessed: summary.creators,
        errors: summary.errors,
      },
      runtime: 'next-native',
    });
  } catch (err: any) {
    console.error('[next /api/creator/jobs/flush-online-seconds]', err);
    return jsonErr(500, err?.message || 'Batch flush failed', 'INTERNAL_ERROR');
  }
}

export const GET = handle;
export const POST = handle;
