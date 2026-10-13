import { NextRequest } from 'next/server';
import { createServiceClient, jsonErr, jsonOk, requireAdmin } from '../../../../../lib/nextAuth';
import { ADMIN_STATUSES, REPORT_SELECT, sanitizeText } from '../../../../../lib/handlers/reports';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** GET /api/v1/admin/reports */
export async function GET(req: NextRequest) {
  try {
    const auth = await requireAdmin(req);
    if (!auth.ok) { return jsonErr(auth.status, auth.error.message, auth.error.code); }

    const client = createServiceClient();
    if (!client) return jsonErr(503, 'Reports backend unavailable', 'NO_ADMIN');

    const statusFilter = sanitizeText(req.nextUrl.searchParams.get('status'), 32).toLowerCase();
    const limit = Math.min(Math.max(Number(req.nextUrl.searchParams.get('limit')) || 50, 1), 100);

    let query = client
      .from('moderation_reports')
      .select(REPORT_SELECT)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (statusFilter && ADMIN_STATUSES.has(statusFilter)) {
      query = query.eq('status', statusFilter);
    }

    const { data: reports, error } = await query;
    if (error) {
      console.error('[next /api/v1/admin/reports]', error.message);
      return jsonErr(500, 'Failed to load reports', 'LOAD_FAILED');
    }

    const rows = reports || [];
    const profileIds = Array.from(
      new Set(rows.flatMap((r: any) => [String(r.reporter_id), String(r.reported_user_id)].filter(Boolean)))
    );

    let profilesById: Record<string, { id: string; name: string | null; avatar_url: string | null }> = {};
    if (profileIds.length > 0) {
      const { data: profiles, error: pErr } = await client
        .from('profiles')
        .select('id, name, avatar_url')
        .in('id', profileIds);
      if (pErr) {
        console.error('[next /api/v1/admin/reports] profiles:', pErr.message);
      } else {
        profilesById = Object.fromEntries((profiles || []).map((p: any) => [String(p.id), p]));
      }
    }

    const enriched = rows.map((r: any) => ({
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

    return jsonOk({ success: true, data: { reports: enriched } });
  } catch (err: any) {
    console.error('[next /api/v1/admin/reports]', err);
    return jsonErr(500, err?.message || 'Failed to load reports', 'LOAD_FAILED');
  }
}
