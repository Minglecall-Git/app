import { NextRequest } from 'next/server';

export const runtime = 'nodejs';
export const maxDuration = 30;
export const dynamic = 'force-dynamic';

async function handle(req: NextRequest) {
  try {
    // Dynamic import so a boot crash still returns JSON (not Next HTML 500 page).
    const [{ dispatchExpress }, { getApp }] = await Promise.all([
      import('../../../lib/expressAdapter'),
      import('../../../server'),
    ]);
    const app = await getApp();
    return await dispatchExpress(app, req);
  } catch (err: any) {
    console.error('[api] Next route failed:', err);
    console.error(err?.stack || String(err));
    return Response.json(
      {
        success: false,
        error: {
          message: err?.message || 'API failed to start',
          code: 'FUNCTION_BOOT_FAILED',
        },
      },
      { status: 500, headers: { 'Cache-Control': 'no-store' } }
    );
  }
}

export const GET = handle;
export const POST = handle;
export const PUT = handle;
export const PATCH = handle;
export const DELETE = handle;
export const OPTIONS = handle;
