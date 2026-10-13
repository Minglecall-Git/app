/**
 * LiveKit config status / read — secrets stay on the server.
 */
import {
  sendJson,
  readJsonBody,
  requireAdminFromBearer,
  getLiveKitEnv,
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

    const auth = await requireAdminFromBearer(req);
    if (auth.ok === false) {
      return sendJson(res, auth.status, { success: false, error: auth.error });
    }

    const livekit = getLiveKitEnv();
    const configured = Boolean(
      livekit.wsUrl &&
        livekit.apiKey &&
        livekit.apiSecret &&
        livekit.apiKey !== 'devkey' &&
        livekit.apiSecret !== 'secret'
    );

    if (req.method === 'GET') {
      return sendJson(res, 200, {
        success: true,
        configured,
        source: 'environment',
        wsUrl: livekit.wsUrl,
        apiKey: livekit.apiKey ? '••••••••' : '',
        message: configured
          ? 'LiveKit credentials are loaded from server environment variables.'
          : 'Set LIVEKIT_URL, LIVEKIT_API_KEY, and LIVEKIT_API_SECRET in Vercel Environment Variables.',
      });
    }

    if (req.method === 'POST') {
      // Admin "save" from UI — do not accept secrets from browser on Vercel.
      await readJsonBody(req);
      return sendJson(res, 200, {
        success: true,
        configured,
        wsUrl: livekit.wsUrl,
        message:
          'LiveKit secrets are not updated from the browser on Vercel. Set LIVEKIT_* in Project Environment Variables and Redeploy.',
      });
    }

    return sendJson(res, 405, { success: false, error: 'Method not allowed' });
  } catch (err: any) {
    console.error('[api/livekit/config]', err);
    return sendJson(res, 500, { success: false, error: err?.message || 'LiveKit config failed' });
  }
}
