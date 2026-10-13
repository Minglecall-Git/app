import { NextRequest } from 'next/server';
import { getPasswordPolicyError } from '../../../../shared/passwordPolicy';
import { createServiceClient, requireAuth } from '../../../../lib/nextAuth';
import { parseJsonBody } from '../../../../lib/nextRequest';
import { authFail, authJson, safeClientError } from '../../../../lib/authHelpers';
import { hashPassword, isSupabaseAdminConfigured, updateUserPasswordAdmin } from '../../../../server/supabaseAdmin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const parsed = await parseJsonBody<{ newPassword?: string; password?: string }>(req);
  if (!parsed.ok) return authFail(parsed.status, parsed.error.message);

  const auth = await requireAuth(req, parsed.data as Record<string, unknown>);
  if (!auth.ok) return authFail(auth.status, auth.error.message);

  try {
    const newPassword = parsed.data?.newPassword ?? parsed.data?.password;
    const policyError = getPasswordPolicyError(newPassword);
    if (policyError) {
      return authFail(400, policyError);
    }

    const userId = auth.profileId;
    const email = auth.email;
    const passwordHash = await hashPassword(String(newPassword));

    const client = createServiceClient();
    if (client && userId) {
      await client
        .from('profiles')
        .update({ password_hash: passwordHash, has_password_set: true } as Record<string, unknown>)
        .eq('id', userId);
    }

    if (client && email) {
      const cleanEmail = String(email).toLowerCase().trim();
      await client
        .from('profiles')
        .update({ password_hash: passwordHash, has_password_set: true } as Record<string, unknown>)
        .ilike('email', cleanEmail);
    }

    if (isSupabaseAdminConfigured()) {
      const adminRes = await updateUserPasswordAdmin(userId, String(newPassword), email);
      if (!adminRes.success) {
        return authFail(500, safeClientError(adminRes.error, 'Failed to update password'));
      }
    }

    return authJson({ success: true, message: 'Password successfully updated and securely hashed.' });
  } catch (err: unknown) {
    console.error('[next /api/auth/update-password]', err);
    return authFail(500, safeClientError(err, 'Failed to update password'));
  }
}
