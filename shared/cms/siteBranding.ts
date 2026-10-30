/**
 * Default site SEO & branding (Admin → CMS → SEO & branding).
 * DB row id `default` overlays these values at runtime.
 */

export type SiteBranding = {
  id: string;
  pageTitle: string;
  metaDescription: string;
  siteName: string;
  logoUrl: string;
  faviconUrl: string;
  ogImageUrl: string;
  themeColor: string;
  /** GA4 Measurement ID (G-XXXXXXXXXX). Empty string = tracking disabled. */
  ga4MeasurementId: string;
  /** google-site-verification meta content value. Empty = no GSC meta. */
  gscVerificationContent: string;
  /** Raw HTML for &lt;head&gt; (e.g. full Google tag / gtag.js snippet). */
  headerScripts: string;
  /** Raw HTML before &lt;/body&gt; (pixels, chat widgets, etc.). */
  footerScripts: string;
  updatedAt?: string | null;
};

export const DEFAULT_SITE_BRANDING: SiteBranding = {
  id: 'default',
  pageTitle: 'LiveCall - 1-on-1 Video & Monetization',
  metaDescription:
    'Live 1-on-1 video calling, creator monetization, interactive matching, and discovery platform.',
  siteName: 'LiveCall',
  logoUrl: '',
  faviconUrl: '/pwa-icon.svg',
  ogImageUrl: '',
  themeColor: '#09090C',
  ga4MeasurementId: '',
  gscVerificationContent: '',
  headerScripts: '',
  footerScripts: '',
  updatedAt: null,
};

const GA4_ID_RE = /^G-[A-Z0-9]+$/i;
const GSC_CONTENT_MAX = 200;
/** Max length for admin-pasted header/footer HTML snippets. */
export const CUSTOM_SCRIPTS_MAX = 50_000;

/**
 * Accept `G-XXXXXXXXXX` (case-insensitive). Returns normalized uppercase ID or ''.
 * Invalid non-empty input returns null so callers can reject the save.
 */
export function normalizeGa4MeasurementId(raw: unknown): string | null {
  const s = String(raw ?? '').trim();
  if (!s) return '';
  if (!GA4_ID_RE.test(s)) return null;
  return s.toUpperCase();
}

/**
 * Accept either the bare verification token or a pasted
 * `<meta name="google-site-verification" content="..." />` tag.
 * Returns content value or '' when empty. Returns null when clearly invalid.
 */
export function normalizeGscVerificationContent(raw: unknown): string | null {
  let s = String(raw ?? '').trim();
  if (!s) return '';
  const attr = s.match(/content\s*=\s*["']([^"']+)["']/i);
  if (attr) s = attr[1].trim();
  else {
    s = s
      .replace(/^<meta\b[^>]*>$/i, '')
      .replace(/^content\s*=\s*/i, '')
      .replace(/^["']|["']$/g, '')
      .trim();
  }
  if (!s) return '';
  if (s.length > GSC_CONTENT_MAX) return null;
  // Tokens are typically alphanumeric / hyphen / underscore
  if (!/^[A-Za-z0-9_-]+$/.test(s)) return null;
  return s;
}

/**
 * Normalize custom HTML snippets. Empty → ''. Oversize → null (reject save).
 * Allows comments, script/meta/link/noscript tags (admin-only field).
 */
export function normalizeCustomScripts(raw: unknown): string | null {
  const s = String(raw ?? '');
  if (!s.trim()) return '';
  if (s.length > CUSTOM_SCRIPTS_MAX) return null;
  return s;
}

export function mapSiteBrandingRow(row: any | null | undefined): SiteBranding {
  if (!row) return { ...DEFAULT_SITE_BRANDING };
  const ga4Raw = row.ga4_measurement_id ?? row.ga4MeasurementId ?? '';
  const gscRaw = row.gsc_verification_content ?? row.gscVerificationContent ?? '';
  const ga4 = normalizeGa4MeasurementId(ga4Raw);
  const gsc = normalizeGscVerificationContent(gscRaw);
  const headerScripts = normalizeCustomScripts(row.header_scripts ?? row.headerScripts) || '';
  const footerScripts = normalizeCustomScripts(row.footer_scripts ?? row.footerScripts) || '';
  return {
    id: String(row.id || 'default'),
    pageTitle: String(row.page_title ?? row.pageTitle ?? DEFAULT_SITE_BRANDING.pageTitle).trim()
      || DEFAULT_SITE_BRANDING.pageTitle,
    metaDescription: String(
      row.meta_description ?? row.metaDescription ?? DEFAULT_SITE_BRANDING.metaDescription
    ).trim() || DEFAULT_SITE_BRANDING.metaDescription,
    siteName: String(row.site_name ?? row.siteName ?? DEFAULT_SITE_BRANDING.siteName).trim()
      || DEFAULT_SITE_BRANDING.siteName,
    logoUrl: String(row.logo_url ?? row.logoUrl ?? '').trim(),
    faviconUrl: String(row.favicon_url ?? row.faviconUrl ?? DEFAULT_SITE_BRANDING.faviconUrl).trim()
      || DEFAULT_SITE_BRANDING.faviconUrl,
    ogImageUrl: String(row.og_image_url ?? row.ogImageUrl ?? '').trim(),
    themeColor: String(row.theme_color ?? row.themeColor ?? DEFAULT_SITE_BRANDING.themeColor).trim()
      || DEFAULT_SITE_BRANDING.themeColor,
    ga4MeasurementId: ga4 || '',
    gscVerificationContent: gsc || '',
    headerScripts,
    footerScripts,
    updatedAt: row.updated_at ?? row.updatedAt ?? null,
  };
}

function upsertMeta(attr: 'name' | 'property', key: string, content: string) {
  if (typeof document === 'undefined') return;
  let el = document.head.querySelector(`meta[${attr}="${key}"]`) as HTMLMetaElement | null;
  if (!el) {
    el = document.createElement('meta');
    el.setAttribute(attr, key);
    document.head.appendChild(el);
  }
  el.setAttribute('content', content);
}

function removeMeta(attr: 'name' | 'property', key: string) {
  if (typeof document === 'undefined') return;
  document.head.querySelector(`meta[${attr}="${key}"]`)?.remove();
}

function upsertLinkRel(rel: string, href: string, type?: string) {
  if (typeof document === 'undefined' || !href) return;
  let el = document.head.querySelector(`link[rel="${rel}"]`) as HTMLLinkElement | null;
  if (!el) {
    el = document.createElement('link');
    el.setAttribute('rel', rel);
    document.head.appendChild(el);
  }
  el.setAttribute('href', href);
  if (type) el.setAttribute('type', type);
  else el.removeAttribute('type');
}

/** Apply branding to document head (SPA / client). Safe no-op on server. */
export function applySiteBrandingToDocument(branding: SiteBranding) {
  if (typeof document === 'undefined') return;
  const b = { ...DEFAULT_SITE_BRANDING, ...branding };
  document.title = b.pageTitle;
  upsertMeta('name', 'description', b.metaDescription);
  upsertMeta('name', 'theme-color', b.themeColor);
  upsertMeta('name', 'apple-mobile-web-app-title', b.siteName);
  upsertMeta('property', 'og:title', b.pageTitle);
  upsertMeta('property', 'og:description', b.metaDescription);
  upsertMeta('property', 'og:type', 'website');
  upsertMeta('property', 'og:site_name', b.siteName);
  if (b.ogImageUrl) upsertMeta('property', 'og:image', b.ogImageUrl);
  upsertMeta('name', 'twitter:card', b.ogImageUrl ? 'summary_large_image' : 'summary');
  upsertMeta('name', 'twitter:title', b.pageTitle);
  upsertMeta('name', 'twitter:description', b.metaDescription);
  if (b.ogImageUrl) upsertMeta('name', 'twitter:image', b.ogImageUrl);
  if (b.gscVerificationContent) {
    upsertMeta('name', 'google-site-verification', b.gscVerificationContent);
  } else {
    removeMeta('name', 'google-site-verification');
  }
  const favicon = b.faviconUrl || DEFAULT_SITE_BRANDING.faviconUrl;
  const isSvg = favicon.toLowerCase().includes('.svg');
  upsertLinkRel('icon', favicon, isSvg ? 'image/svg+xml' : undefined);
  upsertLinkRel('apple-touch-icon', favicon);
}
