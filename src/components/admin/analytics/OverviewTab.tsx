import React from 'react';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  BarChart,
  Bar,
} from 'recharts';
import {
  Coins,
  PhoneCall,
  Users,
  TrendingUp,
  Video,
  Zap,
  Landmark,
  ExternalLink,
} from 'lucide-react';
import {
  PlatformFinanceSnapshot,
  TrendPoint,
  RoleActivityMixPoint,
  formatUsd,
  formatCoins,
} from '../../../utils/adminAnalytics';

interface OverviewTabProps {
  finance: PlatformFinanceSnapshot;
  trends: TrendPoint[];
  activityMix: RoleActivityMixPoint[];
  /** Opens Financial Module (money of record) — not Analytics money tables. */
  onOpenFinancialModule?: () => void;
  onGotoUsers?: (role?: string) => void;
}

const KpiCard: React.FC<{
  label: string;
  value: string;
  sub?: string;
  icon: React.ReactNode;
  onClick?: () => void;
  accent?: string;
}> = ({ label, value, sub, icon, onClick, accent = 'border-l-indigo-500/70' }) => (
  <button
    type="button"
    onClick={onClick}
    className={`text-left p-4 bg-[#13161F] border border-slate-800 border-l-[3px] ${accent} rounded-2xl space-y-1.5 w-full ${
      onClick ? 'hover:border-slate-600 cursor-pointer' : 'cursor-default'
    }`}
  >
    <div className="flex items-center justify-between text-slate-400">
      <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">{label}</span>
      {icon}
    </div>
    <div className="text-xl sm:text-2xl font-black text-white font-mono tracking-tight">{value}</div>
    {sub && <div className="text-[10px] text-slate-400 font-mono">{sub}</div>}
  </button>
);

export const OverviewTab: React.FC<OverviewTabProps> = ({
  finance,
  trends,
  activityMix,
  onOpenFinancialModule,
  onGotoUsers,
}) => {
  const hasTrendActivity = trends.some((t) => t.callCount > 0 || t.burnUSD > 0);

  return (
    <div className="space-y-6">
      <div className="px-3.5 py-2.5 rounded-xl bg-slate-950/80 border border-slate-700/80 text-[11px] text-slate-300 font-mono leading-relaxed flex flex-wrap items-center justify-between gap-2">
        <span>
          Analytics = product/ops. Money of record (Funding, Live ledger, Settlement) lives in{' '}
          <span className="text-emerald-300">Financial Module</span>.
        </span>
        {onOpenFinancialModule && (
          <button
            type="button"
            onClick={onOpenFinancialModule}
            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-emerald-950/50 border border-emerald-700/40 text-emerald-300 text-[10px] font-bold cursor-pointer hover:bg-emerald-900/40"
          >
            <Landmark className="w-3 h-3" /> Open Financial Module <ExternalLink className="w-3 h-3" />
          </button>
        )}
      </div>

      {/* Ops KPIs + light GMV/burn only (no Platform/Host/TL payable tables) */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        <KpiCard
          label="Period GMV (burn)"
          value={formatUsd(finance.burnUSD)}
          sub={formatCoins(finance.burn.burnedCoins)}
          icon={<Coins className="w-3.5 h-3.5 text-amber-400" />}
          onClick={onOpenFinancialModule}
          accent="border-l-amber-500/70"
        />
        <KpiCard
          label="Active callers / hosts"
          value={`${finance.activeCallers} / ${finance.activeHosts}`}
          sub={`Live calls: ${finance.liveCalls}`}
          icon={<Users className="w-3.5 h-3.5 text-pink-400" />}
          onClick={() => onGotoUsers?.()}
          accent="border-l-pink-500/70"
        />
        <KpiCard
          label="Period calls"
          value={String(finance.callCount)}
          sub={`${finance.totalMinutes} live mins`}
          icon={<PhoneCall className="w-3.5 h-3.5 text-rose-400" />}
          accent="border-l-rose-500/70"
        />
        <KpiCard
          label="New creators"
          value={String(finance.newUsersByRole.female_creator)}
          sub={`TLs +${finance.newUsersByRole.team_leader}`}
          icon={<TrendingUp className="w-3.5 h-3.5 text-emerald-400" />}
          onClick={() => onGotoUsers?.('female_creator')}
          accent="border-l-emerald-500/70"
        />
        <KpiCard
          label="New males"
          value={String(finance.newUsersByRole.male_user)}
          sub={`Regular ♀ +${finance.newUsersByRole.female_user}`}
          icon={<Users className="w-3.5 h-3.5 text-indigo-400" />}
          onClick={() => onGotoUsers?.('male_user')}
          accent="border-l-indigo-500/70"
        />
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[10px] font-mono">
        {(
          [
            ['male_user', 'New males', finance.newUsersByRole.male_user],
            ['female_user', 'New regular ♀', finance.newUsersByRole.female_user],
            ['female_creator', 'New creators', finance.newUsersByRole.female_creator],
            ['team_leader', 'New TLs', finance.newUsersByRole.team_leader],
          ] as const
        ).map(([role, label, n]) => (
          <button
            key={role}
            type="button"
            onClick={() => onGotoUsers?.(role)}
            className="p-3 rounded-xl bg-slate-950 border border-slate-800 text-left hover:border-slate-600 cursor-pointer"
          >
            <div className="text-slate-500 uppercase">{label}</div>
            <div className="text-base font-black text-white mt-1">{n}</div>
          </button>
        ))}
      </div>

      <div className="p-5 bg-[#13161F] border border-slate-800 rounded-3xl space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <h3 className="text-sm font-black text-white font-mono uppercase tracking-wider flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-amber-400" />
              Call activity / burn trend
            </h3>
            <p className="text-xs text-slate-400">
              Ops view of call volume and coin burn. Platform / Host / TL payables → Financial Module.
            </p>
          </div>
          {onOpenFinancialModule && (
            <button
              type="button"
              onClick={onOpenFinancialModule}
              className="text-[10px] font-mono text-emerald-400 hover:text-emerald-300 cursor-pointer"
            >
              View Live ledger / P&amp;L →
            </button>
          )}
        </div>
        {!hasTrendActivity ? (
          <div className="h-48 flex items-center justify-center text-xs font-mono text-slate-500 border border-dashed border-slate-800 rounded-2xl">
            Insufficient call activity in this date range — no trend series to plot.
          </div>
        ) : (
          <div className="h-56 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={trends} margin={{ top: 10, right: 10, left: -15, bottom: 0 }}>
                <defs>
                  <linearGradient id="adminBurnGradOps" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#F59E0B" stopOpacity={0.35} />
                    <stop offset="95%" stopColor="#F59E0B" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#1E293B" vertical={false} />
                <XAxis dataKey="label" stroke="#64748B" fontSize={11} tickLine={false} />
                <YAxis stroke="#64748B" fontSize={11} tickFormatter={(v) => `$${v}`} tickLine={false} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#0F172A',
                    borderColor: '#334155',
                    borderRadius: '12px',
                    fontSize: '11px',
                    color: '#F8FAFC',
                  }}
                />
                <Area
                  type="monotone"
                  dataKey="burnUSD"
                  name="Burn USD"
                  stroke="#F59E0B"
                  fill="url(#adminBurnGradOps)"
                  strokeWidth={2}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="p-5 bg-[#13161F] border border-slate-800 rounded-3xl space-y-3">
          <h3 className="text-sm font-black text-white font-mono uppercase">Activity mix by host role</h3>
          {activityMix.length === 0 ? (
            <div className="text-xs text-slate-500 font-mono py-8 text-center">No period activity.</div>
          ) : (
            <div className="h-56">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={activityMix}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1E293B" vertical={false} />
                  <XAxis dataKey="label" stroke="#64748B" fontSize={11} />
                  <YAxis stroke="#64748B" fontSize={11} />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: '#0F172A',
                      borderColor: '#334155',
                      borderRadius: '12px',
                      fontSize: '11px',
                    }}
                  />
                  <Bar dataKey="calls" name="Calls" fill="#6366F1" radius={[6, 6, 0, 0]} />
                  <Bar dataKey="minutes" name="Minutes" fill="#10B981" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>

        <div className="p-5 bg-[#13161F] border border-slate-800 rounded-3xl space-y-4">
          <h3 className="text-sm font-black text-white font-mono uppercase">Session mix</h3>
          {!finance.sessionMix.hasCallTypeBreakdown ? (
            <div className="text-xs font-mono text-slate-500 border border-dashed border-slate-800 rounded-2xl p-6 text-center">
              Insufficient call-type data — audio/roulette flags are not present on call logs.
              <div className="mt-2 text-slate-400">
                Total minutes in range: {finance.sessionMix.totalMinutes}
              </div>
            </div>
          ) : (
            <div className="space-y-3 font-mono text-xs">
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-white flex items-center gap-1.5">
                    <Video className="w-4 h-4 text-pink-400" />
                    Video
                  </span>
                  <span className="font-black text-pink-400">{finance.sessionMix.videoPercent}%</span>
                </div>
                <div className="w-full bg-slate-950 h-2 rounded-full overflow-hidden border border-slate-800">
                  <div className="bg-pink-500 h-full rounded-full" style={{ width: `${finance.sessionMix.videoPercent}%` }} />
                </div>
                <div className="text-[10px] text-slate-500">{finance.sessionMix.videoMinutes} minutes</div>
              </div>
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-white flex items-center gap-1.5">
                    <PhoneCall className="w-4 h-4 text-indigo-400" />
                    Audio
                  </span>
                  <span className="font-black text-indigo-400">{finance.sessionMix.audioPercent}%</span>
                </div>
                <div className="w-full bg-slate-950 h-2 rounded-full overflow-hidden border border-slate-800">
                  <div className="bg-indigo-500 h-full rounded-full" style={{ width: `${finance.sessionMix.audioPercent}%` }} />
                </div>
                <div className="text-[10px] text-slate-500">{finance.sessionMix.audioMinutes} minutes</div>
              </div>
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-white flex items-center gap-1.5">
                    <Zap className="w-4 h-4 text-amber-400" />
                    Roulette
                  </span>
                  <span className="font-black text-amber-400">{finance.sessionMix.roulettePercent}%</span>
                </div>
                <div className="w-full bg-slate-950 h-2 rounded-full overflow-hidden border border-slate-800">
                  <div className="bg-amber-500 h-full rounded-full" style={{ width: `${finance.sessionMix.roulettePercent}%` }} />
                </div>
                <div className="text-[10px] text-slate-500">{finance.sessionMix.rouletteMinutes} minutes</div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
