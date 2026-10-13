import { NextRequest } from 'next/server';
import { handleSetupLock } from '../../../../lib/handlers/setup';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** POST /api/setup/lock */
export async function POST(req: NextRequest) {
  try {
    return await handleSetupLock(req);
  } catch (err: any) {
    return Response.json({ success: false, error: err?.message || 'Failed to update lock' }, { status: 500 });
  }
}
