/**
 * Admin queue for soft-closed accounts (closed_pending_payout / deactivated).
 * Reopen restores login; Mark deactivated completes payout review.
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Loader2,
  RefreshCw,
  RotateCcw,
  UserX,
  Wallet,
} from 'lucide-react';
import { useApp } from '../../../context/AppContext';
import { authFetch } from '../../../utils/apiClient';

export type ClosedAccountRow = {
  id: string;
  name: string;
  email: string | null;
  role: string;
  accountStatus: 'closed_pending_payout' | 'deactivated' | string;
  earningsCoins: number;
  coinBalance: number;
  closedAt: string | null;
  closedReason: string | null;
  closedById: string | null;
  teamLeaderId: string | null;
  agencyName: string | null;
  unpaid?: {
    earningsCoins: number;
    pendingSettlementLines: number;
    pendingSettlementBatches: number;
  };
  pendingSettlementLines: number;
  pendingSettlementBatches: number;
};

type FilterStatus = 'all' | 'closed_pending_payout' | 'deactivated';

function formatWhen(iso: string | null | undefined) {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return String(iso);
  }
}

function statusBadge(status: string) {
  if (status === 'closed_pending_payout') {
    return (
      <span className="px-2 py-0.5 rounded-lg text-[10px] font-bold uppercase tracking-wide bg-amber-500/15 text-amber-300 border border-amber-500/30">
        Pending payout
      </span>
    );
  }
  if (status === 'deactivated') {
    return (
      <span className="px-2 py-0.5 rounded-lg text-[10px] font-bold uppercase tracking-wide bg-slate-500/20 text-slate-300 border border-slate-600/50">
        Deactivated
      </span>
    );
  }
  return (
    <span className="px-2 py-0.5 rounded-lg text-[10px] font-bold uppercase tracking-wide bg-slate-800 text-slate-400">
      {status}
    </span>
  );
}

export const AdminClosedAccountsQueue: React.FC = () => {
  const { showToast } = useApp();
  const [filter, setFilter] = useState<FilterStatus>('all');
  const [loading, setLoading] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [accounts, setAccounts] = useState<ClosedAccountRow[]>([]);
  const [counts, setCounts] = useState({
    total: 0,
    closedPendingPayout: 0,
    deactivated: 0,
  });

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const qs = filter === 'all' ? '' : `?status=${encodeURIComponent(filter)}`;
      const res = await authFetch(`/api/admin/closed-accounts${qs}`);
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.success) {
        const msg =
          (typeof data?.error === 'string' && data.error) ||
          data?.error?.message ||
          'Failed to load closed accounts';
        setError(msg);
        setAccounts([]);
        return;
      }
      setAccounts(data?.data?.accounts || []);
      setCounts(
        data?.data?.counts || {
          total: 0,
          closedPendingPayout: 0,
          deactivated: 0,
        }
      );
    } catch (e: any) {
      setError(e?.message || 'Network error');
      setAccounts([]);
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => {
    void load();
  }, [load]);

  const pendingFirst = useMemo(() => accounts, [accounts]);

  const reopen = async (row: ClosedAccountRow) => {
    const ok = window.confirm(
      `Reopen ${row.name}? They will be able to log in again and appear in discovery.`
    );
    if (!ok) return;
    setBusyId(row.id);
    try {
      const res = await authFetch('/api/admin/closed-accounts/reopen', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: row.id }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.success) {
        showToast(
          'Reopen failed',
          (typeof data?.error === 'string' && data.error) ||
            data?.error?.message ||
            'Could not reopen account',
          'error'
        );
        return;
      }
      const warn = Array.isArray(data?.data?.warnings) ? data.data.warnings.length : 0;
      showToast(
        'Account reopened',
        data?.message ||
          `${row.name} is active again.${warn ? ` (${warn} warning(s))` : ''}`,
        warn ? 'info' : 'success'
      );
      await load();
    } catch (e: any) {
      showToast('Reopen failed', e?.message || 'Network error', 'error');
    } finally {
      setBusyId(null);
    }
  };

  const markDeactivated = async (row: ClosedAccountRow) => {
    const unpaidHint =
      row.earningsCoins > 0 || row.pendingSettlementLines > 0
        ? `\n\nWarning: still shows earnings ${row.earningsCoins} 🪙 and ${row.pendingSettlementLines} pending settlement line(s).`
        : '';
    const ok = window.confirm(
      `Mark ${row.name} as deactivated after final payout review? Login stays disabled; financial records are kept.${unpaidHint}`
    );
    if (!ok) return;
    setBusyId(row.id);
    try {
      const res = await authFetch('/api/admin/closed-accounts/mark-deactivated', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: row.id,
          note: 'Final payout review complete (admin)',
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.success) {
        showToast(
          'Update failed',
          (typeof data?.error === 'string' && data.error) ||
            data?.error?.message ||
            'Could not mark deactivated',
          'error'
        );
        return;
      }
      showToast('Marked deactivated', data?.message || `${row.name} deactivated.`, 'success');
      await load();
    } catch (e: any) {
      showToast('Update failed', e?.message || 'Network error', 'error');
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-bold text-white flex items-center gap-2">
            <UserX className="w-4 h-4 text-amber-400" />
            Closed accounts queue
          </h3>
          <p className="text-[11px] text-slate-500 mt-0.5 max-w-2xl">
            Soft-closed hosts and users with financial history. Process final payouts for{' '}
            <span className="text-amber-300/90">Pending payout</span>, then mark deactivated.
            Reopen restores login when appropriate.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          disabled={loading}
          className="px-3 py-2 rounded-xl text-xs font-bold bg-slate-800 text-slate-200 hover:bg-slate-700 border border-slate-700 flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
        >
          {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
          Refresh
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="p-4 bg-slate-900 border border-slate-800 rounded-2xl">
          <div className="text-[10px] uppercase tracking-wider text-slate-500 font-bold">Total closed</div>
          <div className="text-xl font-black text-white mt-1">{counts.total}</div>
        </div>
        <div className="p-4 bg-slate-900 border border-amber-900/40 rounded-2xl">
          <div className="text-[10px] uppercase tracking-wider text-amber-500/80 font-bold">
            Pending payout
          </div>
          <div className="text-xl font-black text-amber-300 mt-1">{counts.closedPendingPayout}</div>
        </div>
        <div className="p-4 bg-slate-900 border border-slate-800 rounded-2xl">
          <div className="text-[10px] uppercase tracking-wider text-slate-500 font-bold">Deactivated</div>
          <div className="text-xl font-black text-slate-200 mt-1">{counts.deactivated}</div>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {(
          [
            ['all', 'All'],
            ['closed_pending_payout', 'Pending payout'],
            ['deactivated', 'Deactivated'],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => setFilter(id)}
            className={`px-3 py-1.5 rounded-xl text-[11px] font-bold cursor-pointer border transition-all ${
              filter === id
                ? 'bg-emerald-600 text-white border-emerald-500'
                : 'bg-slate-900 text-slate-400 border-slate-800 hover:text-white'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {error && (
        <div className="flex items-start gap-2 p-3 rounded-xl bg-rose-950/40 border border-rose-800/50 text-rose-200 text-xs">
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      {loading && accounts.length === 0 ? (
        <div className="flex items-center justify-center gap-2 py-16 text-slate-500 text-sm">
          <Loader2 className="w-5 h-5 animate-spin" />
          Loading closed accounts…
        </div>
      ) : pendingFirst.length === 0 ? (
        <div className="py-14 text-center text-slate-500 text-sm border border-dashed border-slate-800 rounded-2xl">
          <CheckCircle2 className="w-8 h-8 mx-auto mb-2 text-emerald-600/70" />
          No soft-closed accounts in this filter.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-slate-800">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-900/90 text-[10px] uppercase tracking-wider text-slate-500">
              <tr>
                <th className="px-3 py-2.5 font-bold">User</th>
                <th className="px-3 py-2.5 font-bold">Status</th>
                <th className="px-3 py-2.5 font-bold">Earnings</th>
                <th className="px-3 py-2.5 font-bold">Settlements</th>
                <th className="px-3 py-2.5 font-bold">Closed</th>
                <th className="px-3 py-2.5 font-bold text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/80">
              {pendingFirst.map((row) => {
                const busy = busyId === row.id;
                return (
                  <tr key={row.id} className="bg-[#0d1018] hover:bg-slate-900/60">
                    <td className="px-3 py-3 align-top">
                      <div className="font-bold text-white">{row.name}</div>
                      <div className="text-[10px] text-slate-500 font-mono mt-0.5 truncate max-w-[220px]">
                        {row.email || row.id}
                      </div>
                      <div className="text-[10px] text-slate-600 mt-0.5">
                        {row.role}
                        {row.agencyName ? ` · ${row.agencyName}` : ''}
                      </div>
                    </td>
                    <td className="px-3 py-3 align-top">{statusBadge(row.accountStatus)}</td>
                    <td className="px-3 py-3 align-top">
                      <div className="text-emerald-300 font-mono font-bold">
                        {(row.earningsCoins || 0).toLocaleString()} 🪙
                      </div>
                      <div className="text-[10px] text-slate-500 mt-0.5">
                        wallet {(row.coinBalance || 0).toLocaleString()}
                      </div>
                    </td>
                    <td className="px-3 py-3 align-top">
                      <div className="flex items-center gap-1 text-slate-300">
                        <Wallet className="w-3 h-3 text-slate-500" />
                        <span className="font-mono">
                          {row.pendingSettlementLines} line
                          {row.pendingSettlementLines === 1 ? '' : 's'}
                        </span>
                      </div>
                      <div className="text-[10px] text-slate-500 mt-0.5 font-mono">
                        {row.pendingSettlementBatches} open batch
                        {row.pendingSettlementBatches === 1 ? '' : 'es'}
                      </div>
                    </td>
                    <td className="px-3 py-3 align-top">
                      <div className="text-slate-300">{formatWhen(row.closedAt)}</div>
                      {row.closedReason ? (
                        <div className="text-[10px] text-slate-500 mt-1 max-w-[200px] line-clamp-2">
                          {row.closedReason}
                        </div>
                      ) : null}
                    </td>
                    <td className="px-3 py-3 align-top">
                      <div className="flex flex-wrap justify-end gap-1.5">
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => void reopen(row)}
                          className="px-2.5 py-1.5 rounded-lg text-[10px] font-bold bg-emerald-600/90 hover:bg-emerald-500 text-white flex items-center gap-1 cursor-pointer disabled:opacity-50"
                        >
                          {busy ? (
                            <Loader2 className="w-3 h-3 animate-spin" />
                          ) : (
                            <RotateCcw className="w-3 h-3" />
                          )}
                          Reopen
                        </button>
                        {row.accountStatus === 'closed_pending_payout' ? (
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => void markDeactivated(row)}
                            className="px-2.5 py-1.5 rounded-lg text-[10px] font-bold bg-slate-700 hover:bg-slate-600 text-slate-100 flex items-center gap-1 cursor-pointer disabled:opacity-50"
                          >
                            <CheckCircle2 className="w-3 h-3" />
                            Mark paid / deactivated
                          </button>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <p className="text-[10px] text-slate-600 leading-relaxed">
        Tip: use <span className="text-slate-400">Salary reconcile</span> to remit open settlement
        batches for a closed host, then mark them deactivated here. Hard-wiped accounts (zero
        finance) do not appear in this queue.
      </p>
    </div>
  );
};
