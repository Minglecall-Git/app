/**
 * Flush ephemeral Redis creator online-time into Postgres via atomic RPC.
 * Heartbeats must only INCR Redis — never write creator_metrics on every tick.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { mapCreatorMetricsRow } from './handlers/creatorMetricsMap';
import {
  getCreatorOnlinePending,
  listDirtyCreatorOnlineIds,
  requeueCreatorOnlinePending,
  takeCreatorOnlinePending,
} from './redis';

export function withPendingOnlineSeconds<T extends { activeOnlineSeconds?: number; activeOnlineHours?: number }>(
  metrics: T | null,
  pendingSeconds: number
): T | null {
  if (!metrics) return metrics;
  const pending = Math.max(0, Math.floor(pendingSeconds || 0));
  if (pending <= 0) return metrics;
  const secs = Math.max(0, Math.floor(Number(metrics.activeOnlineSeconds || 0))) + pending;
  return {
    ...metrics,
    activeOnlineSeconds: secs,
    activeOnlineHours: Number((secs / 3600).toFixed(2)),
  };
}

export async function loadCreatorMetricsWithPending(
  client: SupabaseClient,
  creatorId: string
): Promise<ReturnType<typeof mapCreatorMetricsRow> | null> {
  const { data: rows } = await client
    .from('creator_metrics')
    .select('*')
    .eq('creator_id', creatorId)
    .maybeSingle();
  const mapped = rows ? mapCreatorMetricsRow(rows as Record<string, unknown>) : null;
  const pending = await getCreatorOnlinePending(creatorId);
  return withPendingOnlineSeconds(mapped, pending);
}

export type FlushCreatorOnlineResult = {
  success: boolean;
  creatorId: string;
  flushedSeconds: number;
  metrics: ReturnType<typeof mapCreatorMetricsRow> | null;
  error?: string;
  code?: string;
};

export async function flushCreatorOnlineSeconds(
  client: SupabaseClient,
  creatorId: string
): Promise<FlushCreatorOnlineResult> {
  const id = String(creatorId || '').trim();
  if (!id) {
    return { success: false, creatorId: '', flushedSeconds: 0, metrics: null, error: 'creatorId required', code: 'INVALID_INPUT' };
  }

  let delta = 0;
  try {
    delta = await takeCreatorOnlinePending(id);
  } catch (err: any) {
    return {
      success: false,
      creatorId: id,
      flushedSeconds: 0,
      metrics: await loadCreatorMetricsWithPending(client, id),
      error: err?.message || 'Redis take failed',
      code: 'REDIS_UNAVAILABLE',
    };
  }

  if (delta <= 0) {
    return {
      success: true,
      creatorId: id,
      flushedSeconds: 0,
      metrics: await loadCreatorMetricsWithPending(client, id),
    };
  }

  const { data: rpcRaw, error: rpcErr } = await client.rpc('accrue_creator_online_seconds_atomic', {
    p_creator_id: id,
    p_delta_seconds: delta,
  });

  if (rpcErr) {
    try {
      await requeueCreatorOnlinePending(id, delta);
    } catch {
      /* keep best-effort requeue */
    }
    return {
      success: false,
      creatorId: id,
      flushedSeconds: 0,
      metrics: await loadCreatorMetricsWithPending(client, id),
      error: rpcErr.message,
      code: 'ACCRUE_RPC_FAILED',
    };
  }

  const result = typeof rpcRaw === 'string' ? JSON.parse(rpcRaw) : rpcRaw || {};
  if (!result?.success) {
    try {
      await requeueCreatorOnlinePending(id, delta);
    } catch {
      /* keep best-effort requeue */
    }
    return {
      success: false,
      creatorId: id,
      flushedSeconds: 0,
      metrics: await loadCreatorMetricsWithPending(client, id),
      error: result?.error_message || 'Accrue failed',
      code: result?.error_code || 'ACCRUE_FAILED',
    };
  }

  return {
    success: true,
    creatorId: id,
    flushedSeconds: Number(result.flushed_seconds ?? delta) || delta,
    metrics: await loadCreatorMetricsWithPending(client, id),
  };
}

export async function flushDirtyCreatorOnlineSeconds(
  client: SupabaseClient,
  limit = 200
): Promise<{ flushed: number; creators: number; errors: number; details: FlushCreatorOnlineResult[] }> {
  const ids = await listDirtyCreatorOnlineIds(limit);
  const details: FlushCreatorOnlineResult[] = [];
  let flushed = 0;
  let errors = 0;
  for (const id of ids) {
    const res = await flushCreatorOnlineSeconds(client, id);
    details.push(res);
    if (res.success) flushed += res.flushedSeconds;
    else errors += 1;
  }
  return { flushed, creators: ids.length, errors, details };
}
