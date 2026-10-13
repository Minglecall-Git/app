/**
 * /api/teamleader/* — Vercel serverless port of Express team-leader APIs.
 * Paths: creators, stats, ban-creator, unban-creator, delete-creator, override-rate
 */
import {
  sendJson,
  readJsonBody,
  requireTeamLeaderFromBearer,
  createServiceClient,
  type VercelReq,
  type VercelRes,
} from '../vercelAuth';
import { mapProfileRow, isValidEmail } from '../authHelpers';
import { getPasswordPolicyError } from '../passwordPolicy';

const DISPOSABLE = ['@livecall.app', '@minglecall.local', '@example.com', '@test.local'];

function pathParts(url?: string): string[] {
  const raw = String(url || '').split('?')[0];
  const idx = raw.indexOf('/api/teamleader');
  const rest = idx >= 0 ? raw.slice(idx + '/api/teamleader'.length) : raw;
  return rest.split('/').filter(Boolean);
}

function isFemaleHost(u: { gender?: string; role?: string }) {
  return (
    u.gender === 'female' ||
    u.role === 'female_creator' ||
    u.role === 'female_host'
  );
}

function ownsCreator(leaderId: string, u: any) {
  const tl = String(u.teamLeaderId || u.team_leader_id || '');
  const created = String(u.createdById || u.created_by_id || '');
  return tl === leaderId || created === leaderId;
}

function parseQuery(url?: string): URLSearchParams {
  try {
    return new URL(String(url || ''), 'http://localhost').searchParams;
  } catch {
    return new URLSearchParams();
  }
}

export default async function handler(req: VercelReq, res: VercelRes) {
  if (req.method === 'OPTIONS') {
    res.statusCode = 204;
    res.end();
    return;
  }

  const parts = pathParts(req.url);
  const action = parts[0] || '';
  const client = createServiceClient();
  if (!client) {
    return sendJson(res, 503, { success: false, error: { message: 'Supabase not configured', code: 'ENV' } });
  }

  const auth = await requireTeamLeaderFromBearer(req);
  if (auth.ok === false) {
    return sendJson(res, auth.status, { success: false, error: auth.error });
  }

  const leader = auth.profile || {};
  const leaderId = String(leader.id || auth.profileId);
  const isAdmin = auth.role === 'admin';
  const q = parseQuery(req.url);
  const allMode =
    isAdmin && (q.get('all') === '1' || q.get('all') === 'true' || (!q.get('leaderId') && action === 'creators'));
  const scopeLeaderId = allMode ? '' : String(q.get('leaderId') || leaderId);

  try {
    // GET creators
    if (action === 'creators' && req.method === 'GET') {
      const { data, error } = await client.from('profiles').select('*').limit(2000);
      if (error) return sendJson(res, 500, { success: false, error: error.message });
      const listAllMode = allMode || (isAdmin && !q.get('leaderId'));
      const creators = (data || [])
        .map(mapProfileRow)
        .filter((u: any) => {
          if (!u || !isFemaleHost(u)) return false;
          if (u.role === 'team_leader' || u.role === 'agency_manager' || u.role === 'admin') return false;
          if (listAllMode) return true;
          if (u.id === scopeLeaderId) return false;
          return ownsCreator(scopeLeaderId || leaderId, u);
        });
      return sendJson(res, 200, {
        success: true,
        creators,
        count: creators.length,
        leaderId: scopeLeaderId || leaderId,
        agencyName: leader.agency_name || leader.agencyName,
        allMode: listAllMode,
      });
    }

    // POST creators — create managed host
    if (action === 'creators' && req.method === 'POST') {
      const body = await readJsonBody(req);
      const name = String(body?.name || '').trim();
      const email = String(body?.email || '')
        .trim()
        .toLowerCase();
      const password = String(body?.password || '');
      if (!name) return sendJson(res, 400, { success: false, error: 'Creator name is required' });
      if (!isValidEmail(email)) {
        return sendJson(res, 400, { success: false, error: 'A valid email address is required' });
      }
      if (DISPOSABLE.some((s) => email.endsWith(s))) {
        return sendJson(res, 400, {
          success: false,
          error: 'Disposable or placeholder emails are not allowed. Use a real email address.',
        });
      }
      const pwErr = getPasswordPolicyError(password);
      if (pwErr) return sendJson(res, 400, { success: false, error: pwErr });

      const { data: existing } = await client.from('profiles').select('id').ilike('email', email).maybeSingle();
      if (existing) {
        return sendJson(res, 409, { success: false, error: 'An account with this email already exists' });
      }

      if (!leaderId) {
        return sendJson(res, 400, {
          success: false,
          error: 'Team leader profile could not be resolved. Sign out and sign in again.',
        });
      }

      const userMetadata = { role: 'female_creator', name, gender: 'female', full_name: name };
      let authUserId: string | null = null;
      const { data: authUser, error: authErr } = await client.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: userMetadata,
      });
      if (!authErr && authUser?.user?.id) {
        authUserId = authUser.user.id;
      } else {
        // Reclaim orphan Auth (profile deleted) instead of failing
        const { data: list } = await client.auth.admin.listUsers({ perPage: 1000 });
        const matched = (list?.users || []).find(
          (u: any) => String(u.email || '').toLowerCase() === email
        );
        if (matched?.id) {
          const { error: updErr } = await client.auth.admin.updateUserById(matched.id, {
            password,
            email_confirm: true,
            user_metadata: userMetadata,
          });
          if (updErr) {
            return sendJson(res, 500, {
              success: false,
              error: updErr.message || 'Failed to update existing Auth user',
            });
          }
          authUserId = matched.id;
        } else {
          return sendJson(res, 500, {
            success: false,
            error: authErr?.message || 'Failed to create auth user',
          });
        }
      }

      const avatarUrl =
        body.avatarUrl ||
        body.avatar_url ||
        'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&q=80&w=400';
      const row: Record<string, any> = {
        id: authUserId,
        auth_id: authUserId,
        name,
        email,
        gender: 'female',
        gender_locked: true,
        role: 'female_creator',
        is_onboarded: true,
        is_verified: true,
        has_password_set: true,
        team_leader_id: leaderId,
        created_by_id: leaderId,
        agency_name: leader.agency_name || leader.agencyName || null,
        age: body.age != null ? Number(body.age) : 24,
        nationality: body.nationality || 'United States',
        country_code: (body.countryCode || body.country_code || 'US').toString().toUpperCase(),
        bio: body.bio || '',
        avatar_url: avatarUrl,
        gallery: Array.isArray(body.gallery) && body.gallery.length ? body.gallery : [avatarUrl],
        online_status: 'offline',
        updated_at: new Date().toISOString(),
      };

      const { data: inserted, error: insErr } = await client
        .from('profiles')
        .upsert(row, { onConflict: 'id' })
        .select('*')
        .single();
      if (insErr) {
        return sendJson(res, 500, { success: false, error: insErr.message });
      }

      await client
        .from('profiles')
        .update({
          team_leader_id: leaderId,
          created_by_id: leaderId,
          role: 'female_creator',
          gender: 'female',
          gender_locked: true,
          updated_at: new Date().toISOString(),
        })
        .eq('id', authUserId);

      const creator = mapProfileRow(inserted) || {
        id: authUserId,
        authId: authUserId,
        name,
        email,
        gender: 'female',
        role: 'female_creator',
        teamLeaderId: leaderId,
        createdById: leaderId,
      };
      return sendJson(res, 200, {
        success: true,
        creator,
        message: `Successfully created and persisted creator ${name}`,
      });
    }

    // GET stats
    if (action === 'stats' && req.method === 'GET') {
      const { data: profiles } = await client.from('profiles').select('*').limit(2000);
      const managed = (profiles || [])
        .map(mapProfileRow)
        .filter((u: any) => {
          if (!u || !isFemaleHost(u)) return false;
          if (u.role === 'team_leader' || u.role === 'agency_manager' || u.role === 'admin') return false;
          if (allMode && isAdmin) return true;
          return ownsCreator(scopeLeaderId || leaderId, u);
        });
      const managedIds = new Set(managed.map((c: any) => c.id));

      let totalCalls = 0;
      let totalMinutes = 0;
      let hostEarningsCoins = 0;
      let teamLeaderEarnedCoins = 0;
      let totalCoinsSpent = 0;
      let statsSource: string = 'empty';
      let femalePayoutRatioUSD = 0.003;
      let teamLeaderSharePercent = Number(leader.commission_percent || leader.commissionPercent) || 10;

      const { data: cfg } = await client
        .from('system_configs')
        .select('coin_usd_peg, female_payout_ratio_usd, team_leader_share_percent')
        .eq('id', 'default')
        .maybeSingle();
      if (cfg) {
        femalePayoutRatioUSD =
          Number((cfg as any).coin_usd_peg) || Number(cfg.female_payout_ratio_usd) || femalePayoutRatioUSD;
        teamLeaderSharePercent = Number(cfg.team_leader_share_percent) || teamLeaderSharePercent;
      }

      let logs: any[] = [];
      if (allMode && isAdmin) {
        const { data } = await client
          .from('call_logs')
          .select(
            'id, receiver_id, host_id, team_leader_id, team_leader_earned_coins, coins_earned, coins_spent, duration_seconds'
          )
          .limit(20000);
        if (Array.isArray(data)) logs = data;
      } else if (scopeLeaderId || leaderId) {
        const sid = scopeLeaderId || leaderId;
        const { data: byTl } = await client
          .from('call_logs')
          .select(
            'id, receiver_id, host_id, team_leader_id, team_leader_earned_coins, coins_earned, coins_spent, duration_seconds'
          )
          .eq('team_leader_id', sid)
          .limit(20000);
        if (Array.isArray(byTl)) logs.push(...byTl);
        const managedIdList = [...managedIds];
        if (managedIdList.length > 0) {
          const { data: byRx } = await client
            .from('call_logs')
            .select(
              'id, receiver_id, host_id, team_leader_id, team_leader_earned_coins, coins_earned, coins_spent, duration_seconds'
            )
            .in('receiver_id', managedIdList)
            .limit(20000);
          if (Array.isArray(byRx)) logs.push(...byRx);
        }
      }

      if (logs.length > 0) {
        statsSource = 'call_logs';
        const seen = new Set<string>();
        const sid = scopeLeaderId || leaderId;
        for (const row of logs) {
          const id = String(row.id || '');
          if (id && seen.has(id)) continue;
          if (id) seen.add(id);
          const hostId = String(row.receiver_id || row.host_id || '');
          const logTlId = row.team_leader_id ? String(row.team_leader_id) : '';
          const belongs =
            (allMode && isAdmin) || logTlId === sid || (hostId && managedIds.has(hostId));
          if (!belongs) continue;
          totalCalls += 1;
          totalMinutes += Math.round((Number(row.duration_seconds) || 0) / 60);
          hostEarningsCoins += Math.max(0, Number(row.coins_earned) || 0);
          totalCoinsSpent += Math.max(0, Number(row.coins_spent) || 0);
          if ((allMode && isAdmin) || logTlId === sid) {
            teamLeaderEarnedCoins += Math.max(0, Number(row.team_leader_earned_coins) || 0);
          }
        }
      }

      if (!(allMode && isAdmin) && (scopeLeaderId || leaderId)) {
        const sid = scopeLeaderId || leaderId;
        const { data: ledgerRows } = await client
          .from('wallet_ledger')
          .select('amount')
          .eq('user_id', sid)
          .eq('transaction_type', 'TL_EARN')
          .limit(20000);
        if (Array.isArray(ledgerRows) && ledgerRows.length > 0) {
          const ledgerSum = ledgerRows.reduce((acc, r) => acc + Math.max(0, Number(r.amount) || 0), 0);
          if (ledgerSum > teamLeaderEarnedCoins) {
            teamLeaderEarnedCoins = ledgerSum;
            if (statsSource === 'empty') statsSource = 'wallet_ledger';
          }
        }
      }

      if (teamLeaderEarnedCoins <= 0 && !(allMode && isAdmin)) {
        const tl = (profiles || []).find((p: any) => p.id === (scopeLeaderId || leaderId));
        const profileTl = Math.max(0, Number(tl?.earnings_coins) || 0);
        if (profileTl > 0) {
          teamLeaderEarnedCoins = profileTl;
          if (statsSource === 'empty') statsSource = 'profile_fallback';
        }
      }

      if (hostEarningsCoins <= 0) {
        hostEarningsCoins = managed.reduce((acc: number, c: any) => acc + Math.max(0, Number(c.earningsCoins) || 0), 0);
      }

      return sendJson(res, 200, {
        success: true,
        data: {
          totalCalls,
          totalMinutes,
          hostEarningsCoins,
          hostEarningsUSD: hostEarningsCoins * femalePayoutRatioUSD,
          teamLeaderEarnedCoins,
          teamLeaderEarnedUSD: teamLeaderEarnedCoins * femalePayoutRatioUSD,
          totalCoinsSpent,
          femalePayoutRatioUSD,
          teamLeaderSharePercent,
          managedCreatorCount: managed.length,
          statsSource,
          leaderId: scopeLeaderId || leaderId,
          allMode: Boolean(allMode && isAdmin),
        },
      });
    }

    // Ban / unban / delete
    if (
      (action === 'ban-creator' || action === 'unban-creator' || action === 'delete-creator') &&
      req.method === 'POST'
    ) {
      const body = await readJsonBody(req);
      const creatorId = String(body?.creatorId || '').trim();
      if (!creatorId) return sendJson(res, 400, { success: false, error: 'Creator ID is required' });

      const { data: targetRow } = await client.from('profiles').select('*').eq('id', creatorId).maybeSingle();
      if (!targetRow) return sendJson(res, 404, { success: false, error: 'Creator not found' });
      const target = mapProfileRow(targetRow);
      if (!isAdmin && !ownsCreator(leaderId, target)) {
        return sendJson(res, 403, { success: false, error: 'Not authorized for this creator.' });
      }

      if (action === 'ban-creator') {
        const banDays = Number(body.days) || 7;
        const banReason = body.reason || 'Suspended by Team Leader for policy review';
        const bannedUntil = new Date(Date.now() + banDays * 24 * 60 * 60 * 1000).toISOString();
        const { data: updated, error } = await client
          .from('profiles')
          .update({
            is_banned: true,
            ban_reason: banReason,
            banned_until: bannedUntil,
            banned_by_id: leaderId,
            banned_by_role: 'team_leader',
            online_status: 'offline',
            updated_at: new Date().toISOString(),
          })
          .eq('id', creatorId)
          .select('*')
          .single();
        if (error) return sendJson(res, 500, { success: false, error: error.message });
        return sendJson(res, 200, {
          success: true,
          message: 'Creator banned',
          bannedUntil,
          banReason,
          user: mapProfileRow(updated),
        });
      }

      if (action === 'unban-creator') {
        const { data: updated, error } = await client
          .from('profiles')
          .update({
            is_banned: false,
            ban_reason: null,
            banned_until: null,
            banned_by_id: null,
            banned_by_role: null,
            updated_at: new Date().toISOString(),
          })
          .eq('id', creatorId)
          .select('*')
          .single();
        if (error) return sendJson(res, 500, { success: false, error: error.message });
        return sendJson(res, 200, {
          success: true,
          message: 'Creator unbanned',
          user: mapProfileRow(updated),
        });
      }

      // delete-creator
      const authId = targetRow.auth_id || null;
      const warnings: string[] = [];
      let authDeleted = false;
      if (authId) {
        const { error: delAuthErr } = await client.auth.admin.deleteUser(authId);
        if (delAuthErr) warnings.push(delAuthErr.message);
        else authDeleted = true;
      }
      await client
        .from('profiles')
        .update({ team_leader_id: null, created_by_id: null })
        .or(`team_leader_id.eq.${creatorId},created_by_id.eq.${creatorId}`);
      const { error: delErr } = await client.from('profiles').delete().eq('id', creatorId);
      if (delErr) return sendJson(res, 500, { success: false, error: delErr.message });
      return sendJson(res, 200, {
        success: true,
        message: 'Creator deleted',
        data: { authDeleted, profileDeleted: true, r2DeletedCount: 0, warnings },
      });
    }

    if (action === 'override-rate') {
      return sendJson(res, 403, {
        success: false,
        error:
          'Team Leaders cannot override earning rates. Only administrators may set individual overrides.',
      });
    }

    return sendJson(res, 404, {
      success: false,
      error: { message: `Unknown teamleader route: ${action}`, code: 'NOT_FOUND' },
    });
  } catch (e: any) {
    return sendJson(res, 500, {
      success: false,
      error: { message: e?.message || 'Team leader API failed', code: 'TEAMLEADER_ERROR' },
    });
  }
}
