import { NextRequest } from 'next/server';
import { jsonErr, requireAuth } from '../../../../lib/nextAuth';
import { handleStorageDelete, storageJsonError } from '../../../../lib/handlers/storage';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** POST /api/storage/delete */
export async function POST(req: NextRequest) {
  try {
    const auth = await requireAuth(req);
    if (auth.ok === false) return jsonErr(auth.status, auth.error.message, auth.error.code);
    return await handleStorageDelete(req, auth);
  } catch (err) {
    return storageJsonError(err);
  }
}
