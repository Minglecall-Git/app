/**
 * Admin Payment Gateways hub — one Active gateway drives coin checkout.
 * Secrets are write-only from UI (masked after save). Manual credit stays separate.
 */

import React, { useCallback, useEffect, useState } from 'react';
import { Banknote, CheckCircle2, Copy, Loader2, RefreshCw, Settings, X } from 'lucide-react';
import { useApp } from '../../../context/AppContext';
import {
  activatePaymentGateway,
  fetchPaymentGateways,
  patchPaymentGateway,
  type PaymentGatewayAdminRow,
} from '../../../services/financeApi';

function StatusBadge({ status }: { status: PaymentGatewayAdminRow['status'] }) {
  const map: Record<PaymentGatewayAdminRow['status'], { label: string; className: string }> = {
    active: { label: 'Active', className: 'bg-emerald-950 text-emerald-300 border-emerald-800' },
    inactive: { label: 'Inactive', className: 'bg-slate-900 text-slate-400 border-slate-700' },
    not_configured: {
      label: 'Not configured',
      className: 'bg-amber-950 text-amber-300 border-amber-800',
    },
    coming_soon: { label: 'Coming soon', className: 'bg-slate-900 text-slate-500 border-slate-800' },
  };
  const m = map[status] || map.inactive;
  return (
    <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full border ${m.className}`}>
      {m.label}
    </span>
  );
}

export const AdminPaymentGatewaysPanel: React.FC = () => {
  const { showToast } = useApp();
  const [loading, setLoading] = useState(false);
  const [gateways, setGateways] = useState<PaymentGatewayAdminRow[]>([]);
  const [activeName, setActiveName] = useState<string | null>(null);
  const [webhookUrls, setWebhookUrls] = useState<{ paypal: string } | null>(null);
  const [note, setNote] = useState('');
  const [settingsGw, setSettingsGw] = useState<PaymentGatewayAdminRow | null>(null);
  const [clientId, setClientId] = useState('');
  const [clientSecret, setClientSecret] = useState('');
  const [webhookId, setWebhookId] = useState('');
  const [mode, setMode] = useState<'sandbox' | 'live'>('sandbox');
  const [enabled, setEnabled] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetchPaymentGateways();
    setLoading(false);
    if (!res.success || !res.data) {
      showToast('Gateways load failed', res.error?.message || 'Error', 'error');
      return;
    }
    setGateways(res.data.gateways || []);
    setActiveName(res.data.activeGatewayName || null);
    setWebhookUrls(res.data.webhookUrls || null);
    setNote(res.data.note || '');
  }, [showToast]);

  useEffect(() => {
    void load();
  }, [load]);

  const openSettings = (gw: PaymentGatewayAdminRow) => {
    setSettingsGw(gw);
    setClientId(gw.publicConfig?.client_id || '');
    setClientSecret(gw.secrets?.client_secret || '');
    setWebhookId(
      gw.publicConfig?.webhook_id && !String(gw.publicConfig.webhook_id).startsWith('••••')
        ? String(gw.publicConfig.webhook_id)
        : gw.secrets?.webhook_id || ''
    );
    setMode(gw.mode === 'live' ? 'live' : 'sandbox');
    setEnabled(gw.enabled);
  };

  const saveSettings = async () => {
    if (!settingsGw) return;
    setBusy(true);
    const body: {
      enabled: boolean;
      mode: 'sandbox' | 'live';
      clientId?: string;
      clientSecret?: string;
      webhookId?: string;
    } = { enabled, mode };
    if (clientId && !clientId.startsWith('••••')) body.clientId = clientId.trim();
    if (clientSecret && !clientSecret.startsWith('••••')) body.clientSecret = clientSecret.trim();
    if (webhookId && !webhookId.startsWith('••••')) body.webhookId = webhookId.trim();

    const res = await patchPaymentGateway(settingsGw.id, body);
    setBusy(false);
    if (!res.success) {
      showToast('Save failed', res.error?.message || 'Error', 'error');
      return;
    }
    showToast('Gateway saved', `${settingsGw.displayName} settings updated`, 'success');
    setSettingsGw(null);
    void load();
  };

  const onActivate = async (gw: PaymentGatewayAdminRow) => {
    if (gw.comingSoon) return;
    setBusy(true);
    const res = await activatePaymentGateway(gw.id);
    setBusy(false);
    if (!res.success) {
      showToast('Activate failed', res.error?.message || 'Error', 'error');
      return;
    }
    showToast('Gateway activated', `${gw.displayName} is now Active for coin checkout`, 'success');
    void load();
  };

  const copyWebhook = async () => {
    const url = webhookUrls?.paypal;
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      showToast('Copied', 'PayPal webhook URL copied', 'success');
    } catch {
      showToast('Copy failed', url, 'info');
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-sm font-black text-white flex items-center gap-2">
            <Banknote className="w-4 h-4 text-emerald-400" />
            Payment gateways
          </h3>
          <p className="text-[11px] text-slate-500 mt-1 max-w-xl">
            {note ||
              'Coin store uses the Active gateway. Manual coin credit remains available under Users / Funding.'}
          </p>
          <p className="text-[10px] text-slate-400 mt-1 font-mono">
            Active: {activeName || '— none —'}
          </p>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          disabled={loading}
          className="px-3 py-1.5 rounded-lg bg-slate-900 border border-slate-700 text-[11px] font-bold text-slate-200 flex items-center gap-1 cursor-pointer"
        >
          {loading ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
          Refresh
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
        {gateways.map((gw) => {
          const muted = gw.comingSoon;
          return (
            <div
              key={gw.id}
              className={`p-4 rounded-2xl border bg-slate-950 ${
                muted ? 'border-slate-800 opacity-70' : 'border-slate-800'
              } ${gw.isActive ? 'ring-1 ring-emerald-700/60' : ''}`}
            >
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="text-sm font-black text-white">{gw.displayName}</div>
                  <div className="text-[10px] text-slate-500 font-mono mt-0.5">
                    {gw.id} · {gw.mode}
                  </div>
                </div>
                <StatusBadge status={gw.status} />
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={muted || busy}
                  onClick={() => openSettings(gw)}
                  className="px-2.5 py-1 rounded-lg bg-slate-900 border border-slate-700 text-[10px] font-bold text-slate-200 flex items-center gap-1 cursor-pointer disabled:opacity-40"
                >
                  <Settings className="w-3 h-3" />
                  Settings
                </button>
                <button
                  type="button"
                  disabled={muted || busy || gw.isActive}
                  onClick={() => void onActivate(gw)}
                  className="px-2.5 py-1 rounded-lg bg-emerald-950 border border-emerald-800 text-[10px] font-bold text-emerald-200 flex items-center gap-1 cursor-pointer disabled:opacity-40"
                >
                  <CheckCircle2 className="w-3 h-3" />
                  Activate
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {webhookUrls?.paypal ? (
        <div className="bg-[#161922] border border-slate-800 rounded-2xl px-4 py-3">
          <div className="text-[10px] uppercase tracking-wider text-slate-500 font-bold">
            PayPal webhook URL
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <code className="text-[11px] text-cyan-300 font-mono break-all">{webhookUrls.paypal}</code>
            <button
              type="button"
              onClick={() => void copyWebhook()}
              className="px-2 py-1 rounded-lg bg-slate-900 border border-slate-700 text-[10px] font-bold text-slate-200 flex items-center gap-1 cursor-pointer"
            >
              <Copy className="w-3 h-3" />
              Copy
            </button>
          </div>
          <p className="text-[10px] text-slate-500 mt-2">
            Paste this URL in the PayPal Developer Dashboard webhook settings. Store the Webhook ID in Settings.
          </p>
        </div>
      ) : null}

      {settingsGw ? (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/70 p-4">
          <div className="w-full max-w-lg bg-slate-950 border border-slate-800 rounded-2xl shadow-xl">
            <div className="flex items-center justify-between px-4 py-3 border-b border-slate-800">
              <div className="text-sm font-black text-white">{settingsGw.displayName} settings</div>
              <button
                type="button"
                onClick={() => setSettingsGw(null)}
                className="p-1 rounded-lg text-slate-400 hover:text-white cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-4 space-y-3">
              <label className="flex flex-col gap-1">
                <span className="text-[10px] uppercase tracking-wider text-slate-500 font-bold">Mode</span>
                <select
                  value={mode}
                  onChange={(e) => setMode(e.target.value === 'live' ? 'live' : 'sandbox')}
                  className="px-2 py-1.5 rounded-lg bg-slate-900 border border-slate-700 text-[12px] text-slate-200"
                >
                  <option value="sandbox">Sandbox</option>
                  <option value="live">Live</option>
                </select>
              </label>
              <label className="flex items-center gap-2 text-[12px] text-slate-300">
                <input
                  type="checkbox"
                  checked={enabled}
                  onChange={(e) => setEnabled(e.target.checked)}
                  className="rounded border-slate-600"
                />
                Enabled (can configure without being Active)
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-[10px] uppercase tracking-wider text-slate-500 font-bold">
                  Client ID
                </span>
                <input
                  value={clientId}
                  onChange={(e) => setClientId(e.target.value)}
                  placeholder="PayPal client id"
                  className="px-2 py-1.5 rounded-lg bg-slate-900 border border-slate-700 text-[12px] font-mono text-slate-200"
                />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-[10px] uppercase tracking-wider text-slate-500 font-bold">
                  Client Secret
                </span>
                <input
                  type="password"
                  value={clientSecret}
                  onChange={(e) => setClientSecret(e.target.value)}
                  placeholder="Leave blank to keep existing"
                  className="px-2 py-1.5 rounded-lg bg-slate-900 border border-slate-700 text-[12px] font-mono text-slate-200"
                  autoComplete="new-password"
                />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-[10px] uppercase tracking-wider text-slate-500 font-bold">
                  Webhook ID
                </span>
                <input
                  value={webhookId}
                  onChange={(e) => setWebhookId(e.target.value)}
                  placeholder="WH-…"
                  className="px-2 py-1.5 rounded-lg bg-slate-900 border border-slate-700 text-[12px] font-mono text-slate-200"
                />
              </label>
              <p className="text-[10px] text-slate-500">
                Secrets are stored server-side only. After save, values appear masked (••••last4).
              </p>
            </div>
            <div className="px-4 py-3 border-t border-slate-800 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setSettingsGw(null)}
                className="px-3 py-1.5 rounded-lg border border-slate-700 text-[11px] font-bold text-slate-300 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => void saveSettings()}
                className="px-3 py-1.5 rounded-lg bg-emerald-950 border border-emerald-700 text-[11px] font-bold text-emerald-100 cursor-pointer disabled:opacity-50 flex items-center gap-1"
              >
                {busy ? <Loader2 className="w-3 h-3 animate-spin" /> : null}
                Save
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
};
