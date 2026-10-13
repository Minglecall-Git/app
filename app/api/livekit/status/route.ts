import { getLiveKitEnv, isLiveKitConfigured } from '../../../../lib/livekitEnv';
import { jsonOk } from '../../../../lib/nextAuth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** GET /api/livekit/status — public configuration probe (native Next). */
export async function GET() {
  const livekit = getLiveKitEnv();
  return jsonOk({
    configured: isLiveKitConfigured(),
    wsUrl: livekit.wsUrl || null,
    runtime: 'next-native',
  });
}
