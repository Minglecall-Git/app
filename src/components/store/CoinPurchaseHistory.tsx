/**
 * End-user coin purchase history — Profile Wallet.
 * Loads from GET /api/v1/finance/funding/mine (own rows only).
 */

import React, { useCallback, useEffect, useState } from 'react';
import { CheckCircle2, Clock, Loader2, RefreshCw, XCircle, Coins } from 'lucide-react';
import { fetchMyFunding, type CoinPurchaseRow } from '../../services/financeApi';

function statusMeta(status: string): {
  label: string;
  hint: string;
  className: string;
  Icon: typeof CheckCircle2;
} {
  const s = String(status || '').toLowerCase();
  if (s === 'completed') {
    return {
      label: 'Credited',
      hint: 'Coins added to your wallet',
      className: 'text-emerald-400 bg-emerald-950/40 border-emerald-800/60',
      Icon: CheckCircle2,
    };
  }
  if (s === 'pending') {
    return {
      label: 'Pending',
      hint: 'Payment in progress — coins credit after confirmation',
      className: 'text-amber-300 bg-amber-950/40 border-amber-800/60',
      Icon: Clock,
    };
  }
  if (s === 'failed') {
    return {
      label: 'Failed',
      hint: 'Not charged / not credited',
      className: 'text-rose-300 bg-rose-950/40 border-rose-800/60',
      Icon: XCircle,
    };
  }
  if (s === 'refunded') {
    return {
      label: 'Refunded',
      hint: 'Purchase reversed',
      className: 'text-slate-300 bg-slate-900 border-slate-700',
      Icon: XCircle,
    };
  }
  return {
    label: status || 'Unknown',
    hint: '',
    className: 'text-app-muted bg-app-input border-hairline',
    Icon: Clock,
  };
}

function formatWhen(iso: string | null | undefined) {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString(undefined, {
      dateStyle: 'medium',
      timeStyle: 'short',
    });
  } catch {
    return String(iso);
  }
}

function channelLabel(row: CoinPurchaseRow) {
  if (row.channel === 'ADMIN_MANUAL') return 'Admin credit';
  const provider = String(row.paymentProvider || '').trim();
  if (provider) return `Paid · ${provider}`;
  return 'Store purchase';
}

export const CoinPurchaseHistory: React.FC<{ className?: string }> = ({ className }) => {
  const [rows, setRows] = useState<CoinPurchaseRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const res = await fetchMyFunding({ limit: 40, offset: 0 });
    setLoading(false);
    if (!res.success || !res.data) {
      setError(res.error?.message || 'Could not load purchase history');
      setRows([]);
      return;
    }
    setRows(res.data.purchases || []);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className={`space-y-3 ${className || ''}`}>
      <div className="flex items-center justify-between gap-2">
        <div>
          <h3 className="text-xs font-bold text-app-heading font-mono uppercase tracking-wider flex items-center gap-1.5">
            <Coins className="w-3.5 h-3.5 text-amber-400" />
            Coin purchase history
          </h3>
          <p className="text-[10px] text-app-muted mt-0.5">
            Shows whether payment succeeded and coins were credited to your wallet.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          disabled={loading}
          className="p-1.5 rounded-lg border border-hairline text-app-muted hover:text-app-heading cursor-pointer disabled:opacity-50"
          title="Refresh"
        >
          {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
        </button>
      </div>

      {error ? (
        <div className="text-xs text-rose-300 border border-rose-900/50 rounded-xl px-3 py-2">{error}</div>
      ) : null}

      {loading && rows.length === 0 ? (
        <div className="flex items-center gap-2 text-xs text-app-muted py-4 justify-center">
          <Loader2 className="w-3.5 h-3.5 animate-spin" />
          Loading purchases…
        </div>
      ) : null}

      {!loading && rows.length === 0 && !error ? (
        <div className="border border-dashed border-hairline rounded-xl px-3 py-6 text-center text-xs text-app-muted">
          No coin purchases yet. Top up to see history here.
        </div>
      ) : null}

      <div className="space-y-2 max-h-[320px] overflow-y-auto overscroll-contain pr-0.5">
        {rows.map((row) => {
          const meta = statusMeta(row.status);
          const Icon = meta.Icon;
          const credited = String(row.status).toLowerCase() === 'completed' && Boolean(row.walletLedgerId);
          return (
            <div
              key={row.id}
              className="p-3 rounded-xl border border-hairline bg-app-input flex items-start justify-between gap-3"
            >
              <div className="min-w-0 space-y-1">
                <div className="flex flex-wrap items-center gap-1.5">
                  <span
                    className={`inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-md border ${meta.className}`}
                  >
                    <Icon className="w-3 h-3" />
                    {meta.label}
                  </span>
                  {credited ? (
                    <span className="text-[10px] text-emerald-400/90 font-semibold">Wallet updated</span>
                  ) : null}
                </div>
                <div className="text-sm font-bold text-app-heading truncate">
                  +{(Number(row.amountCoins) || 0).toLocaleString()} coins
                </div>
                <div className="text-[10px] text-app-muted font-mono truncate">
                  {channelLabel(row)}
                  {row.amountUsd != null && Number.isFinite(Number(row.amountUsd))
                    ? ` · $${Number(row.amountUsd).toFixed(2)}`
                    : ''}
                </div>
                {meta.hint ? <div className="text-[10px] text-app-muted">{meta.hint}</div> : null}
                {row.reason ? (
                  <div className="text-[10px] text-app-muted/80 truncate">{row.reason}</div>
                ) : null}
              </div>
              <div className="text-right shrink-0 space-y-0.5">
                <div className="text-[10px] text-app-muted font-mono whitespace-nowrap">
                  {formatWhen(row.completedAt || row.createdAt)}
                </div>
                {row.externalRef ? (
                  <div className="text-[9px] text-app-muted/70 font-mono max-w-[120px] truncate" title={row.externalRef}>
                    {row.externalRef}
                  </div>
                ) : null}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
