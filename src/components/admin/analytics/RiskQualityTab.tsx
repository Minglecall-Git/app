import React, { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, Clock, UserX, ShieldAlert, Loader2, Flag } from 'lucide-react';
import { UserProfile } from '../../../types';
import { RiskSignals, formatCoins, formatUsd } from '../../../utils/adminAnalytics';
import { RoleBadge } from './RoleBadge';
import { SystemSettings } from '../../../types';
import { authFetch } from '../../../utils/apiClient';
import { getCoinUsdPeg } from '../../../../shared/finance/fx';

interface RiskQualityTabProps {
  risk: RiskSignals;
  settings: SystemSettings;
  onInspectUser: (user: UserProfile) => void;
}

type ReportStatus = 'pending' | 'investigating' | 'action_taken' | 'dismissed';

interface AdminModerationReport {
  id: string;
  reporter_id: string;
  reported_user_id: string;
  reason: string;
  details: string | null;
  status: ReportStatus;
  created_at: string;
  reporter?: { id: string; name: string | null; avatarUrl: string | null };
  reportedUser?: { id: string; name: string | null; avatarUrl: string | null };
}

function formatReportTime(iso: string): string {
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

export const RiskQualityTab: React.FC<RiskQualityTabProps> = ({
  risk,
  settings,
  onInspectUser,
}) => {
  const coinToUSD = getCoinUsdPeg(settings);
  const [reports, setReports] = useState<AdminModerationReport[]>([]);
  const [statusFilter, setStatusFilter] = useState<ReportStatus | 'all'>('pending');
  const [loadingReports, setLoadingReports] = useState(false);
  const [reportsError, setReportsError] = useState<string | null>(null);
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  const loadReports = useCallback(async () => {
    setLoadingReports(true);
    setReportsError(null);
    try {
      const qs =
        statusFilter === 'all' ? '' : `?status=${encodeURIComponent(statusFilter)}`;
      const res = await authFetch(`/api/v1/admin/reports${qs}`);
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.success) {
        setReportsError(json?.error?.message || 'Failed to load moderation reports.');
        setReports([]);
        return;
      }
      setReports(Array.isArray(json.data?.reports) ? json.data.reports : []);
    } catch (err: any) {
      setReportsError(err?.message || 'Network error loading reports.');
      setReports([]);
    } finally {
      setLoadingReports(false);
    }
  }, [statusFilter]);

  useEffect(() => {
    void loadReports();
  }, [loadReports]);

  const patchReport = async (id: string, status: ReportStatus) => {
    setUpdatingId(id);
    try {
      const res = await authFetch(`/api/v1/admin/reports/${encodeURIComponent(id)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.success) {
        setReportsError(json?.error?.message || 'Failed to update report.');
        return;
      }
      await loadReports();
    } catch (err: any) {
      setReportsError(err?.message || 'Network error updating report.');
    } finally {
      setUpdatingId(null);
    }
  };

  return (
    <div className="space-y-6">
      <div className="p-4 rounded-2xl border border-amber-500/20 bg-amber-500/5 text-xs font-mono text-amber-200/90 flex items-start gap-2">
        <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
        <div>
          Risk & Quality v1 — lightweight signals only. Placeholders shown when source data is missing;
          no fabricated ratings or reports.
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="p-5 bg-[#13161F] border border-slate-800 rounded-3xl space-y-3">
          <h3 className="text-sm font-black text-white font-mono uppercase flex items-center gap-2">
            <UserX className="w-4 h-4 text-rose-400" />
            High decline / low acceptance hosts
          </h3>
          {risk.highDeclineHosts.length === 0 ? (
            <div className="text-xs text-slate-500 font-mono py-6 text-center">No signals in this period.</div>
          ) : (
            <div className="space-y-2">
              {risk.highDeclineHosts.map((item) => (
                <button
                  key={item.user.id}
                  type="button"
                  onClick={() => onInspectUser(item.user)}
                  className="w-full text-left p-3 rounded-xl bg-slate-950 border border-slate-800 hover:border-rose-500/30 cursor-pointer"
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <img src={item.user.avatarUrl} alt="" className="w-8 h-8 rounded-lg object-cover" />
                      <div className="min-w-0">
                        <div className="font-bold text-white text-xs truncate flex items-center gap-2">
                          {item.user.name} <RoleBadge user={item.user} />
                        </div>
                        <div className="text-[10px] font-mono text-slate-500">
                          {item.calls} period calls · {item.declines} miss/decline
                        </div>
                      </div>
                    </div>
                    <div className="text-rose-400 font-mono font-black text-sm">{item.acceptance}%</div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="p-5 bg-[#13161F] border border-slate-800 rounded-3xl space-y-3">
          <h3 className="text-sm font-black text-white font-mono uppercase flex items-center gap-2">
            <ShieldAlert className="w-4 h-4 text-indigo-400" />
            High spend + low balance males
          </h3>
          {risk.churnRiskMales.length === 0 ? (
            <div className="text-xs text-slate-500 font-mono py-6 text-center">No churn-risk males detected.</div>
          ) : (
            <div className="space-y-2">
              {risk.churnRiskMales.map((item) => (
                <button
                  key={item.user.id}
                  type="button"
                  onClick={() => onInspectUser(item.user)}
                  className="w-full text-left p-3 rounded-xl bg-slate-950 border border-slate-800 hover:border-indigo-500/30 cursor-pointer"
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <img src={item.user.avatarUrl} alt="" className="w-8 h-8 rounded-lg object-cover" />
                      <div className="min-w-0">
                        <div className="font-bold text-white text-xs truncate">{item.user.name}</div>
                        <div className="text-[10px] font-mono text-slate-500">
                          Period spend {formatUsd(item.spendCoins * coinToUSD)}
                        </div>
                      </div>
                    </div>
                    <div className="text-amber-300 font-mono text-xs">{formatCoins(item.balance)}</div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="p-5 bg-[#13161F] border border-slate-800 rounded-3xl space-y-3">
        <h3 className="text-sm font-black text-white font-mono uppercase flex items-center gap-2">
          <Clock className="w-4 h-4 text-amber-400" />
          Pending payout aging alerts (7d+)
        </h3>
        {risk.agingPayouts.length === 0 ? (
          <div className="text-xs text-slate-500 font-mono py-4">No payouts aging past 7 days.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs font-mono min-w-[520px]">
              <thead className="text-slate-500 uppercase text-[10px]">
                <tr>
                  <th className="text-left py-2">User</th>
                  <th className="text-left py-2">USD</th>
                  <th className="text-left py-2">Requested</th>
                  <th className="text-left py-2">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {risk.agingPayouts.map((p) => (
                  <tr key={p.id}>
                    <td className="py-2 text-white">{p.userName}</td>
                    <td className="py-2 text-amber-300">{formatUsd(p.amountUSD)}</td>
                    <td className="py-2 text-slate-400">{p.requestDate}</td>
                    <td className="py-2 text-rose-300">{p.status}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="p-5 bg-[#13161F] border border-slate-800 rounded-3xl space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-black text-white font-mono uppercase flex items-center gap-2">
              <Flag className="w-4 h-4 text-rose-400" />
              Moderation reports
            </h3>
            <p className="text-[11px] text-slate-500 font-mono mt-1">
              User-submitted abuse reports from the app. Manual review only — no auto-ban.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as ReportStatus | 'all')}
              className="bg-slate-950 border border-slate-700 rounded-lg text-[11px] font-mono text-slate-200 px-2 py-1.5"
            >
              <option value="pending">Pending</option>
              <option value="investigating">Investigating</option>
              <option value="action_taken">Action taken</option>
              <option value="dismissed">Dismissed</option>
              <option value="all">All</option>
            </select>
            <button
              type="button"
              onClick={() => void loadReports()}
              disabled={loadingReports}
              className="px-2.5 py-1.5 rounded-lg text-[11px] font-mono bg-slate-800 text-slate-200 border border-slate-700 hover:border-slate-500 disabled:opacity-50"
            >
              Refresh
            </button>
          </div>
        </div>

        {reportsError && (
          <div className="text-xs font-mono text-rose-300 bg-rose-500/10 border border-rose-500/20 rounded-xl px-3 py-2">
            {reportsError}
          </div>
        )}

        {loadingReports ? (
          <div className="py-8 flex items-center justify-center gap-2 text-xs text-slate-500 font-mono">
            <Loader2 className="w-4 h-4 animate-spin" />
            Loading reports…
          </div>
        ) : reports.length === 0 ? (
          <div className="py-8 text-center text-xs text-slate-500 font-mono">
            No moderation reports
            {statusFilter === 'all' ? '' : ` with status “${statusFilter}”`} yet.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs font-mono min-w-[720px]">
              <thead>
                <tr className="border-b border-slate-800 text-slate-500 uppercase text-[10px]">
                  <th className="py-2 pr-3">Created</th>
                  <th className="py-2 pr-3">Reporter</th>
                  <th className="py-2 pr-3">Reported</th>
                  <th className="py-2 pr-3">Reason</th>
                  <th className="py-2 pr-3">Status</th>
                  <th className="py-2">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {reports.map((r) => (
                  <tr key={r.id} className="text-slate-300 align-top">
                    <td className="py-2.5 pr-3 text-slate-500 whitespace-nowrap">
                      {formatReportTime(r.created_at)}
                    </td>
                    <td className="py-2.5 pr-3">
                      <div className="text-white font-bold">{r.reporter?.name || r.reporter_id}</div>
                      <div className="text-[10px] text-slate-600 truncate max-w-[120px]">{r.reporter_id}</div>
                    </td>
                    <td className="py-2.5 pr-3">
                      <div className="text-amber-200 font-bold">
                        {r.reportedUser?.name || r.reported_user_id}
                      </div>
                      <div className="text-[10px] text-slate-600 truncate max-w-[120px]">
                        {r.reported_user_id}
                      </div>
                    </td>
                    <td className="py-2.5 pr-3 max-w-[200px]">
                      <div className="text-white">{r.reason}</div>
                      {r.details && (
                        <div className="text-[10px] text-slate-500 mt-0.5 line-clamp-2">{r.details}</div>
                      )}
                    </td>
                    <td className="py-2.5 pr-3 whitespace-nowrap">
                      <span
                        className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                          r.status === 'pending'
                            ? 'bg-amber-500/15 text-amber-300'
                            : r.status === 'investigating'
                              ? 'bg-indigo-500/15 text-indigo-300'
                              : r.status === 'action_taken'
                                ? 'bg-emerald-500/15 text-emerald-300'
                                : 'bg-slate-700/60 text-slate-400'
                        }`}
                      >
                        {r.status}
                      </span>
                    </td>
                    <td className="py-2.5">
                      <div className="flex flex-wrap gap-1">
                        {r.status !== 'investigating' && (
                          <button
                            type="button"
                            disabled={updatingId === r.id}
                            onClick={() => void patchReport(r.id, 'investigating')}
                            className="px-1.5 py-1 rounded bg-indigo-600/80 hover:bg-indigo-500 text-white text-[10px] disabled:opacity-50"
                          >
                            Investigating
                          </button>
                        )}
                        {r.status !== 'dismissed' && (
                          <button
                            type="button"
                            disabled={updatingId === r.id}
                            onClick={() => void patchReport(r.id, 'dismissed')}
                            className="px-1.5 py-1 rounded bg-slate-700 hover:bg-slate-600 text-slate-200 text-[10px] disabled:opacity-50"
                          >
                            Dismiss
                          </button>
                        )}
                        {r.status !== 'action_taken' && (
                          <button
                            type="button"
                            disabled={updatingId === r.id}
                            onClick={() => void patchReport(r.id, 'action_taken')}
                            className="px-1.5 py-1 rounded bg-emerald-700/80 hover:bg-emerald-600 text-white text-[10px] disabled:opacity-50"
                          >
                            Action taken
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
