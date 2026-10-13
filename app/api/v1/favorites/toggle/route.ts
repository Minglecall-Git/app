import { NextRequest } from 'next/server';
import { createServiceClient, jsonErr, jsonOk, requireAuth } from '../../../../../lib/nextAuth';
import { parseJsonBody } from '../../../../../lib/nextRequest';
import { isBlockedEitherWay } from '../../../../../lib/handlers/social';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** POST /api/v1/favorites/toggle */
export async function POST(req: NextRequest) {
  try {
    const auth = await requireAuth(req);
    if (!auth.ok) { return jsonErr(auth.status, auth.error.message, auth.error.code); }

    const parsed = await parseJsonBody<{ targetUserId?: string }>(req);
    if (!parsed.ok) { return jsonErr(parsed.status, parsed.error.message, parsed.error.code); }

    const targetUserId = String(parsed.data?.targetUserId || '').trim();
    if (!targetUserId || targetUserId === auth.profileId) {
      return jsonErr(400, 'Invalid targetUserId', 'INVALID_TARGET');
    }

    const client = createServiceClient();
    if (!client) return jsonErr(503, 'Favorites backend unavailable', 'NO_ADMIN');

    const { data: target, error: targetErr } = await client
      .from('profiles')
      .select('id, is_banned')
      .eq('id', targetUserId)
      .maybeSingle();
    if (targetErr) throw targetErr;
    if (!target) return jsonErr(404, 'Target user not found', 'NOT_FOUND');
    if (target.is_banned) return jsonErr(403, 'Target user unavailable', 'TARGET_BANNED');
    if (await isBlockedEitherWay(client, auth.profileId, targetUserId)) {
      return jsonErr(403, 'Blocked relationship', 'BLOCKED');
    }

    const { data: existing, error: existErr } = await client
      .from('favorites')
      .select('user_id')
      .eq('user_id', auth.profileId)
      .eq('favorite_user_id', targetUserId)
      .maybeSingle();
    if (existErr) throw existErr;

    if (existing) {
      const { error } = await client
        .from('favorites')
        .delete()
        .eq('user_id', auth.profileId)
        .eq('favorite_user_id', targetUserId);
      if (error) {
        console.error('[next /api/v1/favorites/toggle] remove:', error.message);
        return jsonErr(500, 'Failed to remove favorite', 'DELETE_FAILED');
      }
      return jsonOk({ success: true, data: { favorited: false, targetUserId } });
    }

    const { error } = await client.from('favorites').upsert(
      {
        user_id: auth.profileId,
        favorite_user_id: targetUserId,
        created_at: new Date().toISOString(),
      },
      { onConflict: 'user_id,favorite_user_id' }
    );
    if (error) {
      console.error('[next /api/v1/favorites/toggle] add:', error.message);
      return jsonErr(500, 'Failed to add favorite', 'INSERT_FAILED');
    }

    return jsonOk({ success: true, data: { favorited: true, targetUserId } });
  } catch (err: any) {
    console.error('[next /api/v1/favorites/toggle]', err);
    return jsonErr(500, err?.message || 'Failed to toggle favorite', 'TOGGLE_FAILED');
  }
}
