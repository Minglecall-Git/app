import type { MetadataRoute } from 'next';
import { getPublicSiteOrigin, sitemapXmlUrl } from '../shared/cms/sitemap';

export const dynamic = 'force-dynamic';

export default function robots(): MetadataRoute.Robots {
  const origin = getPublicSiteOrigin();
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
