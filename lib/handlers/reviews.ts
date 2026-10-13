import type { SupabaseClient } from '@supabase/supabase-js';

export const MAX_COMMENT_LEN = 500;
export const MAX_TAGS = 12;
const CREATOR_ROLES = new Set(['female_creator', 'female_host', 'female_user']);

export function clampStar(value: unknown): number | null {
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  const rounded = Math.round(n);
  if (rounded < 1 || rounded > 5) return null;
  return rounded;
}

export function sanitizeText(value: unknown, maxLen: number): string {
  return String(value ?? '')
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '')
    .trim()
    .slice(0, maxLen);
}

export function canRequestRating(profile: { role?: string | null; gender?: string | null } | null): boolean {
  if (!profile) return false;
  const role = String(profile.role || '');
  if (CREATOR_ROLES.has(role)) return true;
  return String(profile.gender || '').toLowerCase() === 'female' && role !== 'male_user';
}

export function isAdminRole(role?: string | null) {
  return role === 'admin';
}

export function mapReviewRow(row: any) {
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

export function mapMessageRow(row: any) {
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

export async function recomputeCreatorRating(client: SupabaseClient, creatorId: string) {
  const { data, error } = await client.from('creator_reviews').select('stars').eq('creator_id', creatorId);
  if (error) throw error;
  const rows = data || [];
  const count = rows.length;
  const avg =
    count === 0
      ? 5.0
      : Number((rows.reduce((sum: number, r: any) => sum + Number(r.stars || 0), 0) / count).toFixed(2));
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
