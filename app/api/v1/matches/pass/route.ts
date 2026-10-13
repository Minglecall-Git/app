import { NextRequest } from 'next/server';
import { createServiceClient, jsonErr, jsonOk, requireAuth } from '../../../../../lib/nextAuth';
import { parseJsonBody } from '../../../../../lib/nextRequest';
import { assertTargetExists, findMatchPair, mapMatchRow, type MatchStatus } from '../../../../../lib/handlers/matches';
import { isBlockedEitherWay } from '../../../../../lib/handlers/social';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** POST /api/v1/matches/pass */
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
    if (!client) return jsonErr(503, 'Matches backend unavailable', 'NO_ADMIN');

    const target = await assertTargetExists(client, targetUserId);
    if (!target) return jsonErr(404, 'Target user not found', 'NOT_FOUND');
    if (await isBlockedEitherWay(client, auth.profileId, targetUserId)) {
      return jsonErr(403, 'Blocked relationship', 'BLOCKED');
    }

    const nowIso = new Date().toISOString();
    const existing = await findMatchPair(client, auth.profileId, targetUserId);
    let row = existing;

    if (existing) {
      const nextStatus: MatchStatus = existing.status === 'matched' ? 'unmatched' : 'rejected';
      const { data, error } = await client
        .from('matches')
        .update({
          status: nextStatus,
          initiated_by: auth.profileId,
          last_interaction_at: nowIso,
          matched_at: null,
        })
        .eq('id', existing.id)
        .select('*')
        .maybeSingle();
      if (error) {
        console.error('[next /api/v1/matches/pass] update:', error.message);
        return jsonErr(500, 'Failed to save pass', 'UPDATE_FAILED');
      }
      row = data || existing;
    } else {
      const { data, error } = await client
        .from('matches')
        .insert({
          user_a_id: auth.profileId,
          user_b_id: targetUserId,
          status: 'rejected',
          initiated_by: auth.profileId,
          matched_at: null,
          last_interaction_at: nowIso,
          created_at: nowIso,
        })
        .select('*')
        .maybeSingle();
      if (error) {
        console.error('[next /api/v1/matches/pass] insert:', error.message);
        return jsonErr(500, 'Failed to save pass', 'INSERT_FAILED');
      }
      row = data;
    }

    return jsonOk({ success: true, data: { match: mapMatchRow(row, auth.profileId) } });
  } catch (err: any) {
    console.error('[next /api/v1/matches/pass]', err);
    return jsonErr(500, err?.message || 'Failed to pass', 'PASS_FAILED');
  }
}
