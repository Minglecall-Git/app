import { NextRequest } from 'next/server';
import { handleSetupTestR2 } from '../../../../lib/handlers/setup';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** POST /api/setup/test-r2 */
export async function POST(req: NextRequest) {
  try {
    return await handleSetupTestR2(req);
  } catch (err: any) {
    return Response.json({ success: false, message: err?.message || 'R2 storage test failed' }, { status: 500 });
  }
}
