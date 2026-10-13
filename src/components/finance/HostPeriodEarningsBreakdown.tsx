import React from 'react';
import { Coins, Percent, Gift, Award, Sigma } from 'lucide-react';
import type { HostEarningsBreakdownAmounts } from '../../../shared/finance/hostEarningsBreakdown';

function formatCoins(n: number) {
  return `${Math.round(Number(n) || 0).toLocaleString()} 🪙`;
}

function formatUsd(n: number) {
  return `$${(Number(n) || 0).toFixed(2)}`;
}

interface HostPeriodEarningsBreakdownProps {
  breakdown: HostEarningsBreakdownAmounts;
  title?: string;
  subtitle?: string;
  compact?: boolean;
  className?: string;
}

export const HostPeriodEarningsBreakdown: React.FC<HostPeriodEarningsBreakdownProps> = ({
  breakdown,
  title = 'Period earnings breakdown',
  subtitle,
  compact = false,
  className = '',
}) => {
  const rows = [
    {
      key: 'call',
      label: 'Call earnings (base)',
      hint: 'Live share % during period',
      coins: breakdown.callEarningsCoins,
      usd: breakdown.callEarningsUsd,
      icon: <Coins className="w-3.5 h-3.5 text-pink-400" />,
      show: true,
    },
    {
      key: 'trueup',
      label: 'Target share true-up',
      hint: 'Posted at period close if bronze+ met',
      coins: breakdown.targetShareTrueUpCoins,
      usd: breakdown.targetShareTrueUpUsd,
      icon: <Percent className="w-3.5 h-3.5 text-rose-400" />,
      show: breakdown.targetShareTrueUpCoins > 0 || breakdown.targetShareTrueUpUsd > 0,
    },
    {
      key: 'gift',
      label: 'Gift earnings',
      hint: 'Separate from call true-up',
      coins: breakdown.giftEarningsCoins,
      usd: breakdown.giftEarningsUsd,
      icon: <Gift className="w-3.5 h-3.5 text-amber-400" />,
      show: breakdown.giftEarningsCoins > 0 || breakdown.giftEarningsUsd > 0,
    },
    {
      key: 'bonus',
      label: 'Target cash bonus',
      hint: 'Bronze / silver / gold tier — separate from share true-up',
      coins: breakdown.targetBonusCoins,
      usd: breakdown.targetBonusUsd,
      icon: <Award className="w-3.5 h-3.5 text-emerald-400" />,
      show: breakdown.targetBonusCoins > 0 || breakdown.targetBonusUsd > 0,
    },
  ];

  const visible = rows.filter((r) => r.show || r.key === 'call');

  return (
    <div
      className={`rounded-xl border border-slate-800 bg-slate-950/60 ${compact ? 'p-3 space-y-2' : 'p-3.5 space-y-3'} ${className}`}
    >
      <div>
        <div className={`font-bold text-white ${compact ? 'text-[11px]' : 'text-xs'}`}>{title}</div>
        {subtitle && <p className="text-[10px] text-slate-500 mt-0.5">{subtitle}</p>}
      </div>

      <div className="space-y-1.5">
        {visible.map((r) => (
          <div
            key={r.key}
            className="flex items-center justify-between gap-2 text-[11px] font-mono py-1.5 border-b border-slate-800/60 last:border-0"
          >
            <div className="flex items-start gap-2 min-w-0">
              <span className="mt-0.5 shrink-0">{r.icon}</span>
              <div className="min-w-0">
                <div className="text-slate-200 font-semibold truncate">{r.label}</div>
                {!compact && <div className="text-[9px] text-slate-500">{r.hint}</div>}
              </div>
            </div>
            <div className="text-right shrink-0">
              <div className="text-white font-bold">{formatCoins(r.coins)}</div>
              <div className="text-emerald-400">{formatUsd(r.usd)}</div>
            </div>
          </div>
        ))}
      </div>

      <div className="flex items-center justify-between gap-2 pt-1 border-t border-slate-700/80">
        <div className="flex items-center gap-1.5 text-[11px] font-bold text-slate-300">
          <Sigma className="w-3.5 h-3.5 text-indigo-400" />
          Total owed
        </div>
        <div className="text-right font-mono">
          <div className="text-sm font-black text-white">{formatCoins(breakdown.totalCoins)}</div>
          <div className="text-emerald-300 font-bold">{formatUsd(breakdown.totalUsd)}</div>
        </div>
      </div>
    </div>
  );
};
