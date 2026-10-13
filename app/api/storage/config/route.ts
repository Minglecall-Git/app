import { NextRequest } from 'next/server';
import { jsonErr, requireAdmin } from '../../../../lib/nextAuth';
import { handleStorageConfigGet, handleStorageConfigPost, storageJsonError } from '../../../../lib/handlers/storage';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** GET|POST /api/storage/config */
export async function GET(req: NextRequest) {
  try {
    const auth = await requireAdmin(req);
    if (auth.ok === false) return jsonErr(auth.status, auth.error.message, auth.error.code);
    return handleStorageConfigGet();
  } catch (err) {
    return storageJsonError(err);
  }
}

export async function POST(req: NextRequest) {
  try {
    const auth = await requireAdmin(req);
    if (auth.ok === false) return jsonErr(auth.status, auth.error.message, auth.error.code);
    return await handleStorageConfigPost(req);
  } catch (err) {
    return storageJsonError(err);
  }
}
