import { Router } from 'express';
import type { ServerRuntime } from '../runtimeTypes';
import { requireAuth } from '../middleware/auth';
import { getSupabaseAdmin, isSupabaseAdminConfigured } from '../supabaseAdmin';

function authUserId(req: any): string {
  return String(req.profileId || req.user?.id || '');
}

function sendError(res: any, status: number, message: string, code: string) {
  return res.status(status).json({ success: false, error: { message, code } });
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

export function createFavoritesRouter(_runtime: ServerRuntime) {
  const router = Router();

  /** GET /api/v1/favorites/me */
  router.get('/me', requireAuth, async (req, res) => {
    try {
      if (!isSupabaseAdminConfigured()) {
        return sendError(res, 503, 'Favorites backend unavailable', 'NO_ADMIN');
      }
      const userId = authUserId(req);
      if (!userId) return sendError(res, 401, 'Unauthorized', 'UNAUTHORIZED');

      const client = getSupabaseAdmin()!;
      const { data, error } = await client
        .from('favorites')
        .select('favorite_user_id, created_at')
        .eq('user_id', userId)
        .order('created_at', { ascending: false });

      if (error) {
        console.error('[favorites/me]', error.message);
        return sendError(res, 500, 'Failed to load favorites', 'LOAD_FAILED');
      }

      const favoriteUserIds = (data || []).map((r: any) => String(r.favorite_user_id));
      return res.json({ success: true, data: { favoriteUserIds } });
    } catch (err: any) {
      console.error('[favorites/me] exception:', err);
      return sendError(res, 500, err?.message || 'Failed to load favorites', 'LOAD_FAILED');
    }
  });

  /** POST /api/v1/favorites/toggle { targetUserId } */
  router.post('/toggle', requireAuth, async (req, res) => {
    try {
      if (!isSupabaseAdminConfigured()) {
        return sendError(res, 503, 'Favorites backend unavailable', 'NO_ADMIN');
      }
      const userId = authUserId(req);
      const targetUserId = String(req.body?.targetUserId || '').trim();

      if (!userId) return sendError(res, 401, 'Unauthorized', 'UNAUTHORIZED');
      if (!targetUserId || targetUserId === userId) {
        return sendError(res, 400, 'Invalid targetUserId', 'INVALID_TARGET');
      }

      const client = getSupabaseAdmin()!;
      const { data: target, error: targetErr } = await client
        .from('profiles')
        .select('id, is_banned')
        .eq('id', targetUserId)
        .maybeSingle();
      if (targetErr) throw targetErr;
      if (!target) return sendError(res, 404, 'Target user not found', 'NOT_FOUND');
      if (target.is_banned) return sendError(res, 403, 'Target user unavailable', 'TARGET_BANNED');
      if (await isBlockedEitherWay(client, userId, targetUserId)) {
        return sendError(res, 403, 'Blocked relationship', 'BLOCKED');
      }

      const { data: existing, error: existErr } = await client
        .from('favorites')
        .select('user_id')
        .eq('user_id', userId)
        .eq('favorite_user_id', targetUserId)
        .maybeSingle();
      if (existErr) throw existErr;

      if (existing) {
        const { error } = await client
          .from('favorites')
          .delete()
          .eq('user_id', userId)
          .eq('favorite_user_id', targetUserId);
        if (error) {
          console.error('[favorites/toggle] remove:', error.message);
          return sendError(res, 500, 'Failed to remove favorite', 'DELETE_FAILED');
        }
        return res.json({
          success: true,
          data: { favorited: false, targetUserId },
        });
      }

      const { error } = await client.from('favorites').upsert(
        {
          user_id: userId,
          favorite_user_id: targetUserId,
          created_at: new Date().toISOString(),
        },
        { onConflict: 'user_id,favorite_user_id' }
      );
      if (error) {
        console.error('[favorites/toggle] add:', error.message);
        return sendError(res, 500, 'Failed to add favorite', 'INSERT_FAILED');
      }

      return res.json({
        success: true,
        data: { favorited: true, targetUserId },
      });
    } catch (err: any) {
      console.error('[favorites/toggle] exception:', err);
      return sendError(res, 500, err?.message || 'Failed to toggle favorite', 'TOGGLE_FAILED');
    }
  });

  return router;
}
