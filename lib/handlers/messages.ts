import type { SupabaseClient } from '@supabase/supabase-js';
import type { NextRequest } from 'next/server';
import { jsonErr, jsonOk, type AuthOk } from '../nextAuth';
import { parseJsonBody } from '../nextRequest';
import { broadcastChatMessage } from '../realtimeBroadcast';

const MAX_TEXT_LENGTH = 4000;
const MAX_MEDIA_URL_LENGTH = 2048;
const ALLOWED_MESSAGE_TYPES = new Set(['text', 'image', 'video', 'voice', 'gift', 'friend_request']);

export function mapMessageRow(row: any, clientTempId?: string | null) {
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
    clientTempId: clientTempId || undefined,
  };
}

function isAllowedMediaUrl(url: string): boolean {
  const trimmed = url.trim();
  if (!trimmed || trimmed.length > MAX_MEDIA_URL_LENGTH) return false;
  if (trimmed.startsWith('blob:') || trimmed.startsWith('data:')) return false;

  if (trimmed.startsWith('/api/storage/media?key=')) {
    try {
      const q = new URL(trimmed, 'http://localhost').searchParams.get('key') || '';
      return q.includes('uploads/');
    } catch {
      return false;
    }
  }

  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return false;
    const path = decodeURIComponent(parsed.pathname || '');
    if (
      path.includes('/uploads/chat_media/') ||
      path.includes('/uploads/moment/') ||
      path.includes('/uploads/gallery/')
    ) {
      return true;
    }
    if (parsed.searchParams.get('key')?.includes('uploads/')) return true;
    return false;
  } catch {
    return false;
  }
}

function resolveMessageType(rawType: unknown, hasMedia: boolean): string {
  const candidate = String(rawType || '').trim();
  if (ALLOWED_MESSAGE_TYPES.has(candidate)) return candidate;
  return hasMedia ? 'image' : 'text';
}

async function assertReceiverExists(client: SupabaseClient, receiverId: string) {
  const { data, error } = await client
    .from('profiles')
    .select('id, is_banned, banned_until')
    .eq('id', receiverId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

async function loadSenderProfile(client: SupabaseClient, senderId: string) {
  const { data, error } = await client
    .from('profiles')
    .select('id, is_banned, banned_until, spoken_languages')
    .eq('id', senderId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

function isProfileSuspended(profile: { is_banned?: boolean | null; banned_until?: string | null } | null): boolean {
  if (!profile) return true;
  if (!profile.is_banned) return false;
  if (!profile.banned_until) return true;
  const until = new Date(profile.banned_until).getTime();
  if (Number.isNaN(until)) return true;
  return until > Date.now();
}

async function isBlockedEitherWay(client: SupabaseClient, userId: string, otherUserId: string) {
  const { data, error } = await client
    .from('blocked_users')
    .select('user_id, blocked_user_id')
    .or(
      `and(user_id.eq.${userId},blocked_user_id.eq.${otherUserId}),and(user_id.eq.${otherUserId},blocked_user_id.eq.${userId})`
    )
    .limit(1);
  if (error) throw error;
  return Boolean(data && data.length > 0);
}

/** POST /api/messages */
export async function handleSendMessage(req: NextRequest, auth: AuthOk, client: SupabaseClient) {
  const senderId = auth.profileId;
  if (!senderId) return jsonErr(401, 'Unauthorized', 'UNAUTHORIZED');

  const parsed = await parseJsonBody<{
    receiverId?: string;
    text?: string;
    mediaUrl?: string;
    mediaType?: string;
    type?: string;
    clientTempId?: string;
    originalLanguage?: string;
  }>(req);
  if (parsed.ok === false) return jsonErr(parsed.status, parsed.error.message, parsed.error.code);

  const receiverId = String(parsed.data?.receiverId || '').trim();
  const textRaw = typeof parsed.data?.text === 'string' ? parsed.data.text : '';
  const text = textRaw.trim();
  const mediaUrlRaw = typeof parsed.data?.mediaUrl === 'string' ? parsed.data.mediaUrl.trim() : '';
  const mediaType = typeof parsed.data?.mediaType === 'string' ? parsed.data.mediaType.trim() : null;
  const clientTempId =
    typeof parsed.data?.clientTempId === 'string' && parsed.data.clientTempId.trim()
      ? parsed.data.clientTempId.trim().slice(0, 80)
      : null;
  const originalLanguage =
    typeof parsed.data?.originalLanguage === 'string' && parsed.data.originalLanguage.trim()
      ? parsed.data.originalLanguage.trim().slice(0, 64)
      : null;

  if (!receiverId || receiverId === senderId) {
    return jsonErr(400, 'Invalid receiverId', 'INVALID_RECEIVER');
  }

  const hasMedia = Boolean(mediaUrlRaw);
  if (!text && !hasMedia) {
    return jsonErr(400, 'Message text or mediaUrl is required', 'EMPTY_MESSAGE');
  }
  if (text.length > MAX_TEXT_LENGTH) {
    return jsonErr(400, `Text exceeds ${MAX_TEXT_LENGTH} characters`, 'TEXT_TOO_LONG');
  }
  if (hasMedia && !isAllowedMediaUrl(mediaUrlRaw)) {
    return jsonErr(400, 'mediaUrl is not an allowed app media URL', 'INVALID_MEDIA_URL');
  }

  const [sender, receiver] = await Promise.all([
    loadSenderProfile(client, senderId),
    assertReceiverExists(client, receiverId),
  ]);

  if (!sender) return jsonErr(403, 'Sender profile not found', 'SENDER_NOT_FOUND');
  if (isProfileSuspended(sender)) {
    return jsonErr(403, 'Your account is suspended and cannot send messages', 'SENDER_SUSPENDED');
  }
  if (!receiver) return jsonErr(404, 'Receiver not found', 'RECEIVER_NOT_FOUND');
  if (isProfileSuspended(receiver)) {
    return jsonErr(403, 'This user is unavailable', 'RECEIVER_UNAVAILABLE');
  }

  if (await isBlockedEitherWay(client, senderId, receiverId)) {
    return jsonErr(403, 'Messaging is blocked for this conversation', 'BLOCKED');
  }

  const messageType = resolveMessageType(parsed.data?.type, hasMedia);
  const spoken =
    Array.isArray(sender.spoken_languages) && sender.spoken_languages.length > 0
      ? String(sender.spoken_languages[0])
      : 'English';

  const insertPayload: Record<string, unknown> = {
    sender_id: senderId,
    receiver_id: receiverId,
    text: text || (hasMedia ? '📷 Photo' : null),
    original_language: originalLanguage || spoken,
    translated_text: null,
    target_language: null,
    media_url: hasMedia ? mediaUrlRaw : null,
    media_type: hasMedia ? mediaType || 'image' : null,
    type: messageType,
    is_read: false,
  };

  const { data, error } = await client.from('messages').insert(insertPayload).select('*').single();
  if (error || !data) {
    console.error('[messages/send]', error?.message);
    return jsonErr(500, 'Failed to send message', 'SEND_FAILED');
  }

  const mapped = mapMessageRow(data, clientTempId);

  try {
    await broadcastChatMessage(client, mapped, [senderId, receiverId]);
  } catch (broadcastErr: any) {
    console.warn(
      '[messages/send] realtime broadcast failed (message still durable)',
      broadcastErr?.message || broadcastErr
    );
  }

  return Response.json(
    {
      success: true,
      data: { message: mapped },
      message: mapped,
    },
    { status: 201, headers: { 'Cache-Control': 'no-store' } }
  );
}

/** GET /api/messages/conversation/:otherUserId */
export async function handleConversationPage(
  req: NextRequest,
  auth: AuthOk,
  client: SupabaseClient,
  otherUserIdRaw: string
) {
  const me = auth.profileId;
  const otherUserId = String(otherUserIdRaw || '').trim();
  if (!me || !otherUserId || otherUserId === me) {
    return jsonErr(400, 'Invalid otherUserId', 'INVALID_OTHER');
  }

  // Same block gate as POST /api/messages — deny history when either side blocked the other
  if (await isBlockedEitherWay(client, me, otherUserId)) {
    return jsonErr(403, 'Messaging is blocked for this conversation', 'BLOCKED');
  }

  const url = new URL(req.url);
  const cursor = String(url.searchParams.get('cursor') || '').trim();
  let limit = Number(url.searchParams.get('limit') || 40);
  if (!Number.isFinite(limit) || limit <= 0) limit = 40;
  limit = Math.min(Math.floor(limit), 50);

  let clearedAt: string | null = null;
  try {
    const { data: clearRow } = await client
      .from('message_conversation_clears')
      .select('cleared_at')
      .eq('user_id', me)
      .eq('other_user_id', otherUserId)
      .maybeSingle();
    clearedAt = clearRow?.cleared_at ? String(clearRow.cleared_at) : null;
  } catch {
    /* optional table */
  }

  let q = client
    .from('messages')
    .select('*')
    .or(
      `and(sender_id.eq.${me},receiver_id.eq.${otherUserId}),and(sender_id.eq.${otherUserId},receiver_id.eq.${me})`
    )
    .order('created_at', { ascending: false })
    .limit(limit);
  if (clearedAt) q = q.gt('created_at', clearedAt);
  if (cursor) q = q.lt('created_at', cursor);

  const { data, error } = await q;
  if (error) {
    return jsonErr(500, error.message || 'Failed to load messages', 'LOAD_FAILED');
  }

  const newestFirst = data || [];
  const nextCursor =
    newestFirst.length === limit ? newestFirst[newestFirst.length - 1]?.created_at || null : null;
  const messages = newestFirst
    .slice()
    .reverse()
    .map((row) => mapMessageRow(row));

  return jsonOk({
    success: true,
    messages,
    nextCursor,
    pageSize: limit,
  });
}

/** POST /api/messages/read */
export async function handleMarkRead(req: NextRequest, auth: AuthOk, client: SupabaseClient) {
  const me = auth.profileId;
  const parsed = await parseJsonBody<{ otherUserId?: string }>(req);
  if (parsed.ok === false) return jsonErr(parsed.status, parsed.error.message, parsed.error.code);

  const otherUserId = String(parsed.data?.otherUserId || '').trim();
  if (!me) return jsonErr(401, 'Unauthorized', 'UNAUTHORIZED');
  if (!otherUserId || otherUserId === me) {
    return jsonErr(400, 'Invalid otherUserId', 'INVALID_OTHER');
  }

  const nowIso = new Date().toISOString();
  const { data, error } = await client
    .from('messages')
    .update({ is_read: true, read_at: nowIso })
    .eq('receiver_id', me)
    .eq('sender_id', otherUserId)
    .eq('is_read', false)
    .select('id');

  if (error) {
    console.error('[messages/read]', error.message);
    return jsonErr(500, 'Failed to mark messages read', 'READ_FAILED');
  }

  return jsonOk({
    success: true,
    data: {
      otherUserId,
      updatedIds: (data || []).map((r: any) => r.id),
      updatedCount: (data || []).length,
      readAt: nowIso,
    },
  });
}

async function upsertConversationClear(client: SupabaseClient, me: string, otherUserId: string) {
  const clearedAt = new Date().toISOString();
  const { error } = await client.from('message_conversation_clears').upsert(
    {
      user_id: me,
      other_user_id: otherUserId,
      cleared_at: clearedAt,
    },
    { onConflict: 'user_id,other_user_id' }
  );
  if (error) throw error;
  return clearedAt;
}

/** DELETE /api/messages/conversation/:otherUserId */
export async function handleClearConversation(
  auth: AuthOk,
  client: SupabaseClient,
  otherUserIdRaw: string
) {
  const me = auth.profileId;
  const otherUserId = String(otherUserIdRaw || '').trim();
  if (!me) return jsonErr(401, 'Unauthorized', 'UNAUTHORIZED');
  if (!otherUserId || otherUserId === me) {
    return jsonErr(400, 'Invalid otherUserId', 'INVALID_OTHER');
  }

  try {
    const clearedAt = await upsertConversationClear(client, me, otherUserId);
    return jsonOk({
      success: true,
      data: {
        otherUserId,
        clearedAt,
        semantics: 'soft_hide_for_actor',
      },
    });
  } catch (err: any) {
    console.error('[messages/clear]', err?.message || err);
    return jsonErr(500, 'Failed to clear conversation', 'CLEAR_FAILED');
  }
}

/** POST /api/messages/clear */
export async function handleClearConversationPost(req: NextRequest, auth: AuthOk, client: SupabaseClient) {
  const me = auth.profileId;
  const parsed = await parseJsonBody<{ otherUserId?: string }>(req);
  if (parsed.ok === false) return jsonErr(parsed.status, parsed.error.message, parsed.error.code);

  const otherUserId = String(parsed.data?.otherUserId || '').trim();
  if (!me) return jsonErr(401, 'Unauthorized', 'UNAUTHORIZED');
  if (!otherUserId || otherUserId === me) {
    return jsonErr(400, 'Invalid otherUserId', 'INVALID_OTHER');
  }

  try {
    const clearedAt = await upsertConversationClear(client, me, otherUserId);
    return jsonOk({
      success: true,
      data: {
        otherUserId,
        clearedAt,
        semantics: 'soft_hide_for_actor',
      },
    });
  } catch (err: any) {
    console.error('[messages/clear]', err?.message || err);
    return jsonErr(500, 'Failed to clear conversation', 'CLEAR_FAILED');
  }
}
