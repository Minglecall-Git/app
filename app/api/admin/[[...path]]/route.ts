import { NextRequest } from 'next/server';
import { dispatchAdminNative } from '../../../../lib/handlers/adminNative';
import { jsonErr, requireAdmin } from '../../../../lib/nextAuth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 120;

async function handle(req: NextRequest, ctx: { params: Promise<{ path?: string[] }> }) {
  try {
    const auth = await requireAdmin(req);
    if (!auth.ok) { return jsonErr(auth.status, auth.error.message, auth.error.code); }

    const { path: segments = [] } = await ctx.params;
    return dispatchAdminNative(req, segments, auth);
  } catch (err: any) {
    console.error('[next /api/admin/[[...path]]]', err);
    return jsonErr(500, err?.message || 'Admin request failed', 'SERVER_ERROR');
  }
}

export const GET = handle;
export const POST = handle;
export const PUT = handle;
export const PATCH = handle;
export const DELETE = handle;
