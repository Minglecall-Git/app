import type { NextRequest } from 'next/server';
import type { AuthOk } from '../nextAuth';
import type { ServerRuntime } from '../serverRuntime';
import { mapPublicProfileRow, PUBLIC_PROFILE_SELECT } from './usersPublic';
import {
  getSupabaseAdmin,
  hashPassword,
  isSupabaseAdminConfigured,
  updateUserPasswordAdmin,
  upsertProfileAdmin,
} from '../../server/supabaseAdmin';
import { getPasswordPolicyError } from '../../shared/passwordPolicy';
import { stripPrivilegedProfileFields } from '../profileGuards';
import type { UserProfile } from '../../src/types';
import { err, ok, type HandlerResult } from './handlerResult';

function isAdminRole(auth: AuthOk): boolean {
  return auth.role === 'admin';
}

/** GET /api/users — paginated public directory */
export async function handleGetUsers(
  ctx: ServerRuntime,
  req: NextRequest,
  _auth: AuthOk
): Promise<HandlerResult> {
  try {
    const url = new URL(req.url);
    const limitRaw = Number(url.searchParams.get('limit'));
    const limit = Math.min(Math.max(Number.isFinite(limitRaw) ? limitRaw : 50, 1), 50);
    const cursorParam = url.searchParams.get('cursor');
    const cursor =
      typeof cursorParam === 'string' && cursorParam.trim() ? cursorParam.trim() : null;

    if (!isSupabaseAdminConfigured()) {
      const all = ctx
        .getFormattedUsers()
        .filter((u) => !(u as any).isBanned)
        .sort((a, b) => {
          const ta = new Date(a.createdAt || 0).getTime();
          const tb = new Date(b.createdAt || 0).getTime();
          return tb - ta;
        });
      let start = 0;
      if (cursor) {
        const idx = all.findIndex((u) => String(u.createdAt || '') === cursor);
        start = idx >= 0 ? idx + 1 : 0;
      }
      const page = all.slice(start, start + limit);
      const nextCursor =
        page.length === limit && page[page.length - 1]?.createdAt
          ? String(page[page.length - 1].createdAt)
          : null;
      const users = page.map((u) =>
        mapPublicProfileRow({
          id: u.id,
          name: u.name,
          gender: u.gender,
          age: u.age,
          dob: u.dob,
          nationality: u.nationality,
          country_code: u.countryCode,
          spoken_languages: u.spokenLanguages,
          bio: u.bio,
          extended_bio: u.extendedBio,
          location_city: u.locationCity,
          zodiac: u.zodiac,
          interests: u.interests,
          tags: u.tags,
          interested_in: u.interestedIn,
          avatar_url: u.avatarUrl,
          gallery: u.gallery,
          gallery_videos: u.galleryVideos,
          intro_video_url: u.introVideoUrl,
          is_verified: u.isVerified,
          online_status: u.onlineStatus,
          role: u.role,
          response_rate: u.responseRate,
          hourly_coin_rate: u.hourlyCoinRate,
          rating_score: u.ratingScore,
          total_reviews_count: u.totalReviewsCount,
          total_calls_hosted: u.totalCallsHosted,
          exact_location: u.exactLocation,
          is_using_mock_location: u.isUsingMockLocation,
          mock_location_city: u.mockLocationCity,
          mock_location_country: u.mockLocationCountry,
          mock_location_country_code: u.mockLocationCountryCode,
          created_at: u.createdAt,
          is_banned: false,
        })
      );
      return ok({
        success: true,
        users,
        count: users.length,
        nextCursor,
        timestamp: Date.now(),
        runtime: 'next-native',
      });
    }

    const supabase = getSupabaseAdmin()!;
    let query = supabase
      .from('profiles')
      .select(PUBLIC_PROFILE_SELECT)
      .or('is_banned.is.null,is_banned.eq.false')
      .order('created_at', { ascending: false })
      .limit(limit);

    if (cursor) {
      query = query.lt('created_at', cursor);
    }

    const { data, error } = await query;
    if (error) {
      console.error('[GET /api/users]', error.message);
      return err(500, {
        success: false,
        error: { message: 'Failed to load directory', code: 'DIRECTORY_FAILED' },
      });
    }

    const rows = (Array.isArray(data) ? data : []) as Array<Record<string, any>>;
    const users = rows.map((row) => mapPublicProfileRow(row)).filter(Boolean);
    const last = rows[rows.length - 1];
    const nextCursor =
      rows.length === limit && last?.created_at ? String(last.created_at) : null;

    const withPresence = users.map((u: any) => {
      if (!u?.id) return u;
      const live = ctx.getAuthoritativeStatus(u.id);
      return live ? { ...u, onlineStatus: live } : u;
    });

    return ok({
      success: true,
      users: withPresence,
      count: withPresence.length,
      nextCursor,
      timestamp: Date.now(),
      runtime: 'next-native',
    });
  } catch (e: any) {
    console.error('[GET /api/users] exception:', e);
    return err(500, {
      success: false,
      error: { message: e?.message || 'Failed to load directory', code: 'DIRECTORY_FAILED' },
    });
  }
}

/** POST /api/users — create or update user sync */
export async function handlePostUsers(
  ctx: ServerRuntime,
  auth: AuthOk,
  body: Record<string, unknown>
): Promise<HandlerResult> {
  try {
    const callerId = auth.profileId;
    const isAdmin = isAdminRole(auth);
    let rawUser = { ...(body || {}) } as any;
    if (!rawUser) {
      return err(400, { error: 'User object with valid id is required' });
    }
    if (!isAdmin) {
      rawUser = {
        ...stripPrivilegedProfileFields(rawUser),
        id: callerId,
        role: auth.role,
      };
    }
    if (!rawUser.id) {
      rawUser.id = callerId;
    }
    if (!isAdmin && String(rawUser.id) !== callerId) {
      return err(403, {
        success: false,
        error: { message: 'Cannot modify another user.', code: 'FORBIDDEN' },
      });
    }

    const cleanEmail = rawUser.email ? String(rawUser.email).toLowerCase().trim() : null;

    let canonicalId = String(rawUser.id);
    if (!ctx.serverUsers.has(canonicalId) && cleanEmail) {
      const emailMatch = Array.from(ctx.serverUsers.values()).find(
        (u) => u.email && u.email.toLowerCase().trim() === cleanEmail
      );
      if (emailMatch?.id) {
        canonicalId = emailMatch.id;
      }
    }

    if (ctx.isUserHardDeleted(canonicalId) || ctx.isUserHardDeleted(String(rawUser.id))) {
      return err(410, {
        success: false,
        error: {
          message: 'This user was permanently deleted and cannot be recreated via sync.',
          code: 'USER_HARD_DELETED',
        },
      });
    }

    const existing = ctx.serverUsers.get(canonicalId) || ctx.serverUsers.get(rawUser.id);
    const merged = {
      ...(existing || {}),
      ...rawUser,
      id: canonicalId,
      coinBalance:
        rawUser.coinBalance !== undefined ? Number(rawUser.coinBalance) : existing?.coinBalance,
      earningsCoins:
        rawUser.earningsCoins !== undefined
          ? Number(rawUser.earningsCoins)
          : existing?.earningsCoins,
      country_code: rawUser.countryCode || rawUser.country_code || existing?.countryCode,
    };
    const updatedUser: UserProfile = ctx.normalizeUserProfile(merged);

    if (rawUser.password || rawUser.password_hash) {
      if (rawUser.password) {
        const pwError = getPasswordPolicyError(rawUser.password);
        if (pwError) {
          return err(400, { success: false, error: pwError });
        }
      }
      const hash = rawUser.password_hash || (await hashPassword(rawUser.password));
      (updatedUser as any).password_hash = hash;
      updatedUser.hasPasswordSet = true;

      if (isSupabaseAdminConfigured()) {
        if (updatedUser.role === 'team_leader' || updatedUser.role === 'agency_manager') {
          updatedUser.role =
            updatedUser.role === 'agency_manager' ? 'agency_manager' : 'team_leader';
          updatedUser.gender = 'female';
          updatedUser.genderLocked = true;
        }

        await upsertProfileAdmin({
          ...updatedUser,
          password_hash: hash,
          has_password_set: true,
          role: updatedUser.role,
          gender: updatedUser.gender,
          genderLocked: updatedUser.genderLocked,
        });

        if (rawUser.password && updatedUser.email) {
          const pwRes = await updateUserPasswordAdmin(
            updatedUser.id,
            rawUser.password,
            updatedUser.email,
            {
              role: updatedUser.role,
              gender:
                updatedUser.gender === 'female' ? 'female' : updatedUser.gender || 'male',
              name: updatedUser.name,
            }
          );
          if (pwRes.authUserId) {
            updatedUser.authId = pwRes.authUserId;
          }

          if (updatedUser.role === 'team_leader' || updatedUser.role === 'agency_manager') {
            const adminClient = getSupabaseAdmin();
            if (adminClient) {
              const assertPayload = {
                role: updatedUser.role,
                gender: 'female',
                gender_locked: true,
                updated_at: new Date().toISOString(),
              };
              await adminClient.from('profiles').update(assertPayload as any).eq('id', updatedUser.id);
              if (cleanEmail) {
                await adminClient
                  .from('profiles')
                  .update(assertPayload as any)
                  .ilike('email', cleanEmail);
              }
              if (pwRes.authUserId) {
                await adminClient
                  .from('profiles')
                  .update(assertPayload as any)
                  .eq('auth_id', pwRes.authUserId);
              }
            }
            updatedUser.gender = 'female';
            updatedUser.genderLocked = true;
          }
        }
      }
    } else if (isSupabaseAdminConfigured()) {
      upsertProfileAdmin(updatedUser).catch((e) => {
        console.warn('[Server] Background Supabase upsert error:', e);
      });
    }

    ctx.serverUsers.set(updatedUser.id, updatedUser);

    if (cleanEmail) {
      for (const [sId, sUser] of Array.from(ctx.serverUsers.entries())) {
        if (sId === updatedUser.id) continue;
        if (sUser.email && sUser.email.toLowerCase().trim() === cleanEmail) {
          ctx.serverUsers.delete(sId);
        }
      }
    }

    const liveStatus = ctx.getAuthoritativeStatus(updatedUser.id);
    updatedUser.onlineStatus = liveStatus;
    ctx.presenceMap.set(updatedUser.id, liveStatus);

    ctx.broadcastAll({
      type: 'users:updated',
      user: updatedUser,
      users: ctx.getFormattedUsers(),
    });
    ctx.broadcastAll({
      type: 'wallet:balance_update',
      userId: updatedUser.id,
      authId: updatedUser.authId,
      email: updatedUser.email,
      coinBalance: updatedUser.coinBalance,
      earningsCoins: updatedUser.earningsCoins,
    });
    ctx.broadcastPresence();

    return ok({
      success: true,
      user: updatedUser,
      message: 'User synchronized successfully across all devices.',
      runtime: 'next-native',
    });
  } catch (e: any) {
    console.error('Error in POST /api/users:', e);
    return err(500, { error: e.message || 'Failed to save user' });
  }
}
