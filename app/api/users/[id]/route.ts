import { NextRequest } from 'next/server';
import { handleDeleteUserById } from '../../../../lib/handlers/usersAdminNative';
import { toResponse } from '../../../../lib/handlers/handlerResult';
import { getServerRuntime } from '../../../../lib/serverRuntime';
import { jsonErr, requireAdmin } from '../../../../lib/nextAuth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function DELETE(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireAdmin(req);
    if (!auth.ok) { return jsonErr(auth.status, auth.error.message, auth.error.code); }
    const { id } = await ctx.params;
    const runtime = await getServerRuntime();
    return toResponse(
      await handleDeleteUserById(runtime, id, {
        role: 'admin',
        userId: auth.profileId || null,
      })
    );
  } catch (err: any) {
    console.error('[next DELETE /api/users/:id]', err);
    return jsonErr(500, err?.message || 'Failed', 'SERVER_ERROR');
  }
}
