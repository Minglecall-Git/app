import { NextRequest } from 'next/server';
import { createServiceClient, jsonErr, jsonOk, requireAdmin } from '../../../../../../lib/nextAuth';
import { parseJsonBody } from '../../../../../../lib/nextRequest';
import {
  ADMIN_STATUSES,
  MAX_DETAILS_LEN,
  MAX_REASON_LEN,
  REPORT_SELECT,
  sanitizeText,
} from '../../../../../../lib/handlers/reports';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type RouteContext = { params: Promise<{ id: string }> };

/** PATCH /api/v1/admin/reports/:id */
export async function PATCH(req: NextRequest, context: RouteContext) {
  try {
    const auth = await requireAdmin(req);
    if (!auth.ok) { return jsonErr(auth.status, auth.error.message, auth.error.code); }

    const { id: rawId } = await context.params;
    const reportId = sanitizeText(rawId, 64);
    if (!reportId) return jsonErr(400, 'Report id required', 'INVALID_ID');

    const parsed = await parseJsonBody<{
      status?: string;
      adminNotes?: string;
      actionTaken?: string;
    }>(req);
    if (!parsed.ok) { return jsonErr(parsed.status, parsed.error.message, parsed.error.code); }

    const status = sanitizeText(parsed.data?.status, 32).toLowerCase();
    if (!ADMIN_STATUSES.has(status)) {
      return jsonErr(
        400,
        'status must be pending|investigating|action_taken|dismissed',
        'INVALID_STATUS'
      );
    }

    const adminNotes =
      parsed.data?.adminNotes !== undefined
        ? sanitizeText(parsed.data.adminNotes, MAX_DETAILS_LEN) || null
        : undefined;
    const actionTaken =
      parsed.data?.actionTaken !== undefined
        ? sanitizeText(parsed.data.actionTaken, MAX_REASON_LEN) || null
        : undefined;

    const resolvedStatuses = status === 'action_taken' || status === 'dismissed';

    const patch: Record<string, unknown> = { status };
    if (adminNotes !== undefined) patch.admin_notes = adminNotes;
    if (actionTaken !== undefined) patch.action_taken = actionTaken;
    if (resolvedStatuses) {
      patch.resolved_by = auth.profileId || null;
      patch.resolved_at = new Date().toISOString();
    } else if (status === 'pending' || status === 'investigating') {
      patch.resolved_by = null;
      patch.resolved_at = null;
    }

    const client = createServiceClient();
    if (!client) return jsonErr(503, 'Reports backend unavailable', 'NO_ADMIN');

    const { data, error } = await client
      .from('moderation_reports')
      .update(patch)
      .eq('id', reportId)
      .select(REPORT_SELECT)
      .maybeSingle();

    if (error) {
      console.error('[next PATCH /api/v1/admin/reports/:id]', error.message);
      return jsonErr(500, 'Failed to update report', 'UPDATE_FAILED');
    }
    if (!data) return jsonErr(404, 'Report not found', 'NOT_FOUND');

    return jsonOk({ success: true, data: { report: data } });
  } catch (err: any) {
    console.error('[next PATCH /api/v1/admin/reports/:id]', err);
    return jsonErr(500, err?.message || 'Failed to update report', 'UPDATE_FAILED');
  }
}
