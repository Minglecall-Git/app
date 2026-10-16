import { NextRequest } from 'next/server';
import {
  adminTlInvitePublicPayload,
  createAdminTlInvite,
  listAdminTlInviteManagementRows,
} from '../../../../lib/adminTlInviteTokens';
import { createServiceClient, jsonErr, jsonOk, requireAdmin } from '../../../../lib/nextAuth';
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

/** GET — list all Admin → Team Leader invite links. */
export async function GET(req: NextRequest) {
  try {
    const auth = await requireAdmin(req);
    if (!auth.ok) return jsonErr(auth.status, auth.error.message, auth.error.code);

    const client = createServiceClient();
    if (!client) return jsonErr(503, 'Supabase not configured', 'NO_SUPABASE');

    const base = appBaseUrl(req);
    const rows = await listAdminTlInviteManagementRows(client, base);

    return jsonOk({
      success: true,
      data: {
        invites: rows.map((r) => ({
          id: r.id,
          token: r.token,
          inviteUrl: r.inviteUrl,
          targetRole: r.target_role,
          inviteType: r.invite_type,
          status: r.status,
          signupStatus: r.signupStatus,
          isUsed: r.is_used,
          usedByUserId: r.used_by_user_id,
          usedByName: r.usedByName,
          usedByEmail: r.usedByEmail,
          createdByAdminId: r.created_by_admin_id,
          createdByName: r.createdByName,
          createdByEmail: r.createdByEmail,
          expiresAt: r.expires_at,
          createdAt: r.created_at || null,
        })),
      },
    });
  } catch (err: unknown) {
    console.error('[next /api/admin/tl-invites GET]', err);
    return jsonErr(500, (err as Error)?.message || 'Failed to load TL invites', 'SERVER_ERROR');
  }
}

/** POST — generate a fresh single-use Team Leader invite link (admin only). */
export async function POST(req: NextRequest) {
  try {
    const auth = await requireAdmin(req);
    if (!auth.ok) return jsonErr(auth.status, auth.error.message, auth.error.code);

    const client = createServiceClient();
    if (!client) return jsonErr(503, 'Supabase not configured', 'NO_SUPABASE');

    const parsed = await parseJsonBody<{ expiresInDays?: number }>(req);
    const body = parsed.ok ? parsed.data || {} : {};

    const result = await createAdminTlInvite(client, auth.profileId, {
      expiresInDays: body.expiresInDays,
    });

    if (!result.success) {
      return jsonErr(500, result.error || 'Failed to generate TL invite', 'INVITE_GENERATE_FAILED');
    }

    return jsonOk({
      success: true,
      data: adminTlInvitePublicPayload(result.row, appBaseUrl(req)),
    });
  } catch (err: unknown) {
    console.error('[next /api/admin/tl-invites POST]', err);
    return jsonErr(500, (err as Error)?.message || 'Failed to generate TL invite', 'SERVER_ERROR');
  }
}
