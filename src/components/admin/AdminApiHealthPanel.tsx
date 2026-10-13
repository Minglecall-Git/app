import React, { useCallback, useEffect, useState } from 'react';
import {
  Activity,
  CheckCircle2,
  XCircle,
  RefreshCw,
  Server,
  Wifi,
  Database,
  HardDrive,
  Video,
  Mail,
  AlertTriangle,
  ExternalLink,
  Copy,
  Check,
} from 'lucide-react';
import { authFetch, apiFetch, getApiBaseUrl, getWsUrl, getDeployModeLabel, isSplitDeploy } from '../../utils/apiClient';
import { isSupabaseConfigured, supabase } from '../../lib/supabase';
import { shouldUseRealtimeSignaling } from '../../services/realtimeSignaling';

type CheckRow = {
  id: string;
  label: string;
  ok: boolean;
  latencyMs?: number | null;
  detail?: string;
  source?: 'client' | 'server';
};

type HealthPayload = {
  success?: boolean;
  ok?: boolean;
  mode?: string;
  status?: string;
  timestamp?: string;
  latencyMs?: number;
  checks?: CheckRow[];
  services?: Record<string, boolean>;
  runtime?: Record<string, unknown>;
  error?: { message?: string; code?: string } | string;
  vercel?: unknown;
  api?: unknown;
  env?: Record<string, boolean>;
};

function StatusDot({ ok, pending }: { ok?: boolean; pending?: boolean }) {
  if (pending) return <span className="inline-block w-2.5 h-2.5 rounded-full bg-slate-500 animate-pulse" />;
  if (ok) return <span className="inline-block w-2.5 h-2.5 rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.6)]" />;
  return <span className="inline-block w-2.5 h-2.5 rounded-full bg-rose-500 shadow-[0_0_8px_rgba(244,63,94,0.5)]" />;
}

async function probeRealtime(timeoutMs = 5000): Promise<CheckRow> {
  const t0 = Date.now();
  if (!isSupabaseConfigured()) {
    return {
      id: 'realtime-client',
      label: 'Supabase Realtime (browser)',
      ok: false,
      latencyMs: Date.now() - t0,
      detail: 'Supabase client not configured (VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY)',
      source: 'client',
    };
  }

  return new Promise((resolve) => {
    let settled = false;
    const channel = supabase.channel(`admin-health-probe-${Date.now()}`);
    const finish = (row: CheckRow) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timer);
      try {
        supabase.removeChannel(channel);
      } catch {
        // ignore
      }
      resolve(row);
    };
    const timer = window.setTimeout(() => {
      finish({
        id: 'realtime-client',
        label: 'Supabase Realtime (browser)',
        ok: false,
        latencyMs: Date.now() - t0,
        detail: 'Timed out subscribing to Realtime channel',
        source: 'client',
      });
    }, timeoutMs);

    try {
      channel.subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          finish({
            id: 'realtime-client',
            label: 'Supabase Realtime (browser)',
            ok: true,
            latencyMs: Date.now() - t0,
            detail: 'Channel subscribed (Broadcast/Presence path for call signaling)',
            source: 'client',
          });
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          finish({
            id: 'realtime-client',
            label: 'Supabase Realtime (browser)',
            ok: false,
            latencyMs: Date.now() - t0,
            detail: `Realtime status: ${status}`,
            source: 'client',
          });
        }
      });
    } catch (e: any) {
      finish({
        id: 'realtime-client',
        label: 'Supabase Realtime (browser)',
        ok: false,
        latencyMs: Date.now() - t0,
        detail: e?.message || 'Realtime subscribe failed',
        source: 'client',
      });
    }
  });
}

async function probeRoute(
  id: string,
  label: string,
  path: string,
  opts?: { auth?: boolean; method?: string }
): Promise<CheckRow> {
  const t0 = Date.now();
  try {
    const res = opts?.auth
      ? await authFetch(path, { method: opts.method || 'GET' })
      : await apiFetch(path, { method: opts?.method || 'GET' });
    const text = await res.text();
    let detail = `HTTP ${res.status}`;
    try {
      const data = JSON.parse(text);
      if (data?.error?.code === 'VERCEL_ROUTE_NOT_IMPLEMENTED') {
        detail = '501 not implemented on Vercel';
      } else if (data?.mode) {
        detail = `mode=${data.mode}`;
      } else if (data?.error?.message) {
        detail = String(data.error.message).slice(0, 120);
      } else if (res.ok) {
        detail = 'OK';
      }
    } catch {
      detail = text.slice(0, 80) || detail;
    }
    // 401/403/400 still prove the serverless handler exists (not 501 catch-all)
    const ok = res.ok || res.status === 401 || res.status === 403 || res.status === 400;
    return {
      id,
      label,
      ok: ok && res.status !== 501,
      latencyMs: Date.now() - t0,
      detail,
      source: 'client',
    };
  } catch (e: any) {
    return {
      id,
      label,
      ok: false,
      latencyMs: Date.now() - t0,
      detail: e?.message || 'unreachable',
      source: 'client',
    };
  }
}

export const AdminApiHealthPanel: React.FC = () => {
  const [running, setRunning] = useState(false);
  const [publicHealth, setPublicHealth] = useState<HealthPayload | null>(null);
  const [adminHealth, setAdminHealth] = useState<HealthPayload | null>(null);
  const [clientChecks, setClientChecks] = useState<CheckRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [lastRunAt, setLastRunAt] = useState<string | null>(null);

  const apiBase = getApiBaseUrl() || '(same-origin)';
  const wsUrl = getWsUrl();
  const mode = getDeployModeLabel();
  const useRealtime = shouldUseRealtimeSignaling();

  const runProbes = useCallback(async () => {
    setRunning(true);
    setError(null);
    const nextClient: CheckRow[] = [];

    // Public /api/health
    {
      const t0 = Date.now();
      try {
        const res = await apiFetch('/api/health', { method: 'GET' });
        const text = await res.text();
        let data: HealthPayload = {};
        try {
          data = JSON.parse(text);
        } catch {
          data = { success: false, error: text.slice(0, 200) };
        }
        setPublicHealth(data);
        const looksLikeHtml = /^\s*</.test(text);
        nextClient.push({
          id: 'public-health',
          label: 'GET /api/health',
          ok: res.ok && !looksLikeHtml && (data.success !== false || data.status === 'ok' || data.ok === true),
          latencyMs: Date.now() - t0,
          detail: looksLikeHtml
            ? 'Got HTML (DNS may still point at parking, not Vercel)'
            : data.mode
              ? `mode=${data.mode} · signaling=${(data as any)?.api?.signaling || 'n/a'}`
              : `HTTP ${res.status}`,
          source: 'client',
        });
      } catch (e: any) {
        setPublicHealth(null);
        nextClient.push({
          id: 'public-health',
          label: 'GET /api/health',
          ok: false,
          latencyMs: Date.now() - t0,
          detail: e?.message || 'Network error — confirm minglecall.com DNS → Vercel',
          source: 'client',
        });
      }
    }

    // Admin deep health (Vercel serverless)
    {
      const t0 = Date.now();
      try {
        const res = await authFetch('/api/admin/api-health', { method: 'GET' });
        const text = await res.text();
        let data: HealthPayload = {};
        try {
          data = JSON.parse(text);
        } catch {
          data = {
            success: false,
            error: text.replace(/\s+/g, ' ').slice(0, 220),
          };
        }
        setAdminHealth(data);
        nextClient.push({
          id: 'admin-health',
          label: 'GET /api/admin/api-health',
          ok: res.ok && data.success !== false,
          latencyMs: Date.now() - t0,
          detail:
            typeof data.error === 'string'
              ? data.error
              : data.error?.message ||
                (Array.isArray(data.checks) ? `${data.checks.length} server checks` : `HTTP ${res.status}`),
          source: 'client',
        });
      } catch (e: any) {
        setAdminHealth(null);
        nextClient.push({
          id: 'admin-health',
          label: 'GET /api/admin/api-health',
          ok: false,
          latencyMs: Date.now() - t0,
          detail: e?.message || 'Failed to reach admin health endpoint',
          source: 'client',
        });
      }
    }

    nextClient.push(await probeRoute('auth-send-otp', 'POST /api/auth/send-otp (exists)', '/api/auth/send-otp', { method: 'POST' }));
    nextClient.push(await probeRoute('users', 'GET /api/users', '/api/users', { auth: true }));
    nextClient.push(await probeRoute('storage-config', 'GET /api/storage/config', '/api/storage/config', { auth: true }));
    nextClient.push(await probeRoute('livekit-config', 'GET /api/livekit/config', '/api/livekit/config', { auth: true }));

    if (useRealtime || !isSplitDeploy()) {
      nextClient.push(await probeRealtime());
    } else {
      // Legacy split-deploy Express WS probe
      const t0 = Date.now();
      nextClient.push(
        await new Promise<CheckRow>((resolve) => {
          let settled = false;
          let ws: WebSocket | null = null;
          const finish = (row: CheckRow) => {
            if (settled) return;
            settled = true;
            try {
              ws?.close();
            } catch {
              // ignore
            }
            resolve(row);
          };
          const timer = window.setTimeout(() => {
            finish({
              id: 'ws-client',
              label: 'WebSocket connect (browser)',
              ok: false,
              latencyMs: Date.now() - t0,
              detail: `Timed out connecting to ${wsUrl}`,
              source: 'client',
            });
          }, 4000);
          try {
            ws = new WebSocket(wsUrl);
            ws.onopen = () => {
              window.clearTimeout(timer);
              finish({
                id: 'ws-client',
                label: 'WebSocket connect (browser)',
                ok: true,
                latencyMs: Date.now() - t0,
                detail: `Opened ${wsUrl}`,
                source: 'client',
              });
            };
            ws.onerror = () => {
              window.clearTimeout(timer);
              finish({
                id: 'ws-client',
                label: 'WebSocket connect (browser)',
                ok: false,
                latencyMs: Date.now() - t0,
                detail: `Failed to open ${wsUrl}`,
                source: 'client',
              });
            };
          } catch (e: any) {
            window.clearTimeout(timer);
            finish({
              id: 'ws-client',
              label: 'WebSocket connect (browser)',
              ok: false,
              latencyMs: Date.now() - t0,
              detail: e?.message || 'WebSocket constructor failed',
              source: 'client',
            });
          }
        })
      );
    }

    setClientChecks(nextClient);
    setLastRunAt(new Date().toLocaleString());
    setRunning(false);

    const criticalIds = ['public-health', 'admin-health', 'livekit-config', 'storage-config'];
    const criticalFailed = nextClient.some((c) => criticalIds.includes(c.id) && !c.ok);
    if (criticalFailed || nextClient.some((c) => !c.ok && c.id === 'realtime-client')) {
      setError(
        'One or more probes failed. Confirm Vercel Production env vars, DNS for minglecall.com → Vercel, and Supabase Realtime enabled.'
      );
    } else {
      setError(null);
    }
  }, [useRealtime, wsUrl]);

  useEffect(() => {
    void runProbes();
  }, [runProbes]);

  const serverChecks: CheckRow[] = Array.isArray(adminHealth?.checks) ? adminHealth!.checks! : [];

  const copySummary = async () => {
    const payload = {
      mode,
      apiBase,
      signaling: useRealtime ? 'supabase-realtime' : `websocket:${wsUrl}`,
      lastRunAt,
      clientChecks,
      publicHealth,
      adminHealth,
    };
    await navigator.clipboard.writeText(JSON.stringify(payload, null, 2));
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 border-b border-slate-800 pb-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <div className="p-2 rounded-xl bg-cyan-500/15 text-cyan-300">
              <Activity className="w-5 h-5" />
            </div>
            <h3 className="text-lg font-bold text-white">API Health</h3>
          </div>
          <p className="text-sm text-slate-400 max-w-2xl">
            Probes same-origin Vercel <code className="text-cyan-400">/api/*</code> and Supabase Realtime signaling
            (no Express <code className="text-slate-500">/ws</code> on production).
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => void copySummary()}
            className="px-3 py-2 rounded-xl bg-slate-800 text-slate-200 text-xs font-semibold hover:bg-slate-700 flex items-center gap-1.5 cursor-pointer"
          >
            {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
            {copied ? 'Copied' : 'Copy report'}
          </button>
          <button
            type="button"
            disabled={running}
            onClick={() => void runProbes()}
            className="px-4 py-2 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-bold flex items-center gap-1.5 disabled:opacity-50 cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${running ? 'animate-spin' : ''}`} />
            {running ? 'Running…' : 'Re-run probes'}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <div className="rounded-2xl border border-slate-800 bg-slate-950/60 p-4">
          <div className="flex items-center gap-2 text-slate-400 text-xs font-semibold uppercase tracking-wide mb-2">
            <Server className="w-3.5 h-3.5 text-cyan-400" /> Deploy mode
          </div>
          <p className="text-white font-semibold text-sm">{mode}</p>
          <p className="text-[11px] text-slate-500 mt-1 font-mono break-all">API: {apiBase}</p>
        </div>
        <div className="rounded-2xl border border-slate-800 bg-slate-950/60 p-4">
          <div className="flex items-center gap-2 text-slate-400 text-xs font-semibold uppercase tracking-wide mb-2">
            <Wifi className="w-3.5 h-3.5 text-amber-400" /> Signaling
          </div>
          <p className="text-white font-semibold text-sm">
            {useRealtime ? 'Supabase Realtime' : 'WebSocket (local/Express)'}
          </p>
          {!useRealtime && (
            <p className="text-[11px] text-slate-500 mt-1 font-mono break-all">{wsUrl}</p>
          )}
        </div>
        <div className="rounded-2xl border border-slate-800 bg-slate-950/60 p-4">
          <div className="flex items-center gap-2 text-slate-400 text-xs font-semibold uppercase tracking-wide mb-2">
            <Activity className="w-3.5 h-3.5 text-emerald-400" /> Last run
          </div>
          <p className="text-white font-semibold text-sm">{lastRunAt || '—'}</p>
          {publicHealth?.mode && (
            <p className="text-[11px] text-slate-500 mt-1">
              Health mode: <span className="text-cyan-300 font-mono">{publicHealth.mode}</span>
            </p>
          )}
        </div>
      </div>

      {error && (
        <div className="flex items-start gap-2 rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
          <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {!isSplitDeploy() && (
        <div className="rounded-xl border border-cyan-500/25 bg-cyan-500/10 px-4 py-3 text-xs text-cyan-100/90 space-y-1">
          <p className="font-semibold text-cyan-200">Vercel-only (recommended)</p>
          <p>
            Leave <code className="text-cyan-300">VITE_API_BASE_URL</code> unset. Point{' '}
            <code className="text-cyan-300">minglecall.com</code> (+ www) DNS to this Vercel project. Set Production
            env: Supabase, R2, LiveKit, SMTP/Resend. Signaling uses Supabase Realtime — not <code>/ws</code>.
          </p>
        </div>
      )}

      <section className="space-y-3">
        <h4 className="text-sm font-bold text-slate-200 flex items-center gap-2">
          <ExternalLink className="w-4 h-4 text-cyan-400" />
          Browser → API probes
        </h4>
        <div className="rounded-2xl border border-slate-800 overflow-hidden">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-900/80 text-slate-400 uppercase tracking-wide">
              <tr>
                <th className="px-4 py-2.5 font-semibold">Check</th>
                <th className="px-4 py-2.5 font-semibold">Status</th>
                <th className="px-4 py-2.5 font-semibold">Latency</th>
                <th className="px-4 py-2.5 font-semibold">Detail</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/80">
              {running && clientChecks.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-4 py-6 text-slate-500 text-center">
                    Running probes…
                  </td>
                </tr>
              )}
              {clientChecks.map((row) => (
                <tr key={row.id} className="bg-slate-950/40">
                  <td className="px-4 py-3 text-slate-200 font-medium">{row.label}</td>
                  <td className="px-4 py-3">
                    <span className="inline-flex items-center gap-2">
                      <StatusDot ok={row.ok} />
                      {row.ok ? (
                        <span className="text-emerald-400 font-semibold">OK</span>
                      ) : (
                        <span className="text-rose-400 font-semibold">FAIL</span>
                      )}
                    </span>
                  </td>
                  <td className="px-4 py-3 font-mono text-slate-400">
                    {row.latencyMs != null ? `${row.latencyMs} ms` : '—'}
                  </td>
                  <td className="px-4 py-3 text-slate-400 break-all">{row.detail || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="space-y-3">
        <h4 className="text-sm font-bold text-slate-200 flex items-center gap-2">
          <Database className="w-4 h-4 text-emerald-400" />
          Server-side integration checks
        </h4>
        {serverChecks.length === 0 ? (
          <div className="rounded-xl border border-slate-800 bg-slate-950/50 px-4 py-4 text-xs text-slate-500">
            No server checks yet. Requires a successful{' '}
            <code className="text-slate-300">/api/admin/api-health</code> response (admin session).
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {serverChecks.map((row) => (
              <div
                key={row.id}
                className={`rounded-2xl border p-4 ${
                  row.ok ? 'border-emerald-500/25 bg-emerald-500/5' : 'border-rose-500/25 bg-rose-500/5'
                }`}
              >
                <div className="flex items-center justify-between gap-2 mb-2">
                  <div className="flex items-center gap-2 text-sm font-semibold text-white">
                    {row.id === 'supabase' && <Database className="w-4 h-4 text-emerald-400" />}
                    {row.id === 'r2' && <HardDrive className="w-4 h-4 text-orange-400" />}
                    {row.id === 'livekit' && <Video className="w-4 h-4 text-indigo-400" />}
                    {row.id === 'smtp' && <Mail className="w-4 h-4 text-pink-400" />}
                    {(row.id === 'signaling' || row.id === 'websocket') && (
                      <Wifi className="w-4 h-4 text-amber-400" />
                    )}
                    {(row.id === 'vercel' || row.id === 'express') && (
                      <Server className="w-4 h-4 text-cyan-400" />
                    )}
                    {row.label}
                  </div>
                  {row.ok ? (
                    <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                  ) : (
                    <XCircle className="w-4 h-4 text-rose-400 shrink-0" />
                  )}
                </div>
                <p className="text-[11px] text-slate-400 break-all">{row.detail || '—'}</p>
                {row.latencyMs != null && (
                  <p className="text-[10px] font-mono text-slate-500 mt-1">{row.latencyMs} ms</p>
                )}
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
};
