import { NextRequest } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Fallback for unknown /api paths after Express catch-all removal.
 * Prefer specific app/api route.ts handlers — they take precedence over this.
 */
async function handle(req: NextRequest) {
  const path = new URL(req.url).pathname;
  return Response.json(
    {
      success: false,
      error: {
        message: `No API route for ${path}`,
        code: 'NOT_FOUND',
      },
      runtime: 'next-native',
    },
    { status: 404, headers: { 'Cache-Control': 'no-store' } }
  );
}

export const GET = handle;
export const POST = handle;
export const PUT = handle;
export const PATCH = handle;
export const DELETE = handle;
export const OPTIONS = handle;
