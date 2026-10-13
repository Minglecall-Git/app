import { Router } from 'express';
import type { ServerRuntime } from '../runtimeTypes';
import { requireAuth } from '../middleware/auth';
import { getSupabaseAdmin, isSupabaseAdminConfigured } from '../supabaseAdmin';

const MAX_COMMENT_LEN = 500;
const MAX_TAGS = 12;
const CREATOR_ROLES = new Set(['female_creator', 'female_host', 'female_user']);

function authUserId(req: any): string {
  return String(req.profileId || req.user?.id || '');
}

function sendError(res: any, status: number, message: string, code: string) {
  return res.status(status).json({ success: false, error: { message, code } });
}

function clampStar(value: unknown): number | null {
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  const rounded = Math.round(n);
  if (rounded < 1 || rounded > 5) return null;
  return rounded;
}

function sanitizeText(value: unknown, maxLen: number): string {
  return String(value ?? '')
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '')
    .trim()
    .slice(0, maxLen);
}

function canRequestRating(profile: { role?: string | null; gender?: string | null } | null): boolean {
  if (!profile) return false;
  const role = String(profile.role || '');
  if (CREATOR_ROLES.has(role)) return true;
  return String(profile.gender || '').toLowerCase() === 'female' && role !== 'male_user';
}

function isAdminRole(role?: string | null) {
  return role === 'admin';
}

function mapReviewRow(row: any) {
  return {
    id: row.id,
    creatorId: row.creator_id,
    callerId: row.caller_id,
    callerName: row.caller_name || '',
    callerAvatar: row.caller_avatar || '',
    callLogId: row.call_log_id || undefined,
    stars: row.stars,
    communication: row.communication ?? undefined,
    friendliness: row.friendliness ?? undefined,
    clarity: row.clarity ?? undefined,
    energy: row.energy ?? undefined,
    comment: row.comment || undefined,
    tags: Array.isArray(row.tags) ? row.tags : [],
    callDurationSeconds: row.call_duration_seconds ?? undefined,
    requestedBy: row.requested_by || undefined,
    ratingRequestMessageId: row.rating_request_message_id || undefined,
    createdAt: row.created_at,
  };
}

function mapMessageRow(row: any) {
  return {
    id: row.id,
    senderId: row.sender_id,
    receiverId: row.receiver_id,
    text: row.text || '',
    originalLanguage: row.original_language || 'English',
    translatedText: row.translated_text || undefined,
    targetLanguage: row.target_language || undefined,
    mediaUrl: row.media_url || undefined,
    mediaType: row.media_type || undefined,
    type: row.type,
    giftInfo: row.gift_info || undefined,
    friendRequestInfo: row.friend_request_info || undefined,
    ratingInfo: row.rating_info || undefined,
    isRead: Boolean(row.is_read),
    readAt: row.read_at || undefined,
    createdAt: row.created_at,
    timestamp: row.created_at,
  };
}

async function recomputeCreatorRating(client: any, creatorId: string) {
  const { data, error } = await client
    .from('creator_reviews')
    .select('stars')
    .eq('creator_id', creatorId);
  if (error) throw error;
  const rows = data || [];
  const count = rows.length;
  const avg =
    count === 0
      ? 5.0
      : Number(
          (
            rows.reduce((sum: number, r: any) => sum + Number(r.stars || 0), 0) / count
          ).toFixed(2)
        );
  const { error: updErr } = await client
    .from('profiles')
    .update({
      rating_score: avg,
      total_reviews_count: count,
    })
    .eq('id', creatorId);
  if (updErr) throw updErr;
  return { ratingScore: avg, totalReviewsCount: count };
}

export function createReviewsRouter(_runtime: ServerRuntime) {
  const router = Router();

  /** POST /api/v1/reviews/request  { callerId, callLogId? } */
  router.post('/request', requireAuth, async (req, res) => {
    try {
      if (!isSupabaseAdminConfigured()) {
        return sendError(res, 503, 'Reviews backend unavailable', 'NO_ADMIN');
      }

      const creatorId = authUserId(req);
      const callerId = sanitizeText(req.body?.callerId, 128);
      const callLogId = sanitizeText(req.body?.callLogId, 128) || null;

      if (!creatorId) return sendError(res, 401, 'Unauthorized', 'UNAUTHORIZED');
      if (!callerId || callerId === creatorId) {
        return sendError(res, 400, 'Invalid callerId', 'INVALID_CALLER');
      }

      const client = getSupabaseAdmin()!;
      const { data: creator, error: creatorErr } = await client
        .from('profiles')
        .select('id, name, avatar_url, role, gender, spoken_languages')
        .eq('id', creatorId)
        .maybeSingle();
      if (creatorErr) throw creatorErr;
      if (!canRequestRating(creator)) {
        return sendError(res, 403, 'Only female hosts can request ratings', 'FORBIDDEN_ROLE');
      }

      const { data: caller, error: callerErr } = await client
        .from('profiles')
        .select('id, name')
        .eq('id', callerId)
        .maybeSingle();
      if (callerErr) throw callerErr;
      if (!caller) return sendError(res, 404, 'Caller not found', 'CALLER_NOT_FOUND');

      let callDurationSeconds: number | null = null;
      let resolvedCallLogId: string | null = callLogId;

      if (callLogId) {
        const { data: log, error: logErr } = await client
          .from('call_logs')
          .select('id, caller_id, receiver_id, host_id, duration_seconds')
          .eq('id', callLogId)
          .maybeSingle();
        if (logErr) throw logErr;
        if (!log) return sendError(res, 404, 'Call log not found', 'CALL_NOT_FOUND');
        const participants = [log.caller_id, log.receiver_id, log.host_id].map(String);
        if (!participants.includes(creatorId) || !participants.includes(callerId)) {
          return sendError(res, 403, 'Call log does not match these users', 'CALL_MISMATCH');
        }
        callDurationSeconds = Number(log.duration_seconds) || null;
      } else {
        // Prefer most recent completed call between the pair (optional enrichment)
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

      // Soft-dedupe: reuse open unsubmitted request in last 24h for same pair (+ call when present)
      const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      let openQuery = client
        .from('messages')
        .select('*')
        .eq('sender_id', creatorId)
        .eq('receiver_id', callerId)
        .eq('type', 'call_rating')
        .gte('created_at', since)
        .order('created_at', { ascending: false })
        .limit(10);
      const { data: openMsgs, error: openErr } = await openQuery;
      if (openErr) {
        console.error('[reviews/request] open check:', openErr.message);
      } else {
        const existing = (openMsgs || []).find((m: any) => {
          const info = m.rating_info || {};
          if (info.isSubmitted) return false;
          if (resolvedCallLogId && info.callLogId && info.callLogId !== resolvedCallLogId) return false;
          return true;
        });
        if (existing) {
          return res.json({
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
        console.error('[reviews/request] insert message:', msgErr?.message);
        return sendError(res, 500, 'Failed to send rating request', 'REQUEST_FAILED');
      }

      return res.status(201).json({
        success: true,
        data: {
          messageId: message.id,
          message: mapMessageRow(message),
          alreadyRequested: false,
        },
      });
    } catch (err: any) {
      console.error('[reviews/request] exception:', err);
      return sendError(res, 500, err?.message || 'Failed to send rating request', 'REQUEST_FAILED');
    }
  });

  /** POST /api/v1/reviews — caller submits rating */
  router.post('/', requireAuth, async (req, res) => {
    try {
      if (!isSupabaseAdminConfigured()) {
        return sendError(res, 503, 'Reviews backend unavailable', 'NO_ADMIN');
      }

      const callerId = authUserId(req);
      if (!callerId) return sendError(res, 401, 'Unauthorized', 'UNAUTHORIZED');

      const creatorId = sanitizeText(req.body?.creatorId, 128);
      const callLogId = sanitizeText(req.body?.callLogId, 128) || null;
      const ratingRequestMessageId =
        sanitizeText(req.body?.ratingRequestMessageId, 64) || null;
      const stars = clampStar(req.body?.stars);
      const communication = clampStar(req.body?.communication);
      const friendliness = clampStar(req.body?.friendliness);
      const clarity = clampStar(req.body?.clarity);
      const energy = clampStar(req.body?.energy);
      const comment = sanitizeText(req.body?.comment, MAX_COMMENT_LEN) || null;
      const tagsRaw = Array.isArray(req.body?.tags) ? req.body.tags : [];
      const tags = tagsRaw
        .map((t: unknown) => sanitizeText(t, 64))
        .filter(Boolean)
        .slice(0, MAX_TAGS);
      const callDurationSeconds =
        req.body?.callDurationSeconds != null && Number.isFinite(Number(req.body.callDurationSeconds))
          ? Math.max(0, Math.round(Number(req.body.callDurationSeconds)))
          : null;

      if (!creatorId || creatorId === callerId) {
        return sendError(res, 400, 'Invalid creatorId', 'INVALID_CREATOR');
      }
      if (stars == null) {
        return sendError(res, 400, 'stars must be an integer from 1 to 5', 'INVALID_STARS');
      }

      const client = getSupabaseAdmin()!;

      const { data: creator, error: creatorErr } = await client
        .from('profiles')
        .select('id, name')
        .eq('id', creatorId)
        .maybeSingle();
      if (creatorErr) throw creatorErr;
      if (!creator) return sendError(res, 404, 'Creator not found', 'CREATOR_NOT_FOUND');

      const { data: caller, error: callerErr } = await client
        .from('profiles')
        .select('id, name, avatar_url')
        .eq('id', callerId)
        .maybeSingle();
      if (callerErr) throw callerErr;

      // Load rating request message if provided (must match caller as receiver)
      let requestMessage: any = null;
      if (ratingRequestMessageId) {
        const { data: msg, error: msgErr } = await client
          .from('messages')
          .select('*')
          .eq('id', ratingRequestMessageId)
          .maybeSingle();
        if (msgErr) throw msgErr;
        if (!msg || msg.type !== 'call_rating') {
          return sendError(res, 404, 'Rating request not found', 'REQUEST_NOT_FOUND');
        }
        if (String(msg.receiver_id) !== callerId) {
          return sendError(res, 403, 'You are not the recipient of this rating request', 'NOT_RECIPIENT');
        }
        if (msg.rating_info?.isSubmitted) {
          return sendError(res, 409, 'This rating request was already submitted', 'ALREADY_SUBMITTED');
        }
        if (msg.rating_info?.creatorId && String(msg.rating_info.creatorId) !== creatorId) {
          return sendError(res, 400, 'Creator does not match rating request', 'CREATOR_MISMATCH');
        }
        requestMessage = msg;
      }

      // Duplicate guards
      if (callLogId) {
        const { data: dupCall } = await client
          .from('creator_reviews')
          .select('id')
          .eq('caller_id', callerId)
          .eq('call_log_id', callLogId)
          .maybeSingle();
        if (dupCall?.id) {
          return sendError(res, 409, 'You already rated this call', 'DUPLICATE_CALL_REVIEW');
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
          return sendError(res, 409, 'You already submitted this rating request', 'DUPLICATE_REQUEST_REVIEW');
        }
      }

      const resolvedCallLogId =
        callLogId ||
        (requestMessage?.rating_info?.callLogId
          ? String(requestMessage.rating_info.callLogId)
          : null);
      const resolvedDuration =
        callDurationSeconds ??
        (requestMessage?.rating_info?.callDurationSeconds != null
          ? Number(requestMessage.rating_info.callDurationSeconds)
          : null);

      const insertPayload: Record<string, unknown> = {
        creator_id: creatorId,
        caller_id: callerId,
        caller_name: caller?.name || sanitizeText(req.body?.callerName, 120) || null,
        caller_avatar: caller?.avatar_url || sanitizeText(req.body?.callerAvatar, 500) || null,
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
          return sendError(res, 409, 'Duplicate review for this call or request', 'DUPLICATE_REVIEW');
        }
        console.error('[reviews] insert:', insErr?.message);
        return sendError(res, 500, 'Failed to save review', 'INSERT_FAILED');
      }

      // Mark chat card submitted
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
          console.error('[reviews] update message rating_info:', updMsgErr.message);
        }
      } else if (resolvedCallLogId) {
        // Best-effort: mark matching open call_rating cards between pair
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

      return res.status(201).json({
        success: true,
        data: {
          review: mapReviewRow(review),
          creatorRating: score,
        },
      });
    } catch (err: any) {
      console.error('[reviews] exception:', err);
      return sendError(res, 500, err?.message || 'Failed to save review', 'REVIEW_FAILED');
    }
  });

  /** GET /api/v1/reviews/creator/:creatorId */
  router.get('/creator/:creatorId', requireAuth, async (req, res) => {
    try {
      if (!isSupabaseAdminConfigured()) {
        return sendError(res, 503, 'Reviews backend unavailable', 'NO_ADMIN');
      }

      const me = authUserId(req);
      const creatorId = sanitizeText(req.params.creatorId, 128);
      if (!me) return sendError(res, 401, 'Unauthorized', 'UNAUTHORIZED');
      if (!creatorId) return sendError(res, 400, 'creatorId required', 'INVALID_CREATOR');

      const client = getSupabaseAdmin()!;
      const profile = (req as any).profile as { role?: string } | undefined;
      const appRole = (req as any).user?.app_metadata?.role;
      const isAdmin = isAdminRole(profile?.role) || isAdminRole(appRole);
      if (me !== creatorId && !isAdmin) {
        return sendError(res, 403, 'You can only view your own reviews', 'FORBIDDEN');
      }

      const limit = Math.min(Math.max(Number(req.query?.limit) || 100, 1), 200);
      const { data, error } = await client
        .from('creator_reviews')
        .select('*')
        .eq('creator_id', creatorId)
        .order('created_at', { ascending: false })
        .limit(limit);
      if (error) {
        console.error('[reviews/creator] select:', error.message);
        return sendError(res, 500, 'Failed to load reviews', 'LOAD_FAILED');
      }

      return res.json({
        success: true,
        data: { reviews: (data || []).map(mapReviewRow) },
      });
    } catch (err: any) {
      console.error('[reviews/creator] exception:', err);
      return sendError(res, 500, err?.message || 'Failed to load reviews', 'LOAD_FAILED');
    }
  });

  return router;
}
