import { NextRequest } from 'next/server';
import { createServiceClient, jsonErr, jsonOk, requireAuth } from '../../../../lib/nextAuth';
import { parseJsonBody } from '../../../../lib/nextRequest';
import {
  DEDUPE_WINDOW_MS,
  MAX_DETAILS_LEN,
  MAX_REPORTS_PER_HOUR,
  resolveReportedUserId,
  sanitizeText,
  validateReason,
} from '../../../../lib/handlers/reports';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** POST /api/v1/reports */
export async function POST(req: NextRequest) {
  try {
    const auth = await requireAuth(req);
    if (!auth.ok) { return jsonErr(auth.status, auth.error.message, auth.error.code); }

    const parsed = await parseJsonBody<{
      reportedUserId?: string;
      targetUserId?: string;
      reason?: string;
      details?: string;
      evidenceSnapshotUrl?: string;
    }>(req);
    if (!parsed.ok) { return jsonErr(parsed.status, parsed.error.message, parsed.error.code); }

    const client = createServiceClient();
    if (!client) return jsonErr(503, 'Reports backend unavailable', 'NO_ADMIN');

    const reportedUserId = resolveReportedUserId(parsed.data);
    const reasonResult = validateReason(String(parsed.data?.reason || ''));
    const detailsRaw = sanitizeText(parsed.data?.details, MAX_DETAILS_LEN);
    const details = detailsRaw || null;
    const evidenceSnapshotUrl = sanitizeText(parsed.data?.evidenceSnapshotUrl, 2000) || null;

    if (!reportedUserId || reportedUserId === auth.profileId) {
      return jsonErr(400, 'Invalid reported user', 'INVALID_TARGET');
    }
    if (reasonResult.ok === false) {
      return jsonErr(400, reasonResult.message, 'INVALID_REASON');
    }
    const reason = reasonResult.reason;
    if (detailsRaw.length > MAX_DETAILS_LEN) {
      return jsonErr(400, 'Details are too long', 'INVALID_DETAILS');
    }

    const { data: target, error: targetErr } = await client
      .from('profiles')
      .select('id')
      .eq('id', reportedUserId)
      .maybeSingle();
    if (targetErr) throw targetErr;
    if (!target) return jsonErr(404, 'Target user not found', 'NOT_FOUND');

    const hourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const { count: hourCount, error: rateErr } = await client
      .from('moderation_reports')
      .select('id', { count: 'exact', head: true })
      .eq('reporter_id', auth.profileId)
      .gte('created_at', hourAgo);
    if (rateErr) {
      console.error('[next /api/v1/reports] rate check:', rateErr.message);
      return jsonErr(500, 'Failed to submit report', 'RATE_CHECK_FAILED');
    }
    if ((hourCount || 0) >= MAX_REPORTS_PER_HOUR) {
      return jsonErr(
        429,
        'Too many reports submitted recently. Please try again later.',
        'RATE_LIMITED'
      );
    }

    const dedupeSince = new Date(Date.now() - DEDUPE_WINDOW_MS).toISOString();
    const { data: existing, error: dedupeErr } = await client
      .from('moderation_reports')
      .select('id, status, created_at')
      .eq('reporter_id', auth.profileId)
      .eq('reported_user_id', reportedUserId)
      .eq('reason', reason)
      .eq('status', 'pending')
      .gte('created_at', dedupeSince)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (dedupeErr) {
      console.error('[next /api/v1/reports] dedupe check:', dedupeErr.message);
      return jsonErr(500, 'Failed to submit report', 'DEDUPE_FAILED');
    }
    if (existing?.id) {
      return jsonOk({
        success: true,
        data: {
          id: existing.id,
          status: existing.status || 'pending',
          alreadyReported: true,
        },
      });
    }

    const { data, error } = await client
      .from('moderation_reports')
      .insert({
        reporter_id: auth.profileId,
        reported_user_id: reportedUserId,
        reason,
        details,
        evidence_snapshot_url: evidenceSnapshotUrl,
        status: 'pending',
      })
      .select('id, status, created_at')
      .maybeSingle();

    if (error) {
      console.error('[next /api/v1/reports] insert:', error.message);
      return jsonErr(500, 'Failed to submit report', 'INSERT_FAILED');
    }

    return jsonOk({
      success: true,
      data: {
        id: data?.id,
        status: data?.status || 'pending',
        alreadyReported: false,
      },
    });
  } catch (err: any) {
    console.error('[next /api/v1/reports]', err);
    return jsonErr(500, err?.message || 'Failed to submit report', 'REPORT_FAILED');
  }
}
