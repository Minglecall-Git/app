import { NextRequest } from 'next/server';
import { handleSetupTestSmtp } from '../../../../lib/handlers/setup';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** POST /api/setup/test-smtp */
export async function POST(req: NextRequest) {
  try {
    return await handleSetupTestSmtp(req);
  } catch (err: any) {
    return Response.json({ success: false, message: err?.message || 'SMTP test failed' }, { status: 500 });
  }
}
