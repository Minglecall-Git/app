import type { MetadataRoute } from 'next';
import { headers } from 'next/headers';
import { createClient } from '@supabase/supabase-js';
import {
  buildSitemapPaths,
  getPublicSiteOrigin,
  mapSitemapConfigRow,
  originFromRequestHost,
} from '../shared/cms/sitemap';
import { getSupabaseApiEnv, isServerAdminApiKey } from '../shared/supabaseApiKeys';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

async function resolvePublicOrigin(): Promise<string> {
  try {
    const h = await headers();
    const requestOrigin = originFromRequestHost(
      h.get('x-forwarded-host') || h.get('host'),
      h.get('x-forwarded-proto')
    );
    return getPublicSiteOrigin(requestOrigin || undefined);
  } catch {
    return getPublicSiteOrigin();
  }
}

async function loadSitemapMeta(): Promise<{ lastModified: Date; paths: string[] }> {
  const fallback = {
    lastModified: new Date(),
    paths: buildSitemapPaths(),
  };
  try {
    const api = getSupabaseApiEnv();
    if (!api.url) return fallback;
    const key =
      api.secretKey && isServerAdminApiKey(api.secretKey)
        ? api.secretKey
        : api.publishableKey || api.anonKey;
    if (!key) return fallback;

    const client = createClient(api.url, key, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: {
        fetch: (input, init) => fetch(input, { ...init, cache: 'no-store' }),
      },
    });
    const { data, error } = await client
      .from('cms_site_branding')
      .select('sitemap_updated_at, sitemap_extra_paths')
      .eq('id', 'default')
      .maybeSingle();
    if (error || !data) return fallback;
    const cfg = mapSitemapConfigRow(data);
    return {
      lastModified: cfg.updatedAt ? new Date(cfg.updatedAt) : new Date(),
      paths: buildSitemapPaths(cfg.extraPaths),
    };
  } catch {
    return fallback;
  }
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const origin = await resolvePublicOrigin();
  const { lastModified, paths } = await loadSitemapMeta();

  return paths.map((path, index) => ({
    url: `${origin}${path === '/' ? '' : path}` || origin,
    lastModified,
    changeFrequency: path === '/' ? 'daily' : 'weekly',
    priority: path === '/' ? 1 : Math.max(0.4, 0.8 - index * 0.05),
  }));
}
