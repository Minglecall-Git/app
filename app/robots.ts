import type { MetadataRoute } from 'next';
import { headers } from 'next/headers';
import {
  getPublicSiteOrigin,
  originFromRequestHost,
  sitemapXmlUrl,
} from '../shared/cms/sitemap';

export const dynamic = 'force-dynamic';

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

export default async function robots(): Promise<MetadataRoute.Robots> {
  const origin = await resolvePublicOrigin();
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      disallow: ['/api/', '/admin', '/server-setup', '/agency'],
    },
    sitemap: sitemapXmlUrl(origin),
    host: origin,
  };
}
