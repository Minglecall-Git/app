import { NextRequest } from 'next/server';
import { createServiceClient, jsonErr, jsonOk, requireAuth } from '../../../../lib/nextAuth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function isAdminRole(role: string, email?: string): boolean {
  const e = String(email || '').toLowerCase();
  return (
    role === 'admin' ||
    e === 'admin@livecall.app' ||
    e === 'superadmin@minglecall.com' ||
    e === 'sadmin@minglecall.com'
  );
}

/** GET /api/calls/wallet-ledger?userId= — ledger rows (native Next). */
export async function GET(req: NextRequest) {
  try {
    const auth = await requireAuth(req);
    if (!auth.ok) { return jsonErr(auth.status, auth.error.message, auth.error.code); }

    const requestedUserId = req.nextUrl.searchParams.get('userId') || '';
    const targetUserId = requestedUserId || auth.profileId;

    if (targetUserId !== auth.profileId && !isAdminRole(auth.role, auth.email)) {
      return jsonErr(403, 'Forbidden', 'FORBIDDEN');
    }

    const client = createServiceClient();
    if (!client) return jsonOk({ success: true, data: [], runtime: 'next-native' });

    const { data, error } = await client
      .from('wallet_ledger')
      .select('*')
      .eq('user_id', targetUserId)
      .order('created_at', { ascending: false })
      .limit(200);

    if (error) {
      console.error('[next /api/calls/wallet-ledger]', error.message);
      return jsonErr(500, 'Failed to load ledger', 'LEDGER_FETCH_FAILED');
    }

    const rows = (data || []).map((row: any) => ({
      id: row.id,
      userId: row.user_id,
      callId: row.call_id,
      transactionType: row.transaction_type,
      amount: Number(row.amount) || 0,
      balanceAfter: Number(row.balance_after) || 0,
      billingMinute: row.billing_minute,
      metadata: row.metadata || {},
      createdAt: row.created_at,
    }));

    return jsonOk({ success: true, data: rows, runtime: 'next-native' });
  } catch (err: any) {
    console.error('[next /api/calls/wallet-ledger]', err);
    return jsonErr(500, err?.message || 'Ledger fetch failed', 'INTERNAL_ERROR');
  }
}
