/**
 * Durable OTP storage for Express + Vercel (service-role only).
 */
import { createHash } from 'crypto';
import type { SupabaseClient } from '@supabase/supabase-js';

export function hashOtp(code: string): string {
  return createHash('sha256').update(String(code).trim()).digest('hex');
}

export async function saveOtpDb(
  client: SupabaseClient,
  email: string,
  code: string,
  metadata?: { name?: string; role?: string }
): Promise<void> {
  const cleanEmail = email.trim().toLowerCase();
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();
  const { error } = await client.from('auth_otps').upsert(
    {
      email: cleanEmail,
      code_hash: hashOtp(code),
      name: metadata?.name || null,
      role: metadata?.role || null,
      expires_at: expiresAt,
      attempts: 0,
      updated_at: new Date().toISOString(),
    } as any,
    { onConflict: 'email' }
  );
  if (error) throw new Error(error.message);
}

export async function verifyOtpDb(
  client: SupabaseClient,
  email: string,
  inputCode: string
): Promise<{ success: boolean; error?: string; metadata?: { email: string; name?: string; role?: string } }> {
  const cleanEmail = email.trim().toLowerCase();
  const { data: stored, error } = await client
    .from('auth_otps')
    .select('email, code_hash, name, role, expires_at, attempts')
    .eq('email', cleanEmail)
    .maybeSingle();

  if (error) return { success: false, error: error.message };
  if (!stored) {
    return { success: false, error: 'No active verification code found for this email. Please request a new code.' };
  }

  if (Date.now() > new Date(stored.expires_at).getTime()) {
    await client.from('auth_otps').delete().eq('email', cleanEmail);
    return { success: false, error: 'The verification code has expired. Please request a new one.' };
  }

  const attempts = Number(stored.attempts || 0);
  if (attempts >= 5) {
    await client.from('auth_otps').delete().eq('email', cleanEmail);
    return { success: false, error: 'Too many incorrect attempts. Please request a fresh verification code.' };
  }

  if (stored.code_hash === hashOtp(inputCode)) {
    await client.from('auth_otps').delete().eq('email', cleanEmail);
    return {
      success: true,
      metadata: {
        email: stored.email,
        name: stored.name || undefined,
        role: stored.role || undefined,
      },
    };
  }

  await client
    .from('auth_otps')
    .update({ attempts: attempts + 1, updated_at: new Date().toISOString() } as any)
    .eq('email', cleanEmail);

  return { success: false, error: `Invalid verification code. ${5 - (attempts + 1)} attempt(s) remaining.` };
}

export async function savePendingSignupDb(
  client: SupabaseClient,
  email: string,
  passwordHash: string,
  meta?: { name?: string; role?: string }
): Promise<void> {
  const cleanEmail = email.trim().toLowerCase();
  const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();
  const { error } = await client.from('auth_pending_signups').upsert(
    {
      email: cleanEmail,
      password_hash: passwordHash,
      name: meta?.name || null,
      role: meta?.role || null,
      expires_at: expiresAt,
      updated_at: new Date().toISOString(),
    } as any,
    { onConflict: 'email' }
  );
  if (error) throw new Error(error.message);
}

export async function peekPendingSignupDb(
  client: SupabaseClient,
  email: string
): Promise<{ password_hash: string; name?: string; role?: string } | null> {
  const cleanEmail = email.trim().toLowerCase();
  const { data } = await client
    .from('auth_pending_signups')
    .select('password_hash, name, role, expires_at')
    .eq('email', cleanEmail)
    .maybeSingle();
  if (!data) return null;
  if (Date.now() > new Date(data.expires_at).getTime()) {
    await client.from('auth_pending_signups').delete().eq('email', cleanEmail);
    return null;
  }
  return {
    password_hash: data.password_hash,
    name: data.name || undefined,
    role: data.role || undefined,
  };
}

export async function deletePendingSignupDb(client: SupabaseClient, email: string): Promise<void> {
  const cleanEmail = email.trim().toLowerCase();
  await client.from('auth_pending_signups').delete().eq('email', cleanEmail);
}

/** Peek + delete (legacy). Prefer peek then delete after Auth create succeeds. */
export async function takePendingSignupDb(
  client: SupabaseClient,
  email: string
): Promise<{ password_hash: string; name?: string; role?: string } | null> {
  const pending = await peekPendingSignupDb(client, email);
  if (pending) await deletePendingSignupDb(client, email);
  return pending;
}
