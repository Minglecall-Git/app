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

export function getPublicSiteOrigin(fallbackOrigin?: string): string {
  const env = (
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.APP_URL ||
    process.env.PUBLIC_APP_URL ||
    ''
  )
    .trim()
    .replace(/\/$/, '');
  if (env) return env;
  const fb = String(fallbackOrigin || '')
    .trim()
    .replace(/\/$/, '');
  return fb || 'http://localhost:3000';
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
