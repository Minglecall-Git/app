/**
 * Formal agency_memberships helpers (host ↔ team leader with date audit).
 */
import type { SupabaseClient } from '@supabase/supabase-js';

export type AgencyMembershipRow = {
  id: string;
  host_id: string;
  team_leader_id: string;
  start_date: string;
  end_date: string | null;
  created_at?: string;
  updated_at?: string;
};

/** Active membership = end_date IS NULL or end_date >= today (UTC). */
export async function listActiveHostIdsForLeader(
  client: SupabaseClient,
  teamLeaderId: string
): Promise<string[]> {
  const leaderId = String(teamLeaderId || '').trim();
  if (!leaderId) return [];
  const today = new Date().toISOString().slice(0, 10);
  const { data, error } = await client
    .from('agency_memberships')
    .select('host_id, end_date')
    .eq('team_leader_id', leaderId)
    .or(`end_date.is.null,end_date.gte.${today}`);
  if (error) {
    console.warn('[agencyMemberships] listActiveHostIdsForLeader:', error.message);
    return [];
  }
  return Array.from(
    new Set((data || []).map((r: any) => String(r.host_id || '').trim()).filter(Boolean))
  );
}

export async function isActiveAgencyMember(
  client: SupabaseClient,
  hostId: string,
  teamLeaderId: string
): Promise<boolean> {
  const host = String(hostId || '').trim();
  const leader = String(teamLeaderId || '').trim();
  if (!host || !leader) return false;
  const today = new Date().toISOString().slice(0, 10);
  const { data, error } = await client
    .from('agency_memberships')
    .select('id')
    .eq('host_id', host)
    .eq('team_leader_id', leader)
    .or(`end_date.is.null,end_date.gte.${today}`)
    .limit(1)
    .maybeSingle();
  if (error) {
    console.warn('[agencyMemberships] isActiveAgencyMember:', error.message);
    return false;
  }
  return Boolean(data?.id);
}

/**
 * Ensure an open membership row exists for host→leader (idempotent).
 * Closes any other open memberships for the host first.
 */
export async function ensureActiveAgencyMembership(
  client: SupabaseClient,
  hostId: string,
  teamLeaderId: string,
  actorId?: string | null
): Promise<{ success: boolean; error?: string }> {
  const host = String(hostId || '').trim();
  const leader = String(teamLeaderId || '').trim();
  if (!host || !leader) return { success: false, error: 'hostId and teamLeaderId required' };

  const today = new Date().toISOString().slice(0, 10);
  const nowIso = new Date().toISOString();

  const { error: closeErr } = await client
    .from('agency_memberships')
    .update({ end_date: today, updated_at: nowIso })
    .eq('host_id', host)
    .is('end_date', null)
    .neq('team_leader_id', leader);
  if (closeErr) {
    return { success: false, error: closeErr.message };
  }

  const { data: existing } = await client
    .from('agency_memberships')
    .select('id')
    .eq('host_id', host)
    .eq('team_leader_id', leader)
    .is('end_date', null)
    .maybeSingle();

  if (existing?.id) return { success: true };

  const { error: insErr } = await client.from('agency_memberships').insert({
    host_id: host,
    team_leader_id: leader,
    start_date: today,
    end_date: null,
    created_by_id: actorId || leader,
    updated_at: nowIso,
  });
  if (insErr) return { success: false, error: insErr.message };
  return { success: true };
}
