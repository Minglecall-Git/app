import { supabase, isSupabaseConfigured } from '../lib/supabase';
import { apiUrl } from './apiBase';
import {
  getStoredActiveSessionId,
  isSessionReplacedResponse,
  shouldIgnoreSessionKick,
} from './singleSession';

export { apiUrl, getApiBaseUrl, getWsUrl, isSplitDeploy, getDeployModeLabel } from './apiBase';

export const SESSION_REPLACED_EVENT = 'livecall:session-replaced';

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

export async function getAccessToken(): Promise<string | null> {
  if (!isSupabaseConfigured()) return null;
  try {
    const { data } = await supabase.auth.getSession();
    let session = data.session;
    if (!session?.access_token) return null;

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

    return session?.access_token || null;
  } catch {
    return null;
  }
}

export async function authHeaders(extra?: Record<string, string>): Promise<Record<string, string>> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json', ...(extra || {}) };
  const token = await getAccessToken();
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
    const token = await getAccessToken();
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
