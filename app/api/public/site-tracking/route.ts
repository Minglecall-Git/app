import { NextResponse } from 'next/server';
import { fetchSiteBrandingServer } from '../../../../lib/cms/fetchSiteBrandingServer';

/**
 * Public read of whether GA4 / GSC / custom scripts are configured.
 * Useful to verify Measurement ID is persisted and visible to the layout.
 * Does not expose secrets — only public tracking IDs / presence flags.
 */
export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET() {
  const branding = await fetchSiteBrandingServer();
  return NextResponse.json({
    success: true,
    data: {
      ga4MeasurementId: branding.ga4MeasurementId || null,
      hasGscVerification: Boolean(branding.gscVerificationContent),
      hasHeaderScripts: Boolean(branding.headerScripts?.trim()),
      hasFooterScripts: Boolean(branding.footerScripts?.trim()),
    },
  });
}
