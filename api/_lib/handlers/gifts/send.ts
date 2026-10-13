/**
 * QUARANTINED — do not use.
 * Production gifts use gift_spend_atomic via api/_lib/cjs/coreRoutes.js.
 */
import { sendJson, type VercelReq, type VercelRes } from '../../vercelAuth';

export default async function handler(_req: VercelReq, res: VercelRes) {
  return sendJson(res, 410, {
    success: false,
    error: {
      message: 'Deprecated. Use POST /api/gifts/send (atomic RPC).',
      code: 'DEPRECATED_UNSAFE_GIFT',
    },
  });
}
