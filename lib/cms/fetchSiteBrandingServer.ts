/**
 * Server-side fetch of cms_site_branding for root layout injection (GA4 / GSC).
 * Uses service role when available; falls back to anon/public key (RLS allows SELECT).
 * Always cache: 'no-store' so Measurement ID changes appear immediately.
 */
import { createClient } from '@supabase/supabase-js';
import {
  DEFAULT_SITE_BRANDING,
  mapSiteBrandingRow,
  type SiteBranding,
} from '../../shared/cms/siteBranding';
import { getSupabaseApiEnv } from '../../shared/supabaseApiKeys';
import { isServerAdminApiKey } from '../../shared/supabaseApiKeys';

function noStoreFetch(input: RequestInfo | URL, init?: RequestInit) {
  return fetch(input, {
    ...init,
    cache: 'no-store',
  });
}

export async function fetchSiteBrandingServer(): Promise<SiteBranding> {
  try {
    const api = getSupabaseApiEnv();
    if (!api.url) return { ...DEFAULT_SITE_BRANDING };

    const clients: Array<{ label: string; key: string }> = [];
    if (api.secretKey && isServerAdminApiKey(api.secretKey)) {
      clients.push({ label: 'service', key: api.secretKey });
    }
    const pub = api.publishableKey || api.anonKey;
    if (pub) clients.push({ label: 'anon', key: pub });

    for (const c of clients) {
      const client = createClient(api.url, c.key, {
        auth: { persistSession: false, autoRefreshToken: false },
        global: { fetch: noStoreFetch },
      });
      const { data, error } = await client
        .from('cms_site_branding')
        .select(
          'id, page_title, meta_description, site_name, logo_url, favicon_url, og_image_url, theme_color, ga4_measurement_id, gsc_verification_content, header_scripts, footer_scripts, updated_at'
        )
        .eq('id', 'default')
        .maybeSingle();
      if (error) {
        // Missing columns (migration not applied) or RLS — try next client / fall through
        console.warn(`[fetchSiteBrandingServer] ${c.label}:`, error.message);
        continue;
      }
      if (data) return mapSiteBrandingRow(data);
    }

    return { ...DEFAULT_SITE_BRANDING };
  } catch (e) {
    console.warn('[fetchSiteBrandingServer]', e);
    return { ...DEFAULT_SITE_BRANDING };
  }
}
