import { NextRequest } from 'next/server';
import { jsonOk } from '../../../lib/nextAuth';
import { enforceRateLimit } from '../../../lib/nextRateLimit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Lightweight health — never boots Express. Uses Phase 0 rate-limit helper. */
export async function GET(req: NextRequest) {
  const limited = await enforceRateLimit(req, 'public');
  if (limited) return limited;
  return jsonOk({
    success: true,
    ok: true,
    runtime: 'next-native',
    foundation: 'phase-0',
    ts: new Date().toISOString(),
  });
}
