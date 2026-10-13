import type { SupabaseClient } from '@supabase/supabase-js';
import { RoomServiceClient } from 'livekit-server-sdk';
import { getLiveKitEnv, isLiveKitConfigured, livekitHttpHost } from '../livekitEnv';

export type AdminSignalDelivery = {
  presence: boolean;
  users: string[];
  errors: string[];
};

export async function broadcastAdminSignal(
  client: SupabaseClient,
  payload: Record<string, unknown>,
  userIds: string[]
): Promise<AdminSignalDelivery> {
  const delivery: AdminSignalDelivery = { presence: false, users: [], errors: [] };
  const ids = Array.from(new Set(userIds.map((id) => String(id || '').trim()).filter(Boolean)));

  const subscribeAndSend = async (topic: string) => {
    const channel = client.channel(topic, {
      config: { broadcast: { self: false, ack: false } },
    });
    await new Promise<void>((resolve) => {
      let settled = false;
      const done = () => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve();
      };
      const timer = setTimeout(done, 4000);
      channel.subscribe((status) => {
        if (status === 'SUBSCRIBED' || status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') done();
      });
    });
    const status = await channel.send({
      type: 'broadcast',
      event: 'signal',
      payload,
    });
    await new Promise((r) => setTimeout(r, 250));
    try {
      await client.removeChannel(channel);
    } catch {
      /* ignore */
    }
    return status !== 'error';
  };

  try {
    delivery.presence = await subscribeAndSend('app-presence');
  } catch (e: any) {
    delivery.errors.push(`presence: ${e?.message || 'broadcast failed'}`);
  }

  for (const uid of ids) {
    try {
      const ok = await subscribeAndSend(`user:${uid}`);
      if (ok) delivery.users.push(uid);
      else delivery.errors.push(`user:${uid}: send error`);
    } catch (e: any) {
      delivery.errors.push(`user:${uid}: ${e?.message || 'broadcast failed'}`);
    }
  }
  return delivery;
}

export async function deleteLivekitRoom(roomName: string) {
  const lk = getLiveKitEnv();
  const host = livekitHttpHost(lk.wsUrl);
  if (!isLiveKitConfigured() || !host) {
    return { ok: false, skipped: true, reason: 'LiveKit env not configured' };
  }
  try {
    const svc = new RoomServiceClient(host, lk.apiKey, lk.apiSecret);
    await svc.deleteRoom(String(roomName));
    return { ok: true, skipped: false, roomName: String(roomName) };
  } catch (e: any) {
    const msg = e?.message || 'deleteRoom failed';
    if (/not found|does not exist|404/i.test(msg)) {
      return { ok: true, skipped: false, roomName: String(roomName), alreadyGone: true };
    }
    return { ok: false, skipped: false, roomName: String(roomName), error: msg };
  }
}
