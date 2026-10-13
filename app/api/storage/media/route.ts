import { NextRequest } from 'next/server';
import { handleStorageMedia } from '../../../../lib/handlers/storage';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** GET /api/storage/media */
export async function GET(req: NextRequest) {
  try {
    return await handleStorageMedia(req);
  } catch (err: any) {
    console.error('[Storage Media Proxy]', err);
    return new Response('Internal media streaming error', { status: 500 });
  }
}
