import { NextRequest } from 'next/server';
import { mapCreatorMetricsRow } from '../../../../lib/handlers/creatorMetricsMap';
import { createServiceClient, jsonErr, jsonOk, requireAuth, TEAM_LEADER_ROLES } from '../../../../lib/nextAuth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** GET /api/creator/metrics — creator_metrics table (native Next). */
export async function GET(req: NextRequest) {
  try {
    const auth = await requireAuth(req);
    if (!auth.ok) { return jsonErr(auth.status, auth.error.message, auth.error.code); }

    const client = createServiceClient();
    if (!client) return jsonErr(503, 'Supabase not configured', 'NO_SUPABASE');

    const creatorId = req.nextUrl.searchParams.get('creatorId') || '';
    const selfId = auth.profileId;

    if (creatorId) {
      const allowed =
        creatorId === selfId ||
        auth.role === 'admin' ||
        TEAM_LEADER_ROLES.has(auth.role);
      if (!allowed) return jsonErr(403, 'Forbidden', 'FORBIDDEN');

      const { data, error } = await client
        .from('creator_metrics')
        .select('*')
        .eq('creator_id', creatorId)
        .maybeSingle();
      if (error) return jsonErr(500, error.message, 'METRICS_FETCH_FAILED');
      return jsonOk({
        success: true,
        metric: data ? mapCreatorMetricsRow(data as Record<string, unknown>) : null,
        runtime: 'next-native',
      });
    }

    const { data: rows, error } = await client.from('creator_metrics').select('*').limit(500);
    if (error) return jsonErr(500, error.message, 'METRICS_FETCH_FAILED');

    const metrics: Record<string, ReturnType<typeof mapCreatorMetricsRow>> = {};
    for (const row of rows || []) {
      const mapped = mapCreatorMetricsRow(row as Record<string, unknown>);
      metrics[mapped.creatorId] = mapped;
    }

    return jsonOk({ success: true, metrics, runtime: 'next-native' });
  } catch (err: any) {
    console.error('[next /api/creator/metrics]', err);
    return jsonErr(500, err?.message || 'Metrics fetch failed', 'INTERNAL_ERROR');
  }
}
