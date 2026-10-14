import { randomUUID } from 'crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import { flushCallLedger } from '../callLedger';
import {
  deleteCallState,
  setCallState,
  setPresence,
} from '../redis';
import {
  maxCallEconomy,
  resolveProfileId,
  toIsoTimestamp,
  upsertCallLog,
} from './callLogsDb';

const BUSY_STATUSES = new Set(['ringing', 'active', 'accepted', 'in_call', 'connecting']);
const END_STATUSES = new Set([
  'completed',
  'missed',
  'declined',
  'cancelled',
  'canceled',
  'failed',
  'ended',
  'rejected',
]);

export async function handleCallsSync(
  client: SupabaseClient,
  auth: { profileId: string; userId: string; role: string },
  body: Record<string, unknown>
) {
  const callId = String(body.callId || body.id || randomUUID());
  const myProfileId = String(auth.profileId || '').trim();
  const myAuthId = String(auth.userId || '').trim();
  const rawCaller = String(body.callerId || '').trim();
  const rawReceiver = String(body.receiverId || '').trim();

  let callerId = await resolveProfileId(client, rawCaller || myProfileId || myAuthId);
  let receiverId = await resolveProfileId(client, rawReceiver);

  const rawIsMe = (v: string) => v && (v === myProfileId || v === myAuthId);
  if (rawIsMe(rawCaller) || (!rawCaller && myProfileId)) {
    callerId = myProfileId || callerId;
  }
  if (rawIsMe(rawReceiver)) {
    receiverId = myProfileId || receiverId;
  }
  if (!callerId && myProfileId) callerId = myProfileId;
  if (!callerId) {
    return {
      status: 400 as const,
      body: {
        success: false,
        error: { message: 'Invalid callerId — no matching profile', code: 'INVALID_CALLER' },
      },
    };
  }
  if (rawReceiver && !receiverId) {
    return {
      status: 400 as const,
      body: {
        success: false,
        error: {
          message: 'Invalid receiverId — no matching profile',
          code: 'INVALID_RECEIVER',
          detail: rawReceiver,
        },
      },
    };
  }

  if (
    myProfileId &&
    callerId &&
    receiverId &&
    myProfileId !== callerId &&
    myProfileId !== receiverId &&
    myAuthId !== callerId &&
    myAuthId !== receiverId &&
    auth.role !== 'admin'
  ) {
    return {
      status: 403 as const,
      body: { success: false, error: { message: 'Only call participants can sync this call', code: 'FORBIDDEN' } },
    };
  }

  const callStatus = String(body.status || body.outcome || 'completed').toLowerCase();
  if (!callStatus) {
    return {
      status: 400 as const,
      body: { success: false, error: { message: 'callId and status are required', code: 'INVALID_INPUT' } },
    };
  }

  const startedAt =
    toIsoTimestamp(body.startedAt || body.startTime) ||
    (BUSY_STATUSES.has(callStatus) ? new Date().toISOString() : undefined);
  const endedAt = END_STATUSES.has(callStatus)
    ? toIsoTimestamp(body.endedAt || body.endTime) || new Date().toISOString()
    : null;

  const callerName = body.callerName ? String(body.callerName).trim().slice(0, 120) : undefined;
  const receiverName =
    body.receiverName || body.hostName
      ? String(body.receiverName || body.hostName).trim().slice(0, 120)
      : undefined;

  const normalizedBusyStatus =
    callStatus === 'accepted' || callStatus === 'in_call' || callStatus === 'connecting'
      ? 'active'
      : callStatus;

  const payload: Record<string, unknown> = {
    id: callId,
    caller_id: callerId,
    receiver_id: receiverId || undefined,
    host_id: receiverId || undefined,
    caller_name: callerName,
    host_name: receiverName,
    status: BUSY_STATUSES.has(callStatus) ? normalizedBusyStatus : callStatus,
    started_at: startedAt,
    start_time: startedAt,
    updated_at: new Date().toISOString(),
    end_reason: body.reason ? String(body.reason).slice(0, 120) : undefined,
  };

  // Flush Redis billing buffer before finalizing end-state call_logs (authoritative coins)
  let ledgerFlush: Awaited<ReturnType<typeof flushCallLedger>> | null = null;
  if (END_STATUSES.has(callStatus)) {
    try {
      ledgerFlush = await flushCallLedger(client, callId);
      if (!ledgerFlush.success) {
        console.warn(
          '[next /api/calls/sync] call ledger flush:',
          ledgerFlush.code,
          ledgerFlush.error
        );
      }
    } catch (e: any) {
      console.warn('[next /api/calls/sync] call ledger flush exception:', e?.message);
    }
  }

  if (END_STATUSES.has(callStatus)) {
    const { data: existing } = await client
      .from('call_logs')
      .select('coins_spent, coins_earned, duration_seconds')
      .eq('id', callId)
      .maybeSingle();
    payload.duration_seconds = maxCallEconomy(
      existing?.duration_seconds,
      body.durationSeconds || body.duration
    );
    // Prefer post-flush DB totals; do not trust client coin estimates (avoids double-count)
    payload.coins_spent = Number(existing?.coins_spent) || 0;
    payload.coins_earned = Number(existing?.coins_earned) || 0;
    payload.ended_at = endedAt;
    payload.end_time = endedAt;
    if (!payload.end_reason) payload.end_reason = callStatus;
  } else if (BUSY_STATUSES.has(callStatus)) {
    payload.ended_at = null;
    payload.end_time = null;
  }

  Object.keys(payload).forEach((k) => payload[k] === undefined && delete payload[k]);
  const error = await upsertCallLog(client, payload);
  if (error) {
    console.warn('[next /api/calls/sync]', error.message);
    return {
      status: 500 as const,
      body: {
        success: false,
        error: { message: 'Call sync failed', code: 'CALL_SYNC_FAILED', detail: error.message },
      },
    };
  }

  try {
    if (callStatus === 'ringing') {
      await setPresence(callerId, 'busy');
      await setCallState(callId, {
        callerId,
        receiverId,
        status: callStatus,
        startedAt: startedAt || null,
      });
    } else if (BUSY_STATUSES.has(callStatus)) {
      await setPresence(callerId, 'busy');
      if (receiverId) await setPresence(receiverId, 'busy');
      await setCallState(callId, {
        callerId,
        receiverId,
        status: normalizedBusyStatus,
        startedAt: startedAt || null,
      });
    } else if (END_STATUSES.has(callStatus)) {
      await setPresence(callerId, 'online');
      if (receiverId) await setPresence(receiverId, 'online');
      await deleteCallState(callId);
    }
  } catch (e: any) {
    console.warn('[next /api/calls/sync] Redis', e?.message);
  }

  return {
    status: 200 as const,
    body: {
      success: true,
      callId,
      presenceUpdated: true,
      status: callStatus,
      ledgerFlush: ledgerFlush
        ? {
            flushedMinutes: ledgerFlush.flushedMinutes,
            coinsSpent: ledgerFlush.coinsSpent,
            success: ledgerFlush.success,
          }
        : undefined,
      runtime: 'next-native',
    },
  };
}
