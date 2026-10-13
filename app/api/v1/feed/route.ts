import { NextRequest } from 'next/server';
import { createServiceClient, jsonErr, requireAuth } from '../../../../lib/nextAuth';
import { handleFeedCreate, handleFeedList } from '../../../../lib/handlers/feed';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** GET|POST /api/v1/feed */
export async function GET(req: NextRequest) {
  try {
    const auth = await requireAuth(req);
    if (auth.ok === false) return jsonErr(auth.status, auth.error.message, auth.error.code);
    const client = createServiceClient();
    if (!client) return jsonErr(503, 'Feed backend unavailable', 'NO_ADMIN');
    return handleFeedList(req, auth, client);
  } catch (err: any) {
    console.error('[next /api/v1/feed GET]', err);
    return jsonErr(500, err?.message || 'Failed to load feed', 'LOAD_FAILED');
  }
}

export async function POST(req: NextRequest) {
  try {
    const auth = await requireAuth(req);
    if (auth.ok === false) return jsonErr(auth.status, auth.error.message, auth.error.code);
    const client = createServiceClient();
    if (!client) return jsonErr(503, 'Feed backend unavailable', 'NO_ADMIN');
    return handleFeedCreate(req, auth, client);
  } catch (err: any) {
    console.error('[next /api/v1/feed POST]', err);
    return jsonErr(500, err?.message || 'Failed to create moment', 'CREATE_FAILED');
  }
}
