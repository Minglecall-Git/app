import type { SupabaseClient } from '@supabase/supabase-js';

export type MatchStatus = 'pending' | 'matched' | 'rejected' | 'unmatched';

export function mapMatchRow(row: any, currentUserId: string) {
  const otherUserId = row.user_a_id === currentUserId ? row.user_b_id : row.user_a_id;
  return {
    id: row.id,
    userAId: row.user_a_id,
    userBId: row.user_b_id,
    otherUserId,
    status: row.status as MatchStatus,
    initiatedBy: row.initiated_by,
    matchedAt: row.matched_at,
    lastInteractionAt: row.last_interaction_at,
    createdAt: row.created_at,
  };
}

export async function findMatchPair(client: SupabaseClient, userA: string, userB: string) {
  const { data, error } = await client
    .from('matches')
    .select('*')
    .or(
      `and(user_a_id.eq.${userA},user_b_id.eq.${userB}),and(user_a_id.eq.${userB},user_b_id.eq.${userA})`
    )
    .limit(1);
  if (error) throw error;
  return data && data.length > 0 ? data[0] : null;
}

export async function assertTargetExists(client: SupabaseClient, targetUserId: string) {
  const { data, error } = await client
    .from('profiles')
    .select('id, is_banned, role')
    .eq('id', targetUserId)
    .maybeSingle();
  if (error) throw error;
  return data;
}
