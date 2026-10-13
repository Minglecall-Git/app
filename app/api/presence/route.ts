import { NextRequest } from 'next/server';
import { jsonErr, jsonOk, requireAuth } from '../../../lib/nextAuth';
import {
  deletePresence,
  isRedisConfigured,
  mgetPresence,
  RedisUnavailableError,
  setPresence,
  type PresenceStatus,
} from '../../../lib/redis';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** GET /api/presence?ids=a,b — Redis batch lookup (native Next). */
export async function GET(req: NextRequest) {
  try {
    const auth = await requireAuth(req);
    if (!auth.ok) { return jsonErr(auth.status, auth.error.message, auth.error.code); }
    if (!isRedisConfigured()) {
      return jsonErr(503, 'Presence service unavailable — Redis is not configured', 'REDIS_UNAVAILABLE');
    }

    const idsParam = req.nextUrl.searchParams.get('ids') || '';
    const ids = idsParam
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
      .slice(0, 200);

    if (!ids.length) {
      return jsonOk({ success: true, presence: {}, source: 'redis', runtime: 'next-native' });
    }

    const presence = await mgetPresence(ids);
    return jsonOk({ success: true, presence, source: 'redis', runtime: 'next-native' });
  } catch (err: any) {
    if (err instanceof RedisUnavailableError) {
      return jsonErr(503, err.message, 'REDIS_UNAVAILABLE');
    }
    return jsonErr(500, err?.message || 'Presence lookup failed', 'SERVER_ERROR');
  }
}

/** POST /api/presence — set own presence in Redis (native Next). */
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
    const requested: PresenceStatus | null =
      status === 'offline'
        ? 'offline'
        : status === 'busy' || status === 'in_call'
          ? 'busy'
          : status === 'online' || !status
            ? 'online'
            : null;

    if (!requested) {
      return jsonErr(400, 'status must be online, busy, or offline', 'INVALID_STATUS');
    }

    const userId = auth.profileId;
    if (requested === 'offline') await deletePresence(userId);
    else await setPresence(userId, requested);

    return jsonOk({
      success: true,
      status: requested,
      presence: { [userId]: requested },
      redis: true,
      runtime: 'next-native',
    });
  } catch (err: any) {
    if (err instanceof RedisUnavailableError) {
      return jsonErr(503, err.message, 'REDIS_UNAVAILABLE');
    }
    return jsonErr(500, err?.message || 'Presence update failed', 'SERVER_ERROR');
  }
}
