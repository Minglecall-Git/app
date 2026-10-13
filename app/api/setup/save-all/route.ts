import { NextRequest } from 'next/server';
import { handleSetupSaveAll } from '../../../../lib/handlers/setup';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** POST /api/setup/save-all */
export async function POST(req: NextRequest) {
  try {
    return await handleSetupSaveAll(req);
  } catch (err: any) {
    console.error('[next /api/setup/save-all]', err);
    return Response.json({ success: false, error: err?.message || 'Failed to save setup config' }, { status: 500 });
  }
}
