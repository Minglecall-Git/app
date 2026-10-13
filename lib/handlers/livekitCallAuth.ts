import type { SupabaseClient } from '@supabase/supabase-js';
import { getCallState, isRedisConfigured } from '../redis';

const OPEN_STATUSES = new Set(['ringing', 'active', 'accepted', 'in_call', 'connecting']);

export type CallParticipantAuth =
  | { ok: true; roomName: string }
  | { ok: false; status: number; error: string; code: string };

export async function authorizeCallParticipant(
  client: SupabaseClient | null,
  profileId: string,
  userId: string,
  callId: string,
  role: string,
  email?: string
): Promise<CallParticipantAuth> {
  if (role === 'admin' && String(callId).startsWith('admin_test_room_')) {
    return { ok: true, roomName: callId };
  }

  if (isRedisConfigured()) {
    try {
      const state = await getCallState(callId);
      if (state) {
        const ids = [state.callerId, state.receiverId].map((x) => String(x || ''));
        if (ids.includes(profileId) || ids.includes(userId)) {
          return { ok: true, roomName: callId };
        }
        return { ok: false, status: 403, error: 'Not authorized to join this room.', code: 'NOT_CALL_MEMBER' };
      }
    } catch {
      /* optional */
    }
  }

  if (!client) {
    return { ok: false, status: 503, error: 'Supabase not configured', code: 'NO_SUPABASE' };
  }

  let row: {
    id: string;
    caller_id: string | null;
    receiver_id: string | null;
    host_id: string | null;
    status: string | null;
  } | null = null;

  const fetchRow = async () => {
    const { data } = await client
      .from('call_logs')
      .select('id, caller_id, receiver_id, host_id, status')
      .eq('id', callId)
      .maybeSingle();
    return data;
  };

  row = await fetchRow();
  if (!row) {
    await new Promise((r) => setTimeout(r, 500));
    row = await fetchRow();
  }

  if (!row) {
    return {
      ok: false,
      status: 404,
      error: 'Call room not found or is no longer active.',
      code: 'CALL_NOT_FOUND',
    };
  }

  const st = String(row.status || '').toLowerCase();
  if (st && !OPEN_STATUSES.has(st)) {
    return { ok: false, status: 409, error: 'This call has already ended.', code: 'CALL_ENDED' };
  }

  const participantIds = [row.caller_id, row.receiver_id, row.host_id]
    .map((v) => String(v || '').trim())
    .filter(Boolean);

  let isMember =
    participantIds.includes(profileId) ||
    (!!userId && participantIds.includes(userId));

  if (!isMember && participantIds.length) {
    const { data: rows } = await client
      .from('profiles')
      .select('id, auth_id, email')
      .in('id', participantIds);
    const myEmail = String(email || '')
      .trim()
      .toLowerCase();
    for (const p of rows || []) {
      if (String(p.id) === profileId || String(p.id) === userId) {
        isMember = true;
        break;
      }
      if (p.auth_id && (String(p.auth_id) === profileId || String(p.auth_id) === userId)) {
        isMember = true;
        break;
      }
      if (myEmail && p.email && String(p.email).trim().toLowerCase() === myEmail) {
        isMember = true;
        break;
      }
    }
  }

  if (!isMember) {
    return { ok: false, status: 403, error: 'Not authorized to join this room.', code: 'NOT_CALL_MEMBER' };
  }

  return { ok: true, roomName: String(row.id || callId) };
}
