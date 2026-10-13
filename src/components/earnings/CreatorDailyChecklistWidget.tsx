import React from 'react';
import { useApp } from '../../context/AppContext';
import {
  CheckCircle2,
  Circle,
  Flame,
  Zap,
  Gift,
  Clock,
  Award,
  Sparkles,
  TrendingUp,
  ShieldCheck,
} from 'lucide-react';

export const CreatorDailyChecklistWidget: React.FC = () => {
  const { currentUser, systemSettings, myCreatorMetrics, claimDailyFirstCallBonus } = useApp();

  const metrics = myCreatorMetrics || {
    creatorId: currentUser.id,
    activeOnlineSeconds: 0,
    activeOnlineHours: 0,
    coinsEarnedFromCalls: 0,
    coinsEarnedFromGifts: 0,
    totalTargetCoins: 0,
    currentStreakDays: 1,
    totalCallsOffered: 0,
    totalCallsAnswered: 0,
    totalCallsDeclined: 0,
    totalCallsMissed: 0,
    responseHealthScore: 100,
    performanceTier: 'bronze',
    isReadyNowActive: false,
    bonusEarnedCoins: 0,
    bonusEarnedUSD: 0,
    lastActiveDate: new Date().toISOString().split('T')[0],
  };

  const todayStr = new Date().toISOString().split('T')[0];
  const isFirstCallBonusClaimed = metrics.firstCallBonusClaimedDate === todayStr;

  const firstCallBonusCoins = systemSettings.dailyFirstCallBonusCoins ?? 100;
  const firstCallBonusUSD = systemSettings.dailyFirstCallBonusUSD ?? 1.00;
  const minDailyHours = systemSettings.minDailyActiveHoursForStreak ?? 2;
  const streakTarget = systemSettings.streakTargetDays ?? 7;

  const activeHoursToday = metrics.activeOnlineHours || 0;
  const isDailyHoursMet = activeHoursToday >= minDailyHours;
  const responseScore = metrics.responseHealthScore ?? 100;
  const isResponseHealthy = responseScore >= 90;

  const isStreakBoostActive = metrics.streakBoostUntil ? new Date(metrics.streakBoostUntil).getTime() > Date.now() : (metrics.currentStreakDays >= streakTarget);

  return (
    <div className="bg-[#161920] border border-slate-800 rounded-2xl p-4 sm:p-5 shadow-xl space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-2">
          <div className="p-2 rounded-xl bg-purple-500/15 text-purple-400 border border-purple-500/30">
            <Flame className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center space-x-2">
              <h3 className="text-sm sm:text-base font-bold text-white tracking-tight">
                Daily Creator Quota Checklist
              </h3>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-purple-500/20 text-purple-300 border border-purple-500/30">
                {metrics.currentStreakDays}-DAY STREAK 🔥
              </span>
            </div>
            <p className="text-[11px] text-slate-400">
              Complete daily goals to maintain algorithmic visibility and win streak payouts.
            </p>
          </div>
        </div>

        {/* Current Streak Badge */}
        <div className="flex items-center space-x-1.5 px-3 py-1 rounded-xl bg-gradient-to-r from-orange-950/80 to-amber-950/80 border border-orange-500/40 text-orange-300">
          <Flame className="w-4 h-4 text-orange-400 fill-current animate-pulse" />
          <span className="text-xs font-black font-mono">{metrics.currentStreakDays} DAY STREAK</span>
        </div>
      </div>

      {/* Daily Tasks Checklist */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {/* Task 1: First Paid Call */}
        <div className={`p-3 rounded-xl border transition-all ${
          isFirstCallBonusClaimed
            ? 'bg-emerald-950/20 border-emerald-500/30'
            : 'bg-[#0F1115] border-slate-800'
        }`}>
          <div className="flex items-center justify-between mb-1.5">
            <div className="flex items-center space-x-1.5 text-xs font-bold text-slate-200">
              <Gift className="w-3.5 h-3.5 text-pink-400" />
              <span>1st Paid Call</span>
            </div>
            {isFirstCallBonusClaimed ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-400" />
            ) : (
              <Circle className="w-4 h-4 text-slate-600" />
            )}
          </div>
          <p className="text-[11px] text-slate-400">
            {isFirstCallBonusClaimed
              ? `Claimed +${firstCallBonusCoins} 🪙 ($${firstCallBonusUSD.toFixed(2)})`
              : `Earn 1st call for +${firstCallBonusCoins} 🪙 ($${firstCallBonusUSD.toFixed(2)})`}
          </p>
        </div>

        {/* Task 2: Active Hours */}
        <div className={`p-3 rounded-xl border transition-all ${
          isDailyHoursMet
            ? 'bg-emerald-950/20 border-emerald-500/30'
            : 'bg-[#0F1115] border-slate-800'
        }`}>
          <div className="flex items-center justify-between mb-1.5">
            <div className="flex items-center space-x-1.5 text-xs font-bold text-slate-200">
              <Clock className="w-3.5 h-3.5 text-indigo-400" />
              <span>{minDailyHours}h Active Daily</span>
            </div>
            {isDailyHoursMet ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-400" />
            ) : (
              <Circle className="w-4 h-4 text-slate-600" />
            )}
          </div>
          <p className="text-[11px] text-slate-400 font-mono">
            {activeHoursToday}h / {minDailyHours}h logged today
          </p>
        </div>

        {/* Task 3: Response Health Score */}
        <div className={`p-3 rounded-xl border transition-all ${
          isResponseHealthy
            ? 'bg-emerald-950/20 border-emerald-500/30'
            : 'bg-[#0F1115] border-slate-800'
        }`}>
          <div className="flex items-center justify-between mb-1.5">
            <div className="flex items-center space-x-1.5 text-xs font-bold text-slate-200">
              <Zap className="w-3.5 h-3.5 text-amber-400" />
              <span>Response Health</span>
            </div>
            {isResponseHealthy ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-400" />
            ) : (
              <Circle className="w-4 h-4 text-slate-600" />
            )}
          </div>
          <p className="text-[11px] text-slate-400 font-mono">
            Current: {responseScore}% ({metrics.totalCallsAnswered}/{metrics.totalCallsOffered} answered)
          </p>
        </div>
      </div>

      {/* Streak 7-Day Algorithmic Boost Progress Bar */}
      <div className="p-3.5 bg-[#0F1115] border border-slate-800 rounded-xl space-y-2">
        <div className="flex items-center justify-between text-xs">
          <div className="flex items-center space-x-1.5 font-bold text-slate-300">
            <Sparkles className="w-3.5 h-3.5 text-amber-400" />
            <span>7-Day Streak Boost Progress</span>
          </div>
          <span className="font-mono font-bold text-amber-300 text-[11px]">
            {isStreakBoostActive ? '🔥 +30 ALGORITHMIC BOOST ACTIVE' : `${metrics.currentStreakDays} / ${streakTarget} Days`}
          </span>
        </div>

        <div className="w-full bg-slate-900 rounded-full h-2 overflow-hidden border border-slate-800">
          <div
            className="bg-gradient-to-r from-orange-500 to-amber-400 h-full rounded-full transition-all duration-500"
            style={{ width: `${Math.min(100, (metrics.currentStreakDays / streakTarget) * 100)}%` }}
          />
        </div>

        <p className="text-[10px] text-slate-500">
          Reach a 7-day streak to unlock a continuous +30 algorithmic discovery weight and priority rotational placement.
        </p>
      </div>
    </div>
  );
};
