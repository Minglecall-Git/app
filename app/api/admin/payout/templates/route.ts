import { NextRequest } from 'next/server';
import { enforceRateLimit } from '../../../../../lib/nextRateLimit';
import {
  handleAdminGetTemplates,
  handleAdminPutTemplates,
} from '../../../../../lib/handlers/payout';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const limited = await enforceRateLimit(req, 'authenticated');
  if (limited) return limited;
  return handleAdminGetTemplates(req);
}

export async function PUT(req: NextRequest) {
  const limited = await enforceRateLimit(req, 'sensitive');
  if (limited) return limited;
  return handleAdminPutTemplates(req);
}
