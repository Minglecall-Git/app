import { NextRequest } from 'next/server';
import { broadcastAdminSignal, deleteLivekitRoom } from '../../../../lib/handlers/adminCallSignals';
import { deleteCallState, setPresence } from '../../../../lib/redis';
import { updateCallLogs } from '../../../../lib/handlers/callLogsDb';
import { createServiceClient, jsonErr, jsonOk, requireAdmin } from '../../../../lib/nextAuth';
import { parseJsonBody } from '../../../../lib/nextRequest';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** POST /api/admin/terminate-call — DB + Redis + Realtime (native Next). */
export async function POST(req: NextRequest) {
  try {
    const auth = await requireAdmin(req);
    if (!auth.ok) { return jsonErr(auth.status, auth.error.message, auth.error.code); }

    const parsed = await parseJsonBody<{ callId?: string; id?: string; reason?: string }>(req);
    if (!parsed.ok) { return jsonErr(parsed.status, parsed.error.message, parsed.error.code); }

    const callId = String(parsed.data?.callId || parsed.data?.id || '').trim();
    const reason =
      String(parsed.data?.reason || '').trim() ||
      'Call terminated by Safety & Compliance Administration.';
    if (!callId) return jsonErr(400, 'callId is required', 'INVALID_INPUT');

    const client = createServiceClient();
    if (!client) return jsonErr(503, 'Supabase not configured', 'NO_SUPABASE');

    let callerId = '';
    let receiverId = '';
    const { data: callRow } = await client
      .from('call_logs')
      .select('id, caller_id, receiver_id, status')
      .eq('id', callId)
      .maybeSingle();

    if (callRow) {
      callerId = String(callRow.caller_id || '');
      receiverId = String(callRow.receiver_id || '');
      const endedAt = new Date().toISOString();
      await updateCallLogs(
        client,
        {
          status: 'terminated',
          ended_at: endedAt,
          end_time: endedAt,
          updated_at: endedAt,
        },
        (q) => q.eq('id', callId)
      );
    }

    const partyIds = [callerId, receiverId].filter(Boolean);
    if (partyIds.length) {
      await client
        .from('profiles')
        .update({ online_status: 'online', updated_at: new Date().toISOString() })
        .in('id', partyIds);
      try {
        for (const id of partyIds) await setPresence(id, 'online');
        await deleteCallState(callId);
      } catch {
        /* optional Redis */
      }
    }

    const payload = {
      type: 'call:ended',
      callId,
      endedBy: 'admin_moderator',
      reason,
      callerId: callerId || undefined,
      receiverId: receiverId || undefined,
      outcome: 'terminated',
      status: 'terminated',
    };
    const signalDelivery = await broadcastAdminSignal(client, payload, partyIds);
    const livekit = await deleteLivekitRoom(callId);

    return jsonOk({
      success: true,
      callId,
      message: 'Call successfully terminated by Safety Administration.',
      delivery: { realtime: signalDelivery, livekit },
      runtime: 'next-native',
    });
  } catch (err: any) {
    console.error('[next /api/admin/terminate-call]', err);
    return jsonErr(500, err?.message || 'Failed to terminate call', 'SERVER_ERROR');
  }
}
