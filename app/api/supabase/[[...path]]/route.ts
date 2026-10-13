import { NextRequest } from 'next/server';
import { dispatchSupabaseNative } from '../../../../lib/handlers/supabaseDispatchNative';
import { toResponse } from '../../../../lib/handlers/handlerResult';
import { jsonErr, requireAdmin, requireAuth } from '../../../../lib/nextAuth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 120;

async function handle(req: NextRequest, ctx: { params: Promise<{ path?: string[] }> }) {
  try {
    const { path: segments = [] } = await ctx.params;
    const pathKey = segments.join('/');

    if (pathKey === 'status' && req.method === 'GET') {
      const result = await dispatchSupabaseNative(req, segments, null);
      return toResponse(result);
    }

    const auth = await requireAuth(req);
    if (!auth.ok) { return jsonErr(auth.status, auth.error.message, auth.error.code); }

    if (pathKey === 'test-query' && req.method === 'POST') {
      const admin = await requireAdmin(req);
      if (!admin.ok) { return jsonErr(admin.status, admin.error.message, admin.error.code); }
      const result = await dispatchSupabaseNative(req, segments, admin);
      return toResponse(result);
    }

    if (pathKey === 'bulk-upsert-profiles' && req.method === 'POST') {
      const admin = await requireAdmin(req);
      if (!admin.ok) { return jsonErr(admin.status, admin.error.message, admin.error.code); }
      const result = await dispatchSupabaseNative(req, segments, admin);
      return toResponse(result);
    }

    const result = await dispatchSupabaseNative(req, segments, auth);
    return toResponse(result);
  } catch (err: any) {
    console.error('[next /api/supabase/[[...path]]]', err);
    return jsonErr(500, err?.message || 'Supabase bridge failed', 'SERVER_ERROR');
  }
}

export const GET = handle;
export const POST = handle;
