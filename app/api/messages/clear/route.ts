import { NextRequest } from 'next/server';
import { createServiceClient, jsonErr, requireAuth } from '../../../../lib/nextAuth';
import { handleClearConversationPost } from '../../../../lib/handlers/messages';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** POST /api/messages/clear */
export async function POST(req: NextRequest) {
  try {
    const auth = await requireAuth(req);
    if (auth.ok === false) return jsonErr(auth.status, auth.error.message, auth.error.code);
    const client = createServiceClient();
    if (!client) return jsonErr(503, 'Messages backend unavailable', 'NO_ADMIN');
    return handleClearConversationPost(req, auth, client);
  } catch (err: any) {
    console.error('[next /api/messages/clear]', err);
    return jsonErr(500, err?.message || 'Failed to clear conversation', 'CLEAR_FAILED');
  }
}
