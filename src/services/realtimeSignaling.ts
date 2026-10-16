/**
 * Supabase Realtime signaling (replaces legacy local WebSocket /ws).
 * Channel naming:
 *  - presence: global "app-presence"
 *  - per-user inbox: "user:{profileId}" and optionally "user:{authId}"
 *
 * Call reliability: user inbox alone is enough to mark connected. Presence is
 * best-effort. Callee also polls GET /api/calls/incoming when broadcast drops.
 */
import { supabase, isSupabaseConfigured } from '../lib/supabase';
import type { RealtimeChannel } from '@supabase/supabase-js';

export type SignalHandler = (payload: any) => void;

/** Topic as stored on RealtimeChannel (`realtime:` prefix). */
function realtimeTopic(name: string): string {
  return name.startsWith('realtime:') ? name : `realtime:${name}`;
}

function channelState(channel: RealtimeChannel): string {
  return String((channel as RealtimeChannel & { state?: string }).state || '');
}

function isChannelJoined(channel: RealtimeChannel): boolean {
  return channelState(channel) === 'joined';
}

/** Broadcast only when channel has finished joining (SUBSCRIBED → state joined). */
async function safeChannelSend(
  channel: RealtimeChannel | null | undefined,
  args: { type: 'broadcast'; event: string; payload: unknown }
): Promise<boolean> {
  if (!channel || !isChannelJoined(channel)) return false;
  try {
    const status = await channel.send(args);
    return status !== 'error';
  } catch (e) {
    console.warn('[RealtimeSignaling] safe send skipped/failed', channel.topic, e);
    return false;
  }
}

/** Untrack only when joined — avoids push-before-join on app-signals. */
async function safeChannelUntrack(
  channel: RealtimeChannel | null | undefined
): Promise<void> {
  if (!channel || !isChannelJoined(channel)) return;
  try {
    await channel.untrack();
  } catch (e) {
    console.warn('[RealtimeSignaling] safe untrack skipped/failed', channel.topic, e);
  }
}

function isChannelJoining(channel: RealtimeChannel): boolean {
  return channelState(channel) === 'joining';
}

function hasJoinedOnce(channel: RealtimeChannel): boolean {
  return Boolean((channel as RealtimeChannel & { joinedOnce?: boolean }).joinedOnce);
}

/** In-flight subscribe waiters keyed by realtime topic — prevents double join. */
const subscribeInflight = new Map<string, Promise<boolean>>();

function forceDropCachedChannel(channel: RealtimeChannel) {
  try {
    channel.teardown();
  } catch {
    /* ignore */
  }
  // removeChannel only tears down on unsubscribe "ok"; timed-out leaves can leave
  // a spent joinedOnce instance in the client cache — drop it so channel() is fresh.
  try {
    const rt = (supabase as unknown as { realtime?: { channels?: RealtimeChannel[]; _remove?: (ch: RealtimeChannel) => void } })
      .realtime;
    if (rt && typeof rt._remove === 'function') {
      rt._remove(channel);
    } else if (rt && Array.isArray(rt.channels)) {
      rt.channels = rt.channels.filter((ch) => ch !== channel && ch.topic !== channel.topic);
    }
  } catch {
    /* ignore */
  }
}

async function removeChannelSafe(channel: RealtimeChannel | null) {
  if (!channel) return;
  const topic = channel.topic;
  subscribeInflight.delete(topic);
  try {
    await channel.untrack();
  } catch {
    /* ignore */
  }
  try {
    await supabase.removeChannel(channel);
  } catch {
    /* ignore */
  }
  if (supabase.getChannels().some((ch) => ch === channel || ch.topic === topic)) {
    forceDropCachedChannel(channel);
  }
}

/** Drop any client-cached channel for this logical name so the next create is fresh. */
async function removeChannelsByName(name: string) {
  const topic = realtimeTopic(name);
  const existing = supabase.getChannels().filter((ch) => ch.topic === topic);
  for (const ch of existing) {
    await removeChannelSafe(ch);
  }
}

/**
 * Subscribe once per channel instance. Reuses in-flight waits and never calls
 * `.subscribe()` on an already-joined / already-joining / spent (joinedOnce) channel.
 */
function waitForSubscribe(
  channel: RealtimeChannel,
  timeoutMs = 12000
): Promise<boolean> {
  const topic = channel.topic;
  const existing = subscribeInflight.get(topic);
  if (existing) return existing;

  const promise = new Promise<boolean>((resolve) => {
    let settled = false;
    const done = (ok: boolean) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (subscribeInflight.get(topic) === promise) {
        subscribeInflight.delete(topic);
      }
      resolve(ok);
    };
    const timer = setTimeout(() => done(false), timeoutMs);

    if (isChannelJoined(channel)) {
      done(true);
      return;
    }

    // Spent instance (closed after a prior join) cannot be re-joined — fail fast.
    if (hasJoinedOnce(channel) && !isChannelJoining(channel) && !isChannelJoined(channel)) {
      done(false);
      return;
    }

    // Already joining: poll until joined / error / timeout (do not call subscribe again).
    if (isChannelJoining(channel) || hasJoinedOnce(channel)) {
      const started = Date.now();
      const poll = () => {
        if (settled) return;
        if (isChannelJoined(channel)) {
          done(true);
          return;
        }
        const st = channelState(channel);
        if (st === 'errored' || st === 'closed') {
          done(false);
          return;
        }
        if (Date.now() - started >= timeoutMs) {
          done(false);
          return;
        }
        setTimeout(poll, 50);
      };
      poll();
      return;
    }

    try {
      channel.subscribe((status) => {
        if (status === 'SUBSCRIBED') done(true);
        else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          done(false);
        }
        // Ignore CLOSED during teardown/reconnect — timeout still bounds the wait
      });
    } catch (e) {
      console.warn('[RealtimeSignaling] subscribe threw', topic, e);
      done(false);
    }
  });

  subscribeInflight.set(topic, promise);
  return promise;
}

/** Create a fresh channel for `name`, removing any stale cached instance first. */
async function createFreshChannel(
  name: string,
  opts?: Parameters<typeof supabase.channel>[1]
): Promise<RealtimeChannel> {
  await removeChannelsByName(name);
  const channel = supabase.channel(name, opts);
  // Guard: client may still return a spent instance if remove raced.
  if (hasJoinedOnce(channel) || isChannelJoined(channel) || isChannelJoining(channel)) {
    await removeChannelSafe(channel);
    return supabase.channel(name, opts);
  }
  return channel;
}

export class RealtimeSignaling {
  private userChannel: RealtimeChannel | null = null;
  /** Extra inboxes when profile.id !== auth.users.id (signals may target either). */
  private aliasChannels: RealtimeChannel[] = [];
  private presenceChannel: RealtimeChannel | null = null;
  private profileId: string | null = null;
  private authId: string | null = null;
  private handler: SignalHandler | null = null;
  private connected = false;
  private connectGeneration = 0;
  /** Serializes connect/disconnect so React remounts cannot double-join. */
  private connectChain: Promise<unknown> = Promise.resolve();
  /** Serializes ephemeral target-channel send joins per topic. */
  private sendTopicChains = new Map<string, Promise<unknown>>();

  isConnected() {
    return this.connected;
  }

  async connect(
    profileId: string,
    accessToken: string,
    onMessage: SignalHandler,
    authId?: string | null
  ): Promise<boolean> {
    if (!isSupabaseConfigured()) return false;

    const run = async (): Promise<boolean> => {
      const generation = ++this.connectGeneration;
      this.handler = onMessage;
      this.profileId = profileId;
      this.authId = String(authId || '').trim() || null;

      // Prefer Realtime JWT auth — do NOT setSession with access_token as refresh_token
      // (that can corrupt/refresh-fail the client session and drop Realtime).
      try {
        const rt = (supabase as any).realtime;
        if (rt && typeof rt.setAuth === 'function' && accessToken) {
          await rt.setAuth(accessToken);
        }
      } catch (e) {
        console.warn('[RealtimeSignaling] setAuth notice:', e);
      }

      // Await teardown so we do not double-subscribe the same topic (common Vercel flake)
      await this.disconnectAsync();
      if (generation !== this.connectGeneration) return false;

      const inboxIds = Array.from(
        new Set([profileId, this.authId].map((v) => String(v || '').trim()).filter(Boolean))
      );

      const trySubscribePair = async (): Promise<{ userOk: boolean; presenceOk: boolean }> => {
        const bindBroadcast = (ch: RealtimeChannel) => {
          ch.on('broadcast', { event: 'signal' }, ({ payload }) => {
            if (payload && this.handler) this.handler(payload);
          });
        };

        const primaryId = inboxIds[0];
        const userChannel = await createFreshChannel(`user:${primaryId}`, {
          config: { broadcast: { self: false } },
        });
        if (generation !== this.connectGeneration) {
          await removeChannelSafe(userChannel);
          return { userOk: false, presenceOk: false };
        }
        bindBroadcast(userChannel);

        const aliases: RealtimeChannel[] = [];
        for (const id of inboxIds.slice(1)) {
          const ch = await createFreshChannel(`user:${id}`, {
            config: { broadcast: { self: false } },
          });
          if (generation !== this.connectGeneration) {
            await removeChannelSafe(ch);
            for (const a of aliases) await removeChannelSafe(a);
            await removeChannelSafe(userChannel);
            return { userOk: false, presenceOk: false };
          }
          bindBroadcast(ch);
          aliases.push(ch);
        }

        // Global app-presence track-all removed — HTTP/Redis heartbeat is authoritative.
        // Optional broadcast-only channel for call signals (no presence.track fan-out).
        const presenceChannel = await createFreshChannel('app-signals', {
          config: { broadcast: { self: false } },
        });
        if (generation !== this.connectGeneration) {
          await removeChannelSafe(presenceChannel);
          for (const a of aliases) await removeChannelSafe(a);
          await removeChannelSafe(userChannel);
          return { userOk: false, presenceOk: false };
        }
        presenceChannel.on('broadcast', { event: 'signal' }, ({ payload }) => {
          if (payload && this.handler) this.handler(payload);
        });

        this.userChannel = userChannel;
        this.aliasChannels = aliases;
        // Assign only after subscribe succeeds — avoid send/track on a joining channel
        this.presenceChannel = null;

        const [userOk, ...aliasResults] = await Promise.all([
          waitForSubscribe(userChannel, 12000),
          ...aliases.map((ch) => waitForSubscribe(ch, 12000)),
        ]);
        // Best-effort signal channel; do not block connect on it
        const presenceOk = await waitForSubscribe(presenceChannel, 8000);
        if (presenceOk) {
          this.presenceChannel = presenceChannel;
        } else {
          await removeChannelSafe(presenceChannel);
          this.presenceChannel = null;
        }
        const anyInbox = userOk || aliasResults.some(Boolean);
        return { userOk: anyInbox, presenceOk };
      };

      let { userOk, presenceOk } = await trySubscribePair();
      if (generation !== this.connectGeneration) return false;

      // One retry — Realtime often flakes once after auth/page load on Vercel
      if (!userOk) {
        console.warn('[RealtimeSignaling] user channel failed; retrying once…');
        await this.disconnectAsync();
        if (generation !== this.connectGeneration) return false;
        ({ userOk, presenceOk } = await trySubscribePair());
        if (generation !== this.connectGeneration) return false;
      }

      if (!presenceOk) {
        console.warn(
          '[RealtimeSignaling] signal channel unavailable — calls still use user inbox + DB poll'
        );
      }

      // User inbox is enough for call signaling; Redis/HTTP owns presence
      this.connected = Boolean(userOk);

      if (this.connected && this.handler) {
        this.handler({ type: 'auth:ok', userId: profileId });
      } else {
        console.warn(
          '[RealtimeSignaling] connect failed — DB call sync/incoming poll remains available'
        );
      }
      return this.connected;
    };

    const next = this.connectChain.then(run, run);
    this.connectChain = next.then(
      () => undefined,
      () => undefined
    );
    return next;
  }

  private async withSendTopicLock<T>(topicName: string, fn: () => Promise<T>): Promise<T> {
    const prev = this.sendTopicChains.get(topicName) || Promise.resolve();
    let release!: () => void;
    const next = new Promise<void>((r) => {
      release = r;
    });
    this.sendTopicChains.set(topicName, next);
    await prev.catch(() => undefined);
    try {
      return await fn();
    } finally {
      release();
      if (this.sendTopicChains.get(topicName) === next) {
        this.sendTopicChains.delete(topicName);
      }
    }
  }

  /** Prefer an already-subscribed inbox we own; otherwise join ephemeral target channel. */
  private findOwnedSubscribedChannel(targetId: string): RealtimeChannel | null {
    const topic = realtimeTopic(`user:${targetId}`);
    const candidates = [this.userChannel, this.presenceChannel, ...this.aliasChannels];
    for (const ch of candidates) {
      if (ch && ch.topic === topic && isChannelJoined(ch)) return ch;
    }
    const cached = supabase.getChannels().find((ch) => ch.topic === topic);
    if (cached && isChannelJoined(cached)) return cached;
    return null;
  }

  async send(payload: Record<string, any>): Promise<boolean> {
    if (!this.connected || !this.userChannel) return false;
    const type = String(payload.type || '');

    // Route directed events to recipient user channel(s).
    // Include profile id + auth id aliases — peers may subscribe under either.
    const targetIds = new Set<string>();
    const pushTarget = (v: unknown) => {
      const id = String(v || '').trim();
      if (id) targetIds.add(id);
    };
    pushTarget(payload.toUserId);
    pushTarget(payload.targetUserId);
    pushTarget(payload.calleeId);
    pushTarget(payload.toAuthId);
    pushTarget(payload.receiverAuthId);
    pushTarget(payload.callerAuthId);
    if (
      type === 'call:accept' ||
      type === 'call:accepted' ||
      type === 'call:reject' ||
      type === 'call:cancel' ||
      type === 'call:end' ||
      type === 'call:ended' ||
      type === 'call:safety_warning'
    ) {
      pushTarget(payload.callerId);
      pushTarget(payload.receiverId);
    }
    if (type === 'call:initiate' || type === 'call:incoming' || type === 'call:ringing') {
      pushTarget(payload.receiverId);
    }
    pushTarget(payload.receiverId);
    pushTarget(payload.userId);

    try {
      if (
        targetIds.size > 0 &&
        (type.startsWith('call:') ||
          type.startsWith('friend_request:') ||
          type === 'chat:message' ||
          type === 'chat:incall_preview' ||
          type.startsWith('quick_match:') ||
          type === 'match:created')
      ) {
        // Best-effort fanout on app-signals only when fully joined (Redis owns presence TTL)
        await safeChannelSend(this.presenceChannel, {
          type: 'broadcast',
          event: 'signal',
          payload,
        });

        let delivered = false;
        for (const targetId of targetIds) {
          const topicName = `user:${targetId}`;
          const ok = await this.withSendTopicLock(topicName, async () => {
            // Reuse our own subscribed inbox when targeting ourselves / alias — never re-join.
            const owned = this.findOwnedSubscribedChannel(targetId);
            if (owned) {
              return safeChannelSend(owned, {
                type: 'broadcast',
                event: 'signal',
                payload,
              });
            }

            const targetChannel = await createFreshChannel(topicName, {
              config: { broadcast: { self: false, ack: true } },
            });
            // CRITICAL: wait until SUBSCRIBED before broadcast — otherwise initiate/accept are dropped
            const subscribed = await waitForSubscribe(targetChannel, 5000);
            if (!subscribed) {
              console.warn('[RealtimeSignaling] target channel subscribe failed', targetId, type);
              await removeChannelSafe(targetChannel);
              return false;
            }
            const sent = await safeChannelSend(targetChannel, {
              type: 'broadcast',
              event: 'signal',
              payload,
            });
            // Keep the ephemeral channel briefly so the broadcast can flush to peers.
            await new Promise((r) => setTimeout(r, 350));
            await removeChannelSafe(targetChannel);
            if (!sent) {
              console.warn('[RealtimeSignaling] target broadcast error', targetId, type);
              return false;
            }
            return true;
          });
          if (ok) delivered = true;
        }
        // Fanout may be best-effort — caller UX continues; callee also polls GET /api/calls/incoming.
        return (
          delivered ||
          (Boolean(this.presenceChannel) && isChannelJoined(this.presenceChannel!)) ||
          this.connected
        );
      }

      if (type === 'presence:update' || type === 'heartbeat' || type === 'user:update') {
        // Do NOT track() on app-signals — broadcast-only; Redis/HTTP owns presence.
        const nextStatus = String(payload.status || 'online').toLowerCase();
        if (nextStatus === 'offline') {
          await safeChannelUntrack(this.presenceChannel);
        }
        await safeChannelSend(this.presenceChannel, {
          type: 'broadcast',
          event: 'signal',
          payload,
        });
        return true;
      }

      return safeChannelSend(this.userChannel, {
        type: 'broadcast',
        event: 'signal',
        payload,
      });
    } catch (e) {
      console.warn('[RealtimeSignaling] send failed', e);
      return false;
    }
  }

  /** Fire-and-forget disconnect (legacy callers). */
  disconnect() {
    void this.disconnectAsync();
  }

  async disconnectAsync() {
    const presence = this.presenceChannel;
    const user = this.userChannel;
    const aliases = this.aliasChannels.slice();
    this.presenceChannel = null;
    this.userChannel = null;
    this.aliasChannels = [];
    this.connected = false;
    await removeChannelSafe(presence);
    await removeChannelSafe(user);
    for (const ch of aliases) {
      await removeChannelSafe(ch);
    }
  }
}

function readPublicEnv(key: string): string {
  try {
    const fromVite = (import.meta as ImportMeta & { env?: Record<string, string | undefined> }).env?.[key];
    if (fromVite) return String(fromVite).trim();
  } catch {
    /* Next does not fill import.meta.env */
  }
  return String(typeof process !== 'undefined' ? process.env[key] || '' : '').trim();
}

export function shouldUseRealtimeSignaling(): boolean {
  if (!isSupabaseConfigured()) return false;
  const flag = (readPublicEnv('NEXT_PUBLIC_USE_REALTIME') || readPublicEnv('VITE_USE_REALTIME')).toLowerCase();
  if (flag === 'true' || flag === '1') return true;
  if (flag === 'false' || flag === '0') return false;
  if ((readPublicEnv('NEXT_PUBLIC_WS_URL') || readPublicEnv('VITE_WS_URL')).length > 0) return false;
  // Default: Supabase Realtime on localhost and Vercel (no app-hosted /ws).
  return true;
}
