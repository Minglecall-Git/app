/**
 * Supabase API key shapes (publishable / secret) plus temporary legacy JWT compat.
 * Prefer NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY + SUPABASE_SECRET_KEY in env.
 */

export function cleanEnvValue(value: string | undefined | null): string {
  return String(value || '')
    .trim()
    .replace(/^["']|["']$/g, '');
}

function decodeJwtRole(token: string): string | null {
  try {
    const parts = String(token || '').split('.');
    if (parts.length < 2) return null;
    const b64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const json =
      typeof atob === 'function'
        ? atob(b64)
        : Buffer.from(b64, 'base64').toString('utf8');
    const payload = JSON.parse(json);
    return typeof payload?.role === 'string' ? payload.role : null;
  } catch {
    return null;
  }
}

/** True for empty or UI-masked secrets. */
export function isMaskedOrEmptyKey(key: string): boolean {
  const k = cleanEnvValue(key);
  return !k || k.startsWith('••••');
}

/** Public browser key: sb_publishable_… or legacy anon JWT. */
export function isPublicApiKey(key: string): boolean {
  const k = cleanEnvValue(key);
  if (isMaskedOrEmptyKey(k)) return false;
  if (k.startsWith('sb_publishable_')) return true;
  if (k.startsWith('sb_secret_')) return false;
  const role = decodeJwtRole(k);
  if (role === 'anon') return true;
  if (role === 'service_role') return false;
  // Unknown non-empty string: allow as public only if not clearly a secret prefix
  return !k.startsWith('sb_secret_');
}

/** Server admin key: sb_secret_… or legacy service_role JWT. Never publishable/anon. */
export function isServerAdminApiKey(key: string): boolean {
  const k = cleanEnvValue(key);
  if (isMaskedOrEmptyKey(k)) return false;
  if (k.startsWith('sb_secret_')) return true;
  if (k.startsWith('sb_publishable_')) return false;
  return decodeJwtRole(k) === 'service_role';
}

export function resolveSupabaseUrlFromEnv(
  env: NodeJS.ProcessEnv = process.env
): string {
  return cleanEnvValue(
    env.NEXT_PUBLIC_SUPABASE_URL ||
      env.VITE_SUPABASE_URL ||
      env.SUPABASE_URL ||
      ''
  );
}

export function resolvePublishableKeyFromEnv(
  env: NodeJS.ProcessEnv = process.env
): string {
  return cleanEnvValue(
    env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
      env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
      env.VITE_SUPABASE_ANON_KEY ||
      env.SUPABASE_ANON_KEY ||
      ''
  );
}

export function resolveSecretKeyFromEnv(
  env: NodeJS.ProcessEnv = process.env
): string {
  return cleanEnvValue(
    env.SUPABASE_SECRET_KEY || env.SUPABASE_SERVICE_ROLE_KEY || ''
  );
}

export function getSupabaseApiEnv(env: NodeJS.ProcessEnv = process.env): {
  url: string;
  publishableKey: string;
  secretKey: string;
  /** @deprecated use publishableKey */
  anonKey: string;
  /** @deprecated use secretKey */
  serviceKey: string;
} {
  const url = resolveSupabaseUrlFromEnv(env);
  const publishableKey = resolvePublishableKeyFromEnv(env);
  const secretKey = resolveSecretKeyFromEnv(env);
  return {
    url,
    publishableKey,
    secretKey,
    anonKey: publishableKey,
    serviceKey: secretKey,
  };
}
