/**
 * Catch-all for /api/v1/* social routes on Vercel.
 * Handles matches, favorites, friends, blocks, feed, reviews, reports minimally.
 * Only claims known social prefixes — finance and other v1 modules must not get
 * "Unimplemented v1 path" from this handler.
 */
import {
  sendJson,
  readJsonBody,
  requireAuthFromBearer,
  createServiceClient,
  type VercelReq,
  type VercelRes,
} from '../vercelAuth';

const SOCIAL_V1_PREFIXES = [
  'matches',
  'favorites',
  'friends',
  'blocks',
  'feed',
  'reviews',
  'reports',
  'admin/reports',
] as const;

function pathOf(req: VercelReq): string {
  try {
    return new URL(req.url || '', 'http://localhost').pathname.replace(/^\/api\/v1\/?/, '');
  } catch {
    return '';
  }
}

function isSocialV1Path(path: string): boolean {
  const p = String(path || '').split('?')[0];
  if (!p) return false;
  return SOCIAL_V1_PREFIXES.some((prefix) => p === prefix || p.startsWith(`${prefix}/`));
}

export default async function handler(req: VercelReq, res: VercelRes) {
  if (req.method === 'OPTIONS') {
    res.statusCode = 204;
    res.end();
    return;
  }

  const path = pathOf(req);
  if (!isSocialV1Path(path)) {
    return sendJson(res, 404, {
      success: false,
      error: {
        message: 'Not a social v1 route',
        code: 'USE_OTHER_V1_HANDLER',
      },
    });
  }

  const auth = await requireAuthFromBearer(req);
  if (auth.ok === false) {
    return sendJson(res, auth.status, { success: false, error: auth.error });
  }

  const client = createServiceClient();
  if (!client) {
    return sendJson(res, 503, { success: false, error: { message: 'Supabase not configured' } });
  }

  const method = req.method || 'GET';
  const me = auth.profileId;
  const body = method !== 'GET' ? await readJsonBody(req) : {};

  try {
    // ---- matches ----
    if (path === 'matches/me' && method === 'GET') {
      const { data, error } = await client
        .from('matches')
        .select('*')
        .or(`user_a_id.eq.${me},user_b_id.eq.${me}`)
        .limit(200);
      if (error) throw error;
      const matches = (data || []).map((row: any) => ({
        id: row.id,
        userAId: row.user_a_id,
        userBId: row.user_b_id,
        otherUserId: row.user_a_id === me ? row.user_b_id : row.user_a_id,
        status: row.status,
        initiatedBy: row.initiated_by,
        matchedAt: row.matched_at,
        createdAt: row.created_at,
      }));
      return sendJson(res, 200, { success: true, matches });
    }

    if (path === 'matches/blocks' && method === 'GET') {
      const { data } = await client.from('blocked_users').select('*').eq('user_id', me);
      return sendJson(res, 200, {
        success: true,
        blocks: (data || []).map((r: any) => ({ userId: r.user_id, blockedUserId: r.blocked_user_id })),
      });
    }

    if (path === 'matches/like' && method === 'POST') {
      const targetUserId = String(body?.targetUserId || body?.userId || '');
      if (!targetUserId) {
        return sendJson(res, 400, { success: false, error: { message: 'targetUserId required' } });
      }
      const { data: existing } = await client
        .from('matches')
        .select('*')
        .or(
          `and(user_a_id.eq.${me},user_b_id.eq.${targetUserId}),and(user_a_id.eq.${targetUserId},user_b_id.eq.${me})`
        )
        .limit(1);
      const row = existing?.[0];
      if (row) {
        const mutual =
          row.status === 'pending' && row.initiated_by && row.initiated_by !== me;
        const status = mutual ? 'matched' : row.status === 'matched' ? 'matched' : 'pending';
        await client
          .from('matches')
          .update({
            status,
            matched_at: status === 'matched' ? new Date().toISOString() : row.matched_at,
            last_interaction_at: new Date().toISOString(),
          } as any)
          .eq('id', row.id);
        return sendJson(res, 200, { success: true, status, matchId: row.id, matched: status === 'matched' });
      }
      const { data: created, error } = await client
        .from('matches')
        .insert({
          user_a_id: me,
          user_b_id: targetUserId,
          status: 'pending',
          initiated_by: me,
          last_interaction_at: new Date().toISOString(),
        } as any)
        .select('*')
        .maybeSingle();
      if (error) throw error;
      return sendJson(res, 200, { success: true, status: 'pending', matchId: created?.id, matched: false });
    }

    if (path === 'matches/pass' && method === 'POST') {
      const targetUserId = String(body?.targetUserId || body?.userId || '');
      const { data: existing } = await client
        .from('matches')
        .select('id')
        .or(
          `and(user_a_id.eq.${me},user_b_id.eq.${targetUserId}),and(user_a_id.eq.${targetUserId},user_b_id.eq.${me})`
        )
        .limit(1);
      if (existing?.[0]) {
        await client
          .from('matches')
          .update({ status: 'rejected', last_interaction_at: new Date().toISOString() } as any)
          .eq('id', existing[0].id);
      } else {
        await client.from('matches').insert({
          user_a_id: me,
          user_b_id: targetUserId,
          status: 'rejected',
          initiated_by: me,
        } as any);
      }
      return sendJson(res, 200, { success: true });
    }

    if (path === 'matches/quick-match' && method === 'POST') {
      const targetUserId = String(body?.targetUserId || body?.partnerId || '');
      if (!targetUserId) {
        return sendJson(res, 400, { success: false, error: { message: 'targetUserId required' } });
      }
      const { data: existing } = await client
        .from('matches')
        .select('*')
        .or(
          `and(user_a_id.eq.${me},user_b_id.eq.${targetUserId}),and(user_a_id.eq.${targetUserId},user_b_id.eq.${me})`
        )
        .limit(1);
      if (existing?.[0]) {
        await client
          .from('matches')
          .update({
            status: 'matched',
            matched_at: new Date().toISOString(),
            last_interaction_at: new Date().toISOString(),
          } as any)
          .eq('id', existing[0].id);
        return sendJson(res, 200, { success: true, matched: true, matchId: existing[0].id });
      }
      const { data: created, error } = await client
        .from('matches')
        .insert({
          user_a_id: me,
          user_b_id: targetUserId,
          status: 'matched',
          initiated_by: me,
          matched_at: new Date().toISOString(),
        } as any)
        .select('*')
        .maybeSingle();
      if (error) throw error;
      return sendJson(res, 200, { success: true, matched: true, matchId: created?.id });
    }

    // ---- favorites ----
    if (path === 'favorites/me' && method === 'GET') {
      const { data } = await client.from('favorites').select('*').eq('user_id', me);
      return sendJson(res, 200, {
        success: true,
        favorites: (data || []).map((r: any) => ({ userId: r.user_id, favoriteUserId: r.favorite_user_id })),
      });
    }
    if (path === 'favorites/toggle' && method === 'POST') {
      const targetUserId = String(body?.targetUserId || body?.userId || '');
      const { data: existing } = await client
        .from('favorites')
        .select('id')
        .eq('user_id', me)
        .eq('favorite_user_id', targetUserId)
        .maybeSingle();
      if (existing?.id) {
        await client.from('favorites').delete().eq('id', existing.id);
        return sendJson(res, 200, { success: true, favorited: false });
      }
      await client.from('favorites').insert({ user_id: me, favorite_user_id: targetUserId } as any);
      return sendJson(res, 200, { success: true, favorited: true });
    }

    // ---- friends ----
    if (path === 'friends/requests' && method === 'GET') {
      const { data } = await client
        .from('friend_requests')
        .select('*')
        .or(`sender_id.eq.${me},receiver_id.eq.${me}`)
        .limit(100);
      return sendJson(res, 200, {
        success: true,
        requests: (data || []).map((r: any) => ({
          id: r.id,
          senderId: r.sender_id,
          receiverId: r.receiver_id,
          status: r.status,
          createdAt: r.created_at,
        })),
      });
    }
    if (path === 'friends/request' && method === 'POST') {
      const receiverId = String(body?.targetUserId || body?.receiverId || body?.userId || '').trim();
      if (!receiverId || receiverId === me) {
        return sendJson(res, 400, {
          success: false,
          error: { message: 'Invalid targetUserId', code: 'INVALID_TARGET' },
        });
      }

      const { data: sender } = await client
        .from('profiles')
        .select('id, role, gender, is_banned')
        .eq('id', me)
        .maybeSingle();
      if (!sender) {
        return sendJson(res, 404, {
          success: false,
          error: { message: 'Sender profile not found', code: 'SENDER_NOT_FOUND' },
        });
      }
      if ((sender as any).is_banned) {
        return sendJson(res, 403, {
          success: false,
          error: { message: 'Account unavailable', code: 'SENDER_BANNED' },
        });
      }
      const senderRole = String((sender as any).role || '').toLowerCase();
      const canSend =
        String((sender as any).gender || '').toLowerCase() === 'female' ||
        senderRole === 'female_creator' ||
        senderRole === 'female_host' ||
        senderRole === 'female_user';
      if (!canSend) {
        return sendJson(res, 403, {
          success: false,
          error: {
            message: 'Only female hosts can initiate friend requests',
            code: 'SENDER_NOT_ALLOWED',
          },
        });
      }

      const { data: target } = await client
        .from('profiles')
        .select('id, is_banned')
        .eq('id', receiverId)
        .maybeSingle();
      if (!target) {
        return sendJson(res, 404, {
          success: false,
          error: { message: 'Target user not found', code: 'NOT_FOUND' },
        });
      }
      if ((target as any).is_banned) {
        return sendJson(res, 403, {
          success: false,
          error: { message: 'Target user unavailable', code: 'TARGET_BANNED' },
        });
      }

      const { data: blockedRows } = await client
        .from('blocked_users')
        .select('user_id')
        .or(
          `and(user_id.eq.${me},blocked_user_id.eq.${receiverId}),and(user_id.eq.${receiverId},blocked_user_id.eq.${me})`
        )
        .limit(1);
      if (blockedRows && blockedRows.length) {
        return sendJson(res, 403, {
          success: false,
          error: { message: 'Blocked relationship', code: 'BLOCKED' },
        });
      }

      const pairFilter = `and(sender_id.eq.${me},receiver_id.eq.${receiverId}),and(sender_id.eq.${receiverId},receiver_id.eq.${me})`;
      const { data: existingRows, error: existErr } = await client
        .from('friend_requests')
        .select('id, status')
        .or(pairFilter);
      if (existErr) throw existErr;
      const rows = (existingRows || []) as Array<{ id: string; status: string }>;
      if (rows.some((r) => r.status === 'accepted')) {
        return sendJson(res, 409, {
          success: false,
          error: { message: 'Already friends', code: 'ALREADY_FRIENDS' },
        });
      }
      if (rows.some((r) => r.status === 'pending')) {
        return sendJson(res, 409, {
          success: false,
          error: { message: 'Friend request already pending', code: 'PENDING_EXISTS' },
        });
      }
      if (rows.length > 0) {
        const { error: delErr } = await client.from('friend_requests').delete().or(pairFilter);
        if (delErr) throw delErr;
      }

      const { data, error } = await client
        .from('friend_requests')
        .insert({
          sender_id: me,
          receiver_id: receiverId,
          status: 'pending',
          created_at: new Date().toISOString(),
        } as any)
        .select('*')
        .maybeSingle();
      if (error) throw error;
      return sendJson(res, 200, {
        success: true,
        data: {
          request: {
            id: data.id,
            senderId: data.sender_id,
            receiverId: data.receiver_id,
            status: data.status,
            createdAt: data.created_at,
          },
        },
      });
    }
    if ((path === 'friends/accept' || path === 'friends/decline' || path === 'friends/remove') && method === 'POST') {
      const requestId = String(body?.requestId || body?.id || '');
      const status =
        path === 'friends/accept' ? 'accepted' : path === 'friends/decline' ? 'declined' : 'removed';
      if (requestId) {
        await client.from('friend_requests').update({ status } as any).eq('id', requestId);
      } else if (body?.userId) {
        await client
          .from('friend_requests')
          .update({ status } as any)
          .or(
            `and(sender_id.eq.${me},receiver_id.eq.${body.userId}),and(sender_id.eq.${body.userId},receiver_id.eq.${me})`
          );
      }
      return sendJson(res, 200, { success: true, status });
    }

    // ---- blocks ----
    if ((path === 'blocks/me' || path.startsWith('blocks/me?')) && method === 'GET') {
      const [iBlocked, blockedMe] = await Promise.all([
        client.from('blocked_users').select('blocked_user_id').eq('user_id', me),
        client.from('blocked_users').select('user_id').eq('blocked_user_id', me),
      ]);
      return sendJson(res, 200, {
        success: true,
        data: {
          blockedUserIds: (iBlocked.data || []).map((r: any) => String(r.blocked_user_id)),
          blockedByUserIds: (blockedMe.data || []).map((r: any) => String(r.user_id)),
        },
      });
    }
    if (path === 'blocks' && method === 'POST') {
      const blockedUserId = String(body?.blockedUserId || body?.targetUserId || body?.userId || '');
      await client.from('blocked_users').upsert(
        { user_id: me, blocked_user_id: blockedUserId } as any,
        { onConflict: 'user_id,blocked_user_id' }
      );
      return sendJson(res, 200, { success: true });
    }
    if (path === 'blocks/remove' && method === 'POST') {
      const blockedUserId = String(body?.blockedUserId || body?.targetUserId || body?.userId || '');
      await client.from('blocked_users').delete().eq('user_id', me).eq('blocked_user_id', blockedUserId);
      return sendJson(res, 200, { success: true, data: { blocked: false, targetUserId: blockedUserId } });
    }
    if (path.startsWith('blocks/') && method === 'DELETE') {
      const blockedUserId = decodeURIComponent(path.replace('blocks/', '').split('?')[0]);
      await client.from('blocked_users').delete().eq('user_id', me).eq('blocked_user_id', blockedUserId);
      return sendJson(res, 200, { success: true });
    }

    // ---- feed ----
    if ((path === 'feed' || path.startsWith('feed?')) && method === 'GET') {
      const { data, error } = await client
        .from('feed_posts')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(50);
      if (error) throw error;
      return sendJson(res, 200, { success: true, posts: data || [] });
    }
    if (path === 'feed' && method === 'POST') {
      const { data, error } = await client
        .from('feed_posts')
        .insert({
          author_id: me,
          caption: body?.caption || body?.text || '',
          media_url: body?.mediaUrl || body?.media_url,
          media_type: body?.mediaType || 'image',
        } as any)
        .select('*')
        .maybeSingle();
      if (error) throw error;
      return sendJson(res, 200, { success: true, post: data });
    }
    if (path.match(/^feed\/[^/]+\/like$/) && method === 'POST') {
      return sendJson(res, 200, { success: true, liked: true });
    }
    if (path.match(/^feed\/[^/]+$/) && method === 'DELETE') {
      const postId = decodeURIComponent(path.split('/')[1] || '');
      if (!postId || postId === 'user') {
        return sendJson(res, 400, { success: false, error: { message: 'postId required' } });
      }
      const { data: post } = await client
        .from('feed_posts')
        .select('id, creator_id')
        .eq('id', postId)
        .maybeSingle();
      if (!post) {
        return sendJson(res, 404, { success: false, error: { message: 'Post not found' } });
      }
      if (String((post as any).creator_id) !== me) {
        return sendJson(res, 403, { success: false, error: { message: 'Forbidden', code: 'FORBIDDEN' } });
      }
      await client.from('feed_posts').delete().eq('id', postId);
      return sendJson(res, 200, { success: true, data: { deleted: true, postId } });
    }
    if (path.match(/^feed\/[^/]+\/tip$/) && method === 'POST') {
      return sendJson(res, 200, { success: true, tipped: true });
    }
    if (path.startsWith('feed/user/') && method === 'GET') {
      const userId = decodeURIComponent(path.replace('feed/user/', '').split('?')[0]);
      const { data } = await client
        .from('feed_posts')
        .select('*')
        .eq('author_id', userId)
        .order('created_at', { ascending: false })
        .limit(50);
      return sendJson(res, 200, { success: true, posts: data || [] });
    }

    // ---- reviews / reports stubs that still succeed ----
    if (path.startsWith('reviews') && method === 'GET') {
      return sendJson(res, 200, { success: true, reviews: [] });
    }
    if (path === 'reviews' && method === 'POST') {
      return sendJson(res, 200, { success: true });
    }
    if (path === 'reviews/request' && method === 'POST') {
      return sendJson(res, 200, { success: true });
    }
    if ((path === 'reports/me' || path.startsWith('reports/me?')) && method === 'GET') {
      const { data, error } = await client
        .from('moderation_reports')
        .select('*')
        .eq('reporter_id', me)
        .order('created_at', { ascending: false })
        .limit(50);
      if (error) throw error;
      return sendJson(res, 200, { success: true, data: { reports: data || [] } });
    }
    if (path === 'reports' && method === 'POST') {
      const { error } = await client.from('moderation_reports').insert({
        reporter_id: me,
        reported_user_id: body?.reportedUserId || body?.userId,
        reason: body?.reason || 'other',
        details: body?.details || body?.message || '',
      } as any);
      if (error) throw error;
      return sendJson(res, 200, { success: true });
    }

    return sendJson(res, 501, {
      success: false,
      error: { message: `Unimplemented v1 path: ${path}`, code: 'VERCEL_ROUTE_NOT_IMPLEMENTED' },
    });
  } catch (err: any) {
    console.error('[api/v1]', path, err);
    return sendJson(res, 500, { success: false, error: { message: err?.message || 'Server error' } });
  }
}
