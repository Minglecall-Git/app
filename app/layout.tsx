import type { Metadata, Viewport } from 'next';
import { Suspense } from 'react';
import Script from 'next/script';
import '../src/index.css';
import { DEFAULT_SITE_BRANDING } from '../shared/cms/siteBranding';
import { fetchSiteBrandingServer } from '../lib/cms/fetchSiteBrandingServer';
import { Ga4PageViews } from '../src/components/analytics/Ga4PageViews';
import { SiteHtmlInject } from '../src/components/analytics/SiteHtmlInject';

/** Static defaults; runtime CMS overlays via generateMetadata + AppContext. */
export async function generateMetadata(): Promise<Metadata> {
  const branding = await fetchSiteBrandingServer();
  const verification = branding.gscVerificationContent
    ? { google: branding.gscVerificationContent }
    : undefined;

  return {
    title: branding.pageTitle || DEFAULT_SITE_BRANDING.pageTitle,
    description: branding.metaDescription || DEFAULT_SITE_BRANDING.metaDescription,
    applicationName: branding.siteName || DEFAULT_SITE_BRANDING.siteName,
    icons: {
      icon: branding.faviconUrl || DEFAULT_SITE_BRANDING.faviconUrl,
      apple: branding.faviconUrl || DEFAULT_SITE_BRANDING.faviconUrl,
    },
    openGraph: {
      title: branding.pageTitle || DEFAULT_SITE_BRANDING.pageTitle,
      description: branding.metaDescription || DEFAULT_SITE_BRANDING.metaDescription,
      siteName: branding.siteName || DEFAULT_SITE_BRANDING.siteName,
      type: 'website',
      ...(branding.ogImageUrl ? { images: [{ url: branding.ogImageUrl }] } : {}),
    },
    verification,
  };
}

export const viewport: Viewport = {
  themeColor: DEFAULT_SITE_BRANDING.themeColor,
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const branding = await fetchSiteBrandingServer();
  const ga4Id = branding.ga4MeasurementId;
  const gscContent = branding.gscVerificationContent;
  const headerScripts = branding.headerScripts?.trim() || '';
  const footerScripts = branding.footerScripts?.trim() || '';
  const themeColor = branding.themeColor || DEFAULT_SITE_BRANDING.themeColor;

  return (
    <html lang="en" className="dark" data-theme="dark">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Outfit:wght@600;700;800&family=Plus+Jakarta+Sans:wght@400;500;600;700&family=Space+Grotesk:wght@500;700&display=swap"
          rel="stylesheet"
        />
        <meta name="theme-color" content={themeColor} />
        {gscContent ? (
          <meta name="google-site-verification" content={gscContent} />
        ) : null}
      </head>
      <body>
        {headerScripts ? (
          <SiteHtmlInject html={headerScripts} target="head" markerId="cms-header-scripts" />
        ) : null}
        {children}
        {footerScripts ? (
          <SiteHtmlInject html={footerScripts} target="body" markerId="cms-footer-scripts" />
        ) : null}
        {ga4Id ? (
          <>
            <Script
              src={`https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(ga4Id)}`}
              strategy="afterInteractive"
            />
            <Script id="ga4-gtag-init" strategy="afterInteractive">
              {`
                window.dataLayer = window.dataLayer || [];
                function gtag(){dataLayer.push(arguments);}
                gtag('js', new Date());
                gtag('config', ${JSON.stringify(ga4Id)}, { send_page_view: false });
              `}
            </Script>
            <Suspense fallback={null}>
              <Ga4PageViews measurementId={ga4Id} />
            </Suspense>
          </>
        ) : null}
      </body>
    </html>
  );
}
