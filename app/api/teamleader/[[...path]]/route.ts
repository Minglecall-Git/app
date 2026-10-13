import { NextRequest } from 'next/server';
import { dispatchTeamleaderNative } from '../../../../lib/handlers/teamleaderBridgeNative';
import { toResponse } from '../../../../lib/handlers/handlerResult';
import { jsonErr, requireTeamLeader } from '../../../../lib/nextAuth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 120;

async function handle(req: NextRequest, ctx: { params: Promise<{ path?: string[] }> }) {
  try {
    const auth = await requireTeamLeader(req);
    if (!auth.ok) { return jsonErr(auth.status, auth.error.message, auth.error.code); }

    const { path: segments = [] } = await ctx.params;
    const result = await dispatchTeamleaderNative(req, segments, auth);
    return toResponse(result);
  } catch (err: any) {
    console.error('[next /api/teamleader/[[...path]]]', err);
    return jsonErr(500, err?.message || 'Team leader request failed', 'SERVER_ERROR');
  }
}

export const GET = handle;
export const POST = handle;
