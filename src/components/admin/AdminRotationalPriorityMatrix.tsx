import React, { useState, useMemo, useEffect } from 'react';
import { useApp } from '../../context/AppContext';
import {
  Zap,
  Crown,
  Award,
  Flame,
  Clock,
  Coins,
  ShieldCheck,
  Star,
  Sliders,
  TrendingUp,
  Search,
  Filter,
  RefreshCw,
  Info,
  HelpCircle,
  CheckCircle2,
  AlertCircle,
  Eye,
  Sparkles,
  ArrowUpRight,
  Activity,
  Layers,
  Save,
  RotateCcw,
  SlidersHorizontal,
  X,
} from 'lucide-react';
import { UserProfile, CreatorMetrics, CreatorTier } from '../../types';
import {
  rankCreatorsForDiscovery,
  isCurrentlyPeakHour,
  getDetailedCreatorScoreBreakdown,
  RankedCreatorItem,
} from '../../utils/discoveryAlgorithm';
import { SvgFlag } from '../common/SvgFlag';
import { getUserEffectiveLocation } from '../../utils/location';
import { normalizeMediaUrl } from '../../utils/r2Storage';
import { getFallbackAvatar } from '../../utils/avatars';
import { HostMathAnalyticsModal } from './HostMathAnalyticsModal';

export const AdminRotationalPriorityMatrix: React.FC = () => {
  const {
    users,
    creatorMetricsMap,
    systemSettings,
    updateSystemSettings,
    showToast,
    syncUsersFromSupabase,
  } = useApp();

  // Dynamic Algorithmic Weight State (Hydrated from systemSettings)
  const [weights, setWeights] = useState({
    onlineAvailable: systemSettings.algoWeightOnlineAvailable ?? 100,
    busyInCall: systemSettings.algoWeightBusyInCall ?? 40,
    goldTier: systemSettings.algoWeightGoldTier ?? 100,
    silverTier: systemSettings.algoWeightSilverTier ?? 50,
    bronzeTier: systemSettings.algoWeightBronzeTier ?? 20,
    readyNowSurge: systemSettings.algoWeightReadyNowSurge ?? 80,
    responseHealthMax: systemSettings.algoWeightResponseHealthMax ?? 40,
    streakBoost: systemSettings.algoWeightStreakBoost ?? 30,
    diversityJitterMax: systemSettings.algoWeightDiversityJitterMax ?? 25,
    verified: systemSettings.algoWeightVerified ?? 15,
    highRating: systemSettings.algoWeightHighRating ?? 10,
  });

  // Synchronize local weights whenever systemSettings updates
  useEffect(() => {
    setWeights({
      onlineAvailable: systemSettings.algoWeightOnlineAvailable ?? 100,
      busyInCall: systemSettings.algoWeightBusyInCall ?? 40,
      goldTier: systemSettings.algoWeightGoldTier ?? 100,
      silverTier: systemSettings.algoWeightSilverTier ?? 50,
      bronzeTier: systemSettings.algoWeightBronzeTier ?? 20,
      readyNowSurge: systemSettings.algoWeightReadyNowSurge ?? 80,
      responseHealthMax: systemSettings.algoWeightResponseHealthMax ?? 40,
      streakBoost: systemSettings.algoWeightStreakBoost ?? 30,
      diversityJitterMax: systemSettings.algoWeightDiversityJitterMax ?? 25,
      verified: systemSettings.algoWeightVerified ?? 15,
      highRating: systemSettings.algoWeightHighRating ?? 10,
    });
  }, [
    systemSettings.algoWeightOnlineAvailable,
    systemSettings.algoWeightBusyInCall,
    systemSettings.algoWeightGoldTier,
    systemSettings.algoWeightSilverTier,
    systemSettings.algoWeightBronzeTier,
    systemSettings.algoWeightReadyNowSurge,
    systemSettings.algoWeightResponseHealthMax,
    systemSettings.algoWeightStreakBoost,
    systemSettings.algoWeightDiversityJitterMax,
    systemSettings.algoWeightVerified,
    systemSettings.algoWeightHighRating,
  ]);

  const [isSaving, setIsSaving] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [tierFilter, setTierFilter] = useState<'all' | 'gold' | 'silver' | 'bronze'>('all');
  const [statusFilter, setStatusFilter] = useState<'all' | 'online' | 'busy' | 'offline'>('all');
  const [readyNowOnly, setReadyNowOnly] = useState(false);
  const [selectedHostForDetail, setSelectedHostForDetail] = useState<RankedCreatorItem | null>(null);
  const [showWeightSliders, setShowWeightSliders] = useState(true);

  // Live peak traffic detector
  const isPeak = isCurrentlyPeakHour(
    systemSettings.peakHoursStart || '18:00',
    systemSettings.peakHoursEnd || '00:00'
  );

  // Real-time evaluation of all female creators in the system
  const femaleHosts = useMemo(() => {
    return users.filter(
      (u) =>
        u.role !== 'team_leader' &&
        u.role !== 'agency_manager' &&
        u.role !== 'admin' &&
        (u.gender === 'female' || u.role === 'female_creator' || u.role === 'female_host')
    );
  }, [users]);

  // Real-time ranking with dynamic weights applied
  const rankedCreators = useMemo(() => {
    return rankCreatorsForDiscovery(femaleHosts, creatorMetricsMap, {
      peakHoursStart: systemSettings.peakHoursStart,
      peakHoursEnd: systemSettings.peakHoursEnd,
      peakHoursEnabled: systemSettings.peakHoursEnabled,
      weights,
      targetThresholds: systemSettings,
    });
  }, [femaleHosts, creatorMetricsMap, systemSettings, weights]);

  // Filtered list for the Live Table
  const filteredRankedCreators = useMemo(() => {
    return rankedCreators.filter((item) => {
      if (tierFilter !== 'all' && item.tier !== tierFilter) return false;
      if (statusFilter !== 'all' && item.user.onlineStatus !== statusFilter) return false;
      if (readyNowOnly && !item.isReadyNow) return false;
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        return (
          item.user.name.toLowerCase().includes(q) ||
          (item.user.email && item.user.email.toLowerCase().includes(q)) ||
          (item.user.nationality && item.user.nationality.toLowerCase().includes(q))
        );
      }
      return true;
    });
  }, [rankedCreators, tierFilter, statusFilter, readyNowOnly, searchQuery]);

  // Real-time summary statistics
  const stats = useMemo(() => {
    const total = femaleHosts.length;
    const online = femaleHosts.filter((u) => u.onlineStatus === 'online').length;
    const busy = femaleHosts.filter((u) => u.onlineStatus === 'busy' || u.onlineStatus === 'in_call').length;
    const readyNowCount = rankedCreators.filter((r) => r.isReadyNow).length;
    const goldCount = rankedCreators.filter((r) => r.tier === 'gold').length;
    const silverCount = rankedCreators.filter((r) => r.tier === 'silver').length;
    const bronzeCount = rankedCreators.filter((r) => r.tier === 'bronze').length;
    const topScore = rankedCreators.length > 0 ? rankedCreators[0].calculatedScore : 0;
    const avgHealthScore =
      femaleHosts.length > 0
        ? Math.round(
            rankedCreators.reduce((acc, r) => acc + r.healthScore, 0) / femaleHosts.length
          )
        : 100;

    return {
      total,
      online,
      busy,
      readyNowCount,
      goldCount,
      silverCount,
      bronzeCount,
      topScore,
      avgHealthScore,
    };
  }, [femaleHosts, rankedCreators]);

  // Handle Save Dynamic Weights to Supabase
  const handleSaveWeights = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    try {
      updateSystemSettings({
        algoWeightOnlineAvailable: weights.onlineAvailable,
        algoWeightBusyInCall: weights.busyInCall,
        algoWeightGoldTier: weights.goldTier,
        algoWeightSilverTier: weights.silverTier,
        algoWeightBronzeTier: weights.bronzeTier,
        algoWeightReadyNowSurge: weights.readyNowSurge,
        algoWeightResponseHealthMax: weights.responseHealthMax,
        algoWeightStreakBoost: weights.streakBoost,
        algoWeightDiversityJitterMax: weights.diversityJitterMax,
        algoWeightVerified: weights.verified,
        algoWeightHighRating: weights.highRating,
      });
      showToast(
        'Algorithm Weights Updated ⚡',
        'Rotational priority scoring parameters saved to Supabase system configs.',
        'success'
      );
    } catch (err: any) {
      showToast('Error', err.message || 'Failed to update algorithm weights.', 'error');
    } finally {
      setIsSaving(false);
    }
  };

  // Reset to Optimal Production Defaults
  const handleResetDefaults = () => {
    setWeights({
      onlineAvailable: 100,
      busyInCall: 40,
      goldTier: 100,
      silverTier: 50,
      bronzeTier: 20,
      readyNowSurge: 80,
      responseHealthMax: 40,
      streakBoost: 30,
      diversityJitterMax: 25,
      verified: 15,
      highRating: 10,
    });
    showToast('Defaults Restored', 'Algorithm weights reset to production optimal defaults.', 'info');
  };

  const handleSyncDatabase = async () => {
    setIsSyncing(true);
    try {
      await syncUsersFromSupabase(true);
      showToast('Synced with Supabase', 'Refreshed active creators and live metrics.', 'success');
    } finally {
      setIsSyncing(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* 1. Real-Time Telemetry & Rotation Control Header */}
      <div className="p-5 bg-gradient-to-r from-[#141824] via-[#1A1F30] to-[#111420] border border-indigo-500/30 rounded-2xl shadow-xl space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center space-x-2">
              <div className="p-2.5 rounded-xl bg-gradient-to-tr from-indigo-500 to-purple-500 text-white shadow-md shadow-indigo-950/50">
                <Zap className="w-5 h-5 fill-current" />
              </div>
              <div>
                <div className="flex items-center space-x-2">
                  <h3 className="text-base sm:text-lg font-black text-white">
                    Rotational Priority, Scoring & Diversity Engine
                  </h3>
                  <span className="px-2 py-0.5 rounded bg-emerald-950/80 border border-emerald-500/50 text-emerald-300 text-[10px] font-mono font-bold flex items-center space-x-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping" />
                    <span>REAL-TIME ACTIVE</span>
                  </span>
                </div>
                <p className="text-xs text-slate-400">
                  Live scoring matrix governing discovery order, Quick Match Roulette, and Swipe Match Deck placement.
                </p>
              </div>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex items-center space-x-2.5 shrink-0">
            <button
              onClick={handleSyncDatabase}
              disabled={isSyncing}
              className="px-3.5 py-2 rounded-xl bg-slate-900 border border-slate-700 hover:border-indigo-500 text-slate-200 text-xs font-mono font-bold flex items-center space-x-1.5 transition-all cursor-pointer disabled:opacity-50"
              title="Force re-sync latest creator metrics from Supabase"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin text-indigo-400' : ''}`} />
              <span>{isSyncing ? 'Syncing...' : 'Sync Supabase'}</span>
            </button>

            <button
              onClick={() => setShowWeightSliders(!showWeightSliders)}
              className={`px-3.5 py-2 rounded-xl text-xs font-mono font-bold flex items-center space-x-1.5 transition-all cursor-pointer border ${
                showWeightSliders
                  ? 'bg-indigo-600 text-white border-indigo-400 shadow-md shadow-indigo-950/50'
                  : 'bg-slate-900 text-slate-300 border-slate-700 hover:bg-slate-800'
              }`}
            >
              <SlidersHorizontal className="w-3.5 h-3.5" />
              <span>{showWeightSliders ? 'Hide Sliders' : 'Edit Weights'}</span>
            </button>
          </div>
        </div>

        {/* Real-time Telemetry Metrics Strip */}
        <div className="space-y-1.5 pt-2 border-t border-slate-800/80">
          <div className="flex items-center space-x-2">
            <span className="text-[10px] font-mono uppercase font-bold text-slate-400">Discovery Rotation Live Telemetry</span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 font-mono text-xs">
            {/* Active Evaluated Hosts */}
            <div className="bg-[#0D1017] p-3 rounded-xl border border-slate-800 space-y-1">
              <div className="text-[10px] text-slate-400 uppercase font-bold flex items-center justify-between">
                <span>Evaluated Hosts</span>
                <Activity className="w-3.5 h-3.5 text-indigo-400" />
              </div>
              <div className="text-lg font-black text-white">{stats.total}</div>
              <div className="text-[10px] text-slate-500">Callable creators</div>
            </div>

            {/* Online & In-Call */}
            <div className="bg-[#0D1017] p-3 rounded-xl border border-slate-800 space-y-1">
              <div className="text-[10px] text-slate-400 uppercase font-bold flex items-center justify-between">
                <span>Available Now</span>
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              </div>
              <div className="text-lg font-black text-emerald-400">
                {stats.online}{' '}
                <span className="text-xs text-amber-400 font-normal">({stats.busy} busy)</span>
              </div>
              <div className="text-[10px] text-slate-500">Live WebRTC Queue</div>
            </div>

            {/* Ready Now Surge */}
            <div className="bg-[#0D1017] p-3 rounded-xl border border-slate-800 space-y-1">
              <div className="text-[10px] text-slate-400 uppercase font-bold flex items-center justify-between">
                <span>Ready Now Surge</span>
                <Flame className="w-3.5 h-3.5 text-orange-400" />
              </div>
              <div className="text-lg font-black text-orange-400">{stats.readyNowCount}</div>
              <div className="text-[10px] text-slate-500">Peak Boost Active</div>
            </div>

            {/* Tier Brackets Distribution */}
            <div className="bg-[#0D1017] p-3 rounded-xl border border-slate-800 space-y-1">
              <div className="text-[10px] text-slate-400 uppercase font-bold flex items-center justify-between">
                <span>Tier Brackets</span>
                <Crown className="w-3.5 h-3.5 text-yellow-400" />
              </div>
              <div className="text-sm font-black text-white flex items-center space-x-1 pt-1">
                <span className="text-yellow-400">{stats.goldCount}G</span>
                <span className="text-slate-500">•</span>
                <span className="text-slate-300">{stats.silverCount}S</span>
                <span className="text-slate-500">•</span>
                <span className="text-amber-500">{stats.bronzeCount}B</span>
              </div>
              <div className="text-[10px] text-slate-500">Gold / Silver / Bronze</div>
            </div>

            {/* Avg Response Health */}
            <div className="bg-[#0D1017] p-3 rounded-xl border border-slate-800 space-y-1">
              <div className="text-[10px] text-slate-400 uppercase font-bold flex items-center justify-between">
                <span>Avg Health Score</span>
                <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
              </div>
              <div className="text-lg font-black text-emerald-300">{stats.avgHealthScore}%</div>
              <div className="text-[10px] text-slate-500">Answer acceptance rate</div>
            </div>

            {/* Top Realtime Score */}
            <div className="bg-[#0D1017] p-3 rounded-xl border border-slate-800 space-y-1">
              <div className="text-[10px] text-slate-400 uppercase font-bold flex items-center justify-between">
                <span>Top Score #1</span>
                <Sparkles className="w-3.5 h-3.5 text-amber-400" />
              </div>
              <div className="text-lg font-black text-amber-300">{stats.topScore} pts</div>
              <div className="text-[10px] text-slate-500">Max priority weight</div>
            </div>
          </div>
        </div>
      </div>

      {/* 2. Dynamic Weight Control Sliders Panel */}
      {showWeightSliders && (
        <form
          onSubmit={handleSaveWeights}
          className="p-5 bg-[#161922] border border-slate-800 rounded-2xl space-y-5 shadow-xl transition-all"
        >
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-800">
            <div className="space-y-0.5">
              <h4 className="text-sm font-bold text-white flex items-center space-x-2">
                <Sliders className="w-4 h-4 text-indigo-400" />
                <span>Dynamic Weight Multipliers (Real-Time Control)</span>
              </h4>
              <p className="text-xs text-slate-400">
                Adjust the mathematical score weights. Any modification immediately re-calculates all host rankings below and can be saved to Supabase.
              </p>
            </div>

            <div className="flex items-center space-x-2">
              <button
                type="button"
                onClick={handleResetDefaults}
                className="px-3 py-1.5 rounded-lg bg-slate-900 border border-slate-700 hover:bg-slate-800 text-slate-300 text-xs font-mono font-bold flex items-center space-x-1 cursor-pointer"
                title="Reset sliders to optimal defaults"
              >
                <RotateCcw className="w-3 h-3 text-slate-400" />
                <span>Reset Defaults</span>
              </button>

              <button
                type="submit"
                disabled={isSaving}
                className="px-4 py-1.5 rounded-lg bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-slate-950 font-black text-xs font-mono shadow-md flex items-center space-x-1.5 transition-all cursor-pointer disabled:opacity-50"
              >
                <Save className="w-3.5 h-3.5" />
                <span>{isSaving ? 'Saving...' : 'Save Weights to DB'}</span>
              </button>
            </div>
          </div>

          {/* Grid of Weight Controls */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 text-xs">
            {/* 1. Online Available Weight */}
            <div className="p-3.5 bg-[#0F1115] border border-slate-800 rounded-xl space-y-2">
              <div className="flex items-center justify-between">
                <label className="font-bold text-slate-200 flex items-center space-x-1.5">
                  <span className="w-2 h-2 rounded-full bg-emerald-400" />
                  <span>Online Available Base</span>
                </label>
                <span className="font-mono font-black text-emerald-400 bg-emerald-950/80 px-2 py-0.5 rounded border border-emerald-500/40">
                  +{weights.onlineAvailable} pts
                </span>
              </div>
              <input
                type="range"
                min="20"
                max="200"
                step="5"
                value={weights.onlineAvailable}
                onChange={(e) => setWeights({ ...weights, onlineAvailable: Number(e.target.value) })}
                className="w-full accent-emerald-500 cursor-pointer"
              />
              <p className="text-[10px] text-slate-400">
                Base discovery weight awarded when a host is online and ready for video calls.
              </p>
            </div>

            {/* 2. In-Call / Busy Weight */}
            <div className="p-3.5 bg-[#0F1115] border border-slate-800 rounded-xl space-y-2">
              <div className="flex items-center justify-between">
                <label className="font-bold text-slate-200 flex items-center space-x-1.5">
                  <span className="w-2 h-2 rounded-full bg-amber-400" />
                  <span>In-Call / Busy Weight</span>
                </label>
                <span className="font-mono font-black text-amber-400 bg-amber-950/80 px-2 py-0.5 rounded border border-amber-500/40">
                  +{weights.busyInCall} pts
                </span>
              </div>
              <input
                type="range"
                min="0"
                max="100"
                step="5"
                value={weights.busyInCall}
                onChange={(e) => setWeights({ ...weights, busyInCall: Number(e.target.value) })}
                className="w-full accent-amber-500 cursor-pointer"
              />
              <p className="text-[10px] text-slate-400">
                Score given to busy hosts (maintains visibility over offline users while preventing call clashes).
              </p>
            </div>

            {/* 3. Ready Now Peak Surge */}
            <div className="p-3.5 bg-[#0F1115] border border-slate-800 rounded-xl space-y-2">
              <div className="flex items-center justify-between">
                <label className="font-bold text-slate-200 flex items-center space-x-1.5">
                  <Flame className="w-3.5 h-3.5 text-orange-400" />
                  <span>Ready Now Peak Surge</span>
                </label>
                <span className="font-mono font-black text-orange-400 bg-orange-950/80 px-2 py-0.5 rounded border border-orange-500/40">
                  +{weights.readyNowSurge} pts
                </span>
              </div>
              <input
                type="range"
                min="20"
                max="150"
                step="5"
                value={weights.readyNowSurge}
                onChange={(e) => setWeights({ ...weights, readyNowSurge: Number(e.target.value) })}
                className="w-full accent-orange-500 cursor-pointer"
              />
              <p className="text-[10px] text-slate-400">
                Surge boost added to hosts who toggle Ready Now during peak hours ({systemSettings.peakHoursStart} - {systemSettings.peakHoursEnd}).
              </p>
            </div>

            {/* 4. Gold Tier Boost */}
            <div className="p-3.5 bg-[#0F1115] border border-slate-800 rounded-xl space-y-2">
              <div className="flex items-center justify-between">
                <label className="font-bold text-slate-200 flex items-center space-x-1.5">
                  <Crown className="w-3.5 h-3.5 text-yellow-400" />
                  <span>Gold Tier Boost</span>
                </label>
                <span className="font-mono font-black text-yellow-400 bg-yellow-950/80 px-2 py-0.5 rounded border border-yellow-500/40">
                  +{weights.goldTier} pts
                </span>
              </div>
              <input
                type="range"
                min="20"
                max="200"
                step="5"
                value={weights.goldTier}
                onChange={(e) => setWeights({ ...weights, goldTier: Number(e.target.value) })}
                className="w-full accent-yellow-500 cursor-pointer"
              />
              <p className="text-[10px] text-slate-400">
                Bonus score awarded to Gold Tier creators ({systemSettings.creatorTargetGoldHours}h+ & {systemSettings.creatorTargetGoldCoins} coins).
              </p>
            </div>

            {/* 5. Silver Tier Boost */}
            <div className="p-3.5 bg-[#0F1115] border border-slate-800 rounded-xl space-y-2">
              <div className="flex items-center justify-between">
                <label className="font-bold text-slate-200 flex items-center space-x-1.5">
                  <Award className="w-3.5 h-3.5 text-slate-300" />
                  <span>Silver Tier Boost</span>
                </label>
                <span className="font-mono font-black text-slate-200 bg-slate-800 px-2 py-0.5 rounded border border-slate-600">
                  +{weights.silverTier} pts
                </span>
              </div>
              <input
                type="range"
                min="10"
                max="150"
                step="5"
                value={weights.silverTier}
                onChange={(e) => setWeights({ ...weights, silverTier: Number(e.target.value) })}
                className="w-full accent-slate-300 cursor-pointer"
              />
              <p className="text-[10px] text-slate-400">
                Bonus score for Silver Tier creators ({systemSettings.creatorTargetSilverHours}h+ & {systemSettings.creatorTargetSilverCoins} coins).
              </p>
            </div>

            {/* 6. Response Health Max Weight */}
            <div className="p-3.5 bg-[#0F1115] border border-slate-800 rounded-xl space-y-2">
              <div className="flex items-center justify-between">
                <label className="font-bold text-slate-200 flex items-center space-x-1.5">
                  <ShieldCheck className="w-3.5 h-3.5 text-blue-400" />
                  <span>Response Health Max</span>
                </label>
                <span className="font-mono font-black text-blue-400 bg-blue-950/80 px-2 py-0.5 rounded border border-blue-500/40">
                  +{weights.responseHealthMax} pts
                </span>
              </div>
              <input
                type="range"
                min="10"
                max="100"
                step="5"
                value={weights.responseHealthMax}
                onChange={(e) => setWeights({ ...weights, responseHealthMax: Number(e.target.value) })}
                className="w-full accent-blue-500 cursor-pointer"
              />
              <p className="text-[10px] text-slate-400">
                Scaled dynamically: <span className="font-mono text-slate-300">(Health% / 100) * {weights.responseHealthMax}</span>. Punishes missed calls.
              </p>
            </div>

            {/* 7. 7-Day Streak Boost */}
            <div className="p-3.5 bg-[#0F1115] border border-slate-800 rounded-xl space-y-2">
              <div className="flex items-center justify-between">
                <label className="font-bold text-slate-200 flex items-center space-x-1.5">
                  <Sparkles className="w-3.5 h-3.5 text-purple-400" />
                  <span>7-Day Streak Boost</span>
                </label>
                <span className="font-mono font-black text-purple-400 bg-purple-950/80 px-2 py-0.5 rounded border border-purple-500/40">
                  +{weights.streakBoost} pts
                </span>
              </div>
              <input
                type="range"
                min="5"
                max="100"
                step="5"
                value={weights.streakBoost}
                onChange={(e) => setWeights({ ...weights, streakBoost: Number(e.target.value) })}
                className="w-full accent-purple-500 cursor-pointer"
              />
              <p className="text-[10px] text-slate-400">
                Granted to hosts maintaining consecutive daily active attendance ({systemSettings.streakTargetDays ?? 7} days).
              </p>
            </div>

            {/* 8. Diversity / Anti-Fatigue Jitter */}
            <div className="p-3.5 bg-[#0F1115] border border-slate-800 rounded-xl space-y-2">
              <div className="flex items-center justify-between">
                <label className="font-bold text-slate-200 flex items-center space-x-1.5">
                  <TrendingUp className="w-3.5 h-3.5 text-pink-400" />
                  <span>Anti-Fatigue Jitter Max</span>
                </label>
                <span className="font-mono font-black text-pink-400 bg-pink-950/80 px-2 py-0.5 rounded border border-pink-500/40">
                  0 - {weights.diversityJitterMax} pts
                </span>
              </div>
              <input
                type="range"
                min="0"
                max="50"
                step="5"
                value={weights.diversityJitterMax}
                onChange={(e) => setWeights({ ...weights, diversityJitterMax: Number(e.target.value) })}
                className="w-full accent-pink-500 cursor-pointer"
              />
              <p className="text-[10px] text-slate-400">
                Random rotational jitter preventing the same #1 host from staying permanently pinned to top slot.
              </p>
            </div>

            {/* 9. Verified & Quality Rating */}
            <div className="p-3.5 bg-[#0F1115] border border-slate-800 rounded-xl space-y-2">
              <div className="flex items-center justify-between">
                <label className="font-bold text-slate-200 flex items-center space-x-1.5">
                  <Star className="w-3.5 h-3.5 text-yellow-400" />
                  <span>Verified ({weights.verified}) + High Star ({weights.highRating})</span>
                </label>
                <span className="font-mono font-black text-indigo-300 bg-indigo-950/80 px-2 py-0.5 rounded border border-indigo-500/40">
                  +{weights.verified + weights.highRating} pts
                </span>
              </div>
              <div className="flex items-center space-x-2">
                <input
                  type="number"
                  min="0"
                  max="50"
                  value={weights.verified}
                  onChange={(e) => setWeights({ ...weights, verified: Number(e.target.value) })}
                  className="w-1/2 p-1.5 bg-slate-900 border border-slate-700 rounded text-center text-white font-mono"
                  placeholder="Verified"
                />
                <input
                  type="number"
                  min="0"
                  max="50"
                  value={weights.highRating}
                  onChange={(e) => setWeights({ ...weights, highRating: Number(e.target.value) })}
                  className="w-1/2 p-1.5 bg-slate-900 border border-slate-700 rounded text-center text-white font-mono"
                  placeholder="Rating > 4.8"
                />
              </div>
              <p className="text-[10px] text-slate-400">
                Trust boost for AI-verified profile status (+{weights.verified}) and 4.8+ star ratings (+{weights.highRating}).
              </p>
            </div>
          </div>
        </form>
      )}

      {/* 3. Real-Time Live Ranked Host Inspector Table */}
      <div className="p-5 bg-[#161922] border border-slate-800 rounded-2xl space-y-4 shadow-xl">
        {/* Table Controls */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-800">
          <div className="space-y-0.5">
            <h4 className="text-sm font-bold text-white flex items-center space-x-2">
              <Layers className="w-4 h-4 text-emerald-400" />
              <span>Real-Time Host Priority & Discovery Positioning Table</span>
            </h4>
            <p className="text-xs text-slate-400">
              Shows real-time calculated rank, dynamic score breakdown, and projected discovery slot for each creator.
            </p>
          </div>

          {/* Search and Filters */}
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative">
              <Search className="w-3.5 h-3.5 absolute left-2.5 top-2.5 text-slate-500" />
              <input
                type="text"
                placeholder="Search creator..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-8 pr-3 py-1.5 bg-[#0F1115] border border-slate-800 rounded-lg text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 font-mono"
              />
            </div>

            <select
              value={tierFilter}
              onChange={(e: any) => setTierFilter(e.target.value)}
              className="p-1.5 bg-[#0F1115] border border-slate-800 rounded-lg text-xs text-slate-300 focus:outline-none focus:border-indigo-500 font-mono cursor-pointer"
            >
              <option value="all">All Tiers</option>
              <option value="gold">Gold Tier Only</option>
              <option value="silver">Silver Tier Only</option>
              <option value="bronze">Bronze Tier Only</option>
            </select>

            <select
              value={statusFilter}
              onChange={(e: any) => setStatusFilter(e.target.value)}
              className="p-1.5 bg-[#0F1115] border border-slate-800 rounded-lg text-xs text-slate-300 focus:outline-none focus:border-indigo-500 font-mono cursor-pointer"
            >
              <option value="all">All Statuses</option>
              <option value="online">Online Only</option>
              <option value="busy">Busy / In-Call Only</option>
              <option value="offline">Offline Only</option>
            </select>

            <button
              onClick={() => setReadyNowOnly(!readyNowOnly)}
              className={`px-2.5 py-1.5 rounded-lg text-xs font-mono font-bold flex items-center space-x-1 cursor-pointer border ${
                readyNowOnly
                  ? 'bg-orange-950 border-orange-500 text-orange-300'
                  : 'bg-[#0F1115] border-slate-800 text-slate-400 hover:text-white'
              }`}
            >
              <Flame className="w-3 h-3" />
              <span>Ready Now</span>
            </button>
          </div>
        </div>

        {/* Live Ranked Creators Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs font-mono">
            <thead>
              <tr className="border-b border-slate-800 text-slate-400 uppercase text-[10px]">
                <th className="py-2.5 px-3">Live Rank # & Host</th>
                <th className="py-2.5 px-3">Status</th>
                <th className="py-2.5 px-3">Tier</th>
                <th className="py-2.5 px-3">Ready Now Surge</th>
                <th className="py-2.5 px-3">Health Score</th>
                <th className="py-2.5 px-3">Score Breakdown</th>
                <th className="py-2.5 px-3">Total Score</th>
                <th className="py-2.5 px-3">Projected Placement</th>
                <th className="py-2.5 px-3 text-right">Inspect</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 font-sans">
              {filteredRankedCreators.length === 0 ? (
                <tr>
                  <td colSpan={9} className="py-8 text-center text-slate-500 text-xs">
                    No creators match the active filter criteria.
                  </td>
                </tr>
              ) : (
                filteredRankedCreators.map((item, idx) => {
                  const isTop3 = idx < 3;
                  const bd = item.breakdown;

                  return (
                    <tr
                      key={item.user.id}
                      className={`hover:bg-slate-800/40 transition-colors ${
                        item.isReadyNow ? 'bg-orange-950/10' : ''
                      }`}
                    >
                      {/* Rank # & Creator Details */}
                      <td className="py-3 px-3">
                        <div className="flex items-center space-x-2.5">
                          <span
                            className={`w-6 h-6 rounded-full flex items-center justify-center font-black text-xs font-mono shrink-0 ${
                              idx === 0
                                ? 'bg-yellow-500 text-slate-950 shadow-md shadow-yellow-500/30'
                                : idx === 1
                                ? 'bg-slate-300 text-slate-950 shadow-md'
                                : idx === 2
                                ? 'bg-amber-700 text-white'
                                : 'bg-slate-800 text-slate-400'
                            }`}
                          >
                            {idx + 1}
                          </span>

                          <img
                            src={normalizeMediaUrl(item.user.avatarUrl)}
                            alt={item.user.name}
                            onError={(e) => {
                              (e.target as HTMLImageElement).src = getFallbackAvatar(
                                item.user.name,
                                item.user.gender,
                                item.user.role
                              );
                            }}
                            className="w-8 h-8 rounded-full object-cover border border-slate-700 shrink-0"
                          />

                          <div>
                            <div className="flex items-center space-x-1">
                              <span className="font-bold text-white text-xs">{item.user.name}</span>
                              {item.user.isVerified && (
                                <ShieldCheck className="w-3.5 h-3.5 text-blue-400 shrink-0" />
                              )}
                            </div>
                            <div className="flex items-center space-x-1 text-[10px] text-slate-400">
                              <span>{item.user.age}y</span>
                              <span>•</span>
                              <span className="truncate max-w-[100px]">
                                {getUserEffectiveLocation(item.user).country || item.user.nationality}
                              </span>
                            </div>
                          </div>
                        </div>
                      </td>

                      {/* Online Status */}
                      <td className="py-3 px-3">
                        <span
                          className={`px-2 py-0.5 rounded-full text-[10px] font-bold font-mono uppercase inline-flex items-center space-x-1 ${
                            item.user.onlineStatus === 'online'
                              ? 'bg-emerald-950 text-emerald-300 border border-emerald-700/50'
                              : item.user.onlineStatus === 'busy' || item.user.onlineStatus === 'in_call'
                              ? 'bg-amber-950 text-amber-300 border border-amber-700/50'
                              : 'bg-slate-900 text-slate-400 border border-slate-700'
                          }`}
                        >
                          <span
                            className={`w-1.5 h-1.5 rounded-full ${
                              item.user.onlineStatus === 'online'
                                ? 'bg-emerald-400 animate-pulse'
                                : item.user.onlineStatus === 'busy' || item.user.onlineStatus === 'in_call'
                                ? 'bg-amber-400 animate-pulse'
                                : 'bg-rose-500'
                            }`}
                          />
                          <span>{item.user.onlineStatus}</span>
                        </span>
                      </td>

                      {/* Performance Tier */}
                      <td className="py-3 px-3">
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-black font-mono uppercase border ${
                            item.tier === 'gold'
                              ? 'bg-yellow-500/20 text-yellow-300 border-yellow-500/50'
                              : item.tier === 'silver'
                              ? 'bg-slate-300/20 text-slate-200 border-slate-300/50'
                              : 'bg-amber-800/20 text-amber-300 border-amber-800/50'
                          }`}
                        >
                          {item.tier === 'gold' ? '👑 GOLD' : item.tier === 'silver' ? '🥈 SILVER' : '🥉 BRONZE'}
                        </span>
                      </td>

                      {/* Ready Now Surge */}
                      <td className="py-3 px-3">
                        {item.isReadyNow ? (
                          <span className="px-2 py-0.5 rounded bg-gradient-to-r from-orange-600 to-amber-500 text-white text-[10px] font-black uppercase tracking-wider font-mono shadow-sm flex items-center space-x-1 w-max">
                            <Flame className="w-2.5 h-2.5 fill-current" />
                            <span>SURGE ON (+{weights.readyNowSurge})</span>
                          </span>
                        ) : (
                          <span className="text-[10px] text-slate-500 font-mono">Inactive</span>
                        )}
                      </td>

                      {/* Response Health */}
                      <td className="py-3 px-3 font-mono">
                        <div className="flex items-center space-x-1">
                          <span
                            className={`font-bold ${
                              item.healthScore >= 90
                                ? 'text-emerald-400'
                                : item.healthScore >= 70
                                ? 'text-amber-400'
                                : 'text-rose-400'
                            }`}
                          >
                            ⚡ {item.healthScore}%
                          </span>
                          <span className="text-[10px] text-slate-500">
                            ({item.metrics.totalCallsAnswered}/{item.metrics.totalCallsOffered})
                          </span>
                        </div>
                      </td>

                      {/* Visual Score Breakdown Segment Bar */}
                      <td className="py-3 px-3">
                        <div className="space-y-1">
                          <div className="flex items-center space-x-1 text-[9px] font-mono text-slate-400">
                            <span className="text-emerald-400" title="Online status score">
                              +{bd.onlineScore}
                            </span>
                            <span>•</span>
                            <span className="text-yellow-400" title="Tier standing score">
                              +{bd.tierScore}
                            </span>
                            {bd.readyNowScore > 0 && (
                              <>
                                <span>•</span>
                                <span className="text-orange-400" title="Ready Now Surge">
                                  +{bd.readyNowScore}
                                </span>
                              </>
                            )}
                            <span>•</span>
                            <span className="text-blue-400" title="Health Score points">
                              +{bd.healthScorePts}
                            </span>
                            {bd.streakScore > 0 && (
                              <>
                                <span>•</span>
                                <span className="text-purple-400" title="Streak boost">
                                  +{bd.streakScore}
                                </span>
                              </>
                            )}
                            {bd.diversityJitter > 0 && (
                              <>
                                <span>•</span>
                                <span className="text-pink-400" title="Diversity jitter">
                                  +{bd.diversityJitter}
                                </span>
                              </>
                            )}
                          </div>

                          <div className="w-32 bg-slate-900 h-1.5 rounded-full overflow-hidden flex border border-slate-800">
                            <div
                              style={{ width: `${(bd.onlineScore / 300) * 100}%` }}
                              className="bg-emerald-400 h-full"
                              title="Online base"
                            />
                            <div
                              style={{ width: `${(bd.tierScore / 300) * 100}%` }}
                              className="bg-yellow-400 h-full"
                              title="Tier"
                            />
                            <div
                              style={{ width: `${(bd.readyNowScore / 300) * 100}%` }}
                              className="bg-orange-400 h-full"
                              title="Surge"
                            />
                            <div
                              style={{ width: `${(bd.healthScorePts / 300) * 100}%` }}
                              className="bg-blue-400 h-full"
                              title="Health"
                            />
                            <div
                              style={{ width: `${(bd.streakScore / 300) * 100}%` }}
                              className="bg-purple-400 h-full"
                              title="Streak"
                            />
                            <div
                              style={{ width: `${(bd.diversityJitter / 300) * 100}%` }}
                              className="bg-pink-400 h-full"
                              title="Diversity"
                            />
                          </div>
                        </div>
                      </td>

                      {/* Total Score */}
                      <td className="py-3 px-3 font-mono font-black text-amber-300 text-xs">
                        {item.calculatedScore} pts
                      </td>

                      {/* Projected Discovery Placement */}
                      <td className="py-3 px-3 font-mono text-[10px]">
                        {idx === 0 ? (
                          <span className="px-2 py-0.5 rounded bg-yellow-950 text-yellow-300 border border-yellow-600/50 font-bold">
                            🎯 Slot #1 Hero
                          </span>
                        ) : idx < 4 ? (
                          <span className="px-2 py-0.5 rounded bg-indigo-950 text-indigo-300 border border-indigo-700/50 font-bold">
                            ⭐ Row 1 Top 4
                          </span>
                        ) : idx < 8 ? (
                          <span className="px-2 py-0.5 rounded bg-slate-800 text-slate-300">
                            📱 Row 2 Carousel
                          </span>
                        ) : (
                          <span className="text-slate-500">General Grid</span>
                        )}
                      </td>

                      {/* Inspect Button */}
                      <td className="py-3 px-3 text-right">
                        <button
                          onClick={() => setSelectedHostForDetail(item)}
                          className="px-2.5 py-1 rounded bg-slate-800 hover:bg-indigo-600 text-slate-300 hover:text-white font-mono text-[10px] font-bold transition-all cursor-pointer inline-flex items-center space-x-1"
                        >
                          <Eye className="w-3 h-3" />
                          <span>Math</span>
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* 4. Comprehensive Host Math & Dynamic Analytics Modal */}
      {selectedHostForDetail && (
        <HostMathAnalyticsModal
          hostItem={selectedHostForDetail}
          onClose={() => setSelectedHostForDetail(null)}
          rankIndex={rankedCreators.findIndex((r) => r.user.id === selectedHostForDetail.user.id)}
        />
      )}
    </div>
  );
};
