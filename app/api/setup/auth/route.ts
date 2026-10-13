import { NextRequest } from 'next/server';
import { handleSetupAuth } from '../../../../lib/handlers/setup';
import { jsonErr } from '../../../../lib/nextAuth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** POST /api/setup/auth */
export async function POST(req: NextRequest) {
  try {
    return await handleSetupAuth(req);
  } catch (err: any) {
    return jsonErr(500, err?.message || 'Setup auth failed', 'SETUP_AUTH_FAILED');
  }
}
