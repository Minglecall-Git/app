/**
 * /api/v1/* social routes — CommonJS port of api/_lib/handlers/v1.ts
 *
 * Only claims known social prefixes. Other v1 modules (e.g. finance) must return null
 * so later router handlers can serve them — never swallow with "Unimplemented v1 path".
 */
const { send, readJsonBody, requireAuth, isAdminRole, mapPublicProfileRow } = require('./helpers');

/** Prefixes owned by this social v1 handler (must match Express mounts under /api/v1). */
const SOCIAL_V1_PREFIXES = [
  'matches',
  'favorites',
  'friends',
  'blocks',
  'feed',
  'reviews',
  'reports',
  'admin/reports',
  'users',
];

function v1Path(fullPath, req) {
  if (String(fullPath || '').startsWith('v1/')) {
    return String(fullPath).slice(3);
  }
  if (fullPath === 'v1') return '';
  try {
    return new URL(req.url || '', 'http://localhost').pathname.replace(/^\/api\/v1\/?/, '');
  } catch {
    return '';
  }
}

function isSocialV1Path(path) {
  const p = String(path || '').split('?')[0];
  if (!p) return false;
  return SOCIAL_V1_PREFIXES.some((prefix) => p === prefix || p.startsWith(prefix + '/'));
}

function mapMatchRow(row, me) {
  if (!row) return null;
  return {
    id: row.id,
    userAId: row.user_a_id,
    userBId: row.user_b_id,
    otherUserId: row.user_a_id === me ? row.user_b_id : row.user_a_id,
    status: row.status,
    initiatedBy: row.initiated_by,
    matchedAt: row.matched_at,
    createdAt: row.created_at,
  };
}

function mapFriendRow(r) {
  return {
    id: r.id,
    senderId: r.sender_id,
    receiverId: r.receiver_id,
    status: r.status,
    createdAt: r.created_at,
  };
}

async function loadFriendsPayload(client, me) {
  const { data } = await client
    .from('friend_requests')
    .select('*')
    .or(`sender_id.eq.${me},receiver_id.eq.${me}`)
    .limit(100);
  const requests = (data || []).map(mapFriendRow);
  const friendIds = Array.from(
    new Set(
      requests
        .filter((r) => r.status === 'accepted')
        .map((r) => (r.senderId === me ? r.receiverId : r.senderId))
    )
  );
  return { requests, friendIds };
}

async function loadBlocksPayload(client, me) {
  const [iBlocked, blockedMe] = await Promise.all([
    client.from('blocked_users').select('blocked_user_id').eq('user_id', me),
    client.from('blocked_users').select('user_id').eq('blocked_user_id', me),
  ]);
  return {
    blockedUserIds: (iBlocked.data || []).map((r) => String(r.blocked_user_id)),
    blockedByUserIds: (blockedMe.data || []).map((r) => String(r.user_id)),
  };
}

function mapFeedPost(row, isLiked) {
  return {
    id: row.id,
    creatorId: row.creator_id,
    creatorName: row.creator_name || 'Creator',
    creatorAvatar: row.creator_avatar || '',
    creatorCountry: row.creator_country || undefined,
    mediaUrl: row.media_url,
    mediaType: row.media_type === 'video' ? 'video' : 'image',
    caption: row.caption || '',
    likes: Number(row.likes || 0),
    commentsCount: Number(row.comments_count || 0),
    isLiked: Boolean(isLiked),
    createdAt: row.created_at,
  };
}

async function loadLikedPostIds(client, userId, postIds) {
  if (!userId || !postIds.length) return new Set();
  const { data } = await client
    .from('feed_post_likes')
    .select('post_id')
    .eq('user_id', userId)
    .in('post_id', postIds);
  return new Set((data || []).map((r) => String(r.post_id)));
}

function mapReviewRow(row) {
  return {
    id: row.id,
    creatorId: row.creator_id,
    callerId: row.caller_id,
    callerName: row.caller_name || 'Caller',
    callerAvatar: row.caller_avatar || '',
    callLogId: row.call_log_id || undefined,
    stars: Number(row.stars) || 5,
    communication: row.communication,
    friendliness: row.friendliness,
    clarity: row.clarity,
    energy: row.energy,
    comment: row.comment,
    tags: Array.isArray(row.tags) ? row.tags : [],
    createdAt: row.created_at || '',
    callDurationSeconds: row.call_duration_seconds,
  };
}

async function handleV1(fullPath, req, res) {
  if (!String(fullPath || '').startsWith('v1')) return null;

  const path = v1Path(fullPath, req);
  // Only claim social namespaces — finance and future v1 modules pass through.
  if (!isSocialV1Path(path)) return null;

  const auth = await requireAuth(req);
  if (auth.ok === false) return send(res, auth.status, { success: false, error: auth.error });
  const client = auth.client;
  const method = req.method || 'GET';
  const me = auth.profileId;
  const body = method !== 'GET' ? await readJsonBody(req) : {};

  try {
    // GET /api/v1/users/:id/public
    if (method === 'GET' && /^users\/[^/]+\/public$/.test(path.split('?')[0])) {
      const targetId = decodeURIComponent(path.split('?')[0].replace(/^users\//, '').replace(/\/public$/, ''));
      if (!targetId) {
        return send(res, 400, { success: false, error: { message: 'Invalid user id', code: 'INVALID_ID' } });
      }
      if (targetId !== me) {
        const { data: blockRows } = await client
          .from('blocked_users')
          .select('user_id, blocked_user_id')
          .or(
            `and(user_id.eq.${me},blocked_user_id.eq.${targetId}),and(user_id.eq.${targetId},blocked_user_id.eq.${me})`
          )
          .limit(1);
        if (blockRows && blockRows.length > 0) {
          return send(res, 404, { success: false, error: { message: 'Profile not found', code: 'NOT_FOUND' } });
        }
      }
      const selectCols =
        'id, name, gender, age, dob, nationality, country_code, spoken_languages, bio, extended_bio, location_city, zodiac, interests, tags, interested_in, avatar_url, gallery, gallery_videos, intro_video_url, is_verified, online_status, role, response_rate, hourly_coin_rate, rating_score, total_reviews_count, total_calls_hosted, exact_location, is_using_mock_location, mock_location_city, mock_location_country, mock_location_country_code, created_at, is_banned';
      let { data, error } = await client.from('profiles').select(selectCols).eq('id', targetId).maybeSingle();
      if (error && /column|does not exist/i.test(String(error.message || ''))) {
        const fallback = await client
          .from('profiles')
          .select(
            'id, name, gender, age, dob, nationality, country_code, spoken_languages, bio, extended_bio, location_city, zodiac, interests, tags, avatar_url, gallery, intro_video_url, is_verified, online_status, role, hourly_coin_rate, created_at, is_banned'
          )
          .eq('id', targetId)
          .maybeSingle();
        data = fallback.data;
        error = fallback.error;
      }
      if (error) throw error;
      if (!data || data.is_banned) {
        return send(res, 404, { success: false, error: { message: 'Profile not found', code: 'NOT_FOUND' } });
      }
      return send(res, 200, { success: true, data: { user: mapPublicProfileRow(data) } });
    }

    if (path === 'matches/me' && method === 'GET') {
      const { data, error } = await client
        .from('matches')
        .select('*')
        .or(`user_a_id.eq.${me},user_b_id.eq.${me}`)
        .limit(200);
      if (error) throw error;
      const matches = (data || []).map((row) => mapMatchRow(row, me));
      return send(res, 200, { success: true, data: { matches } });
    }

    if (path === 'matches/blocks' && method === 'GET') {
      const [iBlocked, blockedMe] = await Promise.all([
        client.from('blocked_users').select('blocked_user_id').eq('user_id', me),
        client.from('blocked_users').select('user_id').eq('blocked_user_id', me),
      ]);
      return send(res, 200, {
        success: true,
        data: {
          blockedUserIds: (iBlocked.data || []).map((r) => String(r.blocked_user_id)),
          blockedByUserIds: (blockedMe.data || []).map((r) => String(r.user_id)),
        },
      });
    }

    if (path === 'matches/like' && method === 'POST') {
      const targetUserId = String((body && (body.targetUserId || body.userId)) || '');
      const superLike = Boolean(body && body.superLike);
      if (!targetUserId || targetUserId === me) {
        return send(res, 400, { success: false, error: { message: 'targetUserId required' } });
      }
      const nowIso = new Date().toISOString();
      const { data: existing } = await client
        .from('matches')
        .select('*')
        .or(
          `and(user_a_id.eq.${me},user_b_id.eq.${targetUserId}),and(user_a_id.eq.${targetUserId},user_b_id.eq.${me})`
        )
        .limit(1);
      let row = existing && existing[0];
      let status = 'pending';
      if (row) {
        if (row.status === 'matched') {
          status = 'matched';
        } else if (row.status === 'pending' && row.initiated_by && row.initiated_by !== me) {
          status = 'matched';
        } else {
          status = 'pending';
        }
        const { data: updated, error } = await client
          .from('matches')
          .update({
            status,
            initiated_by: status === 'pending' ? me : row.initiated_by || me,
            matched_at: status === 'matched' ? nowIso : null,
            last_interaction_at: nowIso,
          })
          .eq('id', row.id)
          .select('*')
          .maybeSingle();
        if (error) throw error;
        row = updated || row;
      } else {
        const { data: created, error } = await client
          .from('matches')
          .insert({
            user_a_id: me,
            user_b_id: targetUserId,
            status: 'pending',
            initiated_by: me,
            last_interaction_at: nowIso,
          })
          .select('*')
          .maybeSingle();
        if (error) throw error;
        row = created;
        status = 'pending';
      }
      return send(res, 200, {
        success: true,
        data: { match: mapMatchRow(row, me), superLike },
      });
    }

    if (path === 'matches/pass' && method === 'POST') {
      const targetUserId = String((body && (body.targetUserId || body.userId)) || '');
      if (!targetUserId || targetUserId === me) {
        return send(res, 400, { success: false, error: { message: 'targetUserId required' } });
      }
      const nowIso = new Date().toISOString();
      const { data: existing } = await client
        .from('matches')
        .select('*')
        .or(
          `and(user_a_id.eq.${me},user_b_id.eq.${targetUserId}),and(user_a_id.eq.${targetUserId},user_b_id.eq.${me})`
        )
        .limit(1);
      let row = existing && existing[0];
      if (row) {
        const nextStatus = row.status === 'matched' ? 'unmatched' : 'rejected';
        const { data: updated, error } = await client
          .from('matches')
          .update({
            status: nextStatus,
            initiated_by: me,
            last_interaction_at: nowIso,
            matched_at: null,
          })
          .eq('id', row.id)
          .select('*')
          .maybeSingle();
        if (error) throw error;
        row = updated || row;
      } else {
        const { data: created, error } = await client
          .from('matches')
          .insert({
            user_a_id: me,
            user_b_id: targetUserId,
            status: 'rejected',
            initiated_by: me,
            last_interaction_at: nowIso,
          })
          .select('*')
          .maybeSingle();
        if (error) throw error;
        row = created;
      }
      return send(res, 200, { success: true, data: { match: mapMatchRow(row, me) } });
    }

    if (path === 'matches/quick-match' && method === 'POST') {
      const targetUserId = String((body && (body.targetUserId || body.partnerId)) || '');
      const giftsCoins = Math.max(0, Number((body && body.giftsCoins) || 0) || 0);
      if (!targetUserId || targetUserId === me) {
        return send(res, 400, { success: false, error: { message: 'targetUserId required' } });
      }
      const nowIso = new Date().toISOString();
      const { data: existing } = await client
        .from('matches')
        .select('*')
        .or(
          `and(user_a_id.eq.${me},user_b_id.eq.${targetUserId}),and(user_a_id.eq.${targetUserId},user_b_id.eq.${me})`
        )
        .limit(1);
      let row = existing && existing[0];
      if (row) {
        const { data: updated, error } = await client
          .from('matches')
          .update({
            status: 'matched',
            matched_at: row.matched_at || nowIso,
            last_interaction_at: nowIso,
          })
          .eq('id', row.id)
          .select('*')
          .maybeSingle();
        if (error) throw error;
        row = updated || row;
      } else {
        const { data: created, error } = await client
          .from('matches')
          .insert({
            user_a_id: me,
            user_b_id: targetUserId,
            status: 'matched',
            initiated_by: me,
            matched_at: nowIso,
            last_interaction_at: nowIso,
          })
          .select('*')
          .maybeSingle();
        if (error) throw error;
        row = created;
      }
      return send(res, 200, {
        success: true,
        data: { match: mapMatchRow(row, me), giftsCoins },
      });
    }

    if (path === 'favorites/me' && method === 'GET') {
      const { data } = await client.from('favorites').select('favorite_user_id').eq('user_id', me);
      return send(res, 200, {
        success: true,
        data: {
          favoriteUserIds: (data || []).map((r) => String(r.favorite_user_id)),
        },
      });
    }
    if (path === 'favorites/toggle' && method === 'POST') {
      const targetUserId = String((body && (body.targetUserId || body.userId)) || '');
      if (!targetUserId || targetUserId === me) {
        return send(res, 400, { success: false, error: { message: 'targetUserId required' } });
      }
      const { data: existing } = await client
        .from('favorites')
        .select('id')
        .eq('user_id', me)
        .eq('favorite_user_id', targetUserId)
        .maybeSingle();
      if (existing && existing.id) {
        await client.from('favorites').delete().eq('id', existing.id);
        return send(res, 200, { success: true, data: { favorited: false, targetUserId } });
      }
      await client.from('favorites').insert({ user_id: me, favorite_user_id: targetUserId });
      return send(res, 200, { success: true, data: { favorited: true, targetUserId } });
    }

    if (path === 'friends/requests' && method === 'GET') {
      const { data } = await client
        .from('friend_requests')
        .select('*')
        .or(`sender_id.eq.${me},receiver_id.eq.${me}`)
        .limit(100);
      const requests = (data || []).map((r) => ({
        id: r.id,
        senderId: r.sender_id,
        receiverId: r.receiver_id,
        status: r.status,
        createdAt: r.created_at,
      }));
      const friendIds = Array.from(
        new Set(
          requests
            .filter((r) => r.status === 'accepted')
            .map((r) => (r.senderId === me ? r.receiverId : r.senderId))
        )
      );
      return send(res, 200, {
        success: true,
        data: { requests, friendIds },
      });
    }
    if (path === 'friends/request' && method === 'POST') {
      const receiverId = String((body && (body.targetUserId || body.receiverId || body.userId)) || '');
      if (!receiverId || receiverId === me) {
        return send(res, 400, {
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
        return send(res, 404, {
          success: false,
          error: { message: 'Sender profile not found', code: 'SENDER_NOT_FOUND' },
        });
      }
      if (sender.is_banned) {
        return send(res, 403, {
          success: false,
          error: { message: 'Account unavailable', code: 'SENDER_BANNED' },
        });
      }
      const senderRole = String(sender.role || '').toLowerCase();
      const canSend =
        String(sender.gender || '').toLowerCase() === 'female' ||
        senderRole === 'female_creator' ||
        senderRole === 'female_host' ||
        senderRole === 'female_user';
      if (!canSend) {
        return send(res, 403, {
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
        return send(res, 404, {
          success: false,
          error: { message: 'Target user not found', code: 'NOT_FOUND' },
        });
      }
      if (target.is_banned) {
        return send(res, 403, {
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
        return send(res, 403, {
          success: false,
          error: { message: 'Blocked relationship', code: 'BLOCKED' },
        });
      }

      // Clear stale declined/cancelled rows so UNIQUE(sender_id, receiver_id) does not 500
      const pairFilter = `and(sender_id.eq.${me},receiver_id.eq.${receiverId}),and(sender_id.eq.${receiverId},receiver_id.eq.${me})`;
      const { data: existingRows, error: existErr } = await client
        .from('friend_requests')
        .select('id, status')
        .or(pairFilter);
      if (existErr) throw existErr;
      const rows = existingRows || [];
      if (rows.some((r) => r.status === 'accepted')) {
        return send(res, 409, {
          success: false,
          error: { message: 'Already friends', code: 'ALREADY_FRIENDS' },
        });
      }
      if (rows.some((r) => r.status === 'pending')) {
        return send(res, 409, {
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
        })
        .select('*')
        .maybeSingle();
      if (error) throw error;
      const payload = await loadFriendsPayload(client, me);
      return send(res, 200, {
        success: true,
        data: {
          request: mapFriendRow(data),
          ...payload,
        },
      });
    }
    if (path === 'friends/accept' && method === 'POST') {
      const requestId = String((body && (body.requestId || body.id)) || '');
      if (!requestId) {
        return send(res, 400, { success: false, error: { message: 'requestId required' } });
      }
      const { data: row, error } = await client
        .from('friend_requests')
        .update({ status: 'accepted', responded_at: new Date().toISOString() })
        .eq('id', requestId)
        .select('*')
        .maybeSingle();
      if (error) throw error;
      const payload = await loadFriendsPayload(client, me);
      return send(res, 200, {
        success: true,
        data: { request: row ? mapFriendRow(row) : undefined, ...payload },
      });
    }
    if (path === 'friends/decline' && method === 'POST') {
      const requestId = String((body && (body.requestId || body.id)) || '');
      if (!requestId) {
        return send(res, 400, { success: false, error: { message: 'requestId required' } });
      }
      const { data: row, error } = await client
        .from('friend_requests')
        .update({ status: 'declined', responded_at: new Date().toISOString() })
        .eq('id', requestId)
        .select('*')
        .maybeSingle();
      if (error) throw error;
      const payload = await loadFriendsPayload(client, me);
      return send(res, 200, {
        success: true,
        data: { request: row ? mapFriendRow(row) : undefined, ...payload },
      });
    }
    if (path === 'friends/remove' && method === 'POST') {
      const targetUserId = String((body && (body.targetUserId || body.userId)) || '');
      const requestId = String((body && (body.requestId || body.id)) || '');
      if (requestId) {
        await client.from('friend_requests').delete().eq('id', requestId);
      } else if (targetUserId) {
        await client
          .from('friend_requests')
          .delete()
          .or(
            `and(sender_id.eq.${me},receiver_id.eq.${targetUserId}),and(sender_id.eq.${targetUserId},receiver_id.eq.${me})`
          );
      }
      const payload = await loadFriendsPayload(client, me);
      return send(res, 200, {
        success: true,
        data: { removed: true, targetUserId, ...payload },
      });
    }

    if ((path === 'blocks/me' || path.startsWith('blocks/me?')) && method === 'GET') {
      const blocks = await loadBlocksPayload(client, me);
      return send(res, 200, { success: true, data: blocks });
    }
    if (path === 'blocks' && method === 'POST') {
      const blockedUserId = String(
        (body && (body.blockedUserId || body.targetUserId || body.userId)) || ''
      );
      if (!blockedUserId || blockedUserId === me) {
        return send(res, 400, { success: false, error: { message: 'Invalid target' } });
      }
      await client
        .from('blocked_users')
        .upsert(
          { user_id: me, blocked_user_id: blockedUserId },
          { onConflict: 'user_id,blocked_user_id' }
        );
      const blocks = await loadBlocksPayload(client, me);
      return send(res, 200, { success: true, data: { blocked: true, targetUserId: blockedUserId, ...blocks } });
    }
    if (path === 'blocks/remove' && method === 'POST') {
      const blockedUserId = String(
        (body && (body.blockedUserId || body.targetUserId || body.userId)) || ''
      );
      if (!blockedUserId || blockedUserId === me) {
        return send(res, 400, { success: false, error: { message: 'Invalid target' } });
      }
      await client
        .from('blocked_users')
        .delete()
        .eq('user_id', me)
        .eq('blocked_user_id', blockedUserId);
      const blocks = await loadBlocksPayload(client, me);
      return send(res, 200, {
        success: true,
        data: { blocked: false, targetUserId: blockedUserId, ...blocks },
      });
    }
    if (path.startsWith('blocks/') && method === 'DELETE') {
      const blockedUserId = decodeURIComponent(path.replace('blocks/', '').split('?')[0]);
      if (!blockedUserId || blockedUserId === 'me' || blockedUserId === 'remove') {
        return send(res, 400, { success: false, error: { message: 'Invalid target' } });
      }
      await client
        .from('blocked_users')
        .delete()
        .eq('user_id', me)
        .eq('blocked_user_id', blockedUserId);
      const blocks = await loadBlocksPayload(client, me);
      return send(res, 200, {
        success: true,
        data: { blocked: false, targetUserId: blockedUserId, ...blocks },
      });
    }

    if ((path === 'feed' || path.startsWith('feed?')) && method === 'GET') {
      const { data, error } = await client
        .from('feed_posts')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(50);
      if (error) throw error;
      const rows = data || [];
      const liked = await loadLikedPostIds(
        client,
        me,
        rows.map((r) => String(r.id))
      );
      return send(res, 200, {
        success: true,
        data: { posts: rows.map((r) => mapFeedPost(r, liked.has(String(r.id)))) },
      });
    }
    if (path === 'feed' && method === 'POST') {
      const mediaUrl = String((body && (body.mediaUrl || body.media_url)) || '').trim();
      if (!mediaUrl) {
        return send(res, 400, { success: false, error: { message: 'mediaUrl required' } });
      }
      const { data: profile } = await client
        .from('profiles')
        .select('id, name, avatar_url')
        .eq('id', me)
        .maybeSingle();
      const insertRow = {
        id: `fp_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        creator_id: me,
        creator_name: (profile && profile.name) || 'Creator',
        creator_avatar: (profile && profile.avatar_url) || '',
        caption: String((body && (body.caption || body.text)) || '').slice(0, 2000),
        media_url: mediaUrl,
        media_type: (body && body.mediaType) === 'video' ? 'video' : 'image',
        likes: 0,
        comments_count: 0,
      };
      const { data, error } = await client
        .from('feed_posts')
        .insert(insertRow)
        .select('*')
        .maybeSingle();
      if (error) throw error;
      return send(res, 201, { success: true, data: { post: mapFeedPost(data, false) } });
    }
    if (/^feed\/[^/]+\/like$/.test(path) && method === 'POST') {
      const postId = decodeURIComponent(path.split('/')[1]);
      const { data: post, error: postErr } = await client
        .from('feed_posts')
        .select('id, likes')
        .eq('id', postId)
        .maybeSingle();
      if (postErr) throw postErr;
      if (!post) {
        return send(res, 404, { success: false, error: { message: 'Post not found' } });
      }
      const { data: existing } = await client
        .from('feed_post_likes')
        .select('post_id')
        .eq('post_id', postId)
        .eq('user_id', me)
        .maybeSingle();
      let liked = false;
      let likes = Number(post.likes || 0);
      if (existing) {
        await client.from('feed_post_likes').delete().eq('post_id', postId).eq('user_id', me);
        likes = Math.max(0, likes - 1);
        liked = false;
      } else {
        const { error: insErr } = await client
          .from('feed_post_likes')
          .insert({ post_id: postId, user_id: me });
        if (insErr && String(insErr.code) !== '23505') throw insErr;
        likes = likes + 1;
        liked = true;
      }
      await client.from('feed_posts').update({ likes }).eq('id', postId);
      return send(res, 200, { success: true, data: { postId, liked, likes } });
    }
    if (/^feed\/[^/]+$/.test(path) && method === 'DELETE') {
      const postId = decodeURIComponent(path.split('/')[1]);
      if (!postId || postId === 'user') {
        return send(res, 400, { success: false, error: { message: 'postId required' } });
      }
      const { data: post, error: postErr } = await client
        .from('feed_posts')
        .select('id, creator_id')
        .eq('id', postId)
        .maybeSingle();
      if (postErr) throw postErr;
      if (!post) {
        return send(res, 404, { success: false, error: { message: 'Post not found' } });
      }
      if (String(post.creator_id) !== me && !isAdminRole(auth.role, auth.email)) {
        return send(res, 403, {
          success: false,
          error: { message: 'You can only delete your own moments', code: 'FORBIDDEN' },
        });
      }
      const { error: delErr } = await client.from('feed_posts').delete().eq('id', postId);
      if (delErr) throw delErr;
      return send(res, 200, { success: true, data: { deleted: true, postId } });
    }
    if (/^feed\/[^/]+\/tip$/.test(path) && method === 'POST') {
      const postId = decodeURIComponent(path.split('/')[1]);
      const tipCoins = Math.max(1, Math.min(50000, Math.round(Number((body && body.coins) || 20) || 20)));
      const { data: post } = await client
        .from('feed_posts')
        .select('id, creator_id')
        .eq('id', postId)
        .maybeSingle();
      if (!post) {
        return send(res, 404, { success: false, error: { message: 'Post not found' } });
      }
      const creatorId = String(post.creator_id);
      if (creatorId === me) {
        return send(res, 400, { success: false, error: { message: 'Cannot tip yourself' } });
      }
      const { data: sender } = await client
        .from('profiles')
        .select('id, coin_balance')
        .eq('id', me)
        .maybeSingle();
      if (!sender || Number(sender.coin_balance) < tipCoins) {
        return send(res, 400, {
          success: false,
          error: { message: 'Insufficient coins', code: 'INSUFFICIENT' },
        });
      }
      const { data: host } = await client
        .from('profiles')
        .select('id, earnings_coins, role, team_leader_id, created_by_id')
        .eq('id', creatorId)
        .maybeSingle();
      if (!host) {
        return send(res, 404, { success: false, error: { message: 'Creator not found' } });
      }
      const { data: cfg } = await client
        .from('system_configs')
        .select('female_host_share_percent, team_leader_share_percent')
        .eq('id', 'default')
        .maybeSingle();
      const hostSharePercent = Math.min(
        100,
        Math.max(0, Math.round(Number((cfg && cfg.female_host_share_percent) || 30)))
      );
      const tlSharePercent = Math.min(
        100,
        Math.max(0, Math.round(Number((cfg && cfg.team_leader_share_percent) || 10)))
      );
      const hostEarn = Math.floor(tipCoins * (hostSharePercent / 100));
      const tlId = String(host.team_leader_id || host.created_by_id || '') || null;
      const tlEarn = tlId ? Math.floor(tipCoins * (tlSharePercent / 100)) : 0;
      const newSenderBal = Number(sender.coin_balance) - tipCoins;
      const { data: debited, error: debitErr } = await client
        .from('profiles')
        .update({ coin_balance: newSenderBal, updated_at: new Date().toISOString() })
        .eq('id', me)
        .gte('coin_balance', tipCoins)
        .select('coin_balance')
        .maybeSingle();
      if (debitErr || !debited) {
        return send(res, 409, { success: false, error: { message: 'Debit conflict' } });
      }
      const newHostEarn = Number(host.earnings_coins || 0) + hostEarn;
      await client
        .from('profiles')
        .update({ earnings_coins: newHostEarn, updated_at: new Date().toISOString() })
        .eq('id', creatorId);
      let newTlEarn = null;
      if (tlId && tlEarn > 0) {
        const { data: tl } = await client
          .from('profiles')
          .select('earnings_coins')
          .eq('id', tlId)
          .maybeSingle();
        if (tl) {
          newTlEarn = Number(tl.earnings_coins || 0) + tlEarn;
          await client
            .from('profiles')
            .update({ earnings_coins: newTlEarn, updated_at: new Date().toISOString() })
            .eq('id', tlId);
        }
      }
      return send(res, 200, {
        success: true,
        data: {
          tipCoins,
          senderBalance: Number(debited.coin_balance),
          hostEarnings: newHostEarn,
          tlId,
          tlEarnings: newTlEarn,
        },
      });
    }
    if (path.startsWith('feed/user/') && method === 'GET') {
      const userId = decodeURIComponent(path.replace('feed/user/', '').split('?')[0]);
      const { data } = await client
        .from('feed_posts')
        .select('*')
        .eq('creator_id', userId)
        .order('created_at', { ascending: false })
        .limit(50);
      const rows = data || [];
      const liked = await loadLikedPostIds(
        client,
        me,
        rows.map((r) => String(r.id))
      );
      return send(res, 200, {
        success: true,
        data: { posts: rows.map((r) => mapFeedPost(r, liked.has(String(r.id)))) },
      });
    }

    if (path.startsWith('reviews/creator/') && method === 'GET') {
      const creatorId = decodeURIComponent(path.replace('reviews/creator/', '').split('?')[0]);
      const { data, error } = await client
        .from('creator_reviews')
        .select('*')
        .eq('creator_id', creatorId)
        .order('created_at', { ascending: false })
        .limit(100);
      if (error) throw error;
      return send(res, 200, {
        success: true,
        data: { reviews: (data || []).map(mapReviewRow) },
      });
    }
    if (path === 'reviews' && method === 'POST') {
      const creatorId = String((body && body.creatorId) || '');
      const stars = Math.min(5, Math.max(1, Math.round(Number((body && body.stars) || 5) || 5)));
      if (!creatorId) {
        return send(res, 400, { success: false, error: { message: 'creatorId required' } });
      }
      const { data: caller } = await client
        .from('profiles')
        .select('id, name, avatar_url')
        .eq('id', me)
        .maybeSingle();
      const insertRow = {
        creator_id: creatorId,
        caller_id: me,
        stars,
        communication: body && body.communication != null ? Number(body.communication) : null,
        friendliness: body && body.friendliness != null ? Number(body.friendliness) : null,
        clarity: body && body.clarity != null ? Number(body.clarity) : null,
        energy: body && body.energy != null ? Number(body.energy) : null,
        comment: body && body.comment ? String(body.comment).slice(0, 500) : null,
        tags: Array.isArray(body && body.tags) ? body.tags.slice(0, 12) : [],
        call_log_id: (body && body.callLogId) || null,
        call_duration_seconds:
          body && body.callDurationSeconds != null ? Number(body.callDurationSeconds) : null,
        caller_name: (caller && caller.name) || 'Caller',
        caller_avatar: (caller && caller.avatar_url) || '',
      };
      const { data, error } = await client
        .from('creator_reviews')
        .insert(insertRow)
        .select('*')
        .maybeSingle();
      if (error) throw error;
      const { data: allStars } = await client
        .from('creator_reviews')
        .select('stars')
        .eq('creator_id', creatorId);
      const count = (allStars || []).length;
      const avg =
        count === 0
          ? 5
          : Number(
              (
                (allStars || []).reduce((s, r) => s + Number(r.stars || 0), 0) / count
              ).toFixed(2)
            );
      await client
        .from('profiles')
        .update({ rating_score: avg, total_reviews_count: count })
        .eq('id', creatorId);
      return send(res, 200, {
        success: true,
        data: {
          review: mapReviewRow(data),
          creatorRating: { ratingScore: avg, totalReviewsCount: count },
        },
      });
    }
    if (path === 'reviews/request' && method === 'POST') {
      const callerId = String((body && body.callerId) || '');
      if (!callerId || callerId === me) {
        return send(res, 400, { success: false, error: { message: 'callerId required' } });
      }
      const text = 'How was the call? Tap to rate your experience.';
      const ratingInfo = {
        creatorId: me,
        callerId,
        callLogId: (body && body.callLogId) || null,
        isSubmitted: false,
      };
      const { data: msg, error } = await client
        .from('messages')
        .insert({
          sender_id: me,
          receiver_id: callerId,
          text,
          type: 'call_rating',
          rating_info: ratingInfo,
          is_read: false,
          created_at: new Date().toISOString(),
        })
        .select('*')
        .maybeSingle();
      if (error) throw error;
      return send(res, 200, {
        success: true,
        data: {
          message: {
            id: msg.id,
            senderId: msg.sender_id,
            receiverId: msg.receiver_id,
            text: msg.text || text,
            type: 'call_rating',
            ratingInfo: msg.rating_info || ratingInfo,
            isRead: false,
            createdAt: msg.created_at,
            timestamp: msg.created_at,
          },
        },
      });
    }
    if ((path === 'reports/me' || path.startsWith('reports/me?')) && method === 'GET') {
      const { data, error } = await client
        .from('moderation_reports')
        .select(
          'id, reporter_id, reported_user_id, reason, details, evidence_snapshot_url, status, action_taken, admin_notes, resolved_by, resolved_at, created_at'
        )
        .eq('reporter_id', me)
        .order('created_at', { ascending: false })
        .limit(50);
      if (error) throw error;
      return send(res, 200, { success: true, data: { reports: data || [] } });
    }
    if (path === 'reports' && method === 'POST') {
      const { error } = await client.from('moderation_reports').insert({
        reporter_id: me,
        reported_user_id: (body && (body.reportedUserId || body.userId || body.targetUserId)) || null,
        reason: (body && body.reason) || 'other',
        details: (body && (body.details || body.message)) || '',
      });
      if (error) throw error;
      return send(res, 200, { success: true, data: { alreadyReported: false } });
    }

    // Admin moderation reports (GET list + PATCH status)
    if ((path === 'admin/reports' || path.startsWith('admin/reports?')) && method === 'GET') {
      if (!isAdminRole(auth.role, auth.email)) {
        return send(res, 403, { success: false, error: { message: 'Admin role required', code: 'FORBIDDEN' } });
      }
      let statusFilter = '';
      let limit = 50;
      try {
        const u = new URL(req.url || '', 'http://localhost');
        statusFilter = String(u.searchParams.get('status') || '').toLowerCase();
        limit = Math.min(Math.max(Number(u.searchParams.get('limit') || 50), 1), 100);
      } catch (_) {}
      const ADMIN_STATUSES = new Set(['pending', 'investigating', 'action_taken', 'dismissed']);
      let query = client
        .from('moderation_reports')
        .select(
          'id, reporter_id, reported_user_id, reason, details, evidence_snapshot_url, status, action_taken, admin_notes, resolved_by, resolved_at, created_at'
        )
        .order('created_at', { ascending: false })
        .limit(limit);
      if (statusFilter && ADMIN_STATUSES.has(statusFilter)) query = query.eq('status', statusFilter);
      const { data: reports, error } = await query;
      if (error) throw error;
      const rows = reports || [];
      const profileIds = Array.from(
        new Set(rows.flatMap((r) => [String(r.reporter_id), String(r.reported_user_id)].filter(Boolean)))
      );
      let profilesById = {};
      if (profileIds.length) {
        const { data: profiles } = await client
          .from('profiles')
          .select('id, name, avatar_url')
          .in('id', profileIds);
        profilesById = Object.fromEntries((profiles || []).map((p) => [String(p.id), p]));
      }
      const enriched = rows.map((r) => ({
        ...r,
        reporter: profilesById[String(r.reporter_id)]
          ? {
              id: profilesById[String(r.reporter_id)].id,
              name: profilesById[String(r.reporter_id)].name,
              avatarUrl: profilesById[String(r.reporter_id)].avatar_url,
            }
          : { id: r.reporter_id, name: null, avatarUrl: null },
        reportedUser: profilesById[String(r.reported_user_id)]
          ? {
              id: profilesById[String(r.reported_user_id)].id,
              name: profilesById[String(r.reported_user_id)].name,
              avatarUrl: profilesById[String(r.reported_user_id)].avatar_url,
            }
          : { id: r.reported_user_id, name: null, avatarUrl: null },
      }));
      return send(res, 200, { success: true, data: { reports: enriched } });
    }

    if (path.startsWith('admin/reports/') && method === 'PATCH') {
      if (!isAdminRole(auth.role, auth.email)) {
        return send(res, 403, { success: false, error: { message: 'Admin role required', code: 'FORBIDDEN' } });
      }
      const reportId = decodeURIComponent(path.replace('admin/reports/', '').split('?')[0]);
      const status = String((body && body.status) || '').toLowerCase();
      const ADMIN_STATUSES = new Set(['pending', 'investigating', 'action_taken', 'dismissed']);
      if (!reportId || !ADMIN_STATUSES.has(status)) {
        return send(res, 400, {
          success: false,
          error: { message: 'Invalid report id or status', code: 'INVALID_STATUS' },
        });
      }
      const patch = { status };
      if (body && body.adminNotes !== undefined) {
        patch.admin_notes = String(body.adminNotes || '').slice(0, 2000) || null;
      }
      if (body && body.actionTaken !== undefined) {
        patch.action_taken = String(body.actionTaken || '').slice(0, 200) || null;
      }
      if (status === 'action_taken' || status === 'dismissed') {
        patch.resolved_by = me;
        patch.resolved_at = new Date().toISOString();
      } else {
        patch.resolved_by = null;
        patch.resolved_at = null;
      }
      const { data, error } = await client
        .from('moderation_reports')
        .update(patch)
        .eq('id', reportId)
        .select(
          'id, reporter_id, reported_user_id, reason, details, evidence_snapshot_url, status, action_taken, admin_notes, resolved_by, resolved_at, created_at'
        )
        .maybeSingle();
      if (error) throw error;
      if (!data) {
        return send(res, 404, { success: false, error: { message: 'Report not found', code: 'NOT_FOUND' } });
      }
      return send(res, 200, { success: true, data: { report: data } });
    }

    return send(res, 501, {
      success: false,
      error: { message: `Unimplemented v1 path: ${path}`, code: 'VERCEL_ROUTE_NOT_IMPLEMENTED' },
    });
  } catch (err) {
    console.error('[api/v1]', path, err);
    return send(res, 500, {
      success: false,
      error: { message: (err && err.message) || 'Server error' },
    });
  }
}

module.exports = { handleV1 };
