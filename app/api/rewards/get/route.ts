import { NextRequest } from 'next/server';
import { jsonErr, jsonOk, requireAuth } from '../../../../lib/nextAuth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function resolveRewardDay(raw: string): string {
  const trimmed = String(raw || '').trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;
  return new Date().toISOString().slice(0, 10);
}

async function handle(req: NextRequest) {
  try {
    const auth = await requireAuth(req);
    if (!auth.ok) { return jsonErr(auth.status, auth.error.message, auth.error.code); }

    let rewardDay = resolveRewardDay('');
    if (req.method === 'POST') {
      try {
        const body = await req.json();
        rewardDay = resolveRewardDay(String(body?.rewardDay || ''));
      } catch {
        /* ignore */
      }
    } else {
      rewardDay = resolveRewardDay(req.nextUrl.searchParams.get('rewardDay') || '');
    }

    const { ensureUserDailyRewardsRolloverAdmin, mapDailyRewardsRowToRecord } = await import(
      '../../../../server/supabaseAdmin'
    );

    const result = await ensureUserDailyRewardsRolloverAdmin(auth.profileId, rewardDay);
    if (!result.success) {
      return jsonErr(500, result.error || 'Failed to load rewards', 'LOAD_FAILED');
    }

    return jsonOk({
      success: true,
      data: {
        record: mapDailyRewardsRowToRecord(result.data),
        rewardDay,
      },
      runtime: 'next-native',
    });
  } catch (err: any) {
    console.error('[next /api/rewards/get]', err);
    return jsonErr(500, err?.message || 'Server error', 'SERVER_ERROR');
  }
}

export const GET = handle;
export const POST = handle;
