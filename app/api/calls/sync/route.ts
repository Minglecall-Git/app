import { NextRequest } from 'next/server';
import { handleCallsSync } from '../../../../lib/handlers/callsSyncHandler';
import { createServiceClient, jsonErr, jsonOk, requireAuth } from '../../../../lib/nextAuth';
import { parseJsonBody } from '../../../../lib/nextRequest';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** POST /api/calls/sync — call_logs + Redis call:{id} (native Next). */
export async function POST(req: NextRequest) {
  try {
    const auth = await requireAuth(req);
    if (!auth.ok) { return jsonErr(auth.status, auth.error.message, auth.error.code); }

    const client = createServiceClient();
    if (!client) return jsonErr(503, 'Supabase not configured', 'NO_SUPABASE');

    const parsed = await parseJsonBody<Record<string, unknown>>(req);
    if (!parsed.ok) { return jsonErr(parsed.status, parsed.error.message, parsed.error.code); }

    const result = await handleCallsSync(client, auth, parsed.data || {});
    if (result.status === 200) return jsonOk(result.body);
    return jsonErr(
      result.status,
      (result.body as any).error?.message || 'Call sync failed',
      (result.body as any).error?.code || 'CALL_SYNC_FAILED',
      result.body as Record<string, unknown>
    );
  } catch (err: any) {
    console.error('[next /api/calls/sync]', err);
    return jsonErr(500, err?.message || 'Call sync failed', 'INTERNAL_ERROR');
  }
}
