import React from 'react';
import { Clock, Coins, ExternalLink, Percent, CheckCircle2, AlertTriangle } from 'lucide-react';
import type { HostPeriodTargetProgress } from '../../../shared/finance/hostPeriodTargetProgress';

export const HOST_TARGET_TRUEUP_COPY =
  'Live call commission uses base share. Hit target by period end to unlock target-share true-up + tier bonus.';

/** Dispatch from any admin surface; AdminDashboard listens and switches tab/section. */
export function navigateAdminDeepLink(
  target: 'creator-ops' | 'economy-shares'
): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(
    new CustomEvent('minglecall:admin-navigate', {
      detail:
        target === 'creator-ops'
          ? { tab: 'creator-ops', creatorOpsView: 'targets' }
          : { tab: 'financials', economySection: 'B' },
    })
  );
}

interface HostPeriodTargetProgressPanelProps {
  progress: HostPeriodTargetProgress;
  /** host = earnings UI; admin = detail drawers; compact = table/list rows */
  variant?: 'host' | 'admin' | 'compact';
  showDeepLinks?: boolean;
  className?: string;
}

export const HostPeriodTargetProgressPanel: React.FC<HostPeriodTargetProgressPanelProps> = ({
  progress,
  variant = 'host',
  showDeepLinks = false,
  className = '',
}) => {
  const compact = variant === 'compact';

  if (compact) {
    return (
      <div className={`space-y-1 min-w-[7.5rem] ${className}`} title={HOST_TARGET_TRUEUP_COPY}>
        <div className="flex items-center justify-between text-[9px] font-mono text-slate-400">
          <span>🥉 True-up</span>
          <span className={progress.targetMet ? 'text-emerald-400 font-bold' : 'text-slate-500'}>
            {progress.targetMet ? 'MET' : `${Math.min(progress.pctHours, progress.pctCoins)}%`}
          </span>
        </div>
        <div className="w-full bg-slate-950 h-1.5 rounded-full overflow-hidden border border-slate-800">
          <div
            className="bg-indigo-400 h-full"
            style={{ width: `${progress.pctHours}%` }}
            title={`Hours ${progress.periodHours}/${progress.bronzeHours}`}
          />
        </div>
        <div className="w-full bg-slate-950 h-1.5 rounded-full overflow-hidden border border-slate-800">
          <div
            className="bg-amber-400 h-full"
            style={{ width: `${progress.pctCoins}%` }}
            title={`Coins ${progress.periodCoins}/${progress.bronzeCoins}`}
          />
        </div>
      </div>
    );
  }

  return (
    <div
      className={`rounded-xl border border-slate-800 bg-[#0F1115]/80 p-3.5 space-y-3 ${className}`}
    >
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-2">
        <div className="space-y-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">
              Bronze target (period true-up gate)
            </span>
            {progress.targetMet ? (
              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[10px] font-bold bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
                <CheckCircle2 className="w-3 h-3" /> Target met
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[10px] font-bold bg-slate-800 text-slate-400 border border-slate-700">
                In progress
              </span>
            )}
          </div>
          <p className="text-[11px] text-slate-400 leading-relaxed">{HOST_TARGET_TRUEUP_COPY}</p>
          <p className="text-[10px] font-mono text-slate-500">
            Live {progress.baseSharePercent}% · Target {progress.targetSharePercent}% at close
            {progress.trueUpSkippedDueToOverride ? ' · override skips true-up' : ''}
          </p>
        </div>
        {showDeepLinks && (
          <div className="flex flex-wrap gap-1.5 shrink-0">
            <button
              type="button"
              onClick={() => navigateAdminDeepLink('creator-ops')}
              className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-bold bg-amber-500/10 text-amber-300 border border-amber-500/30 hover:bg-amber-500/20 cursor-pointer"
            >
              Creator Ops <ExternalLink className="w-3 h-3" />
            </button>
            <button
              type="button"
              onClick={() => navigateAdminDeepLink('economy-shares')}
              className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-bold bg-pink-500/10 text-pink-300 border border-pink-500/30 hover:bg-pink-500/20 cursor-pointer"
            >
              Economy shares <ExternalLink className="w-3 h-3" />
            </button>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div className="space-y-2">
          <div className="flex items-center justify-between text-xs font-bold text-slate-300">
            <span className="flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5 text-indigo-400" />
              Hours
            </span>
            <span className="font-mono text-white">
              {Number(progress.periodHours.toFixed(2))}h{' '}
              <span className="text-slate-500">/ {progress.bronzeHours}h</span>
            </span>
          </div>
          <div className="w-full bg-slate-900 rounded-full h-2.5 overflow-hidden border border-slate-800 p-0.5">
            <div
              className="bg-gradient-to-r from-indigo-600 to-blue-400 h-full rounded-full transition-all duration-500"
              style={{ width: `${progress.pctHours}%` }}
            />
          </div>
          <div className="flex justify-between text-[10px] font-mono text-slate-500">
            <span>{progress.pctHours}%</span>
            <span>
              {Math.max(0, Number((progress.bronzeHours - progress.periodHours).toFixed(1)))}h left
            </span>
          </div>
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between text-xs font-bold text-slate-300">
            <span className="flex items-center gap-1.5">
              <Coins className="w-3.5 h-3.5 text-amber-400" />
              Coins
            </span>
            <span className="font-mono text-white">
              {progress.periodCoins.toLocaleString()}{' '}
              <span className="text-slate-500">/ {progress.bronzeCoins.toLocaleString()}</span>
            </span>
          </div>
          <div className="w-full bg-slate-900 rounded-full h-2.5 overflow-hidden border border-slate-800 p-0.5">
            <div
              className="bg-gradient-to-r from-amber-600 to-yellow-400 h-full rounded-full transition-all duration-500"
              style={{ width: `${progress.pctCoins}%` }}
            />
          </div>
          <div className="flex justify-between text-[10px] font-mono text-slate-500">
            <span>{progress.pctCoins}%</span>
            <span>
              {Math.max(0, progress.bronzeCoins - progress.periodCoins).toLocaleString()} left
            </span>
          </div>
        </div>
      </div>

      {progress.estimatedTrueUpPreview != null && (
        <div className="flex items-start gap-2 text-[10px] text-slate-400 border-t border-slate-800/80 pt-2">
          {progress.trueUpSkippedDueToOverride ? (
            <AlertTriangle className="w-3.5 h-3.5 text-amber-400 shrink-0 mt-0.5" />
          ) : (
            <Percent className="w-3.5 h-3.5 text-pink-400 shrink-0 mt-0.5" />
          )}
          <span>
            {progress.trueUpSkippedDueToOverride
              ? 'Share true-up skipped (coin earn override > 0 on profile).'
              : `Estimated true-up preview: ${progress.estimatedTrueUpPreview.toLocaleString()} 🪙 (read-only; posts at period close).`}
          </span>
        </div>
      )}
    </div>
  );
};
