import type { NextRequest } from 'next/server';
import type { AuthOk } from '../nextAuth';
import type { ServerRuntime } from '../serverRuntime';
import { isR2Configured, testR2Connectivity } from '../../server/r2Storage';
import { isSmtpConfigured } from '../../server/emailService';
import {
  isSupabaseAdminConfigured,
  testSupabaseConnectivity,
  upsertProfileAdmin,
} from '../../server/supabaseAdmin';
import type { UserProfile } from '../../src/types';
import { err, ok, type HandlerResult } from './handlerResult';

/** POST /api/admin/override-earning-rate */
export async function handleOverrideEarningRate(
  ctx: ServerRuntime,
  _auth: AuthOk,
  body: Record<string, unknown>
): Promise<HandlerResult> {
  try {
    const creatorId = String(body.creatorId || '').trim();
    const rate = body.rate;
    if (!creatorId) {
      return err(400, { success: false, error: 'creatorId is required' });
    }

    const existing = ctx.serverUsers.get(creatorId);
    if (!existing) {
      return err(404, { success: false, error: 'Creator not found' });
    }

    const role = String(existing.role || '');
    if (role !== 'female_creator' && role !== 'female_host') {
      return err(400, {
        success: false,
        error: 'Earning override is only allowed for female creators.',
      });
    }

    const clearOverride = rate === null || rate === undefined || rate === '' || Number(rate) <= 0;
    const numericRate = clearOverride ? null : Math.max(1, Math.round(Number(rate)));

    const updated: UserProfile = {
      ...existing,
      coinEarnOverrideRate: numericRate,
    };
    ctx.serverUsers.set(creatorId, updated);

    if (isSupabaseAdminConfigured()) {
      await upsertProfileAdmin(updated);
    }

    ctx.broadcastAll({
      type: 'users:updated',
      user: updated,
      users: ctx.getFormattedUsers(),
    });

    return ok({ success: true, user: updated, runtime: 'next-native' });
  } catch (e: any) {
    return err(500, { success: false, error: e?.message || 'Failed to override rate' });
  }
}

/** GET /api/admin/api-health */
export async function handleAdminApiHealth(
  ctx: ServerRuntime,
  _req: NextRequest
): Promise<HandlerResult> {
  const started = Date.now();
  const checks: Array<{
    id: string;
    label: string;
    ok: boolean;
    latencyMs?: number;
    detail?: string;
  }> = [];

  const push = (row: (typeof checks)[number]) => checks.push(row);

  push({
    id: 'next-api',
    label: 'Next.js native admin health',
    ok: true,
    latencyMs: 0,
    detail: `uptime ${Math.round(process.uptime())}s · ${ctx.serverUsers.size} users · ${ctx.connectedSockets.length} ws`,
  });

  {
    const t0 = Date.now();
    if (!isSupabaseAdminConfigured()) {
      push({
        id: 'supabase',
        label: 'Supabase (secret key)',
        ok: false,
        detail: 'SUPABASE_SECRET_KEY / URL missing',
      });
    } else {
      try {
        const probe = await testSupabaseConnectivity();
        push({
          id: 'supabase',
          label: 'Supabase (secret key)',
          ok: Boolean(probe.success),
          latencyMs: Date.now() - t0,
          detail: probe.message || 'reachable',
        });
      } catch (e: any) {
        push({
          id: 'supabase',
          label: 'Supabase (secret key)',
          ok: false,
          latencyMs: Date.now() - t0,
          detail: e?.message || 'probe failed',
        });
      }
    }
  }

  {
    const t0 = Date.now();
    if (!isR2Configured()) {
      push({ id: 'r2', label: 'Cloudflare R2', ok: false, detail: 'R2_* env incomplete' });
    } else {
      try {
        const probe = await testR2Connectivity();
        push({
          id: 'r2',
          label: 'Cloudflare R2',
          ok: Boolean(probe.success),
          latencyMs: Date.now() - t0,
          detail: probe.message || 'reachable',
        });
      } catch (e: any) {
        push({
          id: 'r2',
          label: 'Cloudflare R2',
          ok: false,
          latencyMs: Date.now() - t0,
          detail: e?.message || 'probe failed',
        });
      }
    }
  }

  push({
    id: 'livekit',
    label: 'LiveKit credentials',
    ok: Boolean(
      process.env.LIVEKIT_URL && process.env.LIVEKIT_API_KEY && process.env.LIVEKIT_API_SECRET
    ),
    detail: process.env.LIVEKIT_URL
      ? `URL set (${String(process.env.LIVEKIT_URL).slice(0, 48)}…)`
      : 'LIVEKIT_URL / API_KEY / API_SECRET missing',
  });

  push({
    id: 'smtp',
    label: 'SMTP / email OTP',
    ok: isSmtpConfigured(),
    detail: isSmtpConfigured() ? 'configured' : 'SMTP_* / RESEND_API_KEY missing',
  });

  push({
    id: 'websocket',
    label: 'WebSocket /ws signaling',
    ok: true,
    detail: `${ctx.connectedSockets.length} authenticated/connected socket(s)`,
  });

  const allOk = checks.every((c) => c.ok);
  const corsOrigins = String(process.env.CORS_ORIGINS || process.env.VITE_APP_ORIGIN || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  return {
    status: allOk ? 200 : 503,
    body: {
      success: allOk,
      mode: 'next-native',
      timestamp: new Date().toISOString(),
      latencyMs: Date.now() - started,
      checks,
      corsOrigins,
      runtime: 'next-native',
    },
  };
}
