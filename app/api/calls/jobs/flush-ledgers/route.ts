import { NextRequest } from 'next/server';
import { flushCallLedger } from '../../../../../lib/callLedger';
import { requireFinanceJobAuth } from '../../../../../lib/financeJobAuth';
import { createServiceClient, jsonErr, jsonOk } from '../../../../../lib/nextAuth';
import { isRedisConfigured, listDirtyCallLedgerIds } from '../../../../../lib/redis';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** GET|POST /api/calls/jobs/flush-ledgers — cleanup abandoned Redis call ledgers. */
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

    const limitParam = Number(req.nextUrl.searchParams.get('limit') || 50);
    const limit = Number.isFinite(limitParam) ? Math.max(1, Math.min(100, Math.floor(limitParam))) : 50;
    const ids = await listDirtyCallLedgerIds(limit);
    let flushed = 0;
    let errors = 0;
    for (const id of ids) {
      const res = await flushCallLedger(client, id);
      if (res.success) flushed += res.flushedMinutes;
      else errors += 1;
    }

    return jsonOk({
      success: true,
      data: { callIds: ids.length, flushedMinutes: flushed, errors },
      runtime: 'next-native',
    });
  } catch (err: any) {
    console.error('[next /api/calls/jobs/flush-ledgers]', err);
    return jsonErr(500, err?.message || 'Flush failed', 'INTERNAL_ERROR');
  }
}

export const GET = handle;
export const POST = handle;
