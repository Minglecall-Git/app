import { handleSetupStatus } from '../../../../lib/handlers/setup';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** GET /api/setup/status */
export async function GET() {
  return handleSetupStatus();
}
