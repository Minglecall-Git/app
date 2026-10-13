/**
 * Canonical SPA route map: major feature tabs ↔ meaningful URL paths.
 * Used by the History API navigation layer (no react-router dependency).
 */

export const DEFAULT_TAB = 'home';

/** Tab id → browser pathname */
export const TAB_PATHS: Record<string, string> = {
  home: '/',
  discovery: '/discovery',
  swipe: '/swipe',
  moments: '/moments',
  earnings: '/earnings',
  call_logs: '/call-logs',
  profile: '/profile',
  team_leader: '/agency',
  admin: '/admin',
  server_setup: '/server-setup',
};

const PATH_TO_TAB: Record<string, string> = Object.entries(TAB_PATHS).reduce(
  (acc, [tab, path]) => {
    acc[normalizePath(path)] = tab;
    return acc;
  },
  {} as Record<string, string>
);

export function normalizePath(pathname: string): string {
  if (!pathname) return '/';
  const trimmed = pathname.split('?')[0].split('#')[0];
  if (trimmed.length > 1 && trimmed.endsWith('/')) {
    return trimmed.slice(0, -1) || '/';
  }
  return trimmed || '/';
}

/** Public peer profile deep link: `/profile/<userId>` (exact `/profile` remains own edit page). */
export function parsePublicProfilePath(pathname: string): string | null {
  const normalized = normalizePath(pathname);
  const match = normalized.match(/^\/profile\/([^/]+)$/);
  if (!match) return null;
  let id = match[1];
  try {
    id = decodeURIComponent(id);
  } catch {
    // keep raw segment
  }
  id = String(id || '').trim();
  if (!id) return null;
  return id;
}

export function publicProfilePath(userId: string): string {
  return `/profile/${encodeURIComponent(String(userId || '').trim())}`;
}

export function tabToPath(tab: string): string {
  return TAB_PATHS[tab] ?? TAB_PATHS[DEFAULT_TAB];
}

export function pathToTab(pathname: string): string {
  const normalized = normalizePath(pathname);
  // `/profile/<id>` is not the edit tab — fall through to default unless exact `/profile`.
  if (parsePublicProfilePath(normalized)) return DEFAULT_TAB;
  return PATH_TO_TAB[normalized] ?? DEFAULT_TAB;
}

export function isKnownAppPath(pathname: string): boolean {
  const normalized = normalizePath(pathname);
  if (normalized in PATH_TO_TAB) return true;
  return parsePublicProfilePath(normalized) != null;
}

export function isSetupLocation(pathname?: string, hash?: string): boolean {
  const path = pathname ?? (typeof window !== 'undefined' ? window.location.pathname : '');
  const h = hash ?? (typeof window !== 'undefined' ? window.location.hash : '');
  return (
    path.includes('server-setup') ||
    path.includes('installer') ||
    h.includes('server-setup') ||
    h.includes('setup')
  );
}

export function readTabFromLocation(): string {
  if (typeof window === 'undefined') return DEFAULT_TAB;
  if (isSetupLocation()) return 'server_setup';
  return pathToTab(window.location.pathname);
}
