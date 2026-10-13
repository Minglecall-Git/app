import React, { useEffect, useMemo, useState } from 'react';
import { useApp } from '../../context/AppContext';
import {
  Flame,
  Crown,
  Award,
  Sparkles,
  TrendingUp,
  Calendar,
} from 'lucide-react';
import { CreatorTier } from '../../types';
import { isCurrentlyPeakHour } from '../../utils/discoveryAlgorithm';
import { fetchPeriodClock } from '../../services/financeApi';
import {
  computePerformanceTier,
  resolveTargetThresholds,
  targetBonusUsdForTier,
} from '../../../shared/finance/targetBonus';
import { getHostPeriodTargetProgress } from '../../../shared/finance/hostPeriodTargetProgress';
import {
  HostPeriodTargetProgressPanel,
  HOST_TARGET_TRUEUP_COPY,
} from '../common/HostPeriodTargetProgressPanel';

function formatCountdown(ms: number): string {
  if (ms <= 0) return 'closing soon';
  const totalSec = Math.floor(ms / 1000);
  const days = Math.floor(totalSec / 86400);
  const hours = Math.floor((totalSec % 86400) / 3600);
  const mins = Math.floor((totalSec % 3600) / 60);
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${mins}m`;
  return `${mins}m`;
}

export const CreatorTargetProgressCard: React.FC = () => {
  const { currentUser, systemSettings, myCreatorMetrics, toggleReadyNow } = useApp();
  const [nextCloseAt, setNextCloseAt] = useState<string | null>(null);
  const [clockCycle, setClockCycle] = useState<string | null>(null);
  const [nowTick, setNowTick] = useState(() => Date.now());

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const res = await fetchPeriodClock();
      if (cancelled || !res.success || !res.data) return;
      setNextCloseAt(res.data.nextCloseAt);
      setClockCycle(res.data.cycleType);
    })();
    const tick = window.setInterval(() => setNowTick(Date.now()), 60_000);
    return () => {
      cancelled = true;
      window.clearInterval(tick);
    };
  }, []);

  const metrics = myCreatorMetrics || {
    creatorId: currentUser.id,
    activeOnlineSeconds: 0,
    activeOnlineHours: 0,
    coinsEarnedFromCalls: 0,
    coinsEarnedFromGifts: 0,
    totalTargetCoins: 0,
    currentStreakDays: 1,
    totalCallsOffered: currentUser.totalCallsHosted || 0,
    totalCallsAnswered: currentUser.totalCallsHosted || 0,
    totalCallsDeclined: 0,
    totalCallsMissed: 0,
    responseHealthScore: 100,
    performanceTier: 'bronze' as CreatorTier,
    isReadyNowActive: false,
    bonusEarnedCoins: 0,
    bonusEarnedUSD: 0,
    lastActiveDate: new Date().toISOString().split('T')[0],
  };

  const cycle = clockCycle || systemSettings.creatorTargetCycle || 'weekly';
  const isPeak = isCurrentlyPeakHour(
    systemSettings.peakHoursStart || '18:00',
    systemSettings.peakHoursEnd || '00:00'
  );

  const settingsRecord = systemSettings as unknown as Record<string, unknown>;

  const bronzeProgress = useMemo(
    () =>
      getHostPeriodTargetProgress({
        creatorId: currentUser.id,
        metrics: metrics as unknown as Record<string, unknown>,
        systemSettings: settingsRecord,
        coinEarnOverrideRate: currentUser.coinEarnOverrideRate,
      }),
    [currentUser.id, currentUser.coinEarnOverrideRate, metrics, settingsRecord]
  );

  const thresholds = resolveTargetThresholds(settingsRecord);
  const currentHours = bronzeProgress.periodHours;
  const currentCoins = bronzeProgress.periodCoins;
  const currentTier: CreatorTier = computePerformanceTier(
    currentHours,
    currentCoins,
    thresholds
  );

  let nextTier: 'silver' | 'gold' | 'max' = 'silver';
  let nextBonusUSD = targetBonusUsdForTier('silver', thresholds);
  if (currentTier === 'gold') {
    nextTier = 'max';
    nextBonusUSD = targetBonusUsdForTier('gold', thresholds);
  } else if (currentTier === 'silver') {
    nextTier = 'gold';
    nextBonusUSD = targetBonusUsdForTier('gold', thresholds);
  }

  const countdownLabel = useMemo(() => {
    if (!nextCloseAt) return 'Loading close…';
    const ms = new Date(nextCloseAt).getTime() - nowTick;
    return `Closes in ${formatCountdown(ms)}`;
  }, [nextCloseAt, nowTick]);

  return (
    <div className="bg-gradient-to-br from-[#161920] via-[#1a1d27] to-[#12141c] border border-slate-800/90 rounded-2xl p-4 sm:p-6 shadow-2xl space-y-5 relative overflow-hidden">
      <div className="absolute top-0 right-0 w-80 h-80 bg-indigo-500/5 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-0 left-0 w-80 h-80 bg-amber-500/5 rounded-full blur-3xl pointer-events-none" />

      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 relative z-10">
        <div className="flex items-center space-x-3">
          <div
            className={`w-12 h-12 rounded-2xl flex items-center justify-center shadow-lg border ${
              currentTier === 'gold'
                ? 'bg-gradient-to-tr from-yellow-600 to-amber-400 text-slate-950 border-yellow-300 shadow-yellow-950/50'
                : currentTier === 'silver'
                ? 'bg-gradient-to-tr from-slate-300 to-slate-100 text-slate-950 border-white shadow-slate-950/50'
                : 'bg-gradient-to-tr from-amber-800 to-amber-600 text-white border-amber-500/50 shadow-amber-950/50'
            }`}
          >
            {currentTier === 'gold' ? (
              <Crown className="w-6 h-6 fill-current" />
            ) : currentTier === 'silver' ? (
              <Award className="w-6 h-6 fill-current" />
            ) : (
              <TrendingUp className="w-6 h-6" />
            )}
          </div>
          <div>
            <div className="flex items-center space-x-2">
              <span className="text-xs uppercase font-extrabold tracking-wider text-slate-400 font-mono">
                {cycle.toUpperCase()} TARGET
              </span>
              <span
                className={`px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider border ${
                  currentTier === 'gold'
                    ? 'bg-yellow-500/20 text-yellow-300 border-yellow-500/40'
                    : currentTier === 'silver'
                    ? 'bg-slate-300/20 text-slate-200 border-slate-300/40'
                    : 'bg-amber-800/20 text-amber-300 border-amber-700/40'
                }`}
              >
                {currentTier.toUpperCase()} TIER
              </span>
            </div>
            <h3 className="text-lg sm:text-xl font-black text-white tracking-tight flex items-center gap-1.5">
              Period Target Progress
              <Sparkles className="w-4 h-4 text-amber-400" />
            </h3>
            <p className="text-[11px] text-slate-400 mt-0.5 max-w-md">{HOST_TARGET_TRUEUP_COPY}</p>
          </div>
        </div>

        <div className="flex items-center justify-between sm:justify-end gap-3 bg-[#0F1115]/90 border border-slate-800 rounded-xl px-3.5 py-2.5 shadow-inner">
          <div className="flex flex-col">
            <div className="flex items-center space-x-1.5">
              <Flame
                className={`w-4 h-4 ${
                  metrics.isReadyNowActive ? 'text-orange-400 animate-bounce' : 'text-slate-500'
                }`}
              />
              <span className="text-xs font-bold text-white">Ready Now Surge</span>
            </div>
            <span className="text-[10px] text-slate-400 font-mono">
              {isPeak ? '⚡ Peak Hours Active' : 'Normal Matching Hours'}
            </span>
          </div>

          <button
            onClick={() => toggleReadyNow(!metrics.isReadyNowActive)}
            className={`px-3 py-1.5 rounded-lg text-xs font-black transition-all flex items-center space-x-1 cursor-pointer border ${
              metrics.isReadyNowActive
                ? 'bg-gradient-to-r from-orange-600 to-amber-500 text-white border-orange-400 shadow-lg shadow-orange-950/60'
                : 'bg-slate-800 hover:bg-slate-700 text-slate-300 border-slate-700'
            }`}
          >
            <span>{metrics.isReadyNowActive ? 'ACTIVE 🔥' : 'TOGGLE ON'}</span>
          </button>
        </div>
      </div>

      <div className="relative z-10">
        <HostPeriodTargetProgressPanel progress={bronzeProgress} variant="host" />
      </div>

      <div className="bg-gradient-to-r from-indigo-950/40 via-purple-950/30 to-amber-950/40 border border-indigo-500/20 rounded-xl p-3.5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 relative z-10">
        <div className="flex items-center space-x-2.5">
          <div className="p-2 rounded-lg bg-amber-500/20 text-amber-300 border border-amber-500/30 shrink-0">
            <Sparkles className="w-4 h-4" />
          </div>
          <div>
            <h4 className="text-xs font-bold text-white">
              {nextTier === 'max'
                ? 'Maximum Gold tier — cash bonus settles at period close.'
                : bronzeProgress.targetMet
                ? `Bronze+ met — true-up eligible. Next tier ${nextTier.toUpperCase()} unlocks +$${nextBonusUSD.toFixed(2)} USD cash bonus.`
                : `Hit bronze hours + coins for true-up; higher tiers unlock larger cash bonuses (next: ${nextTier.toUpperCase()} +$${nextBonusUSD.toFixed(2)}).`}
            </h4>
            <p className="text-[11px] text-slate-400">
              Tier cash bonus is separate from share true-up. Both settle in the period-end Financial Module
              batch.
            </p>
          </div>
        </div>

        <div className="flex flex-col items-end gap-1 shrink-0 self-end sm:self-center">
          <span className="px-2.5 py-1 rounded bg-slate-900/90 text-slate-300 border border-slate-800 text-[11px] font-mono flex items-center space-x-1.5">
            <Calendar className="w-3 h-3 text-slate-400" />
            <span>{countdownLabel}</span>
          </span>
          {nextCloseAt && (
            <span className="text-[9px] font-mono text-slate-500">
              {new Date(nextCloseAt).toISOString().replace('T', ' ').replace(/\.\d{3}Z$/, ' UTC')}
            </span>
          )}
        </div>
      </div>
    </div>
  );
};
