export const MAX_REASON_LEN = 200;
export const MAX_DETAILS_LEN = 2000;
export const MAX_REPORTS_PER_HOUR = 10;
export const DEDUPE_WINDOW_MS = 24 * 60 * 60 * 1000;

export const ALLOWED_REASONS = new Set([
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

export const REPORT_SELECT =
  'id, reporter_id, reported_user_id, reason, details, evidence_snapshot_url, status, action_taken, admin_notes, resolved_by, resolved_at, created_at';

export const ADMIN_STATUSES = new Set(['pending', 'investigating', 'action_taken', 'dismissed']);

export function sanitizeText(value: unknown, maxLen: number): string {
  return String(value ?? '')
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '')
    .trim()
    .slice(0, maxLen);
}

export function resolveReportedUserId(body: any): string {
  return sanitizeText(body?.reportedUserId || body?.targetUserId || '', 128);
}

export function validateReason(raw: string): { ok: true; reason: string } | { ok: false; message: string } {
  const reason = sanitizeText(raw, MAX_REASON_LEN);
  if (!reason) return { ok: false, message: 'Reason is required' };
  if (reason.length > MAX_REASON_LEN) return { ok: false, message: 'Reason is too long' };
  if (ALLOWED_REASONS.has(reason) || reason.length <= MAX_REASON_LEN) {
    return { ok: true, reason };
  }
  return { ok: false, message: 'Invalid reason' };
}
