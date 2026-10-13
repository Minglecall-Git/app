import { NextRequest } from 'next/server';
import { createServiceClient, jsonErr, jsonOk, requireAuth } from '../../../../../lib/nextAuth';
import { parseJsonBody } from '../../../../../lib/nextRequest';
import {
  canRequestRating,
  mapMessageRow,
  sanitizeText,
} from '../../../../../lib/handlers/reviews';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** POST /api/v1/reviews/request */
export async function POST(req: NextRequest) {
  try {
    const auth = await requireAuth(req);
    if (!auth.ok) { return jsonErr(auth.status, auth.error.message, auth.error.code); }

    const parsed = await parseJsonBody<{ callerId?: string; callLogId?: string }>(req);
    if (!parsed.ok) { return jsonErr(parsed.status, parsed.error.message, parsed.error.code); }

    const client = createServiceClient();
    if (!client) return jsonErr(503, 'Reviews backend unavailable', 'NO_ADMIN');

    const creatorId = auth.profileId;
    const callerId = sanitizeText(parsed.data?.callerId, 128);
    const callLogId = sanitizeText(parsed.data?.callLogId, 128) || null;

    if (!callerId || callerId === creatorId) {
      return jsonErr(400, 'Invalid callerId', 'INVALID_CALLER');
    }

    const { data: creator, error: creatorErr } = await client
      .from('profiles')
      .select('id, name, avatar_url, role, gender, spoken_languages')
      .eq('id', creatorId)
      .maybeSingle();
    if (creatorErr) throw creatorErr;
    if (!canRequestRating(creator)) {
      return jsonErr(403, 'Only female hosts can request ratings', 'FORBIDDEN_ROLE');
    }

    const { data: caller, error: callerErr } = await client
      .from('profiles')
      .select('id, name')
      .eq('id', callerId)
      .maybeSingle();
    if (callerErr) throw callerErr;
    if (!caller) return jsonErr(404, 'Caller not found', 'CALLER_NOT_FOUND');

    let callDurationSeconds: number | null = null;
    let resolvedCallLogId: string | null = callLogId;

    if (callLogId) {
      const { data: log, error: logErr } = await client
        .from('call_logs')
        .select('id, caller_id, receiver_id, host_id, duration_seconds')
        .eq('id', callLogId)
        .maybeSingle();
      if (logErr) throw logErr;
      if (!log) return jsonErr(404, 'Call log not found', 'CALL_NOT_FOUND');
      const participants = [log.caller_id, log.receiver_id, log.host_id].map(String);
      if (!participants.includes(creatorId) || !participants.includes(callerId)) {
        return jsonErr(403, 'Call log does not match these users', 'CALL_MISMATCH');
      }
      callDurationSeconds = Number(log.duration_seconds) || null;
    } else {
      const { data: recent } = await client
        .from('call_logs')
        .select('id, duration_seconds, caller_id, receiver_id, host_id')
        .or(
          `and(caller_id.eq.${callerId},receiver_id.eq.${creatorId}),and(caller_id.eq.${creatorId},receiver_id.eq.${callerId}),and(caller_id.eq.${callerId},host_id.eq.${creatorId})`
        )
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (recent?.id) {
        resolvedCallLogId = String(recent.id);
        callDurationSeconds = Number(recent.duration_seconds) || null;
      }
    }

    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const { data: openMsgs, error: openErr } = await client
      .from('messages')
      .select('*')
      .eq('sender_id', creatorId)
      .eq('receiver_id', callerId)
      .eq('type', 'call_rating')
      .gte('created_at', since)
      .order('created_at', { ascending: false })
      .limit(10);
    if (openErr) {
      console.error('[next /api/v1/reviews/request] open check:', openErr.message);
    } else {
      const existing = (openMsgs || []).find((m: any) => {
        const info = m.rating_info || {};
        if (info.isSubmitted) return false;
        if (resolvedCallLogId && info.callLogId && info.callLogId !== resolvedCallLogId) return false;
        return true;
      });
      if (existing) {
        return jsonOk({
          success: true,
          data: {
            messageId: existing.id,
            message: mapMessageRow(existing),
            alreadyRequested: true,
          },
        });
      }
    }

    const spoken =
      Array.isArray(creator?.spoken_languages) && creator.spoken_languages.length > 0
        ? String(creator.spoken_languages[0])
        : 'English';

    const ratingInfo = {
      callLogId: resolvedCallLogId || undefined,
      callDurationSeconds: callDurationSeconds || undefined,
      creatorId,
      creatorName: creator?.name || 'Host',
      creatorAvatar: creator?.avatar_url || '',
      callerId,
      isSubmitted: false,
    };

    const text = `Rating requested by ${creator?.name || 'host'} — share feedback on your recent call when you are ready.`;

    const { data: message, error: msgErr } = await client
      .from('messages')
      .insert({
        sender_id: creatorId,
        receiver_id: callerId,
        text,
        original_language: spoken,
        type: 'call_rating',
        rating_info: ratingInfo,
        is_read: false,
      })
      .select('*')
      .single();

    if (msgErr || !message) {
      console.error('[next /api/v1/reviews/request] insert message:', msgErr?.message);
      return jsonErr(500, 'Failed to send rating request', 'REQUEST_FAILED');
    }

    return jsonOk(
      {
        success: true,
        data: {
          messageId: message.id,
          message: mapMessageRow(message),
          alreadyRequested: false,
        },
      },
      201
    );
  } catch (err: any) {
    console.error('[next /api/v1/reviews/request]', err);
    return jsonErr(500, err?.message || 'Failed to send rating request', 'REQUEST_FAILED');
  }
}
