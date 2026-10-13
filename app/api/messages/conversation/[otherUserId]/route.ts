import { NextRequest } from 'next/server';
import { createServiceClient, jsonErr, requireAuth } from '../../../../../lib/nextAuth';
import { handleClearConversation, handleConversationPage } from '../../../../../lib/handlers/messages';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** GET /api/messages/conversation/:otherUserId */
export async function GET(req: NextRequest, ctx: { params: Promise<{ otherUserId: string }> }) {
  try {
    const auth = await requireAuth(req);
    if (auth.ok === false) return jsonErr(auth.status, auth.error.message, auth.error.code);
    const client = createServiceClient();
    if (!client) return jsonErr(503, 'Messages backend unavailable', 'NO_ADMIN');
    const { otherUserId } = await ctx.params;
    return handleConversationPage(req, auth, client, otherUserId);
  } catch (err: any) {
    console.error('[next /api/messages/conversation GET]', err);
    return jsonErr(500, err?.message || 'Failed to load messages', 'LOAD_FAILED');
  }
}

/** DELETE /api/messages/conversation/:otherUserId */
export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ otherUserId: string }> }) {
  try {
    const auth = await requireAuth(_req);
    if (auth.ok === false) return jsonErr(auth.status, auth.error.message, auth.error.code);
    const client = createServiceClient();
    if (!client) return jsonErr(503, 'Messages backend unavailable', 'NO_ADMIN');
    const { otherUserId } = await ctx.params;
    return handleClearConversation(auth, client, otherUserId);
  } catch (err: any) {
    console.error('[next /api/messages/conversation DELETE]', err);
    return jsonErr(500, err?.message || 'Failed to clear conversation', 'CLEAR_FAILED');
  }
}
