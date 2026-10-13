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

async function loadBlockLists(client: any, userId: string) {
  const [iBlocked, blockedMe] = await Promise.all([
    client.from('blocked_users').select('blocked_user_id').eq('user_id', userId),
    client.from('blocked_users').select('user_id').eq('blocked_user_id', userId),
  ]);
  if (iBlocked.error) throw iBlocked.error;
  if (blockedMe.error) throw blockedMe.error;
  return {
    blockedUserIds: (iBlocked.data || []).map((r: any) => String(r.blocked_user_id)),
    blockedByUserIds: (blockedMe.data || []).map((r: any) => String(r.user_id)),
  };
}

/** Decline pending friend requests and strip favorites both directions after a block. */
async function cleanupSocialOnBlock(client: any, actorId: string, targetUserId: string) {
  await client
    .from('friend_requests')
    .update({ status: 'declined', responded_at: new Date().toISOString() })
    .eq('status', 'pending')
    .or(
      `and(sender_id.eq.${actorId},receiver_id.eq.${targetUserId}),and(sender_id.eq.${targetUserId},receiver_id.eq.${actorId})`
    );

  await client
    .from('friend_requests')
    .delete()
    .eq('status', 'accepted')
    .or(
      `and(sender_id.eq.${actorId},receiver_id.eq.${targetUserId}),and(sender_id.eq.${targetUserId},receiver_id.eq.${actorId})`
    );

  await client
    .from('favorites')
    .delete()
    .or(
      `and(user_id.eq.${actorId},favorite_user_id.eq.${targetUserId}),and(user_id.eq.${targetUserId},favorite_user_id.eq.${actorId})`
    );
}

export function createBlocksRouter(_runtime: ServerRuntime) {
  const router = Router();

  /** GET /api/v1/blocks/me */
  router.get('/me', requireAuth, async (req, res) => {
    try {
      if (!isSupabaseAdminConfigured()) {
        return sendError(res, 503, 'Blocks backend unavailable', 'NO_ADMIN');
      }
      const userId = authUserId(req);
      if (!userId) return sendError(res, 401, 'Unauthorized', 'UNAUTHORIZED');

      const lists = await loadBlockLists(getSupabaseAdmin()!, userId);
      return res.json({ success: true, data: lists });
    } catch (err: any) {
      console.error('[blocks/me] exception:', err);
      return sendError(res, 500, err?.message || 'Failed to load blocks', 'LOAD_FAILED');
    }
  });

  /** POST /api/v1/blocks  { targetUserId, reason? } */
  router.post('/', requireAuth, async (req, res) => {
    try {
      if (!isSupabaseAdminConfigured()) {
        return sendError(res, 503, 'Blocks backend unavailable', 'NO_ADMIN');
      }
      const userId = authUserId(req);
      const targetUserId = String(req.body?.targetUserId || '').trim();
      const reason = String(req.body?.reason || '').trim() || null;

      if (!userId) return sendError(res, 401, 'Unauthorized', 'UNAUTHORIZED');
      if (!targetUserId || targetUserId === userId) {
        return sendError(res, 400, 'Invalid targetUserId', 'INVALID_TARGET');
      }

      const client = getSupabaseAdmin()!;
      const { data: target, error: targetErr } = await client
        .from('profiles')
        .select('id')
        .eq('id', targetUserId)
        .maybeSingle();
      if (targetErr) throw targetErr;
      if (!target) return sendError(res, 404, 'Target user not found', 'NOT_FOUND');

      const { error: upsertErr } = await client.from('blocked_users').upsert(
        {
          user_id: userId,
          blocked_user_id: targetUserId,
          reason,
          created_at: new Date().toISOString(),
        },
        { onConflict: 'user_id,blocked_user_id' }
      );
      if (upsertErr) {
        console.error('[blocks] upsert:', upsertErr.message);
        return sendError(res, 500, 'Failed to block user', 'INSERT_FAILED');
      }

      await cleanupSocialOnBlock(client, userId, targetUserId);

      const lists = await loadBlockLists(client, userId);
      return res.json({
        success: true,
        data: {
          blocked: true,
          targetUserId,
          ...lists,
        },
      });
    } catch (err: any) {
      console.error('[blocks] exception:', err);
      return sendError(res, 500, err?.message || 'Failed to block user', 'BLOCK_FAILED');
    }
  });

  /** DELETE /api/v1/blocks/:targetUserId */
  router.delete('/:targetUserId', requireAuth, async (req, res) => {
    try {
      if (!isSupabaseAdminConfigured()) {
        return sendError(res, 503, 'Blocks backend unavailable', 'NO_ADMIN');
      }
      const userId = authUserId(req);
      const targetUserId = String(req.params.targetUserId || '').trim();

      if (!userId) return sendError(res, 401, 'Unauthorized', 'UNAUTHORIZED');
      if (!targetUserId || targetUserId === userId) {
        return sendError(res, 400, 'Invalid targetUserId', 'INVALID_TARGET');
      }

      const client = getSupabaseAdmin()!;
      const { error } = await client
        .from('blocked_users')
        .delete()
        .eq('user_id', userId)
        .eq('blocked_user_id', targetUserId);
      if (error) {
        console.error('[blocks/remove] delete:', error.message);
        return sendError(res, 500, 'Failed to unblock user', 'DELETE_FAILED');
      }

      const lists = await loadBlockLists(client, userId);
      return res.json({
        success: true,
        data: {
          blocked: false,
          targetUserId,
          ...lists,
        },
      });
    } catch (err: any) {
      console.error('[blocks/remove] exception:', err);
      return sendError(res, 500, err?.message || 'Failed to unblock user', 'UNBLOCK_FAILED');
    }
  });

  /** POST /api/v1/blocks/remove  { targetUserId } — alternate to DELETE */
  router.post('/remove', requireAuth, async (req, res) => {
    try {
      if (!isSupabaseAdminConfigured()) {
        return sendError(res, 503, 'Blocks backend unavailable', 'NO_ADMIN');
      }
      const userId = authUserId(req);
      const targetUserId = String(req.body?.targetUserId || '').trim();

      if (!userId) return sendError(res, 401, 'Unauthorized', 'UNAUTHORIZED');
      if (!targetUserId || targetUserId === userId) {
        return sendError(res, 400, 'Invalid targetUserId', 'INVALID_TARGET');
      }

      const client = getSupabaseAdmin()!;
      const { error } = await client
        .from('blocked_users')
        .delete()
        .eq('user_id', userId)
        .eq('blocked_user_id', targetUserId);
      if (error) {
        console.error('[blocks/remove] delete:', error.message);
        return sendError(res, 500, 'Failed to unblock user', 'DELETE_FAILED');
      }

      const lists = await loadBlockLists(client, userId);
      return res.json({
        success: true,
        data: {
          blocked: false,
          targetUserId,
          ...lists,
        },
      });
    } catch (err: any) {
      console.error('[blocks/remove] exception:', err);
      return sendError(res, 500, err?.message || 'Failed to unblock user', 'UNBLOCK_FAILED');
    }
  });

  return router;
}
