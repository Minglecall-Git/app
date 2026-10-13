import { NextRequest } from 'next/server';
import { createServiceClient, jsonErr, jsonOk, requireAuth } from '../../../../../lib/nextAuth';
import { loadBlockLists } from '../../../../../lib/handlers/blocks';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** GET /api/v1/blocks/me */
export async function GET(req: NextRequest) {
  try {
    const auth = await requireAuth(req);
    if (!auth.ok) { return jsonErr(auth.status, auth.error.message, auth.error.code); }

    const client = createServiceClient();
    if (!client) return jsonErr(503, 'Blocks backend unavailable', 'NO_ADMIN');

    const lists = await loadBlockLists(client, auth.profileId);
    return jsonOk({ success: true, data: lists });
  } catch (err: any) {
    console.error('[next /api/v1/blocks/me]', err);
    return jsonErr(500, err?.message || 'Failed to load blocks', 'LOAD_FAILED');
  }
}
