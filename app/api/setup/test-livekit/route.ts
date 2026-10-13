import { NextRequest } from 'next/server';
import { handleSetupTestLivekit } from '../../../../lib/handlers/setup';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** POST /api/setup/test-livekit */
export async function POST(req: NextRequest) {
  try {
    return await handleSetupTestLivekit(req);
  } catch (err: any) {
    return Response.json(
      { success: false, message: `LiveKit Error: ${err?.message || 'Token generation failed'}` },
      { status: 500 }
    );
  }
}
