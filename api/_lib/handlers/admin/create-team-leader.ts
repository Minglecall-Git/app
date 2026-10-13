/**
 * POST /api/admin/create-team-leader
 * Creates Supabase Auth user + profiles row (role=team_leader). Admin only.
 * Self-contained for Vercel — does not import Express/server.ts.
 */
import {
  sendJson,
  readJsonBody,
  requireAdminFromBearer,
  createServiceClient,
  type VercelReq,
  type VercelRes,
} from '../../vercelAuth';
import { getPasswordPolicyError } from '../../passwordPolicy';

function clean(v: unknown): string {
  return String(v || '')
    .trim()
    .replace(/^["']|["']$/g, '');
}

export default async function handler(req: VercelReq, res: VercelRes) {
  try {
    if (req.method === 'OPTIONS') {
      res.statusCode = 204;
      res.end();
      return;
    }
    if (req.method !== 'POST') {
      return sendJson(res, 405, {
        success: false,
        error: { message: 'Method not allowed', code: 'METHOD_NOT_ALLOWED' },
      });
    }

    const auth = await requireAdminFromBearer(req);
    if (auth.ok === false) {
      return sendJson(res, auth.status, { success: false, error: auth.error });
    }

    const body = await readJsonBody(req);
    const name = clean(body.name);
    const email = clean(body.email).toLowerCase();
    const password = typeof body.password === 'string' ? body.password : '';
    const agencyName = clean(body.agencyName) || 'Talent Agency';
    const commissionPercent = Number(body.commissionPercent);
    const nationality = clean(body.nationality) || 'United States';
    const countryCode = clean(body.countryCode || body.country_code || 'US').toUpperCase() || 'US';
    const bio = clean(body.bio) || 'Talent Management & Creator Agency Director';
    const avatarUrl =
      clean(body.avatarUrl || body.avatar_url) ||
      'https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?auto=format&fit=crop&q=80&w=400';
    const spokenLanguages = Array.isArray(body.spokenLanguages)
      ? body.spokenLanguages.map((s: any) => String(s).trim()).filter(Boolean)
      : String(body.spokenLanguages || 'English')
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean);

    if (!name) {
      return sendJson(res, 400, {
        success: false,
        error: { message: 'Name is required.', code: 'NAME_REQUIRED' },
      });
    }
    if (!email || !email.includes('@')) {
      return sendJson(res, 400, {
        success: false,
        error: { message: 'A valid login email is required.', code: 'EMAIL_REQUIRED' },
      });
    }
    const pwError = getPasswordPolicyError(password);
    if (pwError) {
      return sendJson(res, 400, {
        success: false,
        error: { message: pwError, code: 'PASSWORD_POLICY' },
      });
    }

    const admin = createServiceClient();
    if (!admin) {
      return sendJson(res, 503, {
        success: false,
        error: {
          message: 'Supabase service role is not configured on this deployment.',
          code: 'SUPABASE_NOT_CONFIGURED',
        },
      });
    }

    // Reject duplicate email in Auth or profiles
    const { data: existingProfile } = await admin
      .from('profiles')
      .select('id, email, role')
      .ilike('email', email)
      .maybeSingle();
    if (existingProfile?.id) {
      return sendJson(res, 409, {
        success: false,
        error: {
          message: `A profile already exists for ${email}. Use Reset Password or a different email.`,
          code: 'EMAIL_EXISTS',
        },
      });
    }

    const { data: createdAuth, error: createErr } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: {
        role: 'team_leader',
        gender: 'female',
        name,
        full_name: name,
      },
    });

    if (createErr || !createdAuth?.user?.id) {
      const msg = createErr?.message || 'Failed to create Auth user';
      const code = /already/i.test(msg) ? 'EMAIL_EXISTS' : 'AUTH_CREATE_FAILED';
      return sendJson(res, code === 'EMAIL_EXISTS' ? 409 : 500, {
        success: false,
        error: { message: msg, code },
      });
    }

    const authUserId = createdAuth.user.id;
    const now = new Date().toISOString();
    const profileRow = {
      id: authUserId,
      auth_id: authUserId,
      name,
      email,
      gender: 'female',
      gender_locked: true,
      role: 'team_leader',
      age: 28,
      nationality,
      country_code: countryCode,
      bio,
      interests: ['Talent Growth', 'Creator Mentorship'],
      tags: ['Team Leader', 'VIP Agency'],
      spoken_languages: spokenLanguages.length ? spokenLanguages : ['English'],
      avatar_url: avatarUrl,
      gallery: [avatarUrl],
      is_verified: true,
      is_onboarded: true,
      agreed_to_terms: true,
      online_status: 'offline',
      coin_balance: 0,
      hourly_coin_rate: 10,
      earnings_coins: 0,
      agency_name: agencyName,
      commission_percent: Number.isFinite(commissionPercent) ? commissionPercent : 15,
      has_password_set: true,
      created_at: now,
      updated_at: now,
    };

    const { error: upsertErr } = await admin.from('profiles').upsert(profileRow as any, {
      onConflict: 'id',
    });

    if (upsertErr) {
      // Roll back Auth user so login cannot succeed without a profile
      try {
        await admin.auth.admin.deleteUser(authUserId);
      } catch {
        // ignore rollback failure
      }
      return sendJson(res, 500, {
        success: false,
        error: {
          message: upsertErr.message || 'Failed to create team leader profile',
          code: 'PROFILE_UPSERT_FAILED',
        },
      });
    }

    // Re-assert privileged role (Auth trigger may briefly set male_user)
    await admin
      .from('profiles')
      .update({
        role: 'team_leader',
        gender: 'female',
        gender_locked: true,
        auth_id: authUserId,
        updated_at: new Date().toISOString(),
      } as any)
      .eq('id', authUserId);

    return sendJson(res, 200, {
      success: true,
      user: {
        id: authUserId,
        authId: authUserId,
        name,
        email,
        role: 'team_leader',
        gender: 'female',
        genderLocked: true,
        agencyName,
        commissionPercent: profileRow.commission_percent,
        avatarUrl,
        gallery: [avatarUrl],
        spokenLanguages: profileRow.spoken_languages,
        nationality,
        countryCode,
        bio,
        isVerified: true,
        isOnboarded: true,
        hasPasswordSet: true,
        coinBalance: 0,
        hourlyCoinRate: 10,
        earningsCoins: 0,
        onlineStatus: 'offline',
        createdAt: now,
      },
      message: `Team leader ${name} created in Supabase Auth + profiles. They can sign in with ${email}.`,
    });
  } catch (err: any) {
    console.error('[api/admin/create-team-leader]', err);
    return sendJson(res, 500, {
      success: false,
      error: { message: err?.message || 'Failed to create team leader', code: 'INTERNAL' },
    });
  }
}
