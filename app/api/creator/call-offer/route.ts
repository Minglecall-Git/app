import { NextRequest } from 'next/server';
import { mapCreatorMetricsRow } from '../../../../lib/handlers/creatorMetricsMap';
import { createServiceClient, jsonErr, jsonOk, requireAuth } from '../../../../lib/nextAuth';
import { parseJsonBody } from '../../../../lib/nextRequest';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const OUTCOMES = new Set(['offered', 'answered', 'declined', 'missed']);

/** POST /api/creator/call-offer — update creator_metrics call stats (native Next). */
export async function POST(req: NextRequest) {
  try {
    const auth = await requireAuth(req);
    if (!auth.ok) { return jsonErr(auth.status, auth.error.message, auth.error.code); }

    const parsed = await parseJsonBody<{ outcome?: string }>(req);
    if (!parsed.ok) { return jsonErr(parsed.status, parsed.error.message, parsed.error.code); }

    const creatorId = auth.profileId;
    const outcome = String(parsed.data?.outcome || '').trim();
    if (!creatorId || !OUTCOMES.has(outcome)) {
      return jsonErr(400, 'creatorId and valid outcome are required', 'INVALID_INPUT');
    }

    const client = createServiceClient();
    if (!client) return jsonErr(503, 'Supabase not configured', 'NO_SUPABASE');

    const { data: existing } = await client
      .from('creator_metrics')
      .select('*')
      .eq('creator_id', creatorId)
      .maybeSingle();

    const base = existing
      ? mapCreatorMetricsRow(existing as Record<string, unknown>)
      : {
          creatorId,
          totalCallsOffered: 0,
          totalCallsAnswered: 0,
          totalCallsDeclined: 0,
          totalCallsMissed: 0,
          responseHealthScore: 100,
        };

    if (outcome === 'offered') base.totalCallsOffered = (base.totalCallsOffered || 0) + 1;
    else if (outcome === 'answered') base.totalCallsAnswered = (base.totalCallsAnswered || 0) + 1;
    else if (outcome === 'declined') base.totalCallsDeclined = (base.totalCallsDeclined || 0) + 1;
    else if (outcome === 'missed') base.totalCallsMissed = (base.totalCallsMissed || 0) + 1;

    const totalOff = Math.max(
      1,
      base.totalCallsOffered ||
        (base.totalCallsAnswered || 0) +
          (base.totalCallsDeclined || 0) +
          (base.totalCallsMissed || 0)
    );
    base.responseHealthScore = Number((((base.totalCallsAnswered || 0) / totalOff) * 100).toFixed(1));

    const upsertPayload = {
      creator_id: creatorId,
      total_calls_offered: base.totalCallsOffered,
      total_calls_answered: base.totalCallsAnswered,
      total_calls_declined: base.totalCallsDeclined,
      total_calls_missed: base.totalCallsMissed,
      response_health_score: base.responseHealthScore,
      updated_at: new Date().toISOString(),
    };

    const { data: saved, error } = await client
      .from('creator_metrics')
      .upsert(upsertPayload, { onConflict: 'creator_id' })
      .select('*')
      .maybeSingle();

    if (error) return jsonErr(500, error.message, 'METRICS_UPDATE_FAILED');

    const metrics = saved ? mapCreatorMetricsRow(saved as Record<string, unknown>) : base;
    return jsonOk({ success: true, metrics, runtime: 'next-native' });
  } catch (err: any) {
    console.error('[next /api/creator/call-offer]', err);
    return jsonErr(500, err?.message || 'Call offer update failed', 'INTERNAL_ERROR');
  }
}
