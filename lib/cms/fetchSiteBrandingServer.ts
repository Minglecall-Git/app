/**
 * Server-side fetch of cms_site_branding for root layout injection (GA4 / GSC).
 * Uses service role when available; falls back to anon/public key (RLS allows SELECT).
 */
import { createClient } from '@supabase/supabase-js';
import {
  DEFAULT_SITE_BRANDING,
  mapSiteBrandingRow,
  type SiteBranding,
} from '../../shared/cms/siteBranding';
import { createServiceClient } from '../nextAuth';
import { getSupabaseApiEnv } from '../../shared/supabaseApiKeys';

export async function fetchSiteBrandingServer(): Promise<SiteBranding> {
  try {
    const service = createServiceClient();
    if (service) {
      const { data, error } = await service
        .from('cms_site_branding')
        .select('*')
        .eq('id', 'default')
        .maybeSingle();
      if (!error && data) return mapSiteBrandingRow(data);
    }

    const api = getSupabaseApiEnv();
    const baseUrl = api.url;
    const key = api.publishableKey || api.anonKey;
    if (!baseUrl || !key) return { ...DEFAULT_SITE_BRANDING };

    const anon = createClient(baseUrl, key, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data, error } = await anon
      .from('cms_site_branding')
      .select(
        'id, page_title, meta_description, site_name, logo_url, favicon_url, og_image_url, theme_color, ga4_measurement_id, gsc_verification_content, header_scripts, footer_scripts, updated_at'
      )
      .eq('id', 'default')
      .maybeSingle();
    if (error || !data) return { ...DEFAULT_SITE_BRANDING };
    return mapSiteBrandingRow(data);
  } catch (e) {
    console.warn('[fetchSiteBrandingServer]', e);
    return { ...DEFAULT_SITE_BRANDING };
  }
}
