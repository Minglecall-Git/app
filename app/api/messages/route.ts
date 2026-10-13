import { NextRequest } from 'next/server';
import { createServiceClient, jsonErr, requireAuth } from '../../../lib/nextAuth';
import { enforceRateLimit } from '../../../lib/nextRateLimit';
import { handleSendMessage } from '../../../lib/handlers/messages';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** POST /api/messages */
export async function POST(req: NextRequest) {
  try {
    const limited = await enforceRateLimit(req, 'authenticated');
    if (limited) return limited;

    const auth = await requireAuth(req);
    if (auth.ok === false) return jsonErr(auth.status, auth.error.message, auth.error.code);
    const client = createServiceClient();
    if (!client) return jsonErr(503, 'Messages backend unavailable', 'NO_ADMIN');
    return handleSendMessage(req, auth, client);
  } catch (err: any) {
    console.error('[next /api/messages POST]', err);
    return jsonErr(500, err?.message || 'Failed to send message', 'SEND_FAILED');
  }
}
