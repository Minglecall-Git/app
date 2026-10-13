import { NextRequest } from 'next/server';
import { enforceRateLimit } from '../../../../../lib/nextRateLimit';
import {
  handleDeleteMyPayoutCard,
  handleGetMyPayoutCards,
  handlePutMyPayoutCard,
} from '../../../../../lib/handlers/payout';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const limited = await enforceRateLimit(req, 'authenticated');
  if (limited) return limited;
  return handleGetMyPayoutCards(req);
}

export async function PUT(req: NextRequest) {
  const limited = await enforceRateLimit(req, 'sensitive');
  if (limited) return limited;
  return handlePutMyPayoutCard(req);
}

export async function DELETE(req: NextRequest) {
  const limited = await enforceRateLimit(req, 'sensitive');
  if (limited) return limited;
  return handleDeleteMyPayoutCard(req);
}
