import { NextRequest } from 'next/server';
import { handleGetUsers, handlePostUsers } from '../../../lib/handlers/usersDiscoveryNative';
import { toResponse } from '../../../lib/handlers/handlerResult';
import { getServerRuntime } from '../../../lib/serverRuntime';
import { jsonErr, requireAuth } from '../../../lib/nextAuth';
import { parseJsonBody } from '../../../lib/nextRequest';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const auth = await requireAuth(req);
    if (!auth.ok) { return jsonErr(auth.status, auth.error.message, auth.error.code); }
    const ctx = await getServerRuntime();
    return toResponse(await handleGetUsers(ctx, req, auth));
  } catch (err: any) {
    console.error('[next GET /api/users]', err);
    return jsonErr(500, err?.message || 'Failed', 'SERVER_ERROR');
  }
}

export async function POST(req: NextRequest) {
  try {
    const auth = await requireAuth(req);
    if (!auth.ok) { return jsonErr(auth.status, auth.error.message, auth.error.code); }
    const parsed = await parseJsonBody<Record<string, unknown>>(req, { large: true });
    if (!parsed.ok) { return jsonErr(parsed.status, parsed.error.message, parsed.error.code); }
    const ctx = await getServerRuntime();
    return toResponse(await handlePostUsers(ctx, auth, parsed.data || {}));
  } catch (err: any) {
    console.error('[next POST /api/users]', err);
    return jsonErr(500, err?.message || 'Failed', 'SERVER_ERROR');
  }
}
