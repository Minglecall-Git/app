import { NextRequest } from 'next/server';
import { jsonErr, jsonOk, requireAdmin } from '../../../../lib/nextAuth';
import { parseJsonBody } from '../../../../lib/nextRequest';
import { cleanLiveKitEnv, getLiveKitEnv, isLiveKitConfigured } from '../../../../lib/livekitEnv';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function statusPayload() {
  const livekit = getLiveKitEnv();
  const hasSecret = Boolean(livekit.apiSecret && livekit.apiSecret !== 'secret');
  const configured = isLiveKitConfigured();
  return {
    configured,
    apiKeyConfigured: Boolean(livekit.apiKey && livekit.apiKey !== 'devkey'),
    apiSecretConfigured: hasSecret,
    wsUrl: livekit.wsUrl,
    runtime: 'next-native',
  };
}

/** GET /api/livekit/config — env-based, admin only (native Next). */
export async function GET(req: NextRequest) {
  try {
    const auth = await requireAdmin(req);
    if (!auth.ok) { return jsonErr(auth.status, auth.error.message, auth.error.code); }
    return jsonOk(statusPayload());
  } catch (err: any) {
    return jsonErr(500, err?.message || 'LiveKit config failed', 'SERVER_ERROR');
  }
}

/** POST /api/livekit/config — runtime env update (local/dev parity; redeploy for Vercel). */
export async function POST(req: NextRequest) {
  try {
    const auth = await requireAdmin(req);
    if (!auth.ok) { return jsonErr(auth.status, auth.error.message, auth.error.code); }

    const parsed = await parseJsonBody<{ apiKey?: string; apiSecret?: string; wsUrl?: string }>(req);
    if (!parsed.ok) { return jsonErr(parsed.status, parsed.error.message, parsed.error.code); }

    const { apiKey, apiSecret, wsUrl } = parsed.data || {};
    if (apiKey !== undefined) process.env.LIVEKIT_API_KEY = cleanLiveKitEnv(apiKey);
    if (apiSecret !== undefined) process.env.LIVEKIT_API_SECRET = cleanLiveKitEnv(apiSecret);
    if (wsUrl !== undefined) process.env.LIVEKIT_URL = cleanLiveKitEnv(wsUrl);

    return jsonOk({
      success: true,
      ...statusPayload(),
      message: 'LiveKit API keys updated for this server instance.',
    });
  } catch (err: any) {
    return jsonErr(500, err?.message || 'Failed to update LiveKit credentials', 'SERVER_ERROR');
  }
}
