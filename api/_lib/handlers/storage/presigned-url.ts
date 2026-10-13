/**
 * R2 presigned upload URL — uses R2_* from server env.
 * Dynamically imports server/r2Storage so the catch-all cold-start never loads AWS SDK.
 */
import {
  sendJson,
  readJsonBody,
  requireAuthFromBearer,
  type VercelReq,
  type VercelRes,
} from '../../vercelAuth';

export default async function handler(req: VercelReq, res: VercelRes) {
  try {
    if (req.method === 'OPTIONS') {
      res.statusCode = 204;
      res.end();
      return;
    }
    if (req.method !== 'POST') {
      return sendJson(res, 405, { success: false, error: 'Method not allowed' });
    }

    const auth = await requireAuthFromBearer(req);
    if (auth.ok === false) {
      return sendJson(res, auth.status, { success: false, error: auth.error?.message || 'Unauthorized', ...auth.error });
    }

    // Dynamic import — esbuild still bundles server/r2Storage into api/router.js;
    // AWS SDK stays external (see scripts/bundle-vercel-api.mjs).
    const {
      generateR2PresignedUploadUrl,
      isR2Configured,
      StorageNotConfiguredError,
      StorageValidationError,
    } = await import('../../../../server/r2Storage');

    if (!isR2Configured()) {
      return sendJson(res, 503, {
        success: false,
        configured: false,
        error:
          'R2 is not configured. Set R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET_NAME in Vercel Environment Variables.',
        code: 'STORAGE_NOT_CONFIGURED',
      });
    }

    const body = await readJsonBody(req);
    const filename = String(body.filename || '').trim();
    if (!filename) {
      return sendJson(res, 400, { success: false, error: 'Filename is required' });
    }

    const data = await generateR2PresignedUploadUrl({
      filename,
      contentType: String(body.contentType || ''),
      fileSize: Number(body.fileSize) || 0,
      userId: auth.profileId,
      category: body.category || 'chat_media',
    });

    return sendJson(res, 200, { ...data, source: 'environment' });
  } catch (err: any) {
    const name = String(err?.name || err?.constructor?.name || '');
    const code = String(err?.code || '');
    if (name === 'StorageNotConfiguredError' || code === 'STORAGE_NOT_CONFIGURED') {
      return sendJson(res, 503, {
        success: false,
        configured: false,
        error: err.message,
        code: err.code || 'STORAGE_NOT_CONFIGURED',
      });
    }
    if (name === 'StorageValidationError' || code === 'STORAGE_VALIDATION_ERROR') {
      return sendJson(res, err.status || 400, {
        success: false,
        error: err.message,
        code: err.code || 'STORAGE_VALIDATION_ERROR',
        ...(err.details || {}),
      });
    }
    console.error('[api/storage/presigned-url]', err);
    return sendJson(res, 500, { success: false, error: err?.message || 'Presign failed' });
  }
}
