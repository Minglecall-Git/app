/**
 * Public sitemap paths for Google Search Console.
 * Admin → CMS → Sitemap can bump lastmod and add extra paths.
 */

/** Core public routes included in every sitemap. */
export const DEFAULT_SITEMAP_PATHS: string[] = [
  '/',
  '/discovery',
  '/swipe',
  '/moments',
];

export type SitemapConfig = {
  updatedAt: string | null;
  extraPaths: string[];
};

export const DEFAULT_SITEMAP_CONFIG: SitemapConfig = {
  updatedAt: null,
  extraPaths: [],
};

function stripTrailingSlash(value: string): string {
  return value.replace(/\/$/, '');
}

function isLocalHostLike(value: string): boolean {
  return /localhost|127\.0\.0\.1/i.test(value);
}

/** Ensure `https://host` form; bare hosts get the given default protocol. */
export function normalizeSiteOrigin(
  raw: string | null | undefined,
  defaultProto: 'http' | 'https' = 'https'
): string {
  let s = String(raw || '').trim();
  if (!s) return '';
  if (!/^https?:\/\//i.test(s)) {
    s = `${isLocalHostLike(s) ? 'http' : defaultProto}://${s}`;
  }
  try {
    const u = new URL(s);
    if (!u.hostname) return '';
    return stripTrailingSlash(`${u.protocol}//${u.host}`);
  } catch {
    return '';
  }
}

/** Build origin from incoming Host / x-forwarded-* (sitemap + robots). */
export function originFromRequestHost(
  host?: string | null,
  proto?: string | null
): string {
  const h = String(host || '')
    .trim()
    .split(',')[0]
    .trim()
    .replace(/^https?:\/\//i, '');
  if (!h) return '';
  const p =
    String(proto || '')
      .trim()
      .split(',')[0]
      .trim()
      .replace(/:$/, '') || (isLocalHostLike(h) ? 'http' : 'https');
  return normalizeSiteOrigin(`${p}://${h}`, isLocalHostLike(h) ? 'http' : 'https');
}

/**
 * Canonical public origin for sitemap / robots / CMS copy links.
 * Prefers explicit app URL env, then request fallback, then Vercel production URL.
 * Never prefers localhost when a real public origin is available.
 */
export function getPublicSiteOrigin(fallbackOrigin?: string): string {
  const configured = [
    normalizeSiteOrigin(process.env.NEXT_PUBLIC_APP_URL),
    normalizeSiteOrigin(process.env.APP_URL),
    normalizeSiteOrigin(process.env.PUBLIC_APP_URL),
  ].filter(Boolean);

  const request = normalizeSiteOrigin(fallbackOrigin);

  const vercel = [
    normalizeSiteOrigin(process.env.VERCEL_PROJECT_PRODUCTION_URL, 'https'),
    normalizeSiteOrigin(process.env.VERCEL_URL, 'https'),
  ].filter(Boolean);

  const preferPublic = [...configured, request, ...vercel].find(
    (o) => o && !isLocalHostLike(o)
  );
  if (preferPublic) return preferPublic;

  const any = [...configured, request, ...vercel].find(Boolean);
  return any || 'http://localhost:3000';
}

export function sitemapXmlUrl(origin?: string): string {
  return `${getPublicSiteOrigin(origin)}/sitemap.xml`;
}

export function robotsTxtUrl(origin?: string): string {
  return `${getPublicSiteOrigin(origin)}/robots.txt`;
}

/** Normalize one path: leading slash, no query/hash, no trailing slash (except `/`). */
export function normalizeSitemapPath(raw: string): string | null {
  let s = String(raw || '').trim();
  if (!s) return null;
  // Allow full URLs — keep pathname only
  if (/^https?:\/\//i.test(s)) {
    try {
      s = new URL(s).pathname;
    } catch {
      return null;
    }
  }
  if (!s.startsWith('/')) s = `/${s}`;
  s = s.split('?')[0].split('#')[0];
  if (s.length > 1 && s.endsWith('/')) s = s.slice(0, -1);
  if (!/^\/[A-Za-z0-9/_-]*$/.test(s)) return null;
  return s || '/';
}

/** Parse admin textarea (one path per line). Invalid lines dropped. */
export function parseSitemapExtraPaths(raw: unknown): string[] {
  const text = String(raw ?? '');
  const out: string[] = [];
  const seen = new Set<string>();
  for (const line of text.split(/\r?\n/)) {
    const p = normalizeSitemapPath(line);
    if (!p || seen.has(p)) continue;
    seen.add(p);
    out.push(p);
  }
  return out.slice(0, 200);
}

export function formatSitemapExtraPaths(paths: string[]): string {
  return (paths || []).join('\n');
}

export function buildSitemapPaths(extraPaths: string[] = []): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const p of [...DEFAULT_SITEMAP_PATHS, ...extraPaths]) {
    const n = normalizeSitemapPath(p);
    if (!n || seen.has(n)) continue;
    seen.add(n);
    out.push(n);
  }
  return out;
}

export function mapSitemapConfigRow(row: any | null | undefined): SitemapConfig {
  if (!row) return { ...DEFAULT_SITEMAP_CONFIG };
  return {
    updatedAt: row.sitemap_updated_at ?? row.sitemapUpdatedAt ?? null,
    extraPaths: parseSitemapExtraPaths(
      row.sitemap_extra_paths ?? row.sitemapExtraPaths ?? ''
    ),
  };
}
