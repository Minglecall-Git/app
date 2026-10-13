import { NextRequest } from 'next/server';
import { createServiceClient, jsonErr, jsonOk, requireAuth } from '../../../../lib/nextAuth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/calls/incoming — DB ringing calls for callee (native Next).
 * In-memory Express activeCalls are not available here; call_logs is source of truth.
 */
export async function GET(req: NextRequest) {
  try {
    const auth = await requireAuth(req);
    if (!auth.ok) { return jsonErr(auth.status, auth.error.message, auth.error.code); }

    const client = createServiceClient();
    if (!client) {
      return jsonOk({ success: true, data: [], runtime: 'next-native' });
    }

    const selfIds = Array.from(
      new Set([auth.profileId, auth.userId].map((id) => String(id || '').trim()).filter(Boolean))
    );
    const orFilter = selfIds
      .flatMap((id) => [`receiver_id.eq.${id}`, `host_id.eq.${id}`])
      .join(',');

    const { data, error } = await client
      .from('call_logs')
      .select('id, caller_id, receiver_id, host_id, status, started_at, start_time, caller_name')
      .eq('status', 'ringing')
      .or(orFilter)
      .order('started_at', { ascending: false })
      .limit(10);

    if (error) {
      console.warn('[next /api/calls/incoming]', error.message);
      return jsonOk({ success: true, data: [], runtime: 'next-native' });
    }

    const now = Date.now();
    const calls = (data || [])
      .filter((row: any) => {
        const startedMs = Date.parse(row.started_at || row.start_time || '') || 0;
        return !startedMs || now - startedMs < 75_000;
      })
      .map((row: any) => ({
        callId: String(row.id),
        callerId: String(row.caller_id || ''),
        receiverId: String(row.receiver_id || row.host_id || auth.profileId),
        status: 'ringing' as const,
        startedAt: row.started_at || row.start_time || null,
        callerName: row.caller_name || null,
      }))
      .filter((c: any) => c.callId && c.callerId);

    return jsonOk({ success: true, data: calls, runtime: 'next-native' });
  } catch (err: any) {
    console.error('[next /api/calls/incoming]', err);
    return jsonErr(500, err?.message || 'Incoming lookup failed', 'INTERNAL_ERROR');
  }
}
