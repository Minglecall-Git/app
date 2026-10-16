import { NextRequest } from 'next/server';
import {
  getActiveInviteForLeader,
  getOrCreateActiveInvite,
  invitePublicPayload,
} from '../../../../lib/agencyInviteTokens';
import { createServiceClient, jsonErr, jsonOk, requireTeamLeader } from '../../../../lib/nextAuth';
import { parseJsonBody } from '../../../../lib/nextRequest';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function appBaseUrl(req: NextRequest): string {
  const env =
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.APP_URL ||
    '';
  if (env.trim()) return env.trim().replace(/\/$/, '');
  try {
    return new URL(req.url).origin;
  } catch {
    return '';
  }
}

/** GET — return current active invite without rotating. */
export async function GET(req: NextRequest) {
  try {
    const auth = await requireTeamLeader(req);
    if (!auth.ok) return jsonErr(auth.status, auth.error.message, auth.error.code);

    const client = createServiceClient();
    if (!client) return jsonErr(503, 'Supabase not configured', 'NO_SUPABASE');

    const row = await getActiveInviteForLeader(client, auth.profileId);
    if (!row) {
      return jsonErr(404, 'No active invite link. Generate one first.', 'INVITE_NOT_FOUND');
    }

    return jsonOk({
      success: true,
      data: invitePublicPayload(row, appBaseUrl(req)),
    });
  } catch (err: unknown) {
    console.error('[next /api/agency/generate-invite GET]', err);
    return jsonErr(500, (err as Error)?.message || 'Failed to load invite', 'SERVER_ERROR');
  }
}

/** POST — get-or-create active invite; regenerate:true issues a new token. */
export async function POST(req: NextRequest) {
  try {
    const auth = await requireTeamLeader(req);
    if (!auth.ok) return jsonErr(auth.status, auth.error.message, auth.error.code);

    const client = createServiceClient();
    if (!client) return jsonErr(503, 'Supabase not configured', 'NO_SUPABASE');

    const parsed = await parseJsonBody<{
      regenerate?: boolean;
      maxUses?: number | null;
      expiresInDays?: number;
    }>(req);

    const body = parsed.ok ? parsed.data || {} : {};
    const result = await getOrCreateActiveInvite(client, auth.profileId, {
      regenerate: Boolean(body.regenerate),
      maxUses: body.maxUses === undefined ? undefined : body.maxUses,
      expiresInDays: body.expiresInDays,
    });

    if (!result.success) {
      return jsonErr(500, result.error || 'Failed to generate invite', 'INVITE_GENERATE_FAILED');
    }

    return jsonOk({
      success: true,
      data: invitePublicPayload(result.row, appBaseUrl(req)),
    });
  } catch (err: unknown) {
    console.error('[next /api/agency/generate-invite POST]', err);
    return jsonErr(500, (err as Error)?.message || 'Failed to generate invite', 'SERVER_ERROR');
  }
}
