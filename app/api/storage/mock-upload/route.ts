import { NextRequest } from 'next/server';
import { jsonErr, requireAuth } from '../../../../lib/nextAuth';
import { handleMockUpload, storageJsonError } from '../../../../lib/handlers/storage';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/** PUT /api/storage/mock-upload */
export async function PUT(req: NextRequest) {
  try {
    const auth = await requireAuth(req);
    if (auth.ok === false) return jsonErr(auth.status, auth.error.message, auth.error.code);
    return await handleMockUpload(req, auth);
  } catch (err) {
    return storageJsonError(err);
  }
}
