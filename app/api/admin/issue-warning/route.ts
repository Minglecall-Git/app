import { NextRequest } from 'next/server';
import { broadcastAdminSignal } from '../../../../lib/handlers/adminCallSignals';
import { createServiceClient, jsonErr, jsonOk, requireAdmin } from '../../../../lib/nextAuth';
import { parseJsonBody } from '../../../../lib/nextRequest';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** POST /api/admin/issue-warning — Realtime safety warning (native Next). */
export async function POST(req: NextRequest) {
  try {
    const auth = await requireAdmin(req);
    if (!auth.ok) { return jsonErr(auth.status, auth.error.message, auth.error.code); }

    const parsed = await parseJsonBody<{ callId?: string; warningText?: string; message?: string }>(req);
    if (!parsed.ok) { return jsonErr(parsed.status, parsed.error.message, parsed.error.code); }

    const callId = String(parsed.data?.callId || '').trim();
    const warningText =
      String(parsed.data?.warningText || parsed.data?.message || '').trim() ||
      'Automated Safety Advisory: Please adhere to community guidelines.';

    const client = createServiceClient();
    if (!client) return jsonErr(503, 'Supabase not configured', 'NO_SUPABASE');

    let callerId = '';
    let receiverId = '';
    if (callId) {
      const { data: callRow } = await client
        .from('call_logs')
        .select('id, caller_id, receiver_id')
        .eq('id', callId)
        .maybeSingle();
      if (callRow) {
        callerId = String(callRow.caller_id || '');
        receiverId = String(callRow.receiver_id || '');
      }
      try {
        await client.from('moderation_reports').insert({
          reporter_id: auth.profileId,
          reported_user_id: receiverId || callerId || auth.profileId,
          reason: 'admin_call_warning',
          details: JSON.stringify({
            type: 'call:safety_warning',
            callId,
            message: warningText,
            timestamp: new Date().toISOString(),
          }),
          status: 'action_taken',
          action_taken: 'call_safety_warning',
          admin_notes: warningText.slice(0, 500),
        });
      } catch (e: any) {
        console.warn('[next /api/admin/issue-warning] persist skipped:', e?.message);
      }
    }

    const warningPayload = {
      type: 'call:safety_warning',
      callId,
      message: warningText,
      timestamp: Date.now(),
      callerId: callerId || undefined,
      receiverId: receiverId || undefined,
    };
    const signalDelivery = await broadcastAdminSignal(client, warningPayload, [callerId, receiverId]);

    return jsonOk({
      success: true,
      message: 'Warning dispatched discreetly.',
      callId: callId || null,
      delivery: { realtime: signalDelivery },
      runtime: 'next-native',
    });
  } catch (err: any) {
    console.error('[next /api/admin/issue-warning]', err);
    return jsonErr(500, err?.message || 'Failed to issue warning', 'SERVER_ERROR');
  }
}
