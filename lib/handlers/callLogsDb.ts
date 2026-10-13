import type { SupabaseClient } from '@supabase/supabase-js';

export async function resolveProfileId(client: SupabaseClient, raw: unknown): Promise<string> {
  const id = String(raw || '').trim();
  if (!id) return '';
  const { data: byId } = await client.from('profiles').select('id').eq('id', id).maybeSingle();
  if (byId?.id) return String(byId.id);
  const { data: byAuth } = await client.from('profiles').select('id').eq('auth_id', id).maybeSingle();
  if (byAuth?.id) return String(byAuth.id);
  return '';
}

function stripCallLogUpdatedAt(payload: Record<string, unknown>) {
  const next = { ...payload };
  delete next.updated_at;
  return next;
}

function isMissingUpdatedAtError(error: { message?: string } | null): boolean {
  const msg = String(error?.message || '');
  return /updated_at/i.test(msg) && (/column/i.test(msg) || /schema cache/i.test(msg));
}

export async function upsertCallLog(client: SupabaseClient, payload: Record<string, unknown>) {
  let { error } = await client.from('call_logs').upsert(payload as any, { onConflict: 'id' });
  if (error && isMissingUpdatedAtError(error)) {
    ({ error } = await client
      .from('call_logs')
      .upsert(stripCallLogUpdatedAt(payload) as any, { onConflict: 'id' }));
  }
  return error;
}

export async function updateCallLogs(
  client: SupabaseClient,
  patch: Record<string, unknown>,
  applyFilter: (q: any) => any
) {
  let q = client.from('call_logs').update(patch as any) as any;
  q = applyFilter(q);
  let { error } = await q;
  if (error && isMissingUpdatedAtError(error)) {
    q = client.from('call_logs').update(stripCallLogUpdatedAt(patch) as any) as any;
    q = applyFilter(q);
    ({ error } = await q);
  }
  return error;
}

export function maxCallEconomy(existing: unknown, incoming: unknown): number {
  return Math.max(Number(existing) || 0, Number(incoming) || 0);
}

export function toIsoTimestamp(value: unknown): string | undefined {
  if (value == null || value === '') return undefined;
  if (typeof value === 'number' && Number.isFinite(value)) {
    return new Date(value).toISOString();
  }
  const s = String(value).trim();
  if (!s) return undefined;
  const ms = Date.parse(s);
  if (Number.isFinite(ms)) return new Date(ms).toISOString();
  return undefined;
}

export async function addCallMinuteTotals(
  client: SupabaseClient,
  callId: string,
  addSpent: number,
  addEarned: number,
  durationFloor: number,
  extraPatch: Record<string, unknown>
): Promise<{ error: { message: string } | null; coinsSpent?: number; coinsEarned?: number }> {
  let lastErr: { message: string } | null = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    const { data: row, error: readErr } = await client
      .from('call_logs')
      .select('coins_spent, coins_earned, duration_seconds')
      .eq('id', callId)
      .maybeSingle();
    if (readErr) {
      lastErr = readErr;
      break;
    }
    const baseSpent = Number(row?.coins_spent) || 0;
    const baseEarned = Number(row?.coins_earned) || 0;
    const baseDuration = Number(row?.duration_seconds) || 0;
    const nextSpent = baseSpent + Math.max(0, Number(addSpent) || 0);
    const nextEarned = baseEarned + Math.max(0, Number(addEarned) || 0);
    const nextDuration = Math.max(baseDuration, Math.max(0, Number(durationFloor) || 0));
    const patch = {
      ...extraPatch,
      coins_spent: nextSpent,
      coins_earned: nextEarned,
      duration_seconds: nextDuration,
    };

    const writeOnce = async (body: Record<string, unknown>) => {
      const { data, error } = await client
        .from('call_logs')
        .update(body as any)
        .eq('id', callId)
        .eq('coins_earned', baseEarned)
        .eq('coins_spent', baseSpent)
        .select('coins_spent, coins_earned')
        .maybeSingle();
      return { data, error };
    };

    let { data, error } = await writeOnce(patch);
    if (error && isMissingUpdatedAtError(error)) {
      ({ data, error } = await writeOnce(stripCallLogUpdatedAt(patch)));
    }
    if (error) {
      lastErr = error;
      break;
    }
    if (data) {
      return {
        error: null,
        coinsSpent: Number(data.coins_spent) || nextSpent,
        coinsEarned: Number(data.coins_earned) || nextEarned,
      };
    }
  }
  return { error: lastErr };
}
