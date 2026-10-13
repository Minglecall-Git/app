import { NextRequest } from 'next/server';
import { jsonErr, requireAuth } from '../../../../lib/nextAuth';
import { handlePresignedUrl, storageJsonError } from '../../../../lib/handlers/storage';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** POST /api/storage/presigned-url */
export async function POST(req: NextRequest) {
  try {
    const auth = await requireAuth(req);
    if (auth.ok === false) return jsonErr(auth.status, auth.error.message, auth.error.code);
    return await handlePresignedUrl(req, auth);
  } catch (err) {
    return storageJsonError(err);
  }
}
