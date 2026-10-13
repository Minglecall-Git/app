import { NextRequest } from 'next/server';
import { createServiceClient, jsonErr, jsonOk, requireAuth } from '../../../../../lib/nextAuth';
import { parseJsonBody } from '../../../../../lib/nextRequest';
import {
  assertTargetExists,
  findMatchPair,
  mapMatchRow,
  type MatchStatus,
} from '../../../../../lib/handlers/matches';
import { isBlockedEitherWay } from '../../../../../lib/handlers/social';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** POST /api/v1/matches/like */
export async function POST(req: NextRequest) {
  try {
    const auth = await requireAuth(req);
    if (!auth.ok) { return jsonErr(auth.status, auth.error.message, auth.error.code); }

    const parsed = await parseJsonBody<{ targetUserId?: string; superLike?: boolean }>(req);
    if (!parsed.ok) { return jsonErr(parsed.status, parsed.error.message, parsed.error.code); }

    const targetUserId = String(parsed.data?.targetUserId || '').trim();
    const superLike = Boolean(parsed.data?.superLike);
    if (!targetUserId || targetUserId === auth.profileId) {
      return jsonErr(400, 'Invalid targetUserId', 'INVALID_TARGET');
    }

    const client = createServiceClient();
    if (!client) return jsonErr(503, 'Matches backend unavailable', 'NO_ADMIN');

    const target = await assertTargetExists(client, targetUserId);
    if (!target) return jsonErr(404, 'Target user not found', 'NOT_FOUND');
    if (target.is_banned) return jsonErr(403, 'Target user unavailable', 'TARGET_BANNED');
    if (['admin', 'team_leader', 'agency_manager'].includes(String(target.role || ''))) {
      return jsonErr(403, 'Cannot like this account type', 'INVALID_TARGET_ROLE');
    }
    if (await isBlockedEitherWay(client, auth.profileId, targetUserId)) {
      return jsonErr(403, 'Blocked relationship', 'BLOCKED');
    }

    const nowIso = new Date().toISOString();
    const existing = await findMatchPair(client, auth.profileId, targetUserId);

    let status: MatchStatus = 'pending';
    let matchedAt: string | null = null;
    let row = existing;

    if (existing) {
      if (existing.status === 'matched') {
        status = 'matched';
        matchedAt = existing.matched_at || nowIso;
      } else if (existing.status === 'pending' && existing.initiated_by && existing.initiated_by !== auth.profileId) {
        status = 'matched';
        matchedAt = nowIso;
      } else if (existing.status === 'pending' && existing.initiated_by === auth.profileId) {
        status = 'pending';
        matchedAt = null;
      } else {
        status = 'pending';
        matchedAt = null;
      }

      const { data, error } = await client
        .from('matches')
        .update({
          status,
          initiated_by: status === 'pending' ? auth.profileId : existing.initiated_by || auth.profileId,
          last_interaction_at: nowIso,
          matched_at: matchedAt,
        })
        .eq('id', existing.id)
        .select('*')
        .maybeSingle();
      if (error) {
        console.error('[next /api/v1/matches/like] update:', error.message);
        return jsonErr(500, 'Failed to update like', 'UPDATE_FAILED');
      }
      row = data || existing;
    } else {
      const { data, error } = await client
        .from('matches')
        .insert({
          user_a_id: auth.profileId,
          user_b_id: targetUserId,
          status: 'pending',
          initiated_by: auth.profileId,
          matched_at: null,
          last_interaction_at: nowIso,
          created_at: nowIso,
        })
        .select('*')
        .maybeSingle();
      if (error) {
        console.error('[next /api/v1/matches/like] insert:', error.message);
        return jsonErr(500, 'Failed to create like', 'INSERT_FAILED');
      }
      row = data;
      status = 'pending';
    }

    return jsonOk({
      success: true,
      data: {
        match: mapMatchRow(row, auth.profileId),
        superLike,
      },
    });
  } catch (err: any) {
    console.error('[next /api/v1/matches/like]', err);
    return jsonErr(500, err?.message || 'Failed to like', 'LIKE_FAILED');
  }
}
