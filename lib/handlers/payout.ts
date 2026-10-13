/**
 * Payout templates + user payout cards (native Next handlers).
 */
import type { NextRequest } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  createServiceClient,
  jsonErr,
  jsonOk,
  requireAdmin,
  requireAuth,
  requireTeamLeader,
  type AuthOk,
} from '../nextAuth';
import {
  mapTemplateRow,
  templateToRow,
  templateAvailableInCountry,
  validateCardValues,
  maskCardValues,
  assertPayoutRole,
  isPayoutMethodKey,
} from '../../shared/payout/validate';
import type { PayoutMethodTemplate } from '../../shared/payout/types';

function requireDb() {
  return createServiceClient();
}

function profileId(auth: AuthOk): string {
  return String(auth.profileId || '').trim();
}

function roleOf(auth: AuthOk): string {
  return String(auth.role || '').toLowerCase();
}

function isAdminAuth(auth: AuthOk): boolean {
  return roleOf(auth) === 'admin';
}

async function loadTemplates(client: SupabaseClient): Promise<PayoutMethodTemplate[]> {
  const { data, error } = await client
    .from('payout_method_templates')
    .select('*')
    .order('sort_order', { ascending: true });
  if (error) throw new Error(error.message);
  return (data || []).map(mapTemplateRow);
}

function mapCard(row: Record<string, unknown>, extra?: Record<string, unknown>) {
  const values =
    row?.values_json && typeof row.values_json === 'object' && !Array.isArray(row.values_json)
      ? row.values_json
      : {};
  return {
    id: row.id,
    userId: row.user_id,
    methodKey: row.method_key,
    countryCode: row.country_code,
    values,
    isPrimary: Boolean(row.is_primary),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    ...extra,
  };
}

export async function handleAdminGetTemplates(_req: NextRequest) {
  const auth = await requireAdmin(_req);
  if (auth.ok === false) return jsonErr(auth.status, auth.error.message, auth.error.code);
  const client = requireDb();
  if (!client) return jsonErr(503, 'Database not configured', 'NO_ADMIN');
  try {
    const templates = await loadTemplates(client);
    return jsonOk({ success: true, data: { templates } });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed';
    return jsonErr(500, message, 'PAYOUT_FAILED');
  }
}

export async function handleAdminPutTemplates(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (auth.ok === false) return jsonErr(auth.status, auth.error.message, auth.error.code);
  const client = requireDb();
  if (!client) return jsonErr(503, 'Database not configured', 'NO_ADMIN');

  let body: Record<string, unknown> = {};
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return jsonErr(400, 'Invalid JSON body', 'INVALID_JSON');
  }

  const list = Array.isArray(body?.templates)
    ? body.templates
    : body?.template
      ? [body.template]
      : [];
  if (!list.length) {
    return jsonErr(400, 'templates array required', 'INVALID_BODY');
  }

  try {
    const saved: PayoutMethodTemplate[] = [];
    for (const raw of list as Record<string, unknown>[]) {
      const mk = raw.methodKey || raw.method_key;
      if (!isPayoutMethodKey(mk)) {
        return jsonErr(400, `Invalid method_key: ${String(mk)}`, 'INVALID_METHOD');
      }
      const row = templateToRow({
        ...raw,
        methodKey: mk,
      } as PayoutMethodTemplate);
      const { data, error } = await client
        .from('payout_method_templates')
        .upsert(row, { onConflict: 'method_key' })
        .select('*')
        .maybeSingle();
      if (error) throw new Error(error.message);
      saved.push(mapTemplateRow(data));
    }
    return jsonOk({ success: true, data: { templates: saved } });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed';
    return jsonErr(500, message, 'PAYOUT_FAILED');
  }
}

export async function handleGetPayoutTemplates(req: NextRequest) {
  const auth = await requireAuth(req);
  if (auth.ok === false) return jsonErr(auth.status, auth.error.message, auth.error.code);
  const client = requireDb();
  if (!client) return jsonErr(503, 'Database not configured', 'NO_ADMIN');

  if (!assertPayoutRole(roleOf(auth)) && !isAdminAuth(auth)) {
    return jsonErr(403, 'Not allowed', 'FORBIDDEN');
  }

  const country = String(
    req.nextUrl.searchParams.get('country') || req.nextUrl.searchParams.get('countryCode') || ''
  )
    .trim()
    .toUpperCase();

  try {
    let templates = await loadTemplates(client);
    templates = templates.filter((t) => templateAvailableInCountry(t, country || null));
    return jsonOk({ success: true, data: { templates } });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed';
    return jsonErr(500, message, 'PAYOUT_FAILED');
  }
}

export async function handleGetMyPayoutCards(req: NextRequest) {
  const auth = await requireAuth(req);
  if (auth.ok === false) return jsonErr(auth.status, auth.error.message, auth.error.code);
  const client = requireDb();
  if (!client) return jsonErr(503, 'Database not configured', 'NO_ADMIN');
  if (!assertPayoutRole(roleOf(auth))) {
    return jsonErr(403, 'Forbidden', 'FORBIDDEN');
  }
  try {
    const { data, error } = await client
      .from('user_payout_cards')
      .select('*')
      .eq('user_id', profileId(auth))
      .order('updated_at', { ascending: false });
    if (error) throw new Error(error.message);
    return jsonOk({
      success: true,
      data: { cards: (data || []).map((r) => mapCard(r as Record<string, unknown>)) },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed';
    return jsonErr(500, message, 'PAYOUT_FAILED');
  }
}

export async function handlePutMyPayoutCard(req: NextRequest) {
  const auth = await requireAuth(req);
  if (auth.ok === false) return jsonErr(auth.status, auth.error.message, auth.error.code);
  const client = requireDb();
  if (!client) return jsonErr(503, 'Database not configured', 'NO_ADMIN');
  if (!assertPayoutRole(roleOf(auth))) {
    return jsonErr(403, 'Forbidden', 'FORBIDDEN');
  }

  let body: Record<string, unknown> = {};
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return jsonErr(400, 'Invalid JSON body', 'INVALID_JSON');
  }

  const methodKey = body?.methodKey || body?.method_key;
  const countryCode = String(body?.countryCode || body?.country_code || '')
    .trim()
    .toUpperCase();
  if (!isPayoutMethodKey(methodKey)) {
    return jsonErr(400, 'Invalid methodKey', 'INVALID_METHOD');
  }
  if (!countryCode || countryCode.length < 2) {
    return jsonErr(400, 'countryCode is required', 'INVALID_COUNTRY');
  }

  try {
    const templates = await loadTemplates(client);
    const template = templates.find((t) => t.methodKey === methodKey);
    if (!template || !template.isEnabled) {
      return jsonErr(400, 'Method not available', 'METHOD_UNAVAILABLE');
    }
    if (!templateAvailableInCountry(template, countryCode)) {
      return jsonErr(400, 'This method is not available in the selected country', 'COUNTRY_BLOCKED');
    }
    const userId = profileId(auth);
    const { data: existingCard } = await client
      .from('user_payout_cards')
      .select('id')
      .eq('user_id', userId)
      .eq('method_key', methodKey)
      .maybeSingle();
    if (existingCard) {
      return jsonErr(
        409,
        'Payout card is locked after save and cannot be edited. Remove it first or contact admin.',
        'CARD_LOCKED'
      );
    }
    const validated = validateCardValues(template, (body?.values as Record<string, unknown>) || {});
    if (validated.ok === false) {
      return jsonErr(400, validated.message, 'VALIDATION_FAILED');
    }
    const isPrimary = body?.isPrimary === true;
    if (isPrimary) {
      await client
        .from('user_payout_cards')
        .update({ is_primary: false, updated_at: new Date().toISOString() })
        .eq('user_id', userId);
    }
    const { data, error } = await client
      .from('user_payout_cards')
      .insert({
        user_id: userId,
        method_key: methodKey,
        country_code: countryCode,
        values_json: validated.values,
        is_primary: isPrimary,
        updated_at: new Date().toISOString(),
      })
      .select('*')
      .maybeSingle();
    if (error) throw new Error(error.message);
    return jsonOk({ success: true, data: { card: mapCard(data as Record<string, unknown>) } });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed';
    return jsonErr(500, message, 'PAYOUT_FAILED');
  }
}

export async function handleDeleteMyPayoutCard(req: NextRequest) {
  const auth = await requireAuth(req);
  if (auth.ok === false) return jsonErr(auth.status, auth.error.message, auth.error.code);
  const client = requireDb();
  if (!client) return jsonErr(503, 'Database not configured', 'NO_ADMIN');
  if (!assertPayoutRole(roleOf(auth))) {
    return jsonErr(403, 'Forbidden', 'FORBIDDEN');
  }

  let body: Record<string, unknown> = {};
  try {
    const text = await req.text();
    if (text.trim()) body = JSON.parse(text) as Record<string, unknown>;
  } catch {
    /* query-only delete */
  }

  const methodKey = body?.methodKey || req.nextUrl.searchParams.get('methodKey');
  const id = body?.id || req.nextUrl.searchParams.get('id');

  try {
    let q = client.from('user_payout_cards').delete().eq('user_id', profileId(auth));
    if (id) q = q.eq('id', String(id));
    else if (isPayoutMethodKey(methodKey)) q = q.eq('method_key', methodKey);
    else return jsonErr(400, 'id or methodKey required', 'INVALID_ID');

    const { error } = await q;
    if (error) throw new Error(error.message);
    return jsonOk({ success: true });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed';
    return jsonErr(500, message, 'PAYOUT_FAILED');
  }
}

export async function handleGetPayoutCardsRoster(req: NextRequest) {
  const auth = await requireTeamLeader(req);
  if (auth.ok === false) return jsonErr(auth.status, auth.error.message, auth.error.code);
  const client = requireDb();
  if (!client) return jsonErr(503, 'Database not configured', 'NO_ADMIN');

  try {
    const templates = await loadTemplates(client);
    const fieldMap = Object.fromEntries(templates.map((t) => [t.methodKey, t.fields]));
    const admin = isAdminAuth(auth);
    const tlId = profileId(auth);
    let userIds: string[] | null = null;
    if (!admin) {
      const { data: hosts, error: hErr } = await client
        .from('profiles')
        .select('id')
        .or(`team_leader_id.eq.${tlId},created_by_id.eq.${tlId}`);
      if (hErr) throw new Error(hErr.message);
      userIds = [tlId, ...(hosts || []).map((h) => h.id)];
    }
    let q = client
      .from('user_payout_cards')
      .select('*')
      .order('updated_at', { ascending: false })
      .limit(500);
    if (userIds) q = q.in('user_id', userIds);
    const { data: cards, error } = await q;
    if (error) throw new Error(error.message);
    const ids = [...new Set((cards || []).map((c) => c.user_id))];
    let profileMap: Record<string, { name?: string; role?: string }> = {};
    if (ids.length) {
      const { data: profiles } = await client.from('profiles').select('id, name, role').in('id', ids);
      profileMap = Object.fromEntries((profiles || []).map((p) => [p.id, p]));
    }
    const mapped = (cards || []).map((row) => {
      const values =
        row.values_json && typeof row.values_json === 'object' ? row.values_json : {};
      return {
        ...mapCard(row as Record<string, unknown>, {
          values: {},
          userName: profileMap[row.user_id]?.name || row.user_id,
          userRole: profileMap[row.user_id]?.role || '',
          maskedValues: maskCardValues(
            values as Record<string, string>,
            fieldMap[row.method_key] || []
          ),
        }),
      };
    });
    return jsonOk({ success: true, data: { cards: mapped } });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed';
    return jsonErr(500, message, 'PAYOUT_FAILED');
  }
}

export async function handleGetUserPayoutCards(req: NextRequest) {
  const auth = await requireTeamLeader(req);
  if (auth.ok === false) return jsonErr(auth.status, auth.error.message, auth.error.code);
  const client = requireDb();
  if (!client) return jsonErr(503, 'Database not configured', 'NO_ADMIN');

  const userId = String(
    req.nextUrl.searchParams.get('userId') || req.nextUrl.searchParams.get('user_id') || ''
  ).trim();
  if (!userId) return jsonErr(400, 'userId required', 'INVALID_USER');

  try {
    const admin = isAdminAuth(auth);
    const tlId = profileId(auth);
    if (!admin && userId !== tlId) {
      const { data: host } = await client
        .from('profiles')
        .select('id, team_leader_id, created_by_id, name, role')
        .eq('id', userId)
        .maybeSingle();
      const managed =
        String(host?.team_leader_id || '') === tlId || String(host?.created_by_id || '') === tlId;
      if (!managed) return jsonErr(403, 'Not a managed host', 'FORBIDDEN');
    }
    const templates = await loadTemplates(client);
    const { data, error } = await client.from('user_payout_cards').select('*').eq('user_id', userId);
    if (error) throw new Error(error.message);
    const { data: profile } = await client
      .from('profiles')
      .select('id, name, role')
      .eq('id', userId)
      .maybeSingle();
    return jsonOk({
      success: true,
      data: {
        cards: (data || []).map((r) =>
          mapCard(r as Record<string, unknown>, { userName: profile?.name, userRole: profile?.role })
        ),
        templates: templates.map((t) => ({
          methodKey: t.methodKey,
          label: t.label,
          fields: t.fields,
        })),
      },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed';
    return jsonErr(500, message, 'PAYOUT_FAILED');
  }
}
