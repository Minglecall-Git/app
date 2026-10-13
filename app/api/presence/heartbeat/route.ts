import { NextRequest } from 'next/server';
import { jsonErr, jsonOk, requireAuth } from '../../../../lib/nextAuth';
import {
  deletePresence,
  isRedisConfigured,
  mgetPresence,
  RedisUnavailableError,
  setPresence,
  type PresenceStatus,
} from '../../../../lib/redis';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * POST /api/presence/heartbeat — Redis-only native Next route.
 * Skips Express in-memory broadcast (Realtime/Redis are source of truth).
 */
export async function POST(req: NextRequest) {
  try {
    const auth = await requireAuth(req);
    if (!auth.ok) { return jsonErr(auth.status, auth.error.message, auth.error.code); }

    if (!isRedisConfigured()) {
      return jsonErr(503, 'Presence service unavailable — Redis is not configured', 'REDIS_UNAVAILABLE');
    }

    let body: any = {};
    try {
      body = await req.json();
    } catch {
      body = {};
    }

    const status = body?.status;
    const peerIds = body?.peerIds;
    const requested: PresenceStatus | null =
      status === 'offline'
        ? 'offline'
        : status === 'busy' || status === 'in_call'
          ? 'busy'
          : status === 'online' || !status
            ? 'online'
            : null;

    if (status && !requested) {
      return jsonErr(400, 'status must be online, busy, or offline', 'INVALID_STATUS');
    }

    const writeStatus = requested || 'online';
    const userId = auth.profileId;

    try {
      if (writeStatus === 'offline') await deletePresence(userId);
      else await setPresence(userId, writeStatus);
    } catch (err: any) {
      return jsonErr(503, err?.message || 'Redis unavailable', 'REDIS_UNAVAILABLE');
    }

    let presence: Record<string, PresenceStatus> = { [userId]: writeStatus };
    try {
      if (Array.isArray(peerIds) && peerIds.length) {
        const redisMap = await mgetPresence(peerIds.map(String));
        presence = { ...redisMap, [userId]: writeStatus };
      }
    } catch {
      presence = { [userId]: writeStatus };
    }

    return jsonOk({
      success: true,
      status: writeStatus,
      presence,
      redis: true,
      runtime: 'next-native',
    });
  } catch (err: any) {
    if (err instanceof RedisUnavailableError || err?.code === 'REDIS_UNAVAILABLE') {
      return jsonErr(503, err?.message || 'Redis unavailable', 'REDIS_UNAVAILABLE');
    }
    console.error('[next /api/presence/heartbeat]', err);
    return jsonErr(500, err?.message || 'Heartbeat failed', 'SERVER_ERROR');
  }
}
