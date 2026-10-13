import { NextRequest } from 'next/server';
import { requireAuth } from '../../../../lib/nextAuth';
import { parseJsonBody } from '../../../../lib/nextRequest';
import { authFail, authJson, safeClientError } from '../../../../lib/authHelpers';
import { claimExclusiveSessionAdmin } from '../../../../server/supabaseAdmin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const parsed = await parseJsonBody<{ sessionId?: string; activeSessionId?: string }>(req);
  if (!parsed.ok) return authFail(parsed.status, parsed.error.message);

  const auth = await requireAuth(req, parsed.data as Record<string, unknown>);
  if (!auth.ok) return authFail(auth.status, auth.error.message);

  try {
    const profileId = auth.profileId;
    if (!profileId) {
      return authFail(400, 'Authenticated profile required');
    }

    const preferred =
      (typeof parsed.data?.sessionId === 'string' && parsed.data.sessionId) ||
      (typeof parsed.data?.activeSessionId === 'string' && parsed.data.activeSessionId) ||
      null;

    const claimed = await claimExclusiveSessionAdmin(profileId, preferred);
    if (!claimed.success || !claimed.sessionId) {
      return authFail(500, claimed.error || 'Failed to claim exclusive session');
    }

    return authJson({ success: true, activeSessionId: claimed.sessionId });
  } catch (err: unknown) {
    console.error('[next /api/auth/claim-session]', err);
    return authFail(500, safeClientError(err, 'Failed to claim session'));
  }
}
