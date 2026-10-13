import { Router } from 'express';
import type { ServerRuntime } from '../runtimeTypes';
import { requireAuth } from '../middleware/auth';
import { getSupabaseAdmin, isSupabaseAdminConfigured } from '../supabaseAdmin';

/**
 * Match semantics (durable in public.matches):
 * - pass  → status=rejected (hide from swipe deck)
 * - like  → status=pending when one-sided; status=matched only when the other
 *           party already has a pending like toward the actor (mutual)
 * - quick_match → status=matched (both parties connected via Quick Match)
 * Never set matched from a one-sided swipe like alone.
 */

type MatchStatus = 'pending' | 'matched' | 'rejected' | 'unmatched';

function authUserId(req: any): string {
  return String(req.profileId || req.user?.id || '');
}

function sendError(res: any, status: number, message: string, code: string) {
  return res.status(status).json({ success: false, error: { message, code } });
}

async function findMatchPair(client: any, userA: string, userB: string) {
  const { data, error } = await client
    .from('matches')
    .select('*')
    .or(
      `and(user_a_id.eq.${userA},user_b_id.eq.${userB}),and(user_a_id.eq.${userB},user_b_id.eq.${userA})`
    )
    .limit(1);
  if (error) throw error;
  return data && data.length > 0 ? data[0] : null;
}

async function assertTargetExists(client: any, targetUserId: string) {
  const { data, error } = await client
    .from('profiles')
    .select('id, is_banned, role')
    .eq('id', targetUserId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

async function isBlockedEitherWay(client: any, userId: string, targetUserId: string) {
  const { data, error } = await client
    .from('blocked_users')
    .select('user_id, blocked_user_id')
    .or(
      `and(user_id.eq.${userId},blocked_user_id.eq.${targetUserId}),and(user_id.eq.${targetUserId},blocked_user_id.eq.${userId})`
    )
    .limit(1);
  if (error) throw error;
  return Boolean(data && data.length > 0);
}

function mapMatchRow(row: any, currentUserId: string) {
  const otherUserId = row.user_a_id === currentUserId ? row.user_b_id : row.user_a_id;
  return {
    id: row.id,
    userAId: row.user_a_id,
    userBId: row.user_b_id,
    otherUserId,
    status: row.status as MatchStatus,
    initiatedBy: row.initiated_by,
    matchedAt: row.matched_at,
    lastInteractionAt: row.last_interaction_at,
    createdAt: row.created_at,
  };
}

export function createMatchesRouter(_runtime: ServerRuntime) {
  const router = Router();

  /** GET /api/v1/matches/me — all match rows for the authenticated user */
  router.get('/me', requireAuth, async (req, res) => {
    try {
      if (!isSupabaseAdminConfigured()) {
        return sendError(res, 503, 'Matches backend unavailable', 'NO_ADMIN');
      }
      const userId = authUserId(req);
      if (!userId) return sendError(res, 401, 'Unauthorized', 'UNAUTHORIZED');

      const client = getSupabaseAdmin();
      const { data, error } = await client!
        .from('matches')
        .select('*')
        .or(`user_a_id.eq.${userId},user_b_id.eq.${userId}`)
        .order('last_interaction_at', { ascending: false });

      if (error) {
        console.error('[matches/me]', error.message);
        return sendError(res, 500, 'Failed to load matches', 'LOAD_FAILED');
      }

      const matches = (data || []).map((row: any) => mapMatchRow(row, userId));
      return res.json({ success: true, data: { matches } });
    } catch (err: any) {
      console.error('[matches/me] exception:', err);
      return sendError(res, 500, err?.message || 'Failed to load matches', 'LOAD_FAILED');
    }
  });

  /** POST /api/v1/matches/like { targetUserId, superLike?: boolean } */
  router.post('/like', requireAuth, async (req, res) => {
    try {
      if (!isSupabaseAdminConfigured()) {
        return sendError(res, 503, 'Matches backend unavailable', 'NO_ADMIN');
      }
      const userId = authUserId(req);
      const targetUserId = String(req.body?.targetUserId || '').trim();
      const superLike = Boolean(req.body?.superLike);

      if (!userId) return sendError(res, 401, 'Unauthorized', 'UNAUTHORIZED');
      if (!targetUserId || targetUserId === userId) {
        return sendError(res, 400, 'Invalid targetUserId', 'INVALID_TARGET');
      }

      const client = getSupabaseAdmin()!;
      const target = await assertTargetExists(client, targetUserId);
      if (!target) return sendError(res, 404, 'Target user not found', 'NOT_FOUND');
      if (target.is_banned) return sendError(res, 403, 'Target user unavailable', 'TARGET_BANNED');
      if (['admin', 'team_leader', 'agency_manager'].includes(String(target.role || ''))) {
        return sendError(res, 403, 'Cannot like this account type', 'INVALID_TARGET_ROLE');
      }
      if (await isBlockedEitherWay(client, userId, targetUserId)) {
        return sendError(res, 403, 'Blocked relationship', 'BLOCKED');
      }

      const nowIso = new Date().toISOString();
      const existing = await findMatchPair(client, userId, targetUserId);

      let status: MatchStatus = 'pending';
      let matchedAt: string | null = null;
      let row = existing;

      if (existing) {
        if (existing.status === 'matched') {
          status = 'matched';
          matchedAt = existing.matched_at || nowIso;
        } else if (
          existing.status === 'pending' &&
          existing.initiated_by &&
          existing.initiated_by !== userId
        ) {
          // Reciprocal like → mutual match
          status = 'matched';
          matchedAt = nowIso;
        } else if (existing.status === 'pending' && existing.initiated_by === userId) {
          status = 'pending';
          matchedAt = null;
        } else {
          // rejected / unmatched → restart as one-sided pending like
          status = 'pending';
          matchedAt = null;
        }

        const { data, error } = await client
          .from('matches')
          .update({
            status,
            initiated_by: status === 'pending' ? userId : existing.initiated_by || userId,
            last_interaction_at: nowIso,
            matched_at: matchedAt,
          })
          .eq('id', existing.id)
          .select('*')
          .maybeSingle();
        if (error) {
          console.error('[matches/like] update:', error.message);
          return sendError(res, 500, 'Failed to update like', 'UPDATE_FAILED');
        }
        row = data || existing;
      } else {
        const { data, error } = await client
          .from('matches')
          .insert({
            user_a_id: userId,
            user_b_id: targetUserId,
            status: 'pending',
            initiated_by: userId,
            matched_at: null,
            last_interaction_at: nowIso,
            created_at: nowIso,
          })
          .select('*')
          .maybeSingle();
        if (error) {
          console.error('[matches/like] insert:', error.message);
          return sendError(res, 500, 'Failed to create like', 'INSERT_FAILED');
        }
        row = data;
        status = 'pending';
      }

      return res.json({
        success: true,
        data: {
          match: mapMatchRow(row, userId),
          superLike,
          // Flag only; no free coin gift credit on super-like
        },
      });
    } catch (err: any) {
      console.error('[matches/like] exception:', err);
      return sendError(res, 500, err?.message || 'Failed to like', 'LIKE_FAILED');
    }
  });

  /** POST /api/v1/matches/pass { targetUserId } — persist swipe pass as rejected */
  router.post('/pass', requireAuth, async (req, res) => {
    try {
      if (!isSupabaseAdminConfigured()) {
        return sendError(res, 503, 'Matches backend unavailable', 'NO_ADMIN');
      }
      const userId = authUserId(req);
      const targetUserId = String(req.body?.targetUserId || '').trim();

      if (!userId) return sendError(res, 401, 'Unauthorized', 'UNAUTHORIZED');
      if (!targetUserId || targetUserId === userId) {
        return sendError(res, 400, 'Invalid targetUserId', 'INVALID_TARGET');
      }

      const client = getSupabaseAdmin()!;
      const target = await assertTargetExists(client, targetUserId);
      if (!target) return sendError(res, 404, 'Target user not found', 'NOT_FOUND');
      if (await isBlockedEitherWay(client, userId, targetUserId)) {
        return sendError(res, 403, 'Blocked relationship', 'BLOCKED');
      }

      const nowIso = new Date().toISOString();
      const existing = await findMatchPair(client, userId, targetUserId);
      let row = existing;

      if (existing) {
        // Do not downgrade an already-matched pair via accidental pass; mark unmatched instead.
        const nextStatus: MatchStatus = existing.status === 'matched' ? 'unmatched' : 'rejected';
        const { data, error } = await client
          .from('matches')
          .update({
            status: nextStatus,
            initiated_by: userId,
            last_interaction_at: nowIso,
            matched_at: null,
          })
          .eq('id', existing.id)
          .select('*')
          .maybeSingle();
        if (error) {
          console.error('[matches/pass] update:', error.message);
          return sendError(res, 500, 'Failed to save pass', 'UPDATE_FAILED');
        }
        row = data || existing;
      } else {
        const { data, error } = await client
          .from('matches')
          .insert({
            user_a_id: userId,
            user_b_id: targetUserId,
            status: 'rejected',
            initiated_by: userId,
            matched_at: null,
            last_interaction_at: nowIso,
            created_at: nowIso,
          })
          .select('*')
          .maybeSingle();
        if (error) {
          console.error('[matches/pass] insert:', error.message);
          return sendError(res, 500, 'Failed to save pass', 'INSERT_FAILED');
        }
        row = data;
      }

      return res.json({ success: true, data: { match: mapMatchRow(row, userId) } });
    } catch (err: any) {
      console.error('[matches/pass] exception:', err);
      return sendError(res, 500, err?.message || 'Failed to pass', 'PASS_FAILED');
    }
  });

  /**
   * POST /api/v1/matches/quick-match { targetUserId, giftsCoins?: number }
   * Successful Quick Match connection → status=matched (mutual by product rule).
   */
  router.post('/quick-match', requireAuth, async (req, res) => {
    try {
      if (!isSupabaseAdminConfigured()) {
        return sendError(res, 503, 'Matches backend unavailable', 'NO_ADMIN');
      }
      const userId = authUserId(req);
      const targetUserId = String(req.body?.targetUserId || '').trim();
      const giftsCoins = Math.max(0, Number(req.body?.giftsCoins || 0) || 0);

      if (!userId) return sendError(res, 401, 'Unauthorized', 'UNAUTHORIZED');
      if (!targetUserId || targetUserId === userId) {
        return sendError(res, 400, 'Invalid targetUserId', 'INVALID_TARGET');
      }

      const client = getSupabaseAdmin()!;
      const target = await assertTargetExists(client, targetUserId);
      if (!target) return sendError(res, 404, 'Target user not found', 'NOT_FOUND');
      if (await isBlockedEitherWay(client, userId, targetUserId)) {
        return sendError(res, 403, 'Blocked relationship', 'BLOCKED');
      }

      const nowIso = new Date().toISOString();
      const existing = await findMatchPair(client, userId, targetUserId);
      let row = existing;

      if (existing) {
        const { data, error } = await client
          .from('matches')
          .update({
            status: 'matched',
            last_interaction_at: nowIso,
            matched_at: existing.matched_at || nowIso,
          })
          .eq('id', existing.id)
          .select('*')
          .maybeSingle();
        if (error) {
          console.error('[matches/quick-match] update:', error.message);
          return sendError(res, 500, 'Failed to save quick match', 'UPDATE_FAILED');
        }
        row = data || existing;
      } else {
        const { data, error } = await client
          .from('matches')
          .insert({
            user_a_id: userId,
            user_b_id: targetUserId,
            status: 'matched',
            initiated_by: userId,
            matched_at: nowIso,
            last_interaction_at: nowIso,
            created_at: nowIso,
          })
          .select('*')
          .maybeSingle();
        if (error) {
          console.error('[matches/quick-match] insert:', error.message);
          return sendError(res, 500, 'Failed to save quick match', 'INSERT_FAILED');
        }
        row = data;
      }

      return res.json({
        success: true,
        data: {
          match: mapMatchRow(row, userId),
          giftsCoins,
        },
      });
    } catch (err: any) {
      console.error('[matches/quick-match] exception:', err);
      return sendError(res, 500, err?.message || 'Failed to quick match', 'QUICK_MATCH_FAILED');
    }
  });

  /** GET /api/v1/matches/blocks — blocked + blocked-by peer ids for discovery filtering */
  router.get('/blocks', requireAuth, async (req, res) => {
    try {
      if (!isSupabaseAdminConfigured()) {
        return sendError(res, 503, 'Blocks backend unavailable', 'NO_ADMIN');
      }
      const userId = authUserId(req);
      if (!userId) return sendError(res, 401, 'Unauthorized', 'UNAUTHORIZED');

      const client = getSupabaseAdmin()!;
      const [iBlocked, blockedMe] = await Promise.all([
        client.from('blocked_users').select('blocked_user_id').eq('user_id', userId),
        client.from('blocked_users').select('user_id').eq('blocked_user_id', userId),
      ]);

      if (iBlocked.error || blockedMe.error) {
        console.error('[matches/blocks]', iBlocked.error?.message || blockedMe.error?.message);
        return sendError(res, 500, 'Failed to load blocks', 'LOAD_FAILED');
      }

      return res.json({
        success: true,
        data: {
          blockedUserIds: (iBlocked.data || []).map((r: any) => String(r.blocked_user_id)),
          blockedByUserIds: (blockedMe.data || []).map((r: any) => String(r.user_id)),
        },
      });
    } catch (err: any) {
      console.error('[matches/blocks] exception:', err);
      return sendError(res, 500, err?.message || 'Failed to load blocks', 'LOAD_FAILED');
    }
  });

  return router;
}
