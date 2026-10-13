import { NextRequest } from 'next/server';
import { createServiceClient, jsonErr, jsonOk, requireAuth } from '../../../../../lib/nextAuth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** GET /api/v1/matches/blocks */
export async function GET(req: NextRequest) {
  try {
    const auth = await requireAuth(req);
    if (!auth.ok) { return jsonErr(auth.status, auth.error.message, auth.error.code); }

    const client = createServiceClient();
    if (!client) return jsonErr(503, 'Blocks backend unavailable', 'NO_ADMIN');

    const [iBlocked, blockedMe] = await Promise.all([
      client.from('blocked_users').select('blocked_user_id').eq('user_id', auth.profileId),
      client.from('blocked_users').select('user_id').eq('blocked_user_id', auth.profileId),
    ]);

    if (iBlocked.error || blockedMe.error) {
      console.error('[next /api/v1/matches/blocks]', iBlocked.error?.message || blockedMe.error?.message);
      return jsonErr(500, 'Failed to load blocks', 'LOAD_FAILED');
    }

    return jsonOk({
      success: true,
      data: {
        blockedUserIds: (iBlocked.data || []).map((r: any) => String(r.blocked_user_id)),
        blockedByUserIds: (blockedMe.data || []).map((r: any) => String(r.user_id)),
      },
    });
  } catch (err: any) {
    console.error('[next /api/v1/matches/blocks]', err);
    return jsonErr(500, err?.message || 'Failed to load blocks', 'LOAD_FAILED');
  }
}
