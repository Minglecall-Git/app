import {
  sendJson,
  readJsonBody,
  requireAuthFromBearer,
  requireAdminFromBearer,
  createServiceClient,
  type VercelReq,
  type VercelRes,
} from '../../vercelAuth';
import { mapProfileRow, findAuthUserByEmail } from '../../authHelpers';

export default async function handler(req: VercelReq, res: VercelRes) {
  if (req.method === 'OPTIONS') {
    res.statusCode = 204;
    res.end();
    return;
  }

  const client = createServiceClient();
  if (!client) {
    return sendJson(res, 503, { success: false, error: { message: 'Supabase not configured', code: 'ENV' } });
  }

  // GET /api/users
  if (req.method === 'GET') {
    const auth = await requireAuthFromBearer(req);
    if (auth.ok === false) {
      return sendJson(res, auth.status, { success: false, error: auth.error });
    }
    const { data, error } = await client
      .from('profiles')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(500);
    if (error) {
      return sendJson(res, 500, { success: false, error: { message: error.message } });
    }
    const users = (data || []).map(mapProfileRow);
    return sendJson(res, 200, { success: true, users, count: users.length, timestamp: Date.now() });
  }

  // POST /api/users — create/update profile (self or admin)
  if (req.method === 'POST') {
    const auth = await requireAuthFromBearer(req);
    if (auth.ok === false) {
      return sendJson(res, auth.status, { success: false, error: auth.error });
    }
    const body = await readJsonBody(req);
    const isAdmin =
      auth.role === 'admin' ||
      auth.email === 'superadmin@minglecall.com' ||
      auth.email === 'admin@livecall.app';

    let raw = body || {};
    if (!isAdmin) {
      raw = {
        ...raw,
        id: auth.profileId,
        role: auth.role,
        coinBalance: undefined,
        earningsCoins: undefined,
      };
    }
    const id = String(raw.id || auth.profileId);
    if (!isAdmin && id !== auth.profileId) {
      return sendJson(res, 403, { success: false, error: { message: 'Forbidden', code: 'FORBIDDEN' } });
    }

    const payload: Record<string, any> = {
      id,
      auth_id: raw.authId || raw.auth_id || (id === auth.userId ? auth.userId : undefined),
      name: raw.name,
      email: raw.email ? String(raw.email).toLowerCase().trim() : undefined,
      gender: raw.gender,
      gender_locked: raw.genderLocked ?? raw.gender_locked,
      role: isAdmin ? raw.role : auth.role,
      age: raw.age != null ? Number(raw.age) : undefined,
      nationality: raw.nationality,
      country_code: raw.countryCode || raw.country_code,
      bio: raw.bio,
      interests: raw.interests,
      tags: raw.tags,
      spoken_languages: raw.spokenLanguages || raw.spoken_languages,
      avatar_url: raw.avatarUrl || raw.avatar_url,
      gallery: raw.gallery,
      is_verified: raw.isVerified ?? raw.is_verified,
      is_onboarded: raw.isOnboarded ?? raw.is_onboarded,
      online_status: raw.onlineStatus || raw.online_status,
      agency_name: raw.agencyName || raw.agency_name,
      commission_percent: raw.commissionPercent ?? raw.commission_percent,
      team_leader_id: raw.teamLeaderId || raw.team_leader_id,
      created_by_id: raw.createdById || raw.created_by_id,
      has_password_set: raw.hasPasswordSet ?? raw.has_password_set,
      updated_at: new Date().toISOString(),
    };
    // Strip undefined
    Object.keys(payload).forEach((k) => payload[k] === undefined && delete payload[k]);

    if (isAdmin && raw.coinBalance != null) payload.coin_balance = Number(raw.coinBalance);
    if (isAdmin && raw.earningsCoins != null) payload.earnings_coins = Number(raw.earningsCoins);
    if (isAdmin && raw.hourlyCoinRate != null) payload.hourly_coin_rate = Number(raw.hourlyCoinRate);

    const { data, error } = await client.from('profiles').upsert(payload as any, { onConflict: 'id' }).select('*').maybeSingle();
    if (error) {
      return sendJson(res, 500, { success: false, error: { message: error.message } });
    }

    // Password sync for admin creates
    if (isAdmin && typeof raw.password === 'string' && raw.password && raw.email) {
      const { data: list } = await client.auth.admin.listUsers({ perPage: 1000 });
      const matched = findAuthUserByEmail(list?.users as any, String(raw.email));
      if (matched) {
        await client.auth.admin.updateUserById(matched.id, {
          password: raw.password,
          email_confirm: true,
          user_metadata: { role: payload.role, gender: payload.gender, name: payload.name },
        });
        await client.from('profiles').update({ auth_id: matched.id } as any).eq('id', id);
      } else {
        const { data: created } = await client.auth.admin.createUser({
          email: String(raw.email).toLowerCase(),
          password: raw.password,
          email_confirm: true,
          user_metadata: { role: payload.role, gender: payload.gender, name: payload.name },
        });
        if (created?.user?.id) {
          await client.from('profiles').update({ auth_id: created.user.id } as any).eq('id', id);
        }
      }
    }

    return sendJson(res, 200, { success: true, user: mapProfileRow(data) });
  }

  return sendJson(res, 405, { success: false, error: { message: 'Method not allowed' } });
}
