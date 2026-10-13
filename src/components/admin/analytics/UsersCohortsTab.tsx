import React, { useMemo, useState } from 'react';
import { Eye, Users } from 'lucide-react';
import { UserProfile } from '../../../types';
import {
  AdminAnalyticsFilters,
  UserCohortRow,
  filterUsersByAdminFilters,
  formatCoins,
  formatUsd,
} from '../../../utils/adminAnalytics';
import { RoleBadge } from './RoleBadge';

interface UsersCohortsTabProps {
  rows: UserCohortRow[];
  filters: AdminAnalyticsFilters;
  onInspectUser: (user: UserProfile) => void;
}

export const UsersCohortsTab: React.FC<UsersCohortsTabProps> = ({
  rows,
  filters,
  onInspectUser,
}) => {
  const [sortKey, setSortKey] = useState<'name' | 'spend' | 'earn' | 'minutes'>('spend');

  const filtered = useMemo(() => {
    const list = filterUsersByAdminFilters(rows, filters);
    return [...list].sort((a, b) => {
      if (sortKey === 'name') return a.user.name.localeCompare(b.user.name);
      if (sortKey === 'earn') return b.periodEarnCoins - a.periodEarnCoins;
      if (sortKey === 'minutes') return b.periodMinutes - a.periodMinutes;
      return b.periodSpendCoins - a.periodSpendCoins || b.lifetimeSpendCoins - a.lifetimeSpendCoins;
    });
  }, [rows, filters, sortKey]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Users className="w-4 h-4 text-indigo-400" />
          <h3 className="text-sm font-black text-white font-mono uppercase">
            Users & cohorts ({filtered.length})
          </h3>
        </div>
        <div className="flex items-center gap-1 bg-slate-950 p-1 rounded-xl border border-slate-800 text-[11px] font-mono">
          {(
            [
              ['spend', 'Spend'],
              ['earn', 'Earn'],
              ['minutes', 'Mins'],
              ['name', 'Name'],
            ] as const
          ).map(([k, label]) => (
            <button
              key={k}
              type="button"
              onClick={() => setSortKey(k)}
              className={`px-2.5 py-1 rounded-lg cursor-pointer ${
                sortKey === k ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-white'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="overflow-x-auto rounded-2xl border border-slate-800 bg-[#13161F]">
        <table className="w-full text-left text-xs font-mono min-w-[960px]">
          <thead className="bg-slate-950 text-slate-400 uppercase text-[10px] border-b border-slate-800">
            <tr>
              <th className="py-3 px-3">Identity</th>
              <th className="py-3 px-3">Role</th>
              <th className="py-3 px-3">Country</th>
              <th className="py-3 px-3">Status</th>
              <th className="py-3 px-3">Role metrics</th>
              <th className="py-3 px-3">Period</th>
              <th className="py-3 px-3">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/60">
            {filtered.slice(0, 200).map((row) => (
              <tr key={row.user.id} className="hover:bg-slate-900/40">
                <td className="py-2.5 px-3">
                  <div className="flex items-center gap-2 min-w-0">
                    <img
                      src={row.user.avatarUrl}
                      alt=""
                      className="w-8 h-8 rounded-lg object-cover shrink-0"
                    />
                    <div className="min-w-0">
                      <div className="font-bold text-white font-sans truncate">{row.user.name}</div>
                      <div className="text-[10px] text-slate-500 truncate">{row.user.email || row.user.id}</div>
                    </div>
                  </div>
                </td>
                <td className="py-2.5 px-3">
                  <RoleBadge role={row.role} />
                </td>
                <td className="py-2.5 px-3 text-slate-300">{row.country}</td>
                <td className="py-2.5 px-3">
                  <span
                    className={`inline-flex items-center gap-1 ${
                      row.user.onlineStatus === 'online'
                        ? 'text-emerald-400'
                        : row.user.onlineStatus === 'in_call'
                        ? 'text-indigo-400'
                        : 'text-slate-500'
                    }`}
                  >
                    <span className="w-1.5 h-1.5 rounded-full bg-current" />
                    {row.user.onlineStatus || 'offline'}
                  </span>
                </td>
                <td className="py-2.5 px-3 text-slate-300">
                  {row.role === 'male_user' && (
                    <div>
                      <div>Bal {formatCoins(row.balance)}</div>
                      <div className="text-amber-300">LT spend {formatUsd(row.lifetimeSpendUSD)}</div>
                      <div className="text-slate-500">Last {row.lastActiveLabel}</div>
                    </div>
                  )}
                  {row.role === 'female_creator' && (
                    <div>
                      <div className="text-emerald-400">{formatUsd(row.earningsUSD)} · {formatCoins(row.earningsCoins)}</div>
                      <div>{row.minutes}m · Acc {row.acceptanceRatePercent == null ? '—' : `${row.acceptanceRatePercent}%`}</div>
                      <div className="text-amber-300">{row.agencyName || 'Unmanaged'}</div>
                    </div>
                  )}
                  {row.role === 'female_user' && (
                    <div>
                      <div>Activity only</div>
                      <div className={row.earningEligible ? 'text-emerald-400' : 'text-slate-500'}>
                        Earning: {row.earningEligible ? 'eligible (toggle on)' : 'not eligible'}
                      </div>
                      <div className="text-slate-500">{row.periodCalls} period calls</div>
                    </div>
                  )}
                  {row.role === 'team_leader' && (
                    <div>
                      <div className="text-amber-300">{row.managedHostCount} hosts</div>
                      <div>GMV {formatUsd(row.agencyGmvUSD)}</div>
                      <div className="text-emerald-400">Comm {formatUsd(row.agencyCommissionUSD)}</div>
                    </div>
                  )}
                  {(row.role === 'other' || row.role === 'admin') && <div>—</div>}
                </td>
                <td className="py-2.5 px-3 text-slate-400">
                  <div>Spend {formatCoins(row.periodSpendCoins)}</div>
                  <div>Earn {formatCoins(row.periodEarnCoins)}</div>
                  <div>{row.periodMinutes}m / {row.periodCalls} calls</div>
                </td>
                <td className="py-2.5 px-3">
                  <button
                    type="button"
                    onClick={() => onInspectUser(row.user)}
                    className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 flex items-center gap-1 cursor-pointer"
                  >
                    <Eye className="w-3 h-3 text-indigo-400" /> Inspect
                  </button>
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={7} className="py-10 text-center text-slate-500">
                  No users match the current filters.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {filtered.length > 200 && (
        <p className="text-[10px] text-slate-500 font-mono">Showing first 200 of {filtered.length}. Refine filters to narrow.</p>
      )}
    </div>
  );
};
