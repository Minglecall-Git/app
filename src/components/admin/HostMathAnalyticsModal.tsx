import React, { useState, useMemo, useEffect } from 'react';
import { useApp } from '../../context/AppContext';
import {
  X,
  Zap,
  Crown,
  Award,
  Flame,
  Clock,
  Coins,
  DollarSign,
  ShieldCheck,
  Star,
  Activity,
  TrendingUp,
  PhoneCall,
  PhoneIncoming,
  PhoneMissed,
  Gift,
  Building,
  CheckCircle2,
  AlertTriangle,
  Sparkles,
  Info,
  Calendar,
  Layers,
  ArrowUpRight,
  Eye,
  Sliders,
  UserCheck,
  Gauge,
} from 'lucide-react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  PieChart,
  Pie,
  Cell,
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  Radar,
  Legend,
} from 'recharts';
import { RankedCreatorItem } from '../../utils/discoveryAlgorithm';
import { normalizeMediaUrl } from '../../utils/r2Storage';
import { getFallbackAvatar } from '../../utils/avatars';
import { SvgFlag } from '../common/SvgFlag';
import { getUserEffectiveLocation } from '../../utils/location';
import { getCoinUsdPeg } from '../../../shared/finance/fx';
import { getHostPeriodTargetProgress } from '../../../shared/finance/hostPeriodTargetProgress';
import { HostPeriodTargetProgressPanel } from '../common/HostPeriodTargetProgressPanel';

interface HostMathAnalyticsModalProps {
  hostItem: RankedCreatorItem | null;
  onClose: () => void;
  rankIndex?: number;
}

export const HostMathAnalyticsModal: React.FC<HostMathAnalyticsModalProps> = ({
  hostItem,
  onClose,
  rankIndex = 0,
}) => {
  const { systemSettings, users, callLogs } = useApp();
  const [activeTab, setActiveTab] = useState<'analytics' | 'math' | 'targets' | 'telemetry'>('analytics');
  const [liveSecondsTick, setLiveSecondsTick] = useState(0);

  // Dynamic heartbeat ticking simulation for live foreground tracking
  useEffect(() => {
    const timer = setInterval(() => {
      setLiveSecondsTick((prev) => prev + 1);
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  if (!hostItem) return null;

  const { user, metrics, calculatedScore, isReadyNow, tier, healthScore, hasStreakBoost, breakdown } = hostItem;

  // Find managing Team Leader if applicable
  const teamLeader = useMemo(() => {
    if (!user.teamLeaderId) return null;
    return users.find((u) => u.id === user.teamLeaderId) || null;
  }, [user.teamLeaderId, users]);

  // Host Call Logs from real call database
  const hostCallLogs = useMemo(() => {
    return callLogs.filter((l) => l.receiverId === user.id);
  }, [callLogs, user.id]);

  // Financial Metrics — lifetime wallet balance ≠ period target coins (close uses creator_metrics)
  const femalePayoutRatio = getCoinUsdPeg(systemSettings);
  const periodTargetCoins =
    Number(metrics.totalTargetCoins) ||
    (Number(metrics.coinsEarnedFromCalls) || 0) + (Number(metrics.coinsEarnedFromGifts) || 0);
  const totalEarnedCoins = user.earningsCoins || 0;
  const totalEarnedUSD = Number((totalEarnedCoins * femalePayoutRatio).toFixed(2));
  const callCoins = metrics.coinsEarnedFromCalls || 0;
  const giftCoins = metrics.coinsEarnedFromGifts || 0;
  const bonusUSD = metrics.bonusEarnedUSD || (tier === 'gold' ? systemSettings.creatorTargetGoldBonusUSD : tier === 'silver' ? systemSettings.creatorTargetSilverBonusUSD : 0) || 0;

  // Dynamic Live Online Seconds & Hours
  const liveActiveSeconds = (metrics.activeOnlineSeconds || 0) + (user.onlineStatus === 'online' ? liveSecondsTick : 0);
  const liveActiveHours = Number((liveActiveSeconds / 3600).toFixed(2));

  // Score Composition Data for Radar & Bar Charts
  const scoreChartData = [
    { name: 'Online Base', score: breakdown.onlineScore, max: 100, fill: '#10b981' },
    { name: 'Tier standing', score: breakdown.tierScore, max: 100, fill: '#eab308' },
    { name: 'Peak Surge', score: breakdown.readyNowScore, max: 80, fill: '#f97316' },
    { name: 'Response Health', score: breakdown.healthScorePts, max: 40, fill: '#3b82f6' },
    { name: 'Streak Boost', score: breakdown.streakScore, max: 30, fill: '#a855f7' },
    { name: 'Trust & Rating', score: breakdown.trustScore, max: 25, fill: '#06b6d4' },
    { name: 'Diversity Jitter', score: breakdown.diversityJitter, max: 25, fill: '#ec4899' },
  ];

  // Call Acceptance Pie Chart Data
  const answeredCount = metrics.totalCallsAnswered || hostCallLogs.length || 0;
  const declinedCount = metrics.totalCallsDeclined || 0;
  const missedCount = metrics.totalCallsMissed || Math.max(0, metrics.totalCallsOffered - answeredCount - declinedCount);
  const totalCallsOffered = Math.max(answeredCount + declinedCount + missedCount, metrics.totalCallsOffered || 1);

  const callDistributionData = [
    { name: 'Answered', value: Math.max(1, answeredCount), color: '#10b981' },
    { name: 'Declined', value: declinedCount, color: '#f59e0b' },
    { name: 'Missed', value: missedCount, color: '#ef4444' },
  ].filter((d) => d.value > 0);

  // Target Cycle — bronze gate for share true-up (same as burn/settlement)
  const targetCycle = systemSettings.creatorTargetCycle || 'weekly';
  const bronzeProgress = getHostPeriodTargetProgress({
    creatorId: user.id,
    periodHours: liveActiveHours,
    periodCoins: periodTargetCoins,
    systemSettings: systemSettings as unknown as Record<string, unknown>,
    coinEarnOverrideRate: user.coinEarnOverrideRate,
  });

  // Tier ladder display (cash bonus); true-up gate uses bronzeProgress above
  const targetHours =
    tier === 'gold'
      ? systemSettings.creatorTargetGoldHours ?? bronzeProgress.bronzeHours
      : tier === 'silver'
      ? systemSettings.creatorTargetSilverHours ?? bronzeProgress.bronzeHours
      : bronzeProgress.bronzeHours;

  const targetCoins =
    tier === 'gold'
      ? systemSettings.creatorTargetGoldCoins ?? bronzeProgress.bronzeCoins
      : tier === 'silver'
      ? systemSettings.creatorTargetSilverCoins ?? bronzeProgress.bronzeCoins
      : bronzeProgress.bronzeCoins;

  const currentCoins = bronzeProgress.periodCoins;

  const hoursPct = bronzeProgress.pctHours;
  const coinsPct = bronzeProgress.pctCoins;

  // Projected Discovery Placement Label
  const placementLabel =
    rankIndex === 0
      ? '🎯 #1 Priority Hero Placement'
      : rankIndex < 4
      ? '⭐ Row 1 Top 4 Recommended'
      : rankIndex < 8
      ? '📱 Row 2 Prime Carousel'
      : '🌐 Standard Discovery Grid';

  const maxTotalScore = 350;
  const scorePercent = Math.min(100, Math.round((calculatedScore / maxTotalScore) * 100));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-black/85 backdrop-blur-md animate-fade-in overflow-y-auto">
      <div className="bg-[#141724] border border-slate-700/80 rounded-3xl w-full max-w-4xl max-h-[92vh] flex flex-col shadow-2xl overflow-hidden text-slate-100 relative">
        
        {/* Ambient Top Glow */}
        <div className="absolute top-0 left-1/4 w-96 h-40 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute top-0 right-1/4 w-96 h-40 bg-amber-500/10 rounded-full blur-3xl pointer-events-none" />

        {/* 1. Modal Header & Host Profile Summary */}
        <div className="p-4 sm:p-6 bg-gradient-to-r from-[#111420] via-[#161a2b] to-[#121422] border-b border-slate-800 relative z-10">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            {/* Host Identity Details */}
            <div className="flex items-center space-x-3.5">
              <div className="relative">
                <img
                  src={normalizeMediaUrl(user.avatarUrl)}
                  alt={user.name}
                  onError={(e) => {
                    (e.target as HTMLImageElement).src = getFallbackAvatar(user.name, user.gender, user.role);
                  }}
                  className="w-14 h-14 sm:w-16 sm:h-16 rounded-2xl object-cover ring-2 ring-indigo-500/60 shadow-xl"
                />
                <span
                  className={`absolute -bottom-1 -right-1 w-4 h-4 rounded-full border-2 border-[#141724] ${
                    user.onlineStatus === 'online'
                      ? 'bg-emerald-400 animate-pulse'
                      : user.onlineStatus === 'busy' || user.onlineStatus === 'in_call'
                      ? 'bg-amber-400'
                      : 'bg-rose-500'
                  }`}
                  title={`Status: ${user.onlineStatus}`}
                />
              </div>

              <div>
                <div className="flex items-center space-x-2 flex-wrap gap-y-1">
                  <h3 className="text-lg sm:text-xl font-black text-white">{user.name}</h3>
                  {user.isVerified && (
                    <span className="p-0.5 rounded bg-blue-500/20 text-blue-400 border border-blue-500/40" title="AI Verified Profile">
                      <ShieldCheck className="w-3.5 h-3.5" />
                    </span>
                  )}
                  <span className={`px-2 py-0.5 rounded-md text-[10px] font-black uppercase font-mono border ${
                    tier === 'gold'
                      ? 'bg-yellow-500/20 text-yellow-300 border-yellow-500/50'
                      : tier === 'silver'
                      ? 'bg-slate-300/20 text-slate-200 border-slate-300/50'
                      : 'bg-amber-800/20 text-amber-300 border-amber-800/50'
                  }`}>
                    {tier === 'gold' ? '👑 GOLD' : tier === 'silver' ? '🥈 SILVER' : '🥉 BRONZE'}
                  </span>

                  {isReadyNow && (
                    <span className="px-2 py-0.5 rounded-md bg-gradient-to-r from-orange-600 to-amber-500 text-white text-[10px] font-black uppercase font-mono shadow-md flex items-center space-x-1">
                      <Flame className="w-2.5 h-2.5 fill-current" />
                      <span>SURGE ON (+{breakdown.readyNowScore})</span>
                    </span>
                  )}
                </div>

                <div className="flex items-center space-x-2 text-xs text-slate-400 mt-1 font-mono flex-wrap">
                  <span>{user.age} yrs</span>
                  <span>•</span>
                  <div className="flex items-center space-x-1">
                    <SvgFlag countryCode={user.countryCode} nationality={user.nationality} size="xs" rounded={true} />
                    <span>{getUserEffectiveLocation(user).displayCity}</span>
                  </div>
                  <span>•</span>
                  <span>ID: {user.id.slice(0, 8)}...</span>
                  {teamLeader && (
                    <>
                      <span>•</span>
                      <span className="text-amber-400 flex items-center gap-1">
                        <Building className="w-3 h-3" />
                        {teamLeader.agencyName || teamLeader.name}
                      </span>
                    </>
                  )}
                </div>
              </div>
            </div>

            {/* Live Priority Score Hero Callout */}
            <div className="flex items-center justify-between sm:justify-end space-x-3">
              <div className="bg-[#0F1115] border border-amber-500/40 rounded-2xl p-3 text-right shadow-inner min-w-[140px]">
                <div className="text-[10px] text-slate-400 uppercase font-mono font-bold flex items-center justify-end space-x-1">
                  <Sparkles className="w-3 h-3 text-amber-400" />
                  <span>Live Rank #{rankIndex + 1}</span>
                </div>
                <div className="text-xl sm:text-2xl font-black text-amber-300 font-mono">
                  {calculatedScore} <span className="text-xs text-slate-400 font-normal">pts</span>
                </div>
                <div className="text-[10px] text-emerald-400 font-mono font-semibold">
                  {placementLabel}
                </div>
              </div>

              <button
                onClick={onClose}
                className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white transition-colors cursor-pointer shrink-0"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>

          {/* Sub-Tabs Row */}
          <div className="flex items-center space-x-2 mt-5 pt-3 border-t border-slate-800/80 overflow-x-auto pb-1 scrollbar-none font-mono text-xs">
            <button
              onClick={() => setActiveTab('analytics')}
              className={`px-3.5 py-1.5 rounded-xl font-bold flex items-center space-x-1.5 transition-all cursor-pointer shrink-0 ${
                activeTab === 'analytics'
                  ? 'bg-indigo-600 text-white shadow-md shadow-indigo-950/60'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
              }`}
            >
              <Activity className="w-3.5 h-3.5 text-indigo-300" />
              <span>Executive Analytics</span>
            </button>

            <button
              onClick={() => setActiveTab('math')}
              className={`px-3.5 py-1.5 rounded-xl font-bold flex items-center space-x-1.5 transition-all cursor-pointer shrink-0 ${
                activeTab === 'math'
                  ? 'bg-gradient-to-r from-amber-600 to-yellow-500 text-slate-950 shadow-md shadow-amber-950/60 font-black'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
              }`}
            >
              <Zap className="w-3.5 h-3.5 text-yellow-300" />
              <span>Score Math Formula</span>
            </button>

            <button
              onClick={() => setActiveTab('targets')}
              className={`px-3.5 py-1.5 rounded-xl font-bold flex items-center space-x-1.5 transition-all cursor-pointer shrink-0 ${
                activeTab === 'targets'
                  ? 'bg-emerald-600 text-white shadow-md shadow-emerald-950/60'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
              }`}
            >
              <Crown className="w-3.5 h-3.5 text-emerald-300" />
              <span>Dual Target Engine</span>
            </button>

            <button
              onClick={() => setActiveTab('telemetry')}
              className={`px-3.5 py-1.5 rounded-xl font-bold flex items-center space-x-1.5 transition-all cursor-pointer shrink-0 ${
                activeTab === 'telemetry'
                  ? 'bg-purple-600 text-white shadow-md shadow-purple-950/60'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
              }`}
            >
              <Clock className="w-3.5 h-3.5 text-purple-300" />
              <span>Heartbeats & Telemetry</span>
            </button>
          </div>
        </div>

        {/* 2. Modal Body / Active Sub-View */}
        <div className="p-4 sm:p-6 overflow-y-auto space-y-6 flex-1">
          
          {/* ================= VIEW 1: EXECUTIVE ANALYTICS ================= */}
          {activeTab === 'analytics' && (
            <div className="space-y-6">
              {/* FEATURED: Dynamic Point Meter & Multi-Segment Gauge */}
              <div className="p-4 bg-gradient-to-r from-[#121524] via-[#171b30] to-[#121422] border border-indigo-500/40 rounded-2xl space-y-3 shadow-xl font-mono text-xs">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div className="flex items-center space-x-2">
                    <div className="p-2 rounded-xl bg-gradient-to-tr from-amber-500 to-yellow-400 text-slate-950 font-black shadow-md">
                      <Gauge className="w-4 h-4" />
                    </div>
                    <div>
                      <h4 className="font-bold text-white text-sm flex items-center gap-1.5">
                        <span>Dynamic Priority Point Meter</span>
                        <span className="px-2 py-0.2 rounded bg-emerald-950 text-emerald-300 border border-emerald-500/40 text-[10px] animate-pulse">
                          ⚡ LIVE ENGINE
                        </span>
                      </h4>
                      <p className="text-[11px] text-slate-400">
                        Multi-dimensional real-time score calculation powering creator discovery placement.
                      </p>
                    </div>
                  </div>

                  <div className="text-right">
                    <div className="text-xl font-black text-amber-300">
                      {calculatedScore} <span className="text-xs text-slate-400 font-normal">/ {maxTotalScore} pts ({scorePercent}%)</span>
                    </div>
                  </div>
                </div>

                {/* Segmented Color Points Progress Bar */}
                <div className="space-y-1.5 pt-1">
                  <div className="w-full bg-slate-950 h-3.5 rounded-full overflow-hidden flex border border-slate-800 p-0.5 shadow-inner">
                    <div
                      style={{ width: `${(breakdown.onlineScore / maxTotalScore) * 100}%` }}
                      className="bg-emerald-400 h-full rounded-l-full"
                      title={`Online Base: +${breakdown.onlineScore} pts`}
                    />
                    <div
                      style={{ width: `${(breakdown.tierScore / maxTotalScore) * 100}%` }}
                      className="bg-yellow-400 h-full"
                      title={`Tier Multiplier: +${breakdown.tierScore} pts`}
                    />
                    {breakdown.readyNowScore > 0 && (
                      <div
                        style={{ width: `${(breakdown.readyNowScore / maxTotalScore) * 100}%` }}
                        className="bg-orange-400 h-full"
                        title={`Ready Now Surge: +${breakdown.readyNowScore} pts`}
                      />
                    )}
                    <div
                      style={{ width: `${(breakdown.healthScorePts / maxTotalScore) * 100}%` }}
                      className="bg-blue-400 h-full"
                      title={`Response Health: +${breakdown.healthScorePts} pts`}
                    />
                    {breakdown.streakScore > 0 && (
                      <div
                        style={{ width: `${(breakdown.streakScore / maxTotalScore) * 100}%` }}
                        className="bg-purple-400 h-full"
                        title={`Streak Boost: +${breakdown.streakScore} pts`}
                      />
                    )}
                    {breakdown.trustScore > 0 && (
                      <div
                        style={{ width: `${(breakdown.trustScore / maxTotalScore) * 100}%` }}
                        className="bg-cyan-400 h-full"
                        title={`Trust & Rating: +${breakdown.trustScore} pts`}
                      />
                    )}
                    {breakdown.diversityJitter > 0 && (
                      <div
                        style={{ width: `${(breakdown.diversityJitter / maxTotalScore) * 100}%` }}
                        className="bg-pink-400 h-full rounded-r-full"
                        title={`Diversity Jitter: +${breakdown.diversityJitter} pts`}
                      />
                    )}
                  </div>

                  {/* Meter Legend Strip */}
                  <div className="flex items-center justify-between flex-wrap gap-2 text-[10px] text-slate-300 pt-1">
                    <span className="flex items-center gap-1">
                      <span className="w-2 h-2 rounded-full bg-emerald-400" />
                      <span>Online (+{breakdown.onlineScore})</span>
                    </span>
                    <span className="flex items-center gap-1">
                      <span className="w-2 h-2 rounded-full bg-yellow-400" />
                      <span>Tier (+{breakdown.tierScore})</span>
                    </span>
                    {breakdown.readyNowScore > 0 && (
                      <span className="flex items-center gap-1">
                        <span className="w-2 h-2 rounded-full bg-orange-400" />
                        <span>Surge (+{breakdown.readyNowScore})</span>
                      </span>
                    )}
                    <span className="flex items-center gap-1">
                      <span className="w-2 h-2 rounded-full bg-blue-400" />
                      <span>Health (+{breakdown.healthScorePts})</span>
                    </span>
                    {breakdown.streakScore > 0 && (
                      <span className="flex items-center gap-1">
                        <span className="w-2 h-2 rounded-full bg-purple-400" />
                        <span>Streak (+{breakdown.streakScore})</span>
                      </span>
                    )}
                    <span className="flex items-center gap-1">
                      <span className="w-2 h-2 rounded-full bg-pink-400" />
                      <span>Jitter (+{breakdown.diversityJitter})</span>
                    </span>
                  </div>
                </div>
              </div>

              {/* 4 Executive Meter Cards */}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                {/* Meter 1: Priority Score Progress */}
                <div className="p-3.5 bg-[#0F1115] border border-slate-800 rounded-2xl space-y-2">
                  <div className="flex items-center justify-between text-xs text-slate-400 font-mono">
                    <span>Priority Score</span>
                    <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                  </div>
                  <div className="text-xl font-black text-white font-mono">
                    {calculatedScore} <span className="text-xs text-slate-500 font-normal">/ 350 max</span>
                  </div>
                  <div className="w-full bg-slate-900 h-2 rounded-full overflow-hidden border border-slate-800">
                    <div
                      style={{ width: `${Math.min(100, (calculatedScore / 350) * 100)}%` }}
                      className="bg-gradient-to-r from-amber-500 to-yellow-400 h-full rounded-full"
                    />
                  </div>
                  <div className="text-[10px] text-amber-300 font-mono">
                    Top {Math.max(1, Math.round(((rankIndex + 1) / Math.max(1, users.length)) * 100))}% discovery tier
                  </div>
                </div>

                {/* Meter 2: Response Health Meter */}
                <div className="p-3.5 bg-[#0F1115] border border-slate-800 rounded-2xl space-y-2">
                  <div className="flex items-center justify-between text-xs text-slate-400 font-mono">
                    <span>Response Health</span>
                    <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
                  </div>
                  <div className="text-xl font-black text-emerald-400 font-mono">
                    {healthScore}% <span className="text-xs text-slate-500 font-normal">rating</span>
                  </div>
                  <div className="w-full bg-slate-900 h-2 rounded-full overflow-hidden border border-slate-800">
                    <div
                      style={{ width: `${healthScore}%` }}
                      className={`h-full rounded-full ${
                        healthScore >= 90 ? 'bg-emerald-400' : healthScore >= 70 ? 'bg-amber-400' : 'bg-rose-500'
                      }`}
                    />
                  </div>
                  <div className="text-[10px] text-slate-400 font-mono">
                    {answeredCount} of {totalCallsOffered} calls answered
                  </div>
                </div>

                {/* Meter 3: Target Hours Logged */}
                <div className="p-3.5 bg-[#0F1115] border border-slate-800 rounded-2xl space-y-2">
                  <div className="flex items-center justify-between text-xs text-slate-400 font-mono">
                    <span>Active Hours Logged</span>
                    <Clock className="w-3.5 h-3.5 text-indigo-400" />
                  </div>
                  <div className="text-xl font-black text-indigo-300 font-mono">
                    {liveActiveHours}h <span className="text-xs text-slate-500 font-normal">/ {targetHours}h goal</span>
                  </div>
                  <div className="w-full bg-slate-900 h-2 rounded-full overflow-hidden border border-slate-800">
                    <div
                      style={{ width: `${hoursPct}%` }}
                      className="bg-gradient-to-r from-indigo-500 to-blue-400 h-full rounded-full"
                    />
                  </div>
                  <div className="text-[10px] text-slate-400 font-mono">
                    {hoursPct}% target completed
                  </div>
                </div>

                {/* Meter 4: Total Withdrawable Earnings */}
                <div className="p-3.5 bg-[#0F1115] border border-slate-800 rounded-2xl space-y-2">
                  <div className="flex items-center justify-between text-xs text-slate-400 font-mono">
                    <span>Withdrawable Balance</span>
                    <DollarSign className="w-3.5 h-3.5 text-emerald-400" />
                  </div>
                  <div className="text-xl font-black text-emerald-400 font-mono">
                    ${totalEarnedUSD.toFixed(2)}{' '}
                    <span className="text-xs text-slate-500 font-normal">USD</span>
                  </div>
                  <div className="text-[10px] text-amber-300 font-mono">
                    🪙 {totalEarnedCoins.toLocaleString()} coins balance
                  </div>
                  <div className="text-[10px] text-slate-500 font-mono">
                    Payout USD @ Coin USD Peg (Economy → D). Includes calls + gifts + bonuses.
                  </div>
                </div>
              </div>

              {/* Charts Row: Score Breakdown Bar Chart + Call Acceptance Donut */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {/* Chart 1: Priority Score Composition Breakdown */}
                <div className="p-4 bg-[#0F1115] border border-slate-800 rounded-2xl space-y-3 shadow-lg">
                  <div className="flex items-center justify-between">
                    <h4 className="text-xs font-bold text-white font-mono uppercase flex items-center space-x-1.5">
                      <BarChart className="w-3.5 h-3.5 text-indigo-400" />
                      <span>Algorithmic Weight Points Contribution</span>
                    </h4>
                    <span className="text-[10px] text-slate-400 font-mono font-bold">
                      {calculatedScore} Total pts
                    </span>
                  </div>

                  <div className="h-56 w-full font-mono text-xs">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={scoreChartData} layout="vertical" margin={{ left: 20, right: 20, top: 10, bottom: 0 }}>
                        <XAxis type="number" stroke="#64748b" tick={{ fontSize: 10 }} />
                        <YAxis type="category" dataKey="name" stroke="#94a3b8" tick={{ fontSize: 10 }} width={90} />
                        <Tooltip
                          contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', borderRadius: '0.75rem', fontSize: '11px' }}
                          formatter={(val: any) => [`+${val} pts`, 'Score Awarded']}
                        />
                        <Bar dataKey="score" radius={[0, 4, 4, 0]}>
                          {scoreChartData.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={entry.fill} />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                {/* Chart 2: Call Acceptance & Engagement Donut */}
                <div className="p-4 bg-[#0F1115] border border-slate-800 rounded-2xl space-y-3 shadow-lg flex flex-col justify-between">
                  <div className="flex items-center justify-between">
                    <h4 className="text-xs font-bold text-white font-mono uppercase flex items-center space-x-1.5">
                      <PhoneCall className="w-3.5 h-3.5 text-emerald-400" />
                      <span>Call Acceptance & Quality Breakdown</span>
                    </h4>
                    <span className="text-[10px] text-emerald-400 font-mono font-bold">
                      {healthScore}% Response Health
                    </span>
                  </div>

                  <div className="h-44 w-full flex items-center justify-center">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={callDistributionData}
                          innerRadius={45}
                          outerRadius={70}
                          paddingAngle={4}
                          dataKey="value"
                        >
                          {callDistributionData.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={entry.color} />
                          ))}
                        </Pie>
                        <Tooltip
                          contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', borderRadius: '0.75rem', fontSize: '11px' }}
                        />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>

                  <div className="grid grid-cols-3 gap-2 text-center text-[11px] font-mono border-t border-slate-800 pt-2">
                    <div className="p-1.5 bg-slate-900/80 rounded-lg">
                      <span className="text-emerald-400 font-bold block">{answeredCount}</span>
                      <span className="text-[9px] text-slate-400 uppercase">Answered</span>
                    </div>
                    <div className="p-1.5 bg-slate-900/80 rounded-lg">
                      <span className="text-amber-400 font-bold block">{declinedCount}</span>
                      <span className="text-[9px] text-slate-400 uppercase">Declined</span>
                    </div>
                    <div className="p-1.5 bg-slate-900/80 rounded-lg">
                      <span className="text-rose-400 font-bold block">{missedCount}</span>
                      <span className="text-[9px] text-slate-400 uppercase">Missed</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ================= VIEW 2: MATHEMATICAL FORMULA DEEP DIVE ================= */}
          {activeTab === 'math' && (
            <div className="space-y-5 text-xs font-mono">
              {/* Grand Formula Card */}
              <div className="p-4 bg-gradient-to-r from-indigo-950/50 via-[#0F1115] to-purple-950/50 border border-indigo-500/40 rounded-2xl space-y-2.5 shadow-xl">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-black uppercase text-indigo-300 flex items-center gap-1.5">
                    <Sparkles className="w-4 h-4 text-amber-400" />
                    <span>Real-Time Discovery Score Equation</span>
                  </span>
                  <span className="px-2 py-0.5 rounded bg-indigo-950 text-indigo-300 border border-indigo-700/60 font-bold text-[10px]">
                    LIVE EVALUATION
                  </span>
                </div>

                <div className="p-3 bg-slate-950/90 rounded-xl border border-slate-800 text-amber-300 font-bold text-xs sm:text-sm leading-relaxed overflow-x-auto">
                  Score = W_online({breakdown.onlineScore}) + W_tier({breakdown.tierScore}) + W_surge({breakdown.readyNowScore}) + W_health({breakdown.healthScorePts}) + W_streak({breakdown.streakScore}) + W_trust({breakdown.trustScore}) + W_jitter({breakdown.diversityJitter})
                </div>

                <div className="flex items-center justify-between text-xs pt-1">
                  <span className="text-slate-400">Total Calculated Discoverability Score:</span>
                  <span className="text-lg font-black text-emerald-400">
                    = {calculatedScore} pts
                  </span>
                </div>
              </div>

              {/* Step-by-Step Algebraic Variable Breakdown Cards */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {/* 1. Online Base */}
                <div className="p-3.5 bg-[#0F1115] border border-slate-800 rounded-xl space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-slate-300">1. Online Status Weight (W_online)</span>
                    <span className="text-emerald-400 font-black">+{breakdown.onlineScore} pts</span>
                  </div>
                  <p className="text-[11px] text-slate-400">
                    Status: <strong className="text-white uppercase">{user.onlineStatus}</strong>. Online awarded +{systemSettings.algoWeightOnlineAvailable ?? 100}, Busy +{systemSettings.algoWeightBusyInCall ?? 40}, Offline +5.
                  </p>
                </div>

                {/* 2. Tier Weight */}
                <div className="p-3.5 bg-[#0F1115] border border-slate-800 rounded-xl space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-slate-300">2. Performance Tier Multiplier (W_tier)</span>
                    <span className="text-yellow-400 font-black">+{breakdown.tierScore} pts</span>
                  </div>
                  <p className="text-[11px] text-slate-400">
                    Tier: <strong className="text-white uppercase">{tier}</strong>. Gold awards +{systemSettings.algoWeightGoldTier ?? 100}, Silver +{systemSettings.algoWeightSilverTier ?? 50}, Bronze +{systemSettings.algoWeightBronzeTier ?? 20}.
                  </p>
                </div>

                {/* 3. Ready Now Peak Surge */}
                <div className="p-3.5 bg-[#0F1115] border border-slate-800 rounded-xl space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-slate-300">3. Ready Now Peak Surge (W_surge)</span>
                    <span className="text-orange-400 font-black">+{breakdown.readyNowScore} pts</span>
                  </div>
                  <p className="text-[11px] text-slate-400">
                    Surge Status: <strong className="text-white">{isReadyNow ? 'ACTIVE 🔥' : 'INACTIVE'}</strong>. Active during peak hours ({systemSettings.peakHoursStart} - {systemSettings.peakHoursEnd}) grants +{systemSettings.algoWeightReadyNowSurge ?? 80}.
                  </p>
                </div>

                {/* 4. Response Health Score */}
                <div className="p-3.5 bg-[#0F1115] border border-slate-800 rounded-xl space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-slate-300">4. Response Health Scaling (W_health)</span>
                    <span className="text-blue-400 font-black">+{breakdown.healthScorePts} pts</span>
                  </div>
                  <p className="text-[11px] text-slate-400">
                    Formula: <span className="text-slate-300">({healthScore}% / 100) * {systemSettings.algoWeightResponseHealthMax ?? 40} pts</span> = +{breakdown.healthScorePts} pts.
                  </p>
                </div>

                {/* 5. Streak Boost */}
                <div className="p-3.5 bg-[#0F1115] border border-slate-800 rounded-xl space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-slate-300">5. 7-Day Consistency Streak (W_streak)</span>
                    <span className="text-purple-400 font-black">+{breakdown.streakScore} pts</span>
                  </div>
                  <p className="text-[11px] text-slate-400">
                    Streak: <strong className="text-white">{metrics.currentStreakDays} days active</strong>. 7+ days unlocks +{systemSettings.algoWeightStreakBoost ?? 30} boost.
                  </p>
                </div>

                {/* 6. Trust & Rating */}
                <div className="p-3.5 bg-[#0F1115] border border-slate-800 rounded-xl space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-slate-300">6. Verification & Rating (W_trust)</span>
                    <span className="text-cyan-400 font-black">+{breakdown.trustScore} pts</span>
                  </div>
                  <p className="text-[11px] text-slate-400">
                    Verified: {user.isVerified ? 'Yes (+15)' : 'No (+0)'} • Rating: {user.ratingScore || 5.0}★ (+{((user.ratingScore || 5) >= 4.8) ? 10 : 0}).
                  </p>
                </div>

                {/* 7. Diversity Jitter */}
                <div className="p-3.5 bg-[#0F1115] border border-slate-800 rounded-xl space-y-1.5 md:col-span-2">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-slate-300">7. Diversity Anti-Fatigue Jitter (W_jitter)</span>
                    <span className="text-pink-400 font-black">+{breakdown.diversityJitter} pts</span>
                  </div>
                  <p className="text-[11px] text-slate-400">
                    Randomized dynamic variation (0 to {systemSettings.algoWeightDiversityJitterMax ?? 25} pts) ensuring top hosts rotate organically and prevent permanent top-slot pinning.
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* ================= VIEW 3: BRONZE TRUE-UP GATE + TIER LADDER ================= */}
          {activeTab === 'targets' && (
            <div className="space-y-5 text-xs font-mono">
              <div className="p-4 bg-[#0F1115] border border-slate-800 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-lg">
                <div>
                  <div className="flex items-center space-x-2">
                    <span className="text-xs font-bold uppercase text-slate-400">Target Cycle:</span>
                    <span className="px-2 py-0.5 rounded bg-indigo-950 text-indigo-300 border border-indigo-700/60 uppercase font-black">
                      {targetCycle} Cycle
                    </span>
                  </div>
                  <h4 className="text-base font-black text-white mt-1">
                    {tier.toUpperCase()} TIER STANDING
                  </h4>
                </div>

                <div className="text-right font-mono">
                  <span className="text-[10px] text-slate-400 uppercase block">Tier cash bonus (separate)</span>
                  <span className="text-lg font-black text-emerald-400">+${bonusUSD.toFixed(2)} USD</span>
                </div>
              </div>

              <HostPeriodTargetProgressPanel
                progress={bronzeProgress}
                variant="admin"
                showDeepLinks
              />

              {/* Higher-tier ladder (cash bonus) — not the true-up gate */}
              {(tier === 'bronze' || tier === 'silver') && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 opacity-90">
                  <div className="p-4 bg-[#0F1115] border border-slate-800 rounded-xl space-y-2.5">
                    <div className="flex items-center justify-between font-bold">
                      <span className="text-slate-300 flex items-center gap-1.5">
                        <Clock className="w-4 h-4 text-indigo-400" />
                        <span>Next-tier hours ({tier === 'bronze' ? 'silver' : 'gold'})</span>
                      </span>
                      <span className="text-white">
                        {liveActiveHours}h <span className="text-slate-500">/ {targetHours}h</span>
                      </span>
                    </div>
                    <div className="w-full bg-slate-900 h-3 rounded-full overflow-hidden border border-slate-800 p-0.5">
                      <div
                        style={{
                          width: `${Math.min(100, Math.round((liveActiveHours / Math.max(1, targetHours)) * 100))}%`,
                        }}
                        className="bg-gradient-to-r from-indigo-500/70 to-blue-400/70 h-full rounded-full"
                      />
                    </div>
                  </div>
                  <div className="p-4 bg-[#0F1115] border border-slate-800 rounded-xl space-y-2.5">
                    <div className="flex items-center justify-between font-bold">
                      <span className="text-slate-300 flex items-center gap-1.5">
                        <Coins className="w-4 h-4 text-amber-400" />
                        <span>Next-tier coins</span>
                      </span>
                      <span className="text-amber-400">
                        {currentCoins.toLocaleString()}{' '}
                        <span className="text-slate-500">/ {targetCoins.toLocaleString()}</span>
                      </span>
                    </div>
                    <div className="w-full bg-slate-900 h-3 rounded-full overflow-hidden border border-slate-800 p-0.5">
                      <div
                        style={{
                          width: `${Math.min(100, Math.round((currentCoins / Math.max(1, targetCoins)) * 100))}%`,
                        }}
                        className="bg-gradient-to-r from-amber-500/70 to-yellow-400/70 h-full rounded-full"
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* Agency Leader Association & Revenue Split */}
              {teamLeader ? (
                <div className="p-4 bg-[#0F1115] border border-amber-500/30 rounded-xl space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-2">
                      <Building className="w-4 h-4 text-amber-400" />
                      <span className="font-bold text-white">Managed by: {teamLeader.name}</span>
                    </div>
                    <span className="px-2 py-0.5 rounded bg-amber-950 text-amber-300 border border-amber-600/50 font-bold text-[10px]">
                      {teamLeader.commissionPercent ?? systemSettings.teamLeaderSharePercent ?? 10}% Commission
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-400">
                    Agency Guild: <strong className="text-slate-200">{teamLeader.agencyName || 'Aurora Talent Management'}</strong>. Host earnings are split seamlessly on completion.
                  </p>
                </div>
              ) : (
                <div className="p-3 bg-[#0F1115] border border-slate-800 rounded-xl text-[11px] text-slate-400">
                  <span>Independent Host (Direct Platform Account, No Agency Split Override)</span>
                </div>
              )}
            </div>
          )}

          {/* ================= VIEW 4: TELEMETRY & AUDIT TRAIL ================= */}
          {activeTab === 'telemetry' && (
            <div className="space-y-4 text-xs font-mono">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="p-3.5 bg-[#0F1115] border border-slate-800 rounded-xl space-y-1">
                  <span className="text-[10px] text-slate-500 uppercase font-bold">Foreground Heartbeat Ping</span>
                  <div className="text-white font-bold">{metrics.lastActiveDate || 'Active Today'}</div>
                  <span className="text-[10px] text-emerald-400">60-second polling interval active ({liveSecondsTick}s live window)</span>
                </div>

                <div className="p-3.5 bg-[#0F1115] border border-slate-800 rounded-xl space-y-1">
                  <span className="text-[10px] text-slate-500 uppercase font-bold">Call Ring Timeout Window</span>
                  <div className="text-white font-bold">{systemSettings.callRingTimeoutSeconds ?? 30} Seconds</div>
                  <span className="text-[10px] text-slate-400">Threshold before call marked missed</span>
                </div>

                <div className="p-3.5 bg-[#0F1115] border border-slate-800 rounded-xl space-y-1">
                  <span className="text-[10px] text-slate-500 uppercase font-bold">1st Paid Call Daily Bonus</span>
                  <div className="text-emerald-400 font-bold">
                    {metrics.firstCallBonusClaimedDate === new Date().toISOString().split('T')[0]
                      ? 'Claimed Today ✅'
                      : 'Available on Next Call 🎁'}
                  </div>
                  <span className="text-[10px] text-slate-400">
                    +{systemSettings.dailyFirstCallBonusCoins ?? 100} coins / +${systemSettings.dailyFirstCallBonusUSD ?? 1.00} USD
                  </span>
                </div>

                <div className="p-3.5 bg-[#0F1115] border border-slate-800 rounded-xl space-y-1">
                  <span className="text-[10px] text-slate-500 uppercase font-bold">Active Streak Multiplier</span>
                  <div className="text-purple-300 font-bold">
                    {hasStreakBoost ? '🔥 +30 Boost Active' : `${metrics.currentStreakDays} / ${systemSettings.streakTargetDays ?? 7} Days`}
                  </div>
                  <span className="text-[10px] text-slate-400">Requires 2+ active hours daily</span>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* 3. Modal Footer */}
        <div className="p-4 bg-[#111420] border-t border-slate-800 flex items-center justify-between">
          <div className="text-[11px] text-slate-400 font-mono hidden sm:block">
            <span>Database Table: </span>
            <span className="text-slate-200 font-bold">creator_metrics (Supabase)</span>
          </div>

          <div className="flex items-center space-x-2">
            <button
              onClick={onClose}
              className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-white text-xs font-mono font-bold transition-all cursor-pointer"
            >
              Close Analytics Inspector
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
