import type { SupabaseClient } from '@supabase/supabase-js';

export async function loadBlockLists(client: SupabaseClient, userId: string) {
  const [iBlocked, blockedMe] = await Promise.all([
    client.from('blocked_users').select('blocked_user_id').eq('user_id', userId),
    client.from('blocked_users').select('user_id').eq('blocked_user_id', userId),
  ]);
  if (iBlocked.error) throw iBlocked.error;
  if (blockedMe.error) throw blockedMe.error;
  return {
    blockedUserIds: (iBlocked.data || []).map((r: any) => String(r.blocked_user_id)),
    blockedByUserIds: (blockedMe.data || []).map((r: any) => String(r.user_id)),
  };
}

/** Decline pending friend requests and strip favorites both directions after a block. */
export async function cleanupSocialOnBlock(client: SupabaseClient, actorId: string, targetUserId: string) {
  await client
    .from('friend_requests')
    .update({ status: 'declined', responded_at: new Date().toISOString() })
    .eq('status', 'pending')
    .or(
      `and(sender_id.eq.${actorId},receiver_id.eq.${targetUserId}),and(sender_id.eq.${targetUserId},receiver_id.eq.${actorId})`
    );

  await client
    .from('friend_requests')
    .delete()
    .eq('status', 'accepted')
    .or(
      `and(sender_id.eq.${actorId},receiver_id.eq.${targetUserId}),and(sender_id.eq.${targetUserId},receiver_id.eq.${actorId})`
    );

  await client
    .from('favorites')
    .delete()
    .or(
      `and(user_id.eq.${actorId},favorite_user_id.eq.${targetUserId}),and(user_id.eq.${targetUserId},favorite_user_id.eq.${actorId})`
    );
}
