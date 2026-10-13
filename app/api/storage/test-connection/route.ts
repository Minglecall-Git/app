import { NextRequest } from 'next/server';
import { jsonErr, requireAdmin } from '../../../../lib/nextAuth';
import { handleStorageTestConnection, storageJsonError } from '../../../../lib/handlers/storage';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** POST /api/storage/test-connection */
export async function POST(req: NextRequest) {
  try {
    const auth = await requireAdmin(req);
    if (auth.ok === false) return jsonErr(auth.status, auth.error.message, auth.error.code);
    return await handleStorageTestConnection(req);
  } catch (err: any) {
    return Response.json(
      { success: false, message: err?.message || 'Error testing Cloudflare R2 connectivity' },
      { status: 500 }
    );
  }
}
