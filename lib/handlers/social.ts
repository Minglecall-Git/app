import type { SupabaseClient } from '@supabase/supabase-js';

export async function isBlockedEitherWay(
  client: SupabaseClient,
  userId: string,
  targetUserId: string
): Promise<boolean> {
  const { data, error } = await client
    .from('blocked_users')
    .select('user_id, blocked_user_id')
    .or(
      `and(user_id.eq.${userId},blocked_user_id.eq.${targetUserId}),and(user_id.eq.${targetUserId},blocked_user_id.eq.${userId})`
    )
    .limit(1);
  if (error) throw error;
  return Boolean(data && data.length > 0);
}
