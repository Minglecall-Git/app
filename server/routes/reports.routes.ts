import { Router } from 'express';
import type { ServerRuntime } from '../runtimeTypes';
import { requireAuth, requireAdmin } from '../middleware/auth';
import { getSupabaseAdmin, isSupabaseAdminConfigured } from '../supabaseAdmin';

const MAX_REASON_LEN = 200;
const MAX_DETAILS_LEN = 2000;
const MAX_REPORTS_PER_HOUR = 10;
const DEDUPE_WINDOW_MS = 24 * 60 * 60 * 1000;

const ALLOWED_REASONS = new Set([
  'Inappropriate Conduct / Content',
  'Nudity or Sexual Harassment',
  'Fake Profile / Impersonation',
  'Commercial Spam or Scams',
  'Abusive Language',
  'Inappropriate behavior',
  'Reported from profile',
  'Other',
  'User Flagged',
]);

function authUserId(req: any): string {
  return String(req.profileId || req.user?.id || '');
}

function sendError(res: any, status: number, message: string, code: string) {
  return res.status(status).json({ success: false, error: { message, code } });
}

function sanitizeText(value: unknown, maxLen: number): string {
  return String(value ?? '')
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '')
    .trim()
    .slice(0, maxLen);
}

function resolveReportedUserId(body: any): string {
  return sanitizeText(body?.reportedUserId || body?.targetUserId || '', 128);
}

function validateReason(raw: string): { ok: true; reason: string } | { ok: false; message: string } {
  const reason = sanitizeText(raw, MAX_REASON_LEN);
  if (!reason) return { ok: false, message: 'Reason is required' };
  if (reason.length > MAX_REASON_LEN) return { ok: false, message: 'Reason is too long' };
  // Allowlisted reasons OR short free-text (e.g. "Other" custom notes passed as reason)
  if (ALLOWED_REASONS.has(reason) || reason.length <= MAX_REASON_LEN) {
    return { ok: true, reason };
  }
  return { ok: false, message: 'Invalid reason' };
}

const REPORT_SELECT =
  'id, reporter_id, reported_user_id, reason, details, evidence_snapshot_url, status, action_taken, admin_notes, resolved_by, resolved_at, created_at';

/** POST/GET /api/v1/reports */
export function createReportsRouter(_runtime: ServerRuntime) {
  const router = Router();

  /** GET /api/v1/reports/me — reporter's own reports */
  router.get('/me', requireAuth, async (req, res) => {
    try {
      if (!isSupabaseAdminConfigured()) {
        return sendError(res, 503, 'Reports backend unavailable', 'NO_ADMIN');
      }
      const reporterId = authUserId(req);
      if (!reporterId) return sendError(res, 401, 'Unauthorized', 'UNAUTHORIZED');

      const client = getSupabaseAdmin()!;
      const { data, error } = await client
        .from('moderation_reports')
        .select(REPORT_SELECT)
        .eq('reporter_id', reporterId)
        .order('created_at', { ascending: false })
        .limit(50);

      if (error) {
        console.error('[reports/me] select:', error.message);
        return sendError(res, 500, 'Failed to load reports', 'LOAD_FAILED');
      }

      return res.json({ success: true, data: { reports: data || [] } });
    } catch (err: any) {
      console.error('[reports/me] exception:', err);
      return sendError(res, 500, err?.message || 'Failed to load reports', 'LOAD_FAILED');
    }
  });

  /** POST /api/v1/reports  { reportedUserId|targetUserId, reason, details?, evidenceSnapshotUrl? } */
  router.post('/', requireAuth, async (req, res) => {
    try {
      if (!isSupabaseAdminConfigured()) {
        return sendError(res, 503, 'Reports backend unavailable', 'NO_ADMIN');
      }
      const reporterId = authUserId(req);
      const reportedUserId = resolveReportedUserId(req.body);
      const reasonResult = validateReason(req.body?.reason);
      const detailsRaw = sanitizeText(req.body?.details, MAX_DETAILS_LEN);
      const details = detailsRaw || null;
      const evidenceSnapshotUrl =
        sanitizeText(req.body?.evidenceSnapshotUrl, 2000) || null;

      if (!reporterId) return sendError(res, 401, 'Unauthorized', 'UNAUTHORIZED');
      if (!reportedUserId || reportedUserId === reporterId) {
        return sendError(res, 400, 'Invalid reported user', 'INVALID_TARGET');
      }
      if (reasonResult.ok === false) {
        return sendError(res, 400, reasonResult.message, 'INVALID_REASON');
      }
      const reason = reasonResult.reason;
      if (detailsRaw.length > MAX_DETAILS_LEN) {
        return sendError(res, 400, 'Details are too long', 'INVALID_DETAILS');
      }

      const client = getSupabaseAdmin()!;
      const { data: target, error: targetErr } = await client
        .from('profiles')
        .select('id')
        .eq('id', reportedUserId)
        .maybeSingle();
      if (targetErr) throw targetErr;
      if (!target) return sendError(res, 404, 'Target user not found', 'NOT_FOUND');

      const hourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
      const { count: hourCount, error: rateErr } = await client
        .from('moderation_reports')
        .select('id', { count: 'exact', head: true })
        .eq('reporter_id', reporterId)
        .gte('created_at', hourAgo);
      if (rateErr) {
        console.error('[reports] rate check:', rateErr.message);
        return sendError(res, 500, 'Failed to submit report', 'RATE_CHECK_FAILED');
      }
      if ((hourCount || 0) >= MAX_REPORTS_PER_HOUR) {
        return sendError(
          res,
          429,
          'Too many reports submitted recently. Please try again later.',
          'RATE_LIMITED'
        );
      }

      const dedupeSince = new Date(Date.now() - DEDUPE_WINDOW_MS).toISOString();
      const { data: existing, error: dedupeErr } = await client
        .from('moderation_reports')
        .select('id, status, created_at')
        .eq('reporter_id', reporterId)
        .eq('reported_user_id', reportedUserId)
        .eq('reason', reason)
        .eq('status', 'pending')
        .gte('created_at', dedupeSince)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (dedupeErr) {
        console.error('[reports] dedupe check:', dedupeErr.message);
        return sendError(res, 500, 'Failed to submit report', 'DEDUPE_FAILED');
      }
      if (existing?.id) {
        return res.json({
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
          reporter_id: reporterId,
          reported_user_id: reportedUserId,
          reason,
          details,
          evidence_snapshot_url: evidenceSnapshotUrl,
          status: 'pending',
        })
        .select('id, status, created_at')
        .maybeSingle();

      if (error) {
        console.error('[reports] insert:', error.message);
        return sendError(res, 500, 'Failed to submit report', 'INSERT_FAILED');
      }

      return res.json({
        success: true,
        data: {
          id: data?.id,
          status: data?.status || 'pending',
          alreadyReported: false,
        },
      });
    } catch (err: any) {
      console.error('[reports] exception:', err);
      return sendError(res, 500, err?.message || 'Failed to submit report', 'REPORT_FAILED');
    }
  });

  return router;
}

const ADMIN_STATUSES = new Set(['pending', 'investigating', 'action_taken', 'dismissed']);

/** GET/PATCH /api/v1/admin/reports */
export function createAdminReportsRouter(_runtime: ServerRuntime) {
  const router = Router();

  /** GET /api/v1/admin/reports?status=pending */
  router.get('/', requireAdmin, async (req, res) => {
    try {
      if (!isSupabaseAdminConfigured()) {
        return sendError(res, 503, 'Reports backend unavailable', 'NO_ADMIN');
      }

      const statusFilter = sanitizeText(req.query?.status, 32).toLowerCase();
      const limit = Math.min(Math.max(Number(req.query?.limit) || 50, 1), 100);

      const client = getSupabaseAdmin()!;
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
        console.error('[admin/reports] select:', error.message);
        return sendError(res, 500, 'Failed to load reports', 'LOAD_FAILED');
      }

      const rows = reports || [];
      const profileIds = Array.from(
        new Set(
          rows.flatMap((r: any) => [String(r.reporter_id), String(r.reported_user_id)].filter(Boolean))
        )
      );

      let profilesById: Record<string, { id: string; name: string | null; avatar_url: string | null }> =
        {};
      if (profileIds.length > 0) {
        const { data: profiles, error: pErr } = await client
          .from('profiles')
          .select('id, name, avatar_url')
          .in('id', profileIds);
        if (pErr) {
          console.error('[admin/reports] profiles:', pErr.message);
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

      return res.json({ success: true, data: { reports: enriched } });
    } catch (err: any) {
      console.error('[admin/reports] exception:', err);
      return sendError(res, 500, err?.message || 'Failed to load reports', 'LOAD_FAILED');
    }
  });

  /** PATCH /api/v1/admin/reports/:id  { status, adminNotes?, actionTaken? } */
  router.patch('/:id', requireAdmin, async (req, res) => {
    try {
      if (!isSupabaseAdminConfigured()) {
        return sendError(res, 503, 'Reports backend unavailable', 'NO_ADMIN');
      }

      const reportId = sanitizeText(req.params.id, 64);
      if (!reportId) return sendError(res, 400, 'Report id required', 'INVALID_ID');

      const status = sanitizeText(req.body?.status, 32).toLowerCase();
      if (!ADMIN_STATUSES.has(status)) {
        return sendError(
          res,
          400,
          'status must be pending|investigating|action_taken|dismissed',
          'INVALID_STATUS'
        );
      }

      const adminNotes =
        req.body?.adminNotes !== undefined
          ? sanitizeText(req.body.adminNotes, MAX_DETAILS_LEN) || null
          : undefined;
      const actionTaken =
        req.body?.actionTaken !== undefined
          ? sanitizeText(req.body.actionTaken, MAX_REASON_LEN) || null
          : undefined;

      const adminId = authUserId(req);
      const resolvedStatuses = status === 'action_taken' || status === 'dismissed';

      const patch: Record<string, unknown> = { status };
      if (adminNotes !== undefined) patch.admin_notes = adminNotes;
      if (actionTaken !== undefined) patch.action_taken = actionTaken;
      if (resolvedStatuses) {
        patch.resolved_by = adminId || null;
        patch.resolved_at = new Date().toISOString();
      } else if (status === 'pending' || status === 'investigating') {
        patch.resolved_by = null;
        patch.resolved_at = null;
      }

      const client = getSupabaseAdmin()!;
      const { data, error } = await client
        .from('moderation_reports')
        .update(patch)
        .eq('id', reportId)
        .select(REPORT_SELECT)
        .maybeSingle();

      if (error) {
        console.error('[admin/reports/patch] update:', error.message);
        return sendError(res, 500, 'Failed to update report', 'UPDATE_FAILED');
      }
      if (!data) return sendError(res, 404, 'Report not found', 'NOT_FOUND');

      return res.json({ success: true, data: { report: data } });
    } catch (err: any) {
      console.error('[admin/reports/patch] exception:', err);
      return sendError(res, 500, err?.message || 'Failed to update report', 'UPDATE_FAILED');
    }
  });

  return router;
}
