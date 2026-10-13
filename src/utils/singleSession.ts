/**
 * Single-device login helpers.
 * Backend stores profiles.active_session_id; only the matching device stays signed in.
 */

export const ACTIVE_SESSION_STORAGE_KEY = 'livecall_active_session_id';
export const SESSION_REPLACED_CODE = 'SESSION_REPLACED';

/** While claiming, ignore SESSION_REPLACED / Realtime kick (prevents self-logout races). */
let ignoreSessionKickUntilMs = 0;

export function markSessionClaimGrace(ms = 8000): void {
  ignoreSessionKickUntilMs = Math.max(ignoreSessionKickUntilMs, Date.now() + Math.max(0, ms));
}

export function shouldIgnoreSessionKick(): boolean {
  return Date.now() < ignoreSessionKickUntilMs;
}

export function newActiveSessionId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `sess_${Date.now()}_${Math.random().toString(36).slice(2, 12)}`;
}

export function getStoredActiveSessionId(): string | null {
  try {
    const id = localStorage.getItem(ACTIVE_SESSION_STORAGE_KEY);
    return id && id.trim() ? id.trim() : null;
  } catch {
    return null;
  }
}

export function setStoredActiveSessionId(sessionId: string): void {
  try {
    localStorage.setItem(ACTIVE_SESSION_STORAGE_KEY, sessionId);
  } catch {
    /* ignore quota / private mode */
  }
}

export function clearStoredActiveSessionId(): void {
  try {
    localStorage.removeItem(ACTIVE_SESSION_STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

export function isSessionReplacedResponse(payload: unknown): boolean {
  if (!payload || typeof payload !== 'object') return false;
  const p = payload as Record<string, unknown>;
  const err = p.error;
  if (typeof err === 'string' && err.includes(SESSION_REPLACED_CODE)) return true;
  if (err && typeof err === 'object') {
    const e = err as Record<string, unknown>;
    if (e.code === SESSION_REPLACED_CODE) return true;
    if (typeof e.message === 'string' && e.message.includes(SESSION_REPLACED_CODE)) return true;
  }
  if (p.code === SESSION_REPLACED_CODE) return true;
  return false;
}
