import { NextRequest } from 'next/server';
import { jsonErr, requireAdmin } from '../../../../lib/nextAuth';
import { handleStorageTest } from '../../../../lib/handlers/storage';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** POST /api/storage/test */
export async function POST(req: NextRequest) {
  try {
    const auth = await requireAdmin(req);
    if (auth.ok === false) return jsonErr(auth.status, auth.error.message, auth.error.code);
    return await handleStorageTest(req);
  } catch (err: any) {
    return Response.json({ success: false, error: err?.message || 'Test failed' }, { status: 500 });
  }
}
