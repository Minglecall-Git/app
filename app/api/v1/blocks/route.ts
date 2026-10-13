import { NextRequest } from 'next/server';
import { createServiceClient, jsonErr, jsonOk, requireAuth } from '../../../../lib/nextAuth';
import { parseJsonBody } from '../../../../lib/nextRequest';
import { cleanupSocialOnBlock, loadBlockLists } from '../../../../lib/handlers/blocks';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** POST /api/v1/blocks */
export async function POST(req: NextRequest) {
  try {
    const auth = await requireAuth(req);
    if (!auth.ok) { return jsonErr(auth.status, auth.error.message, auth.error.code); }

    const parsed = await parseJsonBody<{ targetUserId?: string; reason?: string }>(req);
    if (!parsed.ok) { return jsonErr(parsed.status, parsed.error.message, parsed.error.code); }

    const targetUserId = String(parsed.data?.targetUserId || '').trim();
    const reason = String(parsed.data?.reason || '').trim() || null;

    if (!targetUserId || targetUserId === auth.profileId) {
      return jsonErr(400, 'Invalid targetUserId', 'INVALID_TARGET');
    }

    const client = createServiceClient();
    if (!client) return jsonErr(503, 'Blocks backend unavailable', 'NO_ADMIN');

    const { data: target, error: targetErr } = await client
      .from('profiles')
      .select('id')
      .eq('id', targetUserId)
      .maybeSingle();
    if (targetErr) throw targetErr;
    if (!target) return jsonErr(404, 'Target user not found', 'NOT_FOUND');

    const { error: upsertErr } = await client.from('blocked_users').upsert(
      {
        user_id: auth.profileId,
        blocked_user_id: targetUserId,
        reason,
        created_at: new Date().toISOString(),
      },
      { onConflict: 'user_id,blocked_user_id' }
    );
    if (upsertErr) {
      console.error('[next /api/v1/blocks] upsert:', upsertErr.message);
      return jsonErr(500, 'Failed to block user', 'INSERT_FAILED');
    }

    await cleanupSocialOnBlock(client, auth.profileId, targetUserId);

    const lists = await loadBlockLists(client, auth.profileId);
    return jsonOk({
      success: true,
      data: {
        blocked: true,
        targetUserId,
        ...lists,
      },
    });
  } catch (err: any) {
    console.error('[next /api/v1/blocks]', err);
    return jsonErr(500, err?.message || 'Failed to block user', 'BLOCK_FAILED');
  }
}
