import { NextRequest } from 'next/server';
import { enforceRateLimit } from '../../../../../lib/nextRateLimit';
import { handleGetPayoutCardsRoster } from '../../../../../lib/handlers/payout';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const limited = await enforceRateLimit(req, 'authenticated');
  if (limited) return limited;
  return handleGetPayoutCardsRoster(req);
}
