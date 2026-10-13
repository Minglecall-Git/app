/**
 * R2 config status from server env (no secrets returned).
 */
import {
  sendJson,
  requireAdminFromBearer,
  getR2Env,
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
    if (req.method !== 'GET') {
      return sendJson(res, 405, { success: false, error: 'Method not allowed' });
    }

    const auth = await requireAdminFromBearer(req);
    if (auth.ok === false) {
      return sendJson(res, auth.status, { success: false, error: auth.error });
    }

    const r2 = getR2Env();
    const configured = Boolean(r2.accountId && r2.accessKeyId && r2.secretAccessKey && r2.bucketName);

    return sendJson(res, 200, {
      success: true,
      configured,
      source: 'environment',
      config: {
        accountId: r2.accountId ? `${r2.accountId.slice(0, 4)}…` : '',
        accessKeyId: r2.accessKeyId ? `${r2.accessKeyId.slice(0, 4)}…` : '',
        secretAccessKey: r2.secretAccessKey ? '••••••••' : '',
        bucketName: r2.bucketName,
        publicUrl: r2.publicUrl,
      },
      message: configured
        ? 'R2 credentials are loaded from server environment variables.'
        : 'Set R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET_NAME (and optional R2_PUBLIC_URL) in Vercel Environment Variables.',
    });
  } catch (err: any) {
    console.error('[api/storage/config]', err);
    return sendJson(res, 500, { success: false, error: err?.message || 'Failed to read R2 config' });
  }
}
