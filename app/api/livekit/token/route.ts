import { AccessToken } from 'livekit-server-sdk';
import { NextRequest } from 'next/server';
import { authorizeCallParticipant } from '../../../../lib/handlers/livekitCallAuth';
import { getLiveKitEnv, isLiveKitConfigured } from '../../../../lib/livekitEnv';
import { createServiceClient, jsonErr, jsonOk, requireAuth } from '../../../../lib/nextAuth';
import { parseJsonBody } from '../../../../lib/nextRequest';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** POST /api/livekit/token — server-derived identity (native Next). */
export async function POST(req: NextRequest) {
  try {
    const auth = await requireAuth(req);
    if (!auth.ok) { return jsonErr(auth.status, auth.error.message, auth.error.code); }

    const parsed = await parseJsonBody<{ roomName?: string; callId?: string; name?: string }>(req);
    if (!parsed.ok) { return jsonErr(parsed.status, parsed.error.message, parsed.error.code); }

    const roomName = String(parsed.data?.roomName || parsed.data?.callId || '').trim();
    const identity = auth.profileId;
    if (!roomName || !identity) {
      return jsonErr(400, 'roomName is required', 'INVALID_INPUT');
    }

    const isAdminTestRoom = roomName.startsWith('admin_test_room_');
    if (isAdminTestRoom && auth.role !== 'admin') {
      return jsonErr(403, 'Admin test rooms require admin privileges.', 'FORBIDDEN');
    }

    if (!isAdminTestRoom) {
      const client = createServiceClient();
      const authz = await authorizeCallParticipant(
        client,
        auth.profileId,
        auth.userId,
        roomName,
        auth.role,
        auth.email
      );
      if (authz.ok === false) return jsonErr(authz.status, authz.error, authz.code);
    }

    const livekit = getLiveKitEnv();
    const urlOk =
      Boolean(livekit.wsUrl) &&
      !livekit.wsUrl.includes('your-livekit') &&
      (livekit.wsUrl.startsWith('wss://') || livekit.wsUrl.startsWith('ws://'));

    if (!isLiveKitConfigured() || !urlOk) {
      return jsonOk({
        configured: false,
        token: null,
        wsUrl: urlOk ? livekit.wsUrl : null,
        message:
          'LiveKit credentials missing or placeholder. Set LIVEKIT_URL, LIVEKIT_API_KEY, LIVEKIT_API_SECRET.',
        runtime: 'next-native',
      });
    }

    const displayName =
      (typeof parsed.data?.name === 'string' && parsed.data.name.trim()) ||
      auth.email ||
      identity;

    const at = new AccessToken(livekit.apiKey, livekit.apiSecret, {
      identity,
      name: displayName,
      ttl: '1h',
    });
    at.addGrant({
      roomJoin: true,
      room: roomName,
      canPublish: true,
      canSubscribe: true,
      canPublishData: true,
      hidden: false,
    });

    const token = await at.toJwt();
    return jsonOk({
      configured: true,
      token,
      wsUrl: livekit.wsUrl,
      runtime: 'next-native',
    });
  } catch (err: any) {
    console.error('[next /api/livekit/token]', err);
    return jsonErr(500, 'Failed to generate token', 'TOKEN_FAILED', {
      configured: false,
      token: null,
      message:
        'Token signing failed. Check that LIVEKIT_API_KEY and LIVEKIT_API_SECRET match your LiveKit Cloud project.',
    });
  }
}
