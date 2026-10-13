import { NextRequest } from 'next/server';
import { createServiceClient, jsonErr, jsonOk, requireAuth } from '../../../../lib/nextAuth';
import { parseJsonBody } from '../../../../lib/nextRequest';
import {
  MAX_COMMENT_LEN,
  MAX_TAGS,
  clampStar,
  mapReviewRow,
  recomputeCreatorRating,
  sanitizeText,
} from '../../../../lib/handlers/reviews';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** POST /api/v1/reviews */
export async function POST(req: NextRequest) {
  try {
    const auth = await requireAuth(req);
    if (!auth.ok) { return jsonErr(auth.status, auth.error.message, auth.error.code); }

    const parsed = await parseJsonBody<Record<string, unknown>>(req);
    if (!parsed.ok) { return jsonErr(parsed.status, parsed.error.message, parsed.error.code); }

    const body = parsed.data || {};
    const client = createServiceClient();
    if (!client) return jsonErr(503, 'Reviews backend unavailable', 'NO_ADMIN');

    const callerId = auth.profileId;
    const creatorId = sanitizeText(body.creatorId, 128);
    const callLogId = sanitizeText(body.callLogId, 128) || null;
    const ratingRequestMessageId = sanitizeText(body.ratingRequestMessageId, 64) || null;
    const stars = clampStar(body.stars);
    const communication = clampStar(body.communication);
    const friendliness = clampStar(body.friendliness);
    const clarity = clampStar(body.clarity);
    const energy = clampStar(body.energy);
    const comment = sanitizeText(body.comment, MAX_COMMENT_LEN) || null;
    const tagsRaw = Array.isArray(body.tags) ? body.tags : [];
    const tags = tagsRaw
      .map((t: unknown) => sanitizeText(t, 64))
      .filter(Boolean)
      .slice(0, MAX_TAGS);
    const callDurationSeconds =
      body.callDurationSeconds != null && Number.isFinite(Number(body.callDurationSeconds))
        ? Math.max(0, Math.round(Number(body.callDurationSeconds)))
        : null;

    if (!creatorId || creatorId === callerId) {
      return jsonErr(400, 'Invalid creatorId', 'INVALID_CREATOR');
    }
    if (stars == null) {
      return jsonErr(400, 'stars must be an integer from 1 to 5', 'INVALID_STARS');
    }

    const { data: creator, error: creatorErr } = await client
      .from('profiles')
      .select('id, name')
      .eq('id', creatorId)
      .maybeSingle();
    if (creatorErr) throw creatorErr;
    if (!creator) return jsonErr(404, 'Creator not found', 'CREATOR_NOT_FOUND');

    const { data: caller, error: callerErr } = await client
      .from('profiles')
      .select('id, name, avatar_url')
      .eq('id', callerId)
      .maybeSingle();
    if (callerErr) throw callerErr;

    let requestMessage: any = null;
    if (ratingRequestMessageId) {
      const { data: msg, error: msgErr } = await client
        .from('messages')
        .select('*')
        .eq('id', ratingRequestMessageId)
        .maybeSingle();
      if (msgErr) throw msgErr;
      if (!msg || msg.type !== 'call_rating') {
        return jsonErr(404, 'Rating request not found', 'REQUEST_NOT_FOUND');
      }
      if (String(msg.receiver_id) !== callerId) {
        return jsonErr(403, 'You are not the recipient of this rating request', 'NOT_RECIPIENT');
      }
      if (msg.rating_info?.isSubmitted) {
        return jsonErr(409, 'This rating request was already submitted', 'ALREADY_SUBMITTED');
      }
      if (msg.rating_info?.creatorId && String(msg.rating_info.creatorId) !== creatorId) {
        return jsonErr(400, 'Creator does not match rating request', 'CREATOR_MISMATCH');
      }
      requestMessage = msg;
    }

    if (callLogId) {
      const { data: dupCall } = await client
        .from('creator_reviews')
        .select('id')
        .eq('caller_id', callerId)
        .eq('call_log_id', callLogId)
        .maybeSingle();
      if (dupCall?.id) {
        return jsonErr(409, 'You already rated this call', 'DUPLICATE_CALL_REVIEW');
      }
    }
    if (ratingRequestMessageId) {
      const { data: dupReq } = await client
        .from('creator_reviews')
        .select('id')
        .eq('caller_id', callerId)
        .eq('rating_request_message_id', ratingRequestMessageId)
        .maybeSingle();
      if (dupReq?.id) {
        return jsonErr(409, 'You already submitted this rating request', 'DUPLICATE_REQUEST_REVIEW');
      }
    }

    const resolvedCallLogId =
      callLogId ||
      (requestMessage?.rating_info?.callLogId ? String(requestMessage.rating_info.callLogId) : null);
    const resolvedDuration =
      callDurationSeconds ??
      (requestMessage?.rating_info?.callDurationSeconds != null
        ? Number(requestMessage.rating_info.callDurationSeconds)
        : null);

    const insertPayload: Record<string, unknown> = {
      creator_id: creatorId,
      caller_id: callerId,
      caller_name: caller?.name || sanitizeText(body.callerName, 120) || null,
      caller_avatar: caller?.avatar_url || sanitizeText(body.callerAvatar, 500) || null,
      call_log_id: resolvedCallLogId,
      stars,
      communication,
      friendliness,
      clarity,
      energy,
      comment,
      tags,
      call_duration_seconds: resolvedDuration,
      requested_by: requestMessage ? String(requestMessage.sender_id) : creatorId,
      rating_request_message_id: ratingRequestMessageId,
    };

    const { data: review, error: insErr } = await client
      .from('creator_reviews')
      .insert(insertPayload)
      .select('*')
      .single();

    if (insErr || !review) {
      if (String(insErr?.code) === '23505') {
        return jsonErr(409, 'Duplicate review for this call or request', 'DUPLICATE_REVIEW');
      }
      console.error('[next /api/v1/reviews] insert:', insErr?.message);
      return jsonErr(500, 'Failed to save review', 'INSERT_FAILED');
    }

    if (ratingRequestMessageId && requestMessage) {
      const nextInfo = {
        ...(requestMessage.rating_info || {}),
        stars,
        communication: communication ?? undefined,
        friendliness: friendliness ?? undefined,
        clarity: clarity ?? undefined,
        energy: energy ?? undefined,
        comment: comment || undefined,
        tags,
        isSubmitted: true,
      };
      const { error: updMsgErr } = await client
        .from('messages')
        .update({ rating_info: nextInfo })
        .eq('id', ratingRequestMessageId);
      if (updMsgErr) {
        console.error('[next /api/v1/reviews] update message rating_info:', updMsgErr.message);
      }
    } else if (resolvedCallLogId) {
      const { data: cards } = await client
        .from('messages')
        .select('id, rating_info')
        .eq('type', 'call_rating')
        .eq('receiver_id', callerId)
        .eq('sender_id', creatorId)
        .order('created_at', { ascending: false })
        .limit(20);
      for (const card of cards || []) {
        const info = card.rating_info || {};
        if (info.isSubmitted) continue;
        if (info.callLogId && String(info.callLogId) !== resolvedCallLogId) continue;
        await client
          .from('messages')
          .update({
            rating_info: {
              ...info,
              stars,
              communication: communication ?? undefined,
              friendliness: friendliness ?? undefined,
              clarity: clarity ?? undefined,
              energy: energy ?? undefined,
              comment: comment || undefined,
              tags,
              isSubmitted: true,
            },
          })
          .eq('id', card.id);
      }
    }

    const score = await recomputeCreatorRating(client, creatorId);

    return jsonOk(
      {
        success: true,
        data: {
          review: mapReviewRow(review),
          creatorRating: score,
        },
      },
      201
    );
  } catch (err: any) {
    console.error('[next /api/v1/reviews]', err);
    return jsonErr(500, err?.message || 'Failed to save review', 'REVIEW_FAILED');
  }
}
