import { NextRequest } from 'next/server';
import { createServiceClient, jsonErr, jsonOk, requireAuth } from '../../../../../lib/nextAuth';
import { REPORT_SELECT } from '../../../../../lib/handlers/reports';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** GET /api/v1/reports/me */
export async function GET(req: NextRequest) {
  try {
    const auth = await requireAuth(req);
    if (!auth.ok) { return jsonErr(auth.status, auth.error.message, auth.error.code); }

    const client = createServiceClient();
    if (!client) return jsonErr(503, 'Reports backend unavailable', 'NO_ADMIN');

    const { data, error } = await client
      .from('moderation_reports')
      .select(REPORT_SELECT)
      .eq('reporter_id', auth.profileId)
      .order('created_at', { ascending: false })
      .limit(50);

    if (error) {
      console.error('[next /api/v1/reports/me]', error.message);
      return jsonErr(500, 'Failed to load reports', 'LOAD_FAILED');
    }

    return jsonOk({ success: true, data: { reports: data || [] } });
  } catch (err: any) {
    console.error('[next /api/v1/reports/me]', err);
    return jsonErr(500, err?.message || 'Failed to load reports', 'LOAD_FAILED');
  }
}
