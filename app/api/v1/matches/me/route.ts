import { NextRequest } from 'next/server';
import { createServiceClient, jsonErr, jsonOk, requireAuth } from '../../../../../lib/nextAuth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function mapMatchRow(row: any, currentUserId: string) {
  const otherUserId = row.user_a_id === currentUserId ? row.user_b_id : row.user_a_id;
  return {
    id: row.id,
    userAId: row.user_a_id,
    userBId: row.user_b_id,
    otherUserId,
    status: row.status,
    initiatedBy: row.initiated_by,
    matchedAt: row.matched_at,
    lastInteractionAt: row.last_interaction_at,
    createdAt: row.created_at,
  };
}

/** GET /api/v1/matches/me — native Next (no Express boot). */
export async function GET(req: NextRequest) {
  try {
    const auth = await requireAuth(req);
    if (!auth.ok) { return jsonErr(auth.status, auth.error.message, auth.error.code); }

    const client = createServiceClient();
    if (!client) return jsonErr(503, 'Matches backend unavailable', 'NO_ADMIN');

    const { data, error } = await client
      .from('matches')
      .select('*')
      .or(`user_a_id.eq.${auth.profileId},user_b_id.eq.${auth.profileId}`)
      .order('last_interaction_at', { ascending: false });

    if (error) {
      console.error('[next /api/v1/matches/me]', error.message);
      return jsonErr(500, 'Failed to load matches', 'LOAD_FAILED');
    }

    const matches = (data || []).map((row: any) => mapMatchRow(row, auth.profileId));
    return jsonOk({ success: true, data: { matches } });
  } catch (err: any) {
    console.error('[next /api/v1/matches/me]', err);
    return jsonErr(500, err?.message || 'Failed to load matches', 'LOAD_FAILED');
  }
}
