import { NextRequest } from 'next/server';
import { handleSetupTestDb } from '../../../../lib/handlers/setup';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** POST /api/setup/test-db */
export async function POST(req: NextRequest) {
  try {
    return await handleSetupTestDb(req);
  } catch (err: any) {
    return Response.json({ success: false, message: err?.message || 'Database test failed' }, { status: 500 });
  }
}
