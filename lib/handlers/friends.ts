import type { SupabaseClient } from '@supabase/supabase-js';

export function mapFriendRequestRow(row: any, profilesById: Map<string, any>) {
  const sender = profilesById.get(String(row.sender_id));
  const receiver = profilesById.get(String(row.receiver_id));
  return {
    id: String(row.id),
    senderId: String(row.sender_id),
    senderName: sender?.name || String(row.sender_id),
    senderAvatar: sender?.avatar_url || '',
    receiverId: String(row.receiver_id),
    receiverName: receiver?.name || String(row.receiver_id),
    receiverAvatar: receiver?.avatar_url || '',
    status: String(row.status || 'pending'),
    timestamp: row.created_at
      ? new Date(row.created_at).toLocaleString()
      : new Date().toLocaleString(),
    createdAt: row.created_at || null,
    respondedAt: row.responded_at || null,
  };
}

export async function enrichFriendRequests(client: SupabaseClient, rows: any[]) {
  const ids = Array.from(
    new Set(
      (rows || []).flatMap((r) => [String(r.sender_id), String(r.receiver_id)]).filter(Boolean)
    )
  );
  const profilesById = new Map<string, any>();
  if (ids.length > 0) {
    const { data: profiles, error } = await client
      .from('profiles')
      .select('id, name, avatar_url')
      .in('id', ids);
    if (error) throw error;
    for (const p of profiles || []) {
      profilesById.set(String(p.id), p);
    }
  }
  return (rows || []).map((row) => mapFriendRequestRow(row, profilesById));
}

export async function loadRequestsForUser(client: SupabaseClient, userId: string) {
  const { data, error } = await client
    .from('friend_requests')
    .select('*')
    .or(`sender_id.eq.${userId},receiver_id.eq.${userId}`)
    .order('created_at', { ascending: false });
  if (error) throw error;
  const requests = await enrichFriendRequests(client, data || []);
  const friendIds = requests
    .filter((r) => r.status === 'accepted')
    .map((r) => (r.senderId === userId ? r.receiverId : r.senderId));
  return {
    requests,
    friendIds: Array.from(new Set(friendIds)),
  };
}

/** Product rule: female hosts/creators (and female gender) may initiate friend requests. */
export function canInitiateFriendRequest(profile: { role?: string | null; gender?: string | null }) {
  const role = String(profile.role || '');
  const gender = String(profile.gender || '');
  if (gender === 'female') return true;
  return role === 'female_creator' || role === 'female_host' || role === 'female_user';
}
