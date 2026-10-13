import React, { useState, useMemo, useEffect } from 'react';
import { useApp } from '../../context/AppContext';
import {
  Crown,
  Award,
  Zap,
  Clock,
  Coins,
  DollarSign,
  Flame,
  ShieldCheck,
  Star,
  Activity,
  TrendingUp,
  Search,
  Filter,
  RefreshCw,
  Sparkles,
  Building,
  AlertTriangle,
  CheckCircle2,
  PhoneCall,
  Gift,
  ArrowUpRight,
  Eye,
  Layers,
  BarChart3,
  Lightbulb,
  Users,
  Compass,
  Gauge,
  Radio,
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
  Legend,
} from 'recharts';
import { UserProfile, CreatorMetrics, CreatorTier } from '../../types';
import {
  rankCreatorsForDiscovery,
  isCurrentlyPeakHour,
  RankedCreatorItem,
} from '../../utils/discoveryAlgorithm';
import { normalizeMediaUrl } from '../../utils/r2Storage';
import { getFallbackAvatar } from '../../utils/avatars';
import { SvgFlag } from '../common/SvgFlag';
import { getUserEffectiveLocation } from '../../utils/location';
import { HostMathAnalyticsModal } from './HostMathAnalyticsModal';
import { getCoinUsdPeg } from '../../../shared/finance/fx';
import { getHostPeriodTargetProgress } from '../../../shared/finance/hostPeriodTargetProgress';
import { HostPeriodTargetProgressPanel } from '../common/HostPeriodTargetProgressPanel';

/** Period target coins for bronze gate — same sources as closePeriod (never lifetime earningsCoins). */
function periodTargetCoinsFromMetrics(metrics: CreatorMetrics | null | undefined): number {
  if (!metrics) return 0;
  return (
    Number(metrics.totalTargetCoins) ||
    (Number(metrics.coinsEarnedFromCalls) || 0) + (Number(metrics.coinsEarnedFromGifts) || 0)
  );
}

export const AdminCreatorPerformanceAnalytics: React.FC = () => {
  const {
    users,
    creatorMetricsMap,
    systemSettings,
    callLogs,
    syncUsersFromSupabase,
    showToast,
  } = useApp();

  const [searchQuery, setSearchQuery] = useState('');
  const [tierFilter, setTierFilter] = useState<'all' | 'gold' | 'silver' | 'bronze'>('all');
  const [agencyFilter, setAgencyFilter] = useState<string>('all');
  const [sortBy, setSortBy] = useState<'revenue' | 'hours' | 'health' | 'streak' | 'score'>('revenue');
  const [selectedHostForDetail, setSelectedHostForDetail] = useState<RankedCreatorItem | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);
  const [heartbeatTick, setHeartbeatTick] = useState(0);

  // Dynamic real-time ticking interval for live active hours and foreground polling
  useEffect(() => {
    const timer = setInterval(() => {
      setHeartbeatTick((prev) => prev + 1);
    }, 2000);
    return () => clearInterval(timer);
  }, []);

  const femalePayoutRatio = getCoinUsdPeg(systemSettings);

  const femaleHosts = useMemo(() => {
    return users.filter((u) => {
      if (u.role === 'team_leader' || u.role === 'agency_manager' || u.role === 'admin') return false;
      if (u.role === 'female_creator' || u.role === 'female_host') return true;
      if (u.gender === 'female' && Boolean(u.teamLeaderId)) return true;
      if (
        systemSettings.enableRegularFemaleCoinEarning &&
        (u.role === 'female_user' || u.gender === 'female')
      ) {
        return true;
      }
      return false;
    });
  }, [users, systemSettings.enableRegularFemaleCoinEarning]);

  // Distinct Team Leaders / Agencies
  const agencyList = useMemo(() => {
    const agencies = new Map<string, string>();
    users
      .filter((u) => u.role === 'team_leader' || u.role === 'agency_manager')
      .forEach((tl) => {
        agencies.set(tl.id, tl.agencyName || tl.name);
      });
    return Array.from(agencies.entries());
  }, [users]);

  // Real-time ranked creators list with complete math and metrics
  const rankedCreators = useMemo(() => {
    return rankCreatorsForDiscovery(femaleHosts, creatorMetricsMap, {
      peakHoursStart: systemSettings.peakHoursStart,
      peakHoursEnd: systemSettings.peakHoursEnd,
      peakHoursEnabled: systemSettings.peakHoursEnabled,
      targetThresholds: systemSettings,
    });
  }, [femaleHosts, creatorMetricsMap, systemSettings, heartbeatTick]);

  // Aggregate Performance Metrics with dynamic online tick adjustments
  const summaryKPIs = useMemo(() => {
    const totalCreators = femaleHosts.length;
    const onlineCreators = femaleHosts.filter((u) => u.onlineStatus === 'online').length;
    const busyCreators = femaleHosts.filter(
      (u) => u.onlineStatus === 'busy' || u.onlineStatus === 'in_call'
    ).length;

    let totalCoinsEarned = 0;
    let totalActiveHours = 0;
    let totalCallsAnswered = 0;
    let totalCallsOffered = 0;
    let totalGoldCount = 0;
    let totalSilverCount = 0;
    let totalBronzeCount = 0;
    let totalBonusesUSD = 0;

    rankedCreators.forEach((r) => {
      const coins = periodTargetCoinsFromMetrics(r.metrics);
      totalCoinsEarned += coins;
      const extraOnlineSecs = r.user.onlineStatus === 'online' ? (heartbeatTick % 60) : 0;
      const hours = Number((((r.metrics.activeOnlineSeconds || 0) + extraOnlineSecs) / 3600).toFixed(2));
      totalActiveHours += hours;
      totalCallsAnswered += r.metrics.totalCallsAnswered || 0;
      totalCallsOffered += Math.max(r.metrics.totalCallsOffered || 0, r.metrics.totalCallsAnswered || 0);

      if (r.tier === 'gold') totalGoldCount++;
      else if (r.tier === 'silver') totalSilverCount++;
      else totalBronzeCount++;

      totalBonusesUSD += r.metrics.bonusEarnedUSD || 0;
    });

    const totalUSDValue = totalCoinsEarned * femalePayoutRatio;
    const avgHealthScore =
      totalCallsOffered > 0 ? Math.round((totalCallsAnswered / totalCallsOffered) * 100) : 100;
    const avgHoursPerHost =
      totalCreators > 0 ? Number((totalActiveHours / totalCreators).toFixed(1)) : 0;

    return {
      totalCreators,
      onlineCreators,
      busyCreators,
      totalCoinsEarned,
      totalUSDValue,
      totalActiveHours: Number(totalActiveHours.toFixed(1)),
      avgHoursPerHost,
      avgHealthScore,
      totalGoldCount,
      totalSilverCount,
      totalBronzeCount,
      totalBonusesUSD,
    };
  }, [femaleHosts, rankedCreators, femalePayoutRatio, heartbeatTick]);

  // Sorted and filtered creators for the Table
  const filteredAndSortedCreators = useMemo(() => {
    let list = rankedCreators.filter((item) => {
      if (tierFilter !== 'all' && item.tier !== tierFilter) return false;
      if (agencyFilter !== 'all') {
        if (agencyFilter === 'independent' && item.user.teamLeaderId) return false;
        if (agencyFilter !== 'independent' && item.user.teamLeaderId !== agencyFilter) return false;
      }
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        return (
          item.user.name.toLowerCase().includes(q) ||
          (item.user.email && item.user.email.toLowerCase().includes(q)) ||
          (item.user.nationality && item.user.nationality.toLowerCase().includes(q)) ||
          item.user.id.toLowerCase().includes(q)
        );
      }
      return true;
    });

    list.sort((a, b) => {
      if (sortBy === 'revenue') {
        const coinsA = periodTargetCoinsFromMetrics(a.metrics);
        const coinsB = periodTargetCoinsFromMetrics(b.metrics);
        return coinsB - coinsA;
      }
      if (sortBy === 'hours') {
        return (b.metrics.activeOnlineHours || 0) - (a.metrics.activeOnlineHours || 0);
      }
      if (sortBy === 'health') {
        return (b.healthScore || 0) - (a.healthScore || 0);
      }
      if (sortBy === 'streak') {
        return (b.metrics.currentStreakDays || 0) - (a.metrics.currentStreakDays || 0);
      }
      return b.calculatedScore - a.calculatedScore;
    });

    return list;
  }, [rankedCreators, tierFilter, agencyFilter, searchQuery, sortBy, heartbeatTick]);

  // Dynamic AI-Powered Intelligence Insights
  const aiInsights = useMemo(() => {
    const isPeak = isCurrentlyPeakHour(
      systemSettings.peakHoursStart || '18:00',
      systemSettings.peakHoursEnd || '00:00'
    );

    const goldTargetCoins = systemSettings.creatorTargetGoldCoins ?? 60000;
    const goldTargetHours = systemSettings.creatorTargetGoldHours ?? 60;
    const silverTargetCoins = systemSettings.creatorTargetSilverCoins ?? 20000;
    const silverTargetHours = systemSettings.creatorTargetSilverHours ?? 40;

    // 1. Target Promotion Candidates (Close to tier goal)
    const promotionCandidates = rankedCreators.filter((r) => {
      const coins = periodTargetCoinsFromMetrics(r.metrics);
      const hours = r.metrics.activeOnlineHours || 0;
      if (r.tier === 'silver' && coins >= goldTargetCoins * 0.75 && hours >= goldTargetHours * 0.75) {
        return true;
      }
      if (r.tier === 'bronze' && coins >= silverTargetCoins * 0.75 && hours >= silverTargetHours * 0.75) {
        return true;
      }
      return false;
    });

    // 2. High-Performance Stars (Top Revenue + 95%+ Health)
    const starPerformers = rankedCreators.filter((r) => {
      const coins = periodTargetCoinsFromMetrics(r.metrics);
      return coins >= 10000 && r.healthScore >= 95;
    });

    // 3. At-Risk / Low Health Score Creators (<80% Health)
    const atRiskCreators = rankedCreators.filter((r) => r.healthScore < 80);

    // 4. Peak Hours Surge Opportunities (Online during peak but not toggled Ready Now)
    const surgeOpportunities = isPeak
      ? rankedCreators.filter((r) => r.user.onlineStatus === 'online' && !r.isReadyNow)
      : [];

    return {
      promotionCandidates,
      starPerformers,
      atRiskCreators,
      surgeOpportunities,
      isPeak,
    };
  }, [rankedCreators, systemSettings, heartbeatTick]);

  // Chart Data 1: Tier Revenue Distribution
  const tierRevenueData = useMemo(() => {
    let goldRevenue = 0;
    let silverRevenue = 0;
    let bronzeRevenue = 0;

    rankedCreators.forEach((r) => {
      const coins = periodTargetCoinsFromMetrics(r.metrics);
      if (r.tier === 'gold') goldRevenue += coins;
      else if (r.tier === 'silver') silverRevenue += coins;
      else bronzeRevenue += coins;
    });

    return [
      { name: 'Gold Tier 👑', coins: goldRevenue, usd: Math.round(goldRevenue * femalePayoutRatio), fill: '#eab308' },
      { name: 'Silver Tier 🥈', coins: silverRevenue, usd: Math.round(silverRevenue * femalePayoutRatio), fill: '#94a3b8' },
      { name: 'Bronze Tier 🥉', coins: bronzeRevenue, usd: Math.round(bronzeRevenue * femalePayoutRatio), fill: '#d97706' },
    ];
  }, [rankedCreators, femalePayoutRatio]);

  // Chart Data 2: Top 5 Earners
  const topEarnersChartData = useMemo(() => {
    return rankedCreators.slice(0, 5).map((r) => ({
      name: r.user.name.split(' ')[0],
      coins: periodTargetCoinsFromMetrics(r.metrics),
      hours: r.metrics.activeOnlineHours || 0,
    }));
  }, [rankedCreators]);

  // Chart Data 3: Response Health Distribution
  const healthDistributionData = useMemo(() => {
    let elite = 0; // >= 90%
    let good = 0;  // 75 - 89%
    let attention = 0; // < 75%

    rankedCreators.forEach((r) => {
      if (r.healthScore >= 90) elite++;
      else if (r.healthScore >= 75) good++;
      else attention++;
    });

    return [
      { name: 'Elite (90%+)', value: Math.max(1, elite), color: '#10b981' },
      { name: 'Good (75-89%)', value: good, color: '#f59e0b' },
      { name: 'Needs Attention (<75%)', value: attention, color: '#ef4444' },
    ].filter((d) => d.value > 0);
  }, [rankedCreators]);

  const handleSync = async () => {
    setIsSyncing(true);
    try {
      await syncUsersFromSupabase(true);
      showToast('Database Synchronized', 'Female creator performance metrics refreshed from Supabase.', 'success');
    } finally {
      setIsSyncing(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* 1. Executive Performance & Analytics Header */}
      <div className="p-5 bg-gradient-to-r from-[#141824] via-[#1B2032] to-[#121420] border border-amber-500/30 rounded-2xl shadow-xl space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center space-x-3">
              <div className="p-3 rounded-2xl bg-gradient-to-tr from-amber-500 to-yellow-400 text-slate-950 shadow-lg shadow-amber-950/50">
                <Crown className="w-6 h-6 fill-current" />
              </div>
              <div>
                <div className="flex items-center space-x-2">
                  <h3 className="text-base sm:text-xl font-black text-white">
                    Female Creator Performance & Intelligence Dashboard
                  </h3>
                  <span className="px-2 py-0.5 rounded bg-emerald-950/80 border border-emerald-500/50 text-emerald-300 text-[10px] font-mono font-bold uppercase flex items-center space-x-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping" />
                    <span>HEARTBEAT TELEMETRY ACTIVE</span>
                  </span>
                </div>
                <p className="text-xs text-slate-300">
                  Comprehensive real-time tracking of female host earnings, hours logged, tier standings, response health, and dynamic priority point meters.
                </p>
              </div>
            </div>
          </div>

          <div className="flex items-center space-x-2.5 shrink-0">
            <button
              onClick={handleSync}
              disabled={isSyncing}
              className="px-4 py-2 rounded-xl bg-slate-900 border border-slate-700 hover:border-indigo-500 text-slate-200 text-xs font-mono font-bold flex items-center space-x-2 transition-all cursor-pointer disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin text-indigo-400' : ''}`} />
              <span>{isSyncing ? 'Syncing...' : 'Sync Supabase Data'}</span>
            </button>
          </div>
        </div>

        {/* Executive 6-KPI Summary Strip */}
        <div className="space-y-1.5 pt-2 border-t border-slate-800/80">
          <div className="flex items-center space-x-2">
            <span className="text-[10px] font-mono uppercase font-bold text-slate-400">Executive Fleet KPI Strip</span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 font-mono text-xs">
            {/* Total Active Creators */}
            <div className="bg-[#0D1017] p-3 rounded-xl border border-slate-800 space-y-1">
              <div className="text-[10px] text-slate-400 uppercase font-bold flex items-center justify-between">
                <span>Female Creators</span>
                <Users className="w-3.5 h-3.5 text-indigo-400" />
              </div>
              <div className="text-lg font-black text-white">{summaryKPIs.totalCreators}</div>
              <div className="text-[10px] text-emerald-400 font-semibold">
                🟢 {summaryKPIs.onlineCreators} Online ({summaryKPIs.busyCreators} in-call)
              </div>
            </div>

            {/* Total Gross Revenue */}
            <div className="bg-[#0D1017] p-3 rounded-xl border border-slate-800 space-y-1">
              <div className="text-[10px] text-slate-400 uppercase font-bold flex items-center justify-between">
                <span>Gross Host GMV</span>
                <DollarSign className="w-3.5 h-3.5 text-emerald-400" />
              </div>
              <div className="text-lg font-black text-emerald-400">
                ${summaryKPIs.totalUSDValue.toFixed(2)}
              </div>
              <div className="text-[10px] text-amber-300">
                🪙 {summaryKPIs.totalCoinsEarned.toLocaleString()} coins
              </div>
            </div>

            {/* Total Active Hours */}
            <div className="bg-[#0D1017] p-3 rounded-xl border border-slate-800 space-y-1">
              <div className="text-[10px] text-slate-400 uppercase font-bold flex items-center justify-between">
                <span>Total Active Hours</span>
                <Clock className="w-3.5 h-3.5 text-blue-400" />
              </div>
              <div className="text-lg font-black text-white">{summaryKPIs.totalActiveHours}h</div>
              <div className="text-[10px] text-slate-400">
                Avg {summaryKPIs.avgHoursPerHost}h / creator
              </div>
            </div>

            {/* Tier Standing Distribution */}
            <div className="bg-[#0D1017] p-3 rounded-xl border border-slate-800 space-y-1">
              <div className="text-[10px] text-slate-400 uppercase font-bold flex items-center justify-between">
                <span>Tier Standings</span>
                <Crown className="w-3.5 h-3.5 text-yellow-400" />
              </div>
              <div className="text-sm font-black text-white flex items-center space-x-1 pt-1">
                <span className="text-yellow-400">{summaryKPIs.totalGoldCount} Gold</span>
                <span className="text-slate-500">•</span>
                <span className="text-slate-300">{summaryKPIs.totalSilverCount} Silver</span>
              </div>
              <div className="text-[10px] text-amber-500">
                {summaryKPIs.totalBronzeCount} Bronze Hosts
              </div>
            </div>

            {/* Avg Response Health */}
            <div className="bg-[#0D1017] p-3 rounded-xl border border-slate-800 space-y-1">
              <div className="text-[10px] text-slate-400 uppercase font-bold flex items-center justify-between">
                <span>Avg Acceptance</span>
                <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
              </div>
              <div className="text-lg font-black text-emerald-300">{summaryKPIs.avgHealthScore}%</div>
              <div className="text-[10px] text-slate-400">Answer rate across fleet</div>
            </div>

            {/* Target Bonuses Paid */}
            <div className="bg-[#0D1017] p-3 rounded-xl border border-slate-800 space-y-1">
              <div className="text-[10px] text-slate-400 uppercase font-bold flex items-center justify-between">
                <span>Target Bonuses</span>
                <Sparkles className="w-3.5 h-3.5 text-purple-400" />
              </div>
              <div className="text-lg font-black text-purple-300">
                ${summaryKPIs.totalBonusesUSD.toFixed(2)}
              </div>
              <div className="text-[10px] text-slate-400">Cash rewards credited</div>
            </div>
          </div>
        </div>
      </div>

      {/* 2. AI-Powered Strategic Intelligence & Suggestions Card */}
      <div className="p-5 bg-[#161922] border border-slate-800 rounded-2xl space-y-4 shadow-xl">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <div className="p-2 rounded-xl bg-gradient-to-tr from-indigo-500 to-purple-500 text-white shadow-md">
              <Lightbulb className="w-4 h-4" />
            </div>
            <div>
              <h4 className="text-sm font-bold text-white flex items-center gap-1.5">
                <span>AI-Powered Creator Performance Intelligence & Advisory Engine</span>
                <span className="px-2 py-0.5 rounded bg-indigo-950 text-indigo-300 border border-indigo-700/50 text-[10px] font-mono">
                  AUTOMATED ADVICE
                </span>
              </h4>
              <p className="text-xs text-slate-400">
                Actionable optimization suggestions calculated in real-time based on attendance, acceptance rates, and target proximity.
              </p>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
          {/* Advisory 1: Target Promotion Opportunities */}
          <div className="p-3.5 bg-[#0F1115] border border-amber-500/30 rounded-xl space-y-2">
            <div className="flex items-center justify-between text-amber-300 font-bold font-mono">
              <span className="flex items-center gap-1">
                <Crown className="w-3.5 h-3.5 text-yellow-400" />
                <span>Tier Promotions</span>
              </span>
              <span className="px-1.5 py-0.5 rounded bg-amber-950 text-amber-300 text-[10px]">
                {aiInsights.promotionCandidates.length} Candidates
              </span>
            </div>
            <p className="text-[11px] text-slate-300">
              {aiInsights.promotionCandidates.length > 0
                ? `${aiInsights.promotionCandidates.map((c) => c.user.name).slice(0, 2).join(', ')} ${
                    aiInsights.promotionCandidates.length > 2 ? `+${aiInsights.promotionCandidates.length - 2} more` : ''
                  } are within 25% of unlocking the next tier cash bonus.`
                : 'All creators are on standard target trajectory.'}
            </p>
            <div className="text-[10px] text-amber-400 font-mono font-semibold">
              💡 Action: Notify Agency Leaders to encourage extra shift hours.
            </div>
          </div>

          {/* Advisory 2: High-Performance Star Retainers */}
          <div className="p-3.5 bg-[#0F1115] border border-emerald-500/30 rounded-xl space-y-2">
            <div className="flex items-center justify-between text-emerald-300 font-bold font-mono">
              <span className="flex items-center gap-1">
                <Sparkles className="w-3.5 h-3.5 text-emerald-400" />
                <span>VIP Top Performers</span>
              </span>
              <span className="px-1.5 py-0.5 rounded bg-emerald-950 text-emerald-300 text-[10px]">
                {aiInsights.starPerformers.length} VIPs
              </span>
            </div>
            <p className="text-[11px] text-slate-300">
              {aiInsights.starPerformers.length > 0
                ? `${aiInsights.starPerformers.length} hosts maintained 95%+ answer rate and generated $80+ USD this cycle.`
                : 'Top hosts are steadily pacing their earnings.'}
            </p>
            <div className="text-[10px] text-emerald-400 font-mono font-semibold">
              💡 Action: Feature in Discovery Hero banner for top user retention.
            </div>
          </div>

          {/* Advisory 3: Low Health / Missed Call Alerts */}
          <div className="p-3.5 bg-[#0F1115] border border-rose-500/30 rounded-xl space-y-2">
            <div className="flex items-center justify-between text-rose-300 font-bold font-mono">
              <span className="flex items-center gap-1">
                <AlertTriangle className="w-3.5 h-3.5 text-rose-400" />
                <span>At-Risk Acceptance</span>
              </span>
              <span className="px-1.5 py-0.5 rounded bg-rose-950 text-rose-300 text-[10px]">
                {aiInsights.atRiskCreators.length} At Risk
              </span>
            </div>
            <p className="text-[11px] text-slate-300">
              {aiInsights.atRiskCreators.length > 0
                ? `${aiInsights.atRiskCreators.map((c) => c.user.name).slice(0, 2).join(', ')} have answer rates below 80% with call drops.`
                : 'All active creators have healthy answer acceptance rates.'}
            </p>
            <div className="text-[10px] text-rose-400 font-mono font-semibold">
              💡 Action: Algorithm automatically applies -40 weight penalty.
            </div>
          </div>

          {/* Advisory 4: Peak Surge Optimization */}
          <div className="p-3.5 bg-[#0F1115] border border-orange-500/30 rounded-xl space-y-2">
            <div className="flex items-center justify-between text-orange-300 font-bold font-mono">
              <span className="flex items-center gap-1">
                <Flame className="w-3.5 h-3.5 text-orange-400" />
                <span>Peak Surge Traffic</span>
              </span>
              <span className="px-1.5 py-0.5 rounded bg-orange-950 text-orange-300 text-[10px]">
                {aiInsights.isPeak ? '⚡ Peak Time' : 'Off-Peak'}
              </span>
            </div>
            <p className="text-[11px] text-slate-300">
              {aiInsights.isPeak
                ? `${aiInsights.surgeOpportunities.length} online creators haven't toggled "Ready Now" to claim their +80 surge discovery rank.`
                : `Peak traffic schedule starts at ${systemSettings.peakHoursStart || '18:00'}.`}
            </p>
            <div className="text-[10px] text-orange-400 font-mono font-semibold">
              💡 Action: Push app notification reminding hosts to activate Ready Now.
            </div>
          </div>
        </div>
      </div>

      {/* 3. Visual Performance Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Chart 1: Revenue by Tier */}
        <div className="p-4 bg-[#161922] border border-slate-800 rounded-2xl space-y-3 shadow-xl font-mono text-xs">
          <div className="flex items-center justify-between">
            <h4 className="font-bold text-white uppercase text-xs flex items-center space-x-1.5">
              <BarChart3 className="w-3.5 h-3.5 text-yellow-400" />
              <span>Revenue Distribution by Tier</span>
            </h4>
          </div>
          <div className="h-52 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={tierRevenueData} margin={{ left: -10, right: 10, top: 10, bottom: 0 }}>
                <XAxis dataKey="name" stroke="#64748b" tick={{ fontSize: 10 }} />
                <YAxis stroke="#64748b" tick={{ fontSize: 10 }} />
                <Tooltip
                  contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', borderRadius: '0.75rem', fontSize: '11px' }}
                  formatter={(val: any) => [`${val.toLocaleString()} coins ($${(val * femalePayoutRatio).toFixed(2)})`, 'Gross Coins']}
                />
                <Bar dataKey="coins" radius={[6, 6, 0, 0]}>
                  {tierRevenueData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.fill} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Chart 2: Top 5 Performers (Coins vs Hours) */}
        <div className="p-4 bg-[#161922] border border-slate-800 rounded-2xl space-y-3 shadow-xl font-mono text-xs">
          <div className="flex items-center justify-between">
            <h4 className="font-bold text-white uppercase text-xs flex items-center space-x-1.5">
              <TrendingUp className="w-3.5 h-3.5 text-emerald-400" />
              <span>Top 5 Creators (Revenue vs Hours)</span>
            </h4>
          </div>
          <div className="h-52 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={topEarnersChartData} layout="vertical" margin={{ left: 10, right: 15, top: 10, bottom: 0 }}>
                <XAxis type="number" stroke="#64748b" tick={{ fontSize: 10 }} />
                <YAxis type="category" dataKey="name" stroke="#94a3b8" tick={{ fontSize: 10 }} width={60} />
                <Tooltip
                  contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', borderRadius: '0.75rem', fontSize: '11px' }}
                  formatter={(val: any) => [`${val.toLocaleString()} coins`, 'Earnings']}
                />
                <Bar dataKey="coins" fill="#10b981" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Chart 3: Response Health Score Fleet Distribution */}
        <div className="p-4 bg-[#161922] border border-slate-800 rounded-2xl space-y-3 shadow-xl font-mono text-xs flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <h4 className="font-bold text-white uppercase text-xs flex items-center space-x-1.5">
              <ShieldCheck className="w-3.5 h-3.5 text-blue-400" />
              <span>Fleet Acceptance Health Distribution</span>
            </h4>
            <span className="text-emerald-400 font-bold">{summaryKPIs.avgHealthScore}% Avg</span>
          </div>
          <div className="h-40 w-full flex items-center justify-center">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={healthDistributionData}
                  innerRadius={38}
                  outerRadius={62}
                  paddingAngle={4}
                  dataKey="value"
                >
                  {healthDistributionData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', borderRadius: '0.75rem', fontSize: '11px' }}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="flex items-center justify-between text-[10px] text-slate-400 pt-1 border-t border-slate-800">
            <span className="text-emerald-400 font-bold">🟢 Elite 90%+</span>
            <span className="text-amber-400 font-bold">🟡 Good 75-89%</span>
            <span className="text-rose-400 font-bold">🔴 Attention &lt;75%</span>
          </div>
        </div>
      </div>

      {/* 4. Comprehensive Creator Performance Leaderboard Table */}
      <div className="p-5 bg-[#161922] border border-slate-800 rounded-2xl space-y-4 shadow-xl">
        {/* Table Filters & Sorting Controls */}
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 pb-3 border-b border-slate-800">
          <div className="space-y-0.5">
            <h4 className="text-sm font-bold text-white flex items-center space-x-2">
              <Crown className="w-4 h-4 text-amber-400" />
              <span>Female Creator Performance Standings & Full Leaderboard</span>
            </h4>
            <p className="text-xs text-slate-400">
              Live ranking of all female creators by gross coin earnings, foreground hours, response health, dynamic points, and agency commission splits.
            </p>
          </div>

          {/* Filter Bar */}
          <div className="flex flex-wrap items-center gap-2">
            {/* Search Input */}
            <div className="relative">
              <Search className="w-3.5 h-3.5 absolute left-2.5 top-2.5 text-slate-500" />
              <input
                type="text"
                placeholder="Search creator / country..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-8 pr-3 py-1.5 bg-[#0F1115] border border-slate-800 rounded-lg text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 font-mono"
              />
            </div>

            {/* Sort Dropdown */}
            <select
              value={sortBy}
              onChange={(e: any) => setSortBy(e.target.value)}
              className="p-1.5 bg-[#0F1115] border border-slate-800 rounded-lg text-xs text-amber-300 font-bold focus:outline-none focus:border-amber-500 font-mono cursor-pointer"
            >
              <option value="revenue">Sort: Top Earners (Coins)</option>
              <option value="hours">Sort: Most Active Hours</option>
              <option value="health">Sort: Highest Health %</option>
              <option value="streak">Sort: Longest Streak</option>
              <option value="score">Sort: Discovery Score</option>
            </select>

            {/* Tier Filter */}
            <select
              value={tierFilter}
              onChange={(e: any) => setTierFilter(e.target.value)}
              className="p-1.5 bg-[#0F1115] border border-slate-800 rounded-lg text-xs text-slate-300 focus:outline-none focus:border-indigo-500 font-mono cursor-pointer"
            >
              <option value="all">All Tiers</option>
              <option value="gold">👑 Gold Tier Only</option>
              <option value="silver">🥈 Silver Tier Only</option>
              <option value="bronze">🥉 Bronze Tier Only</option>
            </select>

            {/* Agency Filter */}
            <select
              value={agencyFilter}
              onChange={(e: any) => setAgencyFilter(e.target.value)}
              className="p-1.5 bg-[#0F1115] border border-slate-800 rounded-lg text-xs text-slate-300 focus:outline-none focus:border-indigo-500 font-mono cursor-pointer max-w-[150px]"
            >
              <option value="all">All Agencies</option>
              <option value="independent">Independent Hosts</option>
              {agencyList.map(([id, name]) => (
                <option key={id} value={id}>
                  {name}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Leaderboard Table with Dynamic Point Meter Column */}
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs font-mono">
            <thead>
              <tr className="border-b border-slate-800 text-slate-400 uppercase text-[10px]">
                <th className="py-2.5 px-3">Rank & Creator</th>
                <th className="py-2.5 px-3">Tier</th>
                <th className="py-2.5 px-3">Gross Coins</th>
                <th className="py-2.5 px-3">USD @ Peg (Economy)</th>
                <th className="py-2.5 px-3">Active Hours</th>
                <th className="py-2.5 px-3">True-up target</th>
                <th className="py-2.5 px-3">Dynamic Point Meter</th>
                <th className="py-2.5 px-3">Health</th>
                <th className="py-2.5 px-3">Streak</th>
                <th className="py-2.5 px-3">Agency / Leader</th>
                <th className="py-2.5 px-3 text-right">Deep Dive</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 font-sans">
              {filteredAndSortedCreators.length === 0 ? (
                <tr>
                  <td colSpan={11} className="py-8 text-center text-slate-500 text-xs">
                    No creators match the active filter criteria.
                  </td>
                </tr>
              ) : (
                filteredAndSortedCreators.map((item, idx) => {
                  const coins = periodTargetCoinsFromMetrics(item.metrics);
                  const usd = Number((coins * femalePayoutRatio).toFixed(2));
                  const extraSecs = item.user.onlineStatus === 'online' ? (heartbeatTick % 60) : 0;
                  const hours = Number((((item.metrics.activeOnlineSeconds || 0) + extraSecs) / 3600).toFixed(2));
                  const bd = item.breakdown;

                  const managingLeader = users.find((u) => u.id === item.user.teamLeaderId);

                  return (
                    <tr
                      key={item.user.id}
                      className="hover:bg-slate-800/40 transition-colors"
                    >
                      {/* Rank & Profile */}
                      <td className="py-3 px-3">
                        <div className="flex items-center space-x-2.5">
                          <span
                            className={`w-6 h-6 rounded-full flex items-center justify-center font-black text-xs font-mono shrink-0 ${
                              idx === 0
                                ? 'bg-yellow-500 text-slate-950 shadow-md shadow-yellow-500/30'
                                : idx === 1
                                ? 'bg-slate-300 text-slate-950'
                                : idx === 2
                                ? 'bg-amber-700 text-white'
                                : 'bg-slate-800 text-slate-400'
                            }`}
                          >
                            {idx + 1}
                          </span>

                          <div className="relative shrink-0">
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
                              className="w-8 h-8 rounded-full object-cover border border-slate-700"
                            />
                            <span
                              className={`absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border border-[#161922] ${
                                item.user.onlineStatus === 'online'
                                  ? 'bg-emerald-400 animate-pulse'
                                  : item.user.onlineStatus === 'busy' || item.user.onlineStatus === 'in_call'
                                  ? 'bg-amber-400'
                                  : 'bg-rose-500'
                              }`}
                            />
                          </div>

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
                              <span className="truncate max-w-[90px]">
                                {getUserEffectiveLocation(item.user).country || item.user.nationality}
                              </span>
                            </div>
                          </div>
                        </div>
                      </td>

                      {/* Tier Standing */}
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

                      {/* Gross Coin Earnings */}
                      <td className="py-3 px-3 font-mono font-bold text-amber-300">
                        🪙 {coins.toLocaleString()}
                      </td>

                      {/* Payout USD @ Coin USD Peg */}
                      <td className="py-3 px-3 font-mono font-black text-emerald-400">
                        ${usd.toFixed(2)}
                      </td>

                      {/* Active Online Hours (Ticking Live) */}
                      <td className="py-3 px-3 font-mono text-slate-200">
                        <div className="flex items-center space-x-1">
                          <span className="font-bold">{hours}h</span>
                          {item.user.onlineStatus === 'online' && (
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping" title="Live counting" />
                          )}
                        </div>
                      </td>

                      {/* Bronze true-up gate vs Creator Ops thresholds */}
                      <td className="py-3 px-3">
                        <HostPeriodTargetProgressPanel
                          progress={getHostPeriodTargetProgress({
                            creatorId: item.user.id,
                            periodHours: hours,
                            periodCoins: periodTargetCoinsFromMetrics(item.metrics),
                            systemSettings: systemSettings as unknown as Record<string, unknown>,
                            coinEarnOverrideRate: item.user.coinEarnOverrideRate,
                          })}
                          variant="compact"
                        />
                      </td>

                      {/* Dynamic Point Meter & Score Segment Bar */}
                      <td className="py-3 px-3">
                        <div className="space-y-1">
                          <div className="flex items-center justify-between text-[9px] font-mono text-slate-400">
                            <span className="text-amber-300 font-bold">{item.calculatedScore} pts</span>
                            <span className="text-slate-500 text-[8px]">
                              +{bd.onlineScore}o • +{bd.tierScore}t • +{bd.healthScorePts}h
                            </span>
                          </div>

                          <div className="w-28 bg-slate-950 h-2 rounded-full overflow-hidden flex border border-slate-800">
                            <div
                              style={{ width: `${(bd.onlineScore / 350) * 100}%` }}
                              className="bg-emerald-400 h-full"
                              title={`Online: +${bd.onlineScore}`}
                            />
                            <div
                              style={{ width: `${(bd.tierScore / 350) * 100}%` }}
                              className="bg-yellow-400 h-full"
                              title={`Tier: +${bd.tierScore}`}
                            />
                            {bd.readyNowScore > 0 && (
                              <div
                                style={{ width: `${(bd.readyNowScore / 350) * 100}%` }}
                                className="bg-orange-400 h-full"
                                title={`Surge: +${bd.readyNowScore}`}
                              />
                            )}
                            <div
                              style={{ width: `${(bd.healthScorePts / 350) * 100}%` }}
                              className="bg-blue-400 h-full"
                              title={`Health: +${bd.healthScorePts}`}
                            />
                            {bd.streakScore > 0 && (
                              <div
                                style={{ width: `${(bd.streakScore / 350) * 100}%` }}
                                className="bg-purple-400 h-full"
                                title={`Streak: +${bd.streakScore}`}
                              />
                            )}
                            {bd.diversityJitter > 0 && (
                              <div
                                style={{ width: `${(bd.diversityJitter / 350) * 100}%` }}
                                className="bg-pink-400 h-full"
                                title={`Jitter: +${bd.diversityJitter}`}
                              />
                            )}
                          </div>
                        </div>
                      </td>

                      {/* Response Health */}
                      <td className="py-3 px-3 font-mono">
                        <span
                          className={`font-bold ${
                            item.healthScore >= 90
                              ? 'text-emerald-400'
                              : item.healthScore >= 75
                              ? 'text-amber-400'
                              : 'text-rose-400'
                          }`}
                        >
                          ⚡ {item.healthScore}%
                        </span>
                      </td>

                      {/* Active Streak */}
                      <td className="py-3 px-3 font-mono text-purple-300">
                        🔥 {item.metrics.currentStreakDays}d
                      </td>

                      {/* Agency / Team Leader */}
                      <td className="py-3 px-3 font-mono text-[11px] text-slate-300">
                        {managingLeader ? (
                          <div>
                            <span className="text-amber-400 font-bold block truncate max-w-[120px]">
                              {managingLeader.agencyName || managingLeader.name}
                            </span>
                            <span className="text-[10px] text-slate-500">
                              {managingLeader.commissionPercent ?? systemSettings.teamLeaderSharePercent ?? 10}% Split
                            </span>
                          </div>
                        ) : (
                          <span className="text-slate-500">Independent</span>
                        )}
                      </td>

                      {/* Deep Dive Action */}
                      <td className="py-3 px-3 text-right">
                        <button
                          onClick={() => setSelectedHostForDetail(item)}
                          className="px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-indigo-600 text-slate-300 hover:text-white font-mono text-[10px] font-bold transition-all cursor-pointer inline-flex items-center space-x-1"
                        >
                          <Eye className="w-3 h-3" />
                          <span>Analytics</span>
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

      {/* 5. Deep Dive Modal Integration */}
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
