import { NextRequest } from 'next/server';
import { jsonErr, requireAuth } from '../../../../lib/nextAuth';
import { handleStorageUpload, storageJsonError } from '../../../../lib/handlers/storage';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/** POST /api/storage/upload */
export async function POST(req: NextRequest) {
  try {
    const auth = await requireAuth(req);
    if (auth.ok === false) return jsonErr(auth.status, auth.error.message, auth.error.code);
    return await handleStorageUpload(req, auth);
  } catch (err) {
    return storageJsonError(err);
  }
}
