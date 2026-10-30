/**
 * Load payment_gateways from DB and resolve provider implementations.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { createPayPalProvider } from './paypal';
import type {
  GatewayMode,
  GatewaySecrets,
  PaymentGatewayProvider,
  PaymentGatewayRow,
} from './types';

function asRecord(v: unknown): Record<string, unknown> {
  if (v && typeof v === 'object' && !Array.isArray(v)) return v as Record<string, unknown>;
  return {};
}

function asSecrets(v: unknown): GatewaySecrets {
  const rec = asRecord(v);
  const out: GatewaySecrets = {};
  for (const [k, val] of Object.entries(rec)) {
    if (val == null) continue;
    out[k] = String(val);
  }
  return out;
}

export function mapGatewayRow(row: Record<string, unknown>): PaymentGatewayRow {
  const modeRaw = String(row.mode || 'sandbox').toLowerCase();
  const mode: GatewayMode = modeRaw === 'live' ? 'live' : 'sandbox';
  return {
    id: String(row.id || ''),
    display_name: String(row.display_name || row.id || ''),
    enabled: row.enabled === true,
    is_active: row.is_active === true,
    mode,
    public_config: asRecord(row.public_config),
    secrets_encrypted: asSecrets(row.secrets_encrypted),
    updated_at: row.updated_at != null ? String(row.updated_at) : null,
    updated_by: row.updated_by != null ? String(row.updated_by) : null,
  };
}

/** Mask secret values for admin API responses — never return raw secrets. */
export function maskSecretValue(value: string | undefined | null): string | null {
  const s = String(value || '');
  if (!s) return null;
  if (s.length <= 4) return '••••';
  return `••••${s.slice(-4)}`;
}

export function maskGatewaySecrets(secrets: GatewaySecrets): Record<string, string | null> {
  const out: Record<string, string | null> = {};
  for (const [k, v] of Object.entries(secrets)) {
    out[k] = maskSecretValue(v);
  }
  return out;
}

export function gatewayHasSecrets(gateway: PaymentGatewayRow): boolean {
  const s = gateway.secrets_encrypted || {};
  const pub = gateway.public_config || {};
  if (gateway.id === 'paypal') {
    const clientId = String(s.client_id || pub.client_id || process.env.PAYPAL_CLIENT_ID || '').trim();
    const clientSecret = String(s.client_secret || process.env.PAYPAL_CLIENT_SECRET || '').trim();
    return Boolean(clientId && clientSecret);
  }
  return Object.values(s).some((v) => Boolean(String(v || '').trim()));
}

export async function listPaymentGateways(
  client: SupabaseClient
): Promise<{ success: boolean; gateways?: PaymentGatewayRow[]; error?: string }> {
  const { data, error } = await client
    .from('payment_gateways')
    .select('*')
    .order('id', { ascending: true });
  if (error) return { success: false, error: error.message };
  return { success: true, gateways: (data || []).map((r) => mapGatewayRow(r as Record<string, unknown>)) };
}

export async function getPaymentGateway(
  client: SupabaseClient,
  id: string
): Promise<{ success: boolean; gateway?: PaymentGatewayRow | null; error?: string }> {
  const gid = String(id || '').trim();
  if (!gid) return { success: false, error: 'gateway id required' };
  const { data, error } = await client.from('payment_gateways').select('*').eq('id', gid).maybeSingle();
  if (error) return { success: false, error: error.message };
  return { success: true, gateway: data ? mapGatewayRow(data as Record<string, unknown>) : null };
}

export async function getActivePaymentGateway(
  client: SupabaseClient
): Promise<{ success: boolean; gateway?: PaymentGatewayRow | null; error?: string }> {
  const { data, error } = await client
    .from('payment_gateways')
    .select('*')
    .eq('is_active', true)
    .maybeSingle();
  if (error) return { success: false, error: error.message };
  return { success: true, gateway: data ? mapGatewayRow(data as Record<string, unknown>) : null };
}

export function resolveProvider(gateway: PaymentGatewayRow): PaymentGatewayProvider | null {
  if (gateway.id === 'paypal') {
    return createPayPalProvider(gateway.mode, gateway.public_config, gateway.secrets_encrypted);
  }
  return null;
}

/** True when a blank / masked placeholder should not overwrite stored secrets. */
export function isMaskedOrEmptySecret(value: unknown): boolean {
  if (value == null) return true;
  const s = String(value).trim();
  if (!s) return true;
  if (s.startsWith('••••')) return true;
  return false;
}

export async function updatePaymentGateway(
  client: SupabaseClient,
  id: string,
  patch: {
    enabled?: boolean;
    mode?: GatewayMode;
    public_config?: Record<string, unknown>;
    secrets?: Record<string, string | undefined | null>;
    updated_by?: string | null;
  }
): Promise<{ success: boolean; gateway?: PaymentGatewayRow; error?: string; code?: string }> {
  const gid = String(id || '').trim();
  if (!gid) return { success: false, error: 'gateway id required', code: 'INVALID_ID' };

  const existing = await getPaymentGateway(client, gid);
  if (!existing.success) return { success: false, error: existing.error, code: 'LOAD_FAILED' };
  if (!existing.gateway) return { success: false, error: 'Gateway not found', code: 'NOT_FOUND' };

  const gw = existing.gateway;
  if (gid === 'stripe' || gw.public_config?.coming_soon === true) {
    // Allow enabling=false / mode only; block pretending Stripe is ready
    if (patch.enabled === true) {
      return { success: false, error: 'Stripe is coming soon', code: 'COMING_SOON' };
    }
  }

  const nextPublic = { ...gw.public_config, ...(patch.public_config || {}) };
  const nextSecrets: GatewaySecrets = { ...gw.secrets_encrypted };

  if (patch.secrets) {
    for (const [k, v] of Object.entries(patch.secrets)) {
      if (isMaskedOrEmptySecret(v)) continue;
      nextSecrets[k] = String(v).trim();
    }
  }

  // Keep client_id mirrored in public_config for PayPal (non-secret)
  if (nextSecrets.client_id) {
    nextPublic.client_id = nextSecrets.client_id;
  }
  if (patch.public_config?.client_id && !isMaskedOrEmptySecret(patch.public_config.client_id)) {
    nextPublic.client_id = String(patch.public_config.client_id).trim();
    nextSecrets.client_id = nextPublic.client_id as string;
  }
  if (patch.public_config?.webhook_id && !isMaskedOrEmptySecret(patch.public_config.webhook_id)) {
    nextPublic.webhook_id = String(patch.public_config.webhook_id).trim();
    nextSecrets.webhook_id = String(nextPublic.webhook_id);
  }

  const updatePayload: Record<string, unknown> = {
    public_config: nextPublic,
    secrets_encrypted: nextSecrets,
    updated_at: new Date().toISOString(),
    updated_by: patch.updated_by ?? gw.updated_by ?? null,
  };
  if (typeof patch.enabled === 'boolean') updatePayload.enabled = patch.enabled;
  if (patch.mode === 'sandbox' || patch.mode === 'live') updatePayload.mode = patch.mode;

  const { data, error } = await client
    .from('payment_gateways')
    .update(updatePayload)
    .eq('id', gid)
    .select('*')
    .single();

  if (error) return { success: false, error: error.message, code: 'UPDATE_FAILED' };
  return { success: true, gateway: mapGatewayRow(data as Record<string, unknown>) };
}

export async function activatePaymentGateway(
  client: SupabaseClient,
  id: string,
  updatedBy?: string | null
): Promise<{ success: boolean; gateway?: PaymentGatewayRow; error?: string; code?: string }> {
  const gid = String(id || '').trim();
  if (!gid) return { success: false, error: 'gateway id required', code: 'INVALID_ID' };

  const existing = await getPaymentGateway(client, gid);
  if (!existing.success) return { success: false, error: existing.error, code: 'LOAD_FAILED' };
  if (!existing.gateway) return { success: false, error: 'Gateway not found', code: 'NOT_FOUND' };

  if (existing.gateway.public_config?.coming_soon === true || gid === 'stripe') {
    return { success: false, error: 'This gateway is coming soon', code: 'COMING_SOON' };
  }
  if (!existing.gateway.enabled) {
    return { success: false, error: 'Enable and configure the gateway before activating', code: 'NOT_ENABLED' };
  }
  if (!gatewayHasSecrets(existing.gateway)) {
    return {
      success: false,
      error: 'Configure API credentials before activating',
      code: 'NOT_CONFIGURED',
    };
  }

  // Deactivate others, then activate target (partial unique index enforces one active)
  const { error: clearErr } = await client
    .from('payment_gateways')
    .update({ is_active: false, updated_at: new Date().toISOString() })
    .eq('is_active', true);
  if (clearErr) return { success: false, error: clearErr.message, code: 'DEACTIVATE_FAILED' };

  const { data, error } = await client
    .from('payment_gateways')
    .update({
      is_active: true,
      updated_at: new Date().toISOString(),
      updated_by: updatedBy ?? null,
    })
    .eq('id', gid)
    .select('*')
    .single();

  if (error) return { success: false, error: error.message, code: 'ACTIVATE_FAILED' };
  return { success: true, gateway: mapGatewayRow(data as Record<string, unknown>) };
}

export function serializeGatewayForAdmin(gateway: PaymentGatewayRow) {
  const configured = gatewayHasSecrets(gateway);
  const comingSoon = gateway.public_config?.coming_soon === true || gateway.id === 'stripe';
  let status: 'active' | 'inactive' | 'not_configured' | 'coming_soon' = 'inactive';
  if (comingSoon) status = 'coming_soon';
  else if (gateway.is_active) status = 'active';
  else if (!configured) status = 'not_configured';

  return {
    id: gateway.id,
    displayName: gateway.display_name,
    enabled: gateway.enabled,
    isActive: gateway.is_active,
    mode: gateway.mode,
    status,
    configured,
    comingSoon,
    publicConfig: {
      client_id: gateway.public_config.client_id
        ? String(gateway.public_config.client_id)
        : gateway.secrets_encrypted.client_id
          ? String(gateway.secrets_encrypted.client_id)
          : null,
      webhook_id: gateway.public_config.webhook_id
        ? String(gateway.public_config.webhook_id)
        : gateway.secrets_encrypted.webhook_id
          ? maskSecretValue(String(gateway.secrets_encrypted.webhook_id))
          : null,
      coming_soon: comingSoon || undefined,
    },
    secrets: maskGatewaySecrets(gateway.secrets_encrypted),
    updatedAt: gateway.updated_at,
    updatedBy: gateway.updated_by,
  };
}
