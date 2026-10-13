/**
 * QUARANTINED — do not use.
 * Production burn is `burn_call_coins_atomic` via api/_lib/cjs/coreRoutes.js
 * and app/api/calls/burn/route.ts. This stub previously did non-atomic RMW.
 */
import { sendJson, type VercelReq, type VercelRes } from '../../vercelAuth';

export default async function handler(_req: VercelReq, res: VercelRes) {
  return sendJson(res, 410, {
    success: false,
    error: {
      message: 'Deprecated. Use POST /api/calls/burn (atomic RPC).',
      code: 'DEPRECATED_UNSAFE_BURN',
    },
  });
}
