import { NextRequest } from 'next/server';
import { createServiceClient, jsonErr, jsonOk, requireAuth } from '../../../../lib/nextAuth';
import { parseJsonBody } from '../../../../lib/nextRequest';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** POST /api/creator/ready-now-toggle — profiles + creator_metrics (native Next). */
export async function POST(req: NextRequest) {
  try {
    const auth = await requireAuth(req);
    if (!auth.ok) { return jsonErr(auth.status, auth.error.message, auth.error.code); }

    const parsed = await parseJsonBody<{ isReadyNow?: boolean; active?: boolean }>(req);
    if (!parsed.ok) { return jsonErr(parsed.status, parsed.error.message, parsed.error.code); }

    const client = createServiceClient();
    if (!client) return jsonErr(503, 'Supabase not configured', 'NO_SUPABASE');

    const creatorId = auth.profileId;
    const { data: current } = await client
      .from('profiles')
      .select('is_ready_now_active')
      .eq('id', creatorId)
      .maybeSingle();

    const body = parsed.data || {};
    let next: boolean;
    if (typeof body.isReadyNow === 'boolean') next = body.isReadyNow;
    else if (typeof body.active === 'boolean') next = body.active;
    else next = !Boolean(current?.is_ready_now_active);

    const toggledAt = new Date().toISOString();
    const { data, error } = await client
      .from('profiles')
      .update({
        is_ready_now_active: next,
        ready_now_toggled_at: toggledAt,
        online_status: next ? 'online' : 'offline',
        updated_at: toggledAt,
      })
      .eq('id', creatorId)
      .select('is_ready_now_active, ready_now_toggled_at')
      .maybeSingle();

    if (error) return jsonErr(500, error.message, 'UPDATE_FAILED');

    try {
      await client.from('creator_metrics').upsert(
        {
          creator_id: creatorId,
          is_ready_now_active: next,
          ready_now_toggled_at: toggledAt,
          updated_at: toggledAt,
        },
        { onConflict: 'creator_id' }
      );
    } catch {
      /* optional */
    }

    const metrics = {
      creatorId,
      isReadyNowActive: Boolean(data?.is_ready_now_active),
      readyNowToggledAt: data?.ready_now_toggled_at,
    };

    return jsonOk({
      success: true,
      metrics,
      isReadyNowActive: metrics.isReadyNowActive,
      readyNowToggledAt: metrics.readyNowToggledAt,
      runtime: 'next-native',
    });
  } catch (err: any) {
    console.error('[next /api/creator/ready-now-toggle]', err);
    return jsonErr(500, err?.message || 'Ready now toggle failed', 'INTERNAL_ERROR');
  }
}
