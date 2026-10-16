import { NextRequest } from 'next/server';
import {
  createSingleUseInvite,
  invitePublicPayload,
  listInviteManagementRows,
} from '../../../../lib/agencyInviteTokens';
import { createServiceClient, jsonErr, jsonOk, requireTeamLeader } from '../../../../lib/nextAuth';
import { parseJsonBody } from '../../../../lib/nextRequest';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function appBaseUrl(req: NextRequest): string {
  const env = process.env.NEXT_PUBLIC_APP_URL || process.env.APP_URL || '';
  if (env.trim()) return env.trim().replace(/\/$/, '');
  try {
    return new URL(req.url).origin;
  } catch {
    return '';
  }
}

/**
 * GET — list all invite links for this Team Leader (management table).
 * Query ?latest=1 returns the newest unused active link only (legacy).
 */
export async function GET(req: NextRequest) {
  try {
    const auth = await requireTeamLeader(req);
    if (!auth.ok) return jsonErr(auth.status, auth.error.message, auth.error.code);

    const client = createServiceClient();
    if (!client) return jsonErr(503, 'Supabase not configured', 'NO_SUPABASE');

    const base = appBaseUrl(req);
    const latestOnly = req.nextUrl.searchParams.get('latest') === '1';
    const rows = await listInviteManagementRows(client, auth.profileId, base);

    if (latestOnly) {
      const active = rows.find((r) => r.status === 'active');
      if (!active) {
        return jsonErr(404, 'No active invite link. Generate one first.', 'INVITE_NOT_FOUND');
      }
      return jsonOk({
        success: true,
        data: invitePublicPayload(active, base),
      });
    }

    return jsonOk({
      success: true,
      data: {
        invites: rows.map((r) => ({
          id: r.id,
          token: r.token,
          inviteUrl: r.inviteUrl,
          status: r.status,
          signupStatus: r.signupStatus,
          isUsed: r.is_used,
          usedByUserId: r.used_by_user_id,
          usedByName: r.usedByName,
          usedByEmail: r.usedByEmail,
          expiresAt: r.expires_at,
          createdAt: r.created_at || null,
        })),
      },
    });
  } catch (err: unknown) {
    console.error('[next /api/agency/generate-invite GET]', err);
    return jsonErr(500, (err as Error)?.message || 'Failed to load invites', 'SERVER_ERROR');
  }
}

/** POST — always create a fresh single-use invite token. */
export async function POST(req: NextRequest) {
  try {
    const auth = await requireTeamLeader(req);
    if (!auth.ok) return jsonErr(auth.status, auth.error.message, auth.error.code);

    const client = createServiceClient();
    if (!client) return jsonErr(503, 'Supabase not configured', 'NO_SUPABASE');

    const parsed = await parseJsonBody<{ expiresInDays?: number }>(req);
    const body = parsed.ok ? parsed.data || {} : {};

    const result = await createSingleUseInvite(client, auth.profileId, {
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
