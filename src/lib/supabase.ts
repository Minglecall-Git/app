import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { Database } from '../types/database.types';

/**
 * Next inlines only a direct `process.env.NEXT_PUBLIC_*` read.
 * next.config maps publishable (and temporary anon fallbacks) into
 * NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY / NEXT_PUBLIC_SUPABASE_ANON_KEY.
 */
function readInlinedPublic(value: string | undefined): string {
  return String(value || '')
    .trim()
    .replace(/^["']|["']$/g, '');
}

const CLIENT_SUPABASE_OVERRIDE_KEY = 'minglecall_supabase_client_override';

type ClientOverride = { url: string; publishableKey: string };

function isValidHttpUrl(value: string): boolean {
  try {
    const u = new URL(String(value || '').trim().replace(/^["']|["']$/g, ''));
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch {
    return false;
  }
}

function clearClientOverride() {
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.removeItem(CLIENT_SUPABASE_OVERRIDE_KEY);
    }
  } catch {
    /* ignore */
  }
}

function readClientOverride(): ClientOverride | null {
  try {
    if (typeof localStorage === 'undefined') return null;
    const raw = localStorage.getItem(CLIENT_SUPABASE_OVERRIDE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as {
      url?: string;
      publishableKey?: string;
      anonKey?: string;
    };
    const url = String(parsed?.url || '')
      .trim()
      .replace(/^["']|["']$/g, '');
    const publishableKey = String(parsed?.publishableKey || parsed?.anonKey || '')
      .trim()
      .replace(/^["']|["']$/g, '');
    if (
      url &&
      publishableKey &&
      isValidHttpUrl(url) &&
      !url.includes('placeholder') &&
      !publishableKey.startsWith('••••')
    ) {
      return { url, publishableKey };
    }
    // Bad override (e.g. after DB switch) would crash createClient → black page.
    clearClientOverride();
  } catch {
    clearClientOverride();
  }
  return null;
}

function writeClientOverride(url: string, publishableKey: string) {
  try {
    if (typeof localStorage === 'undefined') return;
    localStorage.setItem(
      CLIENT_SUPABASE_OVERRIDE_KEY,
      JSON.stringify({ url: url.trim(), publishableKey: publishableKey.trim() })
    );
  } catch {
    /* ignore */
  }
}

const envUrl = readInlinedPublic(process.env.NEXT_PUBLIC_SUPABASE_URL);
const envPublishableKey = readInlinedPublic(
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

function isEnvSupabaseConfigured(url: string, publishableKey: string): boolean {
  return Boolean(
    url &&
      publishableKey &&
      isValidHttpUrl(url) &&
      !url.includes('placeholder') &&
      !url.includes('your-project-ref') &&
      !publishableKey.startsWith('••••')
  );
}

/**
 * Prefer inlined NEXT_PUBLIC_ values.
 * localStorage override only fills gaps when env is missing — prevents localhost
 * from silently using a different Supabase project than production.
 */
function resolveClientConfig(): { url: string; publishableKey: string } {
  const override = readClientOverride();
  const envReady = isEnvSupabaseConfigured(envUrl, envPublishableKey);

  if (envReady) {
    if (
      override &&
      (override.url !== envUrl || override.publishableKey !== envPublishableKey)
    ) {
      clearClientOverride();
      try {
        console.info(
          '[supabase] Cleared stale localStorage override; using NEXT_PUBLIC_SUPABASE_* from env.'
        );
      } catch {
        /* ignore */
      }
    }
    return { url: envUrl, publishableKey: envPublishableKey };
  }

  if (override) {
    return { url: override.url, publishableKey: override.publishableKey };
  }

  return { url: envUrl, publishableKey: envPublishableKey };
}

const resolved = resolveClientConfig();
let supabaseUrl = resolved.url;
let supabasePublishableKey = resolved.publishableKey;

// Fallback placeholder to allow graceful instantiation without crashing
const FALLBACK_URL = 'https://placeholder-project.supabase.co';
const FALLBACK_PUBLISHABLE_KEY = 'sb_publishable_placeholder';

const clientOptions = {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
  realtime: {
    params: {
      eventsPerSecond: 20,
    },
  },
  db: {
    schema: 'public' as const,
  },
};

function safeCreateClient(url: string, key: string): SupabaseClient<Database> {
  const nextUrl = isValidHttpUrl(url) ? url : FALLBACK_URL;
  const nextKey = String(key || '').trim() || FALLBACK_PUBLISHABLE_KEY;
  try {
    return createClient<Database>(nextUrl, nextKey, clientOptions);
  } catch (err) {
    console.warn('[supabase] createClient failed, using placeholder client:', err);
    clearClientOverride();
    supabaseUrl = '';
    supabasePublishableKey = '';
    return createClient<Database>(FALLBACK_URL, FALLBACK_PUBLISHABLE_KEY, clientOptions);
  }
}

if (supabaseUrl && !isValidHttpUrl(supabaseUrl)) {
  clearClientOverride();
  supabaseUrl = isValidHttpUrl(envUrl) ? envUrl : '';
  supabasePublishableKey = supabaseUrl ? envPublishableKey : '';
}

let supabaseClient: SupabaseClient<Database> = safeCreateClient(
  supabaseUrl || FALLBACK_URL,
  supabasePublishableKey || FALLBACK_PUBLISHABLE_KEY
);

/**
 * Proxy so existing `import { supabase }` keeps working after admin reconfigure.
 */
export const supabase: SupabaseClient<Database> = new Proxy({} as SupabaseClient<Database>, {
  get(_target, prop, receiver) {
    const value = Reflect.get(supabaseClient as object, prop, receiver);
    return typeof value === 'function' ? value.bind(supabaseClient) : value;
  },
}) as SupabaseClient<Database>;

export const isSupabaseConfigured = (): boolean => {
  return Boolean(
    supabaseUrl &&
      supabasePublishableKey &&
      !supabaseUrl.includes('placeholder-project') &&
      !supabaseUrl.includes('your-project-ref')
  );
};

/**
 * Hot-swap browser Supabase URL/publishable key (public values only).
 * Persist override to localStorage only when env is missing.
 */
export function reconfigureSupabaseClient(
  url: string,
  publishableKey: string
): { success: boolean; error?: string } {
  const nextUrl = String(url || '')
    .trim()
    .replace(/^["']|["']$/g, '');
  const nextKey = String(publishableKey || '')
    .trim()
    .replace(/^["']|["']$/g, '');
  if (!nextUrl || !nextKey || nextKey.startsWith('••••')) {
    return { success: false, error: 'Supabase URL and publishable key are required.' };
  }
  if (nextUrl.includes('placeholder') || nextUrl.includes('your-project')) {
    return { success: false, error: 'Replace the placeholder Supabase project URL.' };
  }
  let parsed: URL;
  try {
    parsed = new URL(nextUrl);
  } catch {
    return {
      success: false,
      error: 'Invalid supabaseUrl: Must be a valid HTTP or HTTPS URL (e.g. https://xxxx.supabase.co).',
    };
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return {
      success: false,
      error: 'Invalid supabaseUrl: Must be a valid HTTP or HTTPS URL (e.g. https://xxxx.supabase.co).',
    };
  }

  try {
    supabaseUrl = nextUrl;
    supabasePublishableKey = nextKey;
    if (isEnvSupabaseConfigured(envUrl, envPublishableKey)) {
      if (nextUrl !== envUrl || nextKey !== envPublishableKey) {
        clearClientOverride();
      } else {
        writeClientOverride(nextUrl, nextKey);
      }
    } else {
      writeClientOverride(nextUrl, nextKey);
    }
    supabaseClient = safeCreateClient(nextUrl, nextKey);
    return { success: true };
  } catch (err: any) {
    clearClientOverride();
    return { success: false, error: err?.message || 'Failed to reconfigure Supabase client' };
  }
}

export function getSupabaseClientConfig(): {
  url: string;
  publishableKeyConfigured: boolean;
  /** @deprecated use publishableKeyConfigured */
  anonKeyConfigured: boolean;
} {
  const configured = Boolean(
    supabasePublishableKey && !supabasePublishableKey.startsWith('••••')
  );
  return {
    url: supabaseUrl || '',
    publishableKeyConfigured: configured,
    anonKeyConfigured: configured,
  };
}

export async function testSupabaseConnection(): Promise<{
  connected: boolean;
  latencyMs: number;
  message: string;
  configured: boolean;
}> {
  const configured = isSupabaseConfigured();
  if (!configured) {
    return {
      connected: false,
      latencyMs: 0,
      message:
        'Supabase URL or publishable key is missing. Configure NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY.',
      configured: false,
    };
  }

  const startTime = performance.now();
  try {
    const { error, status } = await supabase.from('system_configs').select('id').limit(1);

    const latencyMs = Math.round(performance.now() - startTime);

    if (error && status !== 406 && status !== 0) {
      return {
        connected: false,
        latencyMs,
        message: `Database query returned: ${error.message}`,
        configured: true,
      };
    }

    return {
      connected: true,
      latencyMs,
      message: `Successfully connected to PostgreSQL via Supabase (Ping: ${latencyMs}ms)`,
      configured: true,
    };
  } catch (err: any) {
    return {
      connected: false,
      latencyMs: Math.round(performance.now() - startTime),
      message: err.message || 'Network error connecting to Supabase instance',
      configured: true,
    };
  }
}
