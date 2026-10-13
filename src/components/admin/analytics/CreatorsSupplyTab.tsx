import React, { useMemo, useState } from 'react';
import { Award, Eye, Radio, Layers } from 'lucide-react';
import { UserProfile, SystemSettings, CallLogItem } from '../../../types';
import {
  DateRange,
  filterCallLogsByRange,
  isEarningEligibleCreator,
  resolveAdminAnalyticsRole,
  formatCoins,
  formatUsd,
} from '../../../utils/adminAnalytics';
import { RoleBadge } from './RoleBadge';
import { AdminCreatorPerformanceAnalytics } from '../AdminCreatorPerformanceAnalytics';
import { getCoinUsdPeg } from '../../../../shared/finance/fx';

interface CreatorsSupplyTabProps {
  users: UserProfile[];
  callLogs: CallLogItem[];
  settings: SystemSettings;
  range: DateRange;
  onInspectUser: (user: UserProfile) => void;
}

export const CreatorsSupplyTab: React.FC<CreatorsSupplyTabProps> = ({
  users,
  callLogs,
  settings,
  range,
  onInspectUser,
}) => {
  const [showPerformance, setShowPerformance] = useState(true);

  const creators = useMemo(() => {
    return users.filter((u) => isEarningEligibleCreator(u, settings));
  }, [users, settings]);

  const regularExcluded = useMemo(() => {
    return users.filter((u) => resolveAdminAnalyticsRole(u) === 'female_user' && !isEarningEligibleCreator(u, settings));
  }, [users, settings]);

  const periodLogs = useMemo(() => filterCallLogsByRange(callLogs, range), [callLogs, range]);
  const payoutRatio = getCoinUsdPeg(settings);

  const supply = useMemo(() => {
    const online = creators.filter((u) => u.onlineStatus === 'online').length;
    const inCall = creators.filter((u) => u.onlineStatus === 'in_call').length;
    const busy = creators.filter((u) => u.onlineStatus === 'busy').length;
    const offline = creators.length - online - inCall - busy;
    return { online, inCall, busy, offline };
  }, [creators]);

  const topEarners = useMemo(() => {
    return creators
      .map((u) => {
        const logs = periodLogs.filter((l) => l.receiverId === u.id);
        const coins = logs.reduce((a, l) => a + (l.coinsEarned || 0), 0);
        const minutes = Math.round(logs.reduce((a, l) => a + (l.durationSeconds || 0), 0) / 60);
        return { user: u, coins, minutes, usd: coins * payoutRatio };
      })
      .sort((a, b) => b.coins - a.coins)
      .slice(0, 15);
  }, [creators, periodLogs, payoutRatio]);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {(
          [
            ['Online', supply.online, 'text-emerald-400'],
            ['In call', supply.inCall, 'text-indigo-400'],
            ['Busy', supply.busy, 'text-amber-400'],
            ['Offline', supply.offline, 'text-slate-400'],
          ] as const
        ).map(([label, n, color]) => (
          <div key={label} className="p-4 bg-[#13161F] border border-slate-800 rounded-2xl">
            <div className="text-[10px] font-mono uppercase text-slate-500 flex items-center gap-1">
              <Radio className="w-3 h-3" /> {label}
            </div>
            <div className={`text-xl font-black font-mono mt-1 ${color}`}>{n}</div>
          </div>
        ))}
      </div>

      <div className="p-4 bg-slate-950 border border-pink-500/20 rounded-2xl text-xs font-mono text-slate-400">
        Regular female users excluded from earnings leaderboards unless{' '}
        <span className="text-pink-300">enableRegularFemaleCoinEarning</span> is on.
        Currently excluded: <span className="text-white font-bold">{regularExcluded.length}</span>.
        Earning-eligible creators/hosts: <span className="text-emerald-400 font-bold">{creators.length}</span>.
      </div>

      <div className="p-5 bg-[#13161F] border border-slate-800 rounded-3xl space-y-3">
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-sm font-black text-white font-mono uppercase flex items-center gap-2">
            <Award className="w-4 h-4 text-emerald-400" />
            Top earners (period)
          </h3>
        </div>
        <div className="space-y-2">
          {topEarners.map((item, idx) => (
            <div
              key={item.user.id}
              className="flex items-center justify-between gap-3 p-3 rounded-xl bg-slate-950 border border-slate-800/80"
            >
              <div className="flex items-center gap-3 min-w-0">
                <span className="text-slate-500 font-mono text-xs w-5">#{idx + 1}</span>
                <img src={item.user.avatarUrl} alt="" className="w-9 h-9 rounded-full object-cover" />
                <div className="min-w-0">
                  <div className="font-bold text-white text-xs truncate flex items-center gap-2">
                    {item.user.name} <RoleBadge user={item.user} />
                  </div>
                  <div className="text-[10px] text-slate-500 font-mono">{item.minutes}m period</div>
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <div className="text-right font-mono text-xs">
                  <div className="text-emerald-400 font-black">{formatUsd(item.usd)}</div>
                  <div className="text-amber-300">{formatCoins(item.coins)}</div>
                </div>
                <button
                  type="button"
                  onClick={() => onInspectUser(item.user)}
                  className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 cursor-pointer"
                  title="Inspect in admin drawer"
                >
                  <Eye className="w-3.5 h-3.5 text-emerald-400" />
                </button>
              </div>
            </div>
          ))}
          {topEarners.length === 0 && (
            <div className="text-center text-xs text-slate-500 py-8">No creator earnings in this period.</div>
          )}
        </div>
      </div>

      <div className="space-y-3">
        <button
          type="button"
          onClick={() => setShowPerformance((v) => !v)}
          className="flex items-center gap-2 text-xs font-mono font-bold text-slate-300 hover:text-white cursor-pointer"
        >
          <Layers className="w-4 h-4 text-indigo-400" />
          {showPerformance ? 'Hide' : 'Show'} Creator Performance deep tool
        </button>
        {showPerformance && (
          <div className="rounded-3xl border border-slate-800 overflow-hidden">
            <p className="px-4 pt-3 text-[10px] font-mono text-slate-500">
              Deep tool includes Host Math modal. Prefer creator-only rows — regular female users should not appear as earners unless the earning toggle is enabled.
            </p>
            <AdminCreatorPerformanceAnalytics />
          </div>
        )}
      </div>
    </div>
  );
};
