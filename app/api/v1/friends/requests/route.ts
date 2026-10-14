import { NextRequest } from 'next/server';
import { createServiceClient, jsonErr, jsonOk, requireAuth } from '../../../../../lib/nextAuth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function mapFriendRequestRow(row: any, profilesById: Map<string, any>) {
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

/** GET /api/v1/friends/requests — Next.js Route Handler. */
export async function GET(req: NextRequest) {
  try {
    const auth = await requireAuth(req);
    if (!auth.ok) { return jsonErr(auth.status, auth.error.message, auth.error.code); }

    const client = createServiceClient();
    if (!client) return jsonErr(503, 'Friends backend unavailable', 'NO_ADMIN');

    const { data, error } = await client
      .from('friend_requests')
      .select('*')
      .or(`sender_id.eq.${auth.profileId},receiver_id.eq.${auth.profileId}`)
      .order('created_at', { ascending: false });
    if (error) throw error;

    const rows = data || [];
    const ids = Array.from(
      new Set(rows.flatMap((r: any) => [String(r.sender_id), String(r.receiver_id)]).filter(Boolean))
    );
    const profilesById = new Map<string, any>();
    if (ids.length) {
      const { data: profiles, error: pErr } = await client
        .from('profiles')
        .select('id, name, avatar_url')
        .in('id', ids);
      if (pErr) throw pErr;
      for (const p of profiles || []) profilesById.set(String(p.id), p);
    }

    const requests = rows.map((row: any) => mapFriendRequestRow(row, profilesById));
    const friendIds = requests
      .filter((r) => r.status === 'accepted')
      .map((r) => (r.senderId === auth.profileId ? r.receiverId : r.senderId));

    return jsonOk({
      success: true,
      data: { requests, friendIds: Array.from(new Set(friendIds)) },
    });
  } catch (err: any) {
    console.error('[next /api/v1/friends/requests]', err);
    return jsonErr(500, err?.message || 'Failed to load friend requests', 'LOAD_FAILED');
  }
}
