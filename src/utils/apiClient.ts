import { supabase, isSupabaseConfigured } from '../lib/supabase';
import { apiUrl } from './apiBase';
import {
  getStoredActiveSessionId,
  isSessionReplacedResponse,
  shouldIgnoreSessionKick,
} from './singleSession';

export { apiUrl, getApiBaseUrl, getWsUrl, isSplitDeploy, getDeployModeLabel } from './apiBase';

export const SESSION_REPLACED_EVENT = 'livecall:session-replaced';

/** Brief window after login/setSession where authFetch should wait for getSession() to settle. */
let expectSessionUntilMs = 0;
/** Token seeded immediately after login — bridges the gap before getSession() reflects setSession. */
let seededAccessToken: { token: string; expiresAtMs: number } | null = null;

function notifyIfSessionReplaced(res: Response): void {
  if (res.status !== 409) return;
  if (shouldIgnoreSessionKick()) return;
  void res
    .clone()
    .json()
    .then((data) => {
      if (
        isSessionReplacedResponse(data) &&
        typeof window !== 'undefined' &&
        !shouldIgnoreSessionKick()
      ) {
        window.dispatchEvent(new CustomEvent(SESSION_REPLACED_EVENT));
      }
    })
    .catch(() => {});
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Call right after password/OTP login (or setSession) so authFetch waits briefly
 * instead of racing ahead with missing Authorization headers (401 cascade).
 */
export function expectAuthSessionSoon(ms = 5000): void {
  expectSessionUntilMs = Math.max(expectSessionUntilMs, Date.now() + Math.max(0, ms));
}

/** Cache a known-good access token until Supabase getSession() catches up. */
export function seedAccessToken(
  token: string | null | undefined,
  ttlMs = 120_000,
  opts?: { expectSoon?: boolean }
): void {
  const trimmed = typeof token === 'string' ? token.trim() : '';
  if (!trimmed) {
    seededAccessToken = null;
    return;
  }
  seededAccessToken = { token: trimmed, expiresAtMs: Date.now() + Math.max(5_000, ttlMs) };
  if (opts?.expectSoon !== false) {
    expectAuthSessionSoon(5_000);
  }
}

export function clearSeededAccessToken(): void {
  seededAccessToken = null;
  expectSessionUntilMs = 0;
}

function readSeededAccessToken(): string | null {
  if (!seededAccessToken) return null;
  if (Date.now() > seededAccessToken.expiresAtMs) {
    seededAccessToken = null;
    return null;
  }
  return seededAccessToken.token;
}

export async function getAccessToken(): Promise<string | null> {
  if (!isSupabaseConfigured()) return readSeededAccessToken();
  try {
    const { data } = await supabase.auth.getSession();
    let session = data.session;
    if (!session?.access_token) {
      return readSeededAccessToken();
    }

    // getSession() can return an expired access_token; refresh before API calls.
    // This is the usual cause of "Invalid or expired authentication token" on Vercel
    // while localhost still works with a freshly signed-in session.
    const expiresAtMs = Number(session.expires_at || 0) * 1000;
    const needsRefresh = !expiresAtMs || expiresAtMs <= Date.now() + 60_000;
    if (needsRefresh) {
      const { data: refreshed, error } = await supabase.auth.refreshSession();
      if (!error && refreshed.session?.access_token) {
        session = refreshed.session;
      }
    }

    const token = session?.access_token || null;
    if (token) {
      // Keep seed in sync (no expectSoon — avoid perpetually extending the settle window)
      seedAccessToken(token, 120_000, { expectSoon: false });
      return token;
    }
    return readSeededAccessToken();
  } catch {
    return readSeededAccessToken();
  }
}

/**
 * Poll until supabase.auth.getSession() (or seed) yields a usable access token.
 * Used by login completion and authFetch during the post-login settle window.
 */
export async function waitForAccessToken(opts?: {
  timeoutMs?: number;
  intervalMs?: number;
}): Promise<string | null> {
  const timeoutMs = opts?.timeoutMs ?? 4000;
  const intervalMs = opts?.intervalMs ?? 80;
  const deadline = Date.now() + Math.max(0, timeoutMs);
  let token = await getAccessToken();
  if (token) return token;
  while (Date.now() < deadline) {
    await sleep(intervalMs);
    token = await getAccessToken();
    if (token) return token;
  }
  return getAccessToken();
}

export async function authHeaders(extra?: Record<string, string>): Promise<Record<string, string>> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json', ...(extra || {}) };
  let token = await getAccessToken();
  if (!token && Date.now() < expectSessionUntilMs) {
    token = await waitForAccessToken({
      timeoutMs: Math.max(0, expectSessionUntilMs - Date.now()),
    });
  }
  if (token) headers.Authorization = `Bearer ${token}`;
  const sessionId = getStoredActiveSessionId();
  if (sessionId) headers['X-Session-Id'] = sessionId;
  return headers;
}

function resolveInput(input: RequestInfo | URL): RequestInfo | URL {
  if (typeof input === 'string') return apiUrl(input);
  if (input instanceof URL) return new URL(apiUrl(input.pathname + input.search));
  return input;
}

/** Authenticated fetch — resolves `/api/...` against VITE_API_BASE_URL when set. */
export async function authFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const headers = new Headers(init?.headers || {});
  if (!headers.has('Authorization')) {
    let token = await getAccessToken();
    // After login, getSession can lag setSession — wait instead of firing bare 401s
    if (!token && Date.now() < expectSessionUntilMs) {
      token = await waitForAccessToken({
        timeoutMs: Math.max(0, expectSessionUntilMs - Date.now()),
      });
    }
    if (token) headers.set('Authorization', `Bearer ${token}`);
  }
  if (!headers.has('X-Session-Id')) {
    const sessionId = getStoredActiveSessionId();
    if (sessionId) headers.set('X-Session-Id', sessionId);
  }
  if (init?.body && !headers.has('Content-Type') && typeof init.body === 'string') {
    headers.set('Content-Type', 'application/json');
  }
  const res = await fetch(resolveInput(input), { ...init, headers });
  notifyIfSessionReplaced(res);
  return res;
}

/** Same-origin or split-deploy fetch without forcing auth (OTP, setup, public probes). */
export async function apiFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  return fetch(resolveInput(input), init);
}
