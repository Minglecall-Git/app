import React, { useMemo } from 'react';
import { useApp } from '../../context/AppContext';
import { getCoinUsdPeg } from '../../../shared/finance/fx';
import {
  Crown,
  Award,
  TrendingUp,
  Flame,
  Clock,
  Coins,
  ShieldCheck,
  Zap,
  Star,
  Users,
  Search,
  ArrowUpRight,
} from 'lucide-react';
import { UserProfile, CreatorMetrics, CreatorTier } from '../../types';
import { getCountryFlag } from '../../utils/flags';
import { normalizeMediaUrl } from '../../utils/r2Storage';
import { getFallbackAvatar } from '../../utils/avatars';

interface AgencyHostLeaderboardProps {
  creators: UserProfile[];
}

export const AgencyHostLeaderboard: React.FC<AgencyHostLeaderboardProps> = ({ creators }) => {
  const { creatorMetricsMap, systemSettings } = useApp();
  const [searchQuery, setSearchQuery] = React.useState('');
  const [tierFilter, setTierFilter] = React.useState<string>('all');

  const femalePayoutRatio = getCoinUsdPeg(systemSettings);

  // Augment creators with real Supabase metrics & calculate leaderboard rank
  const augmentedCreators = useMemo(() => {
    return creators.map((creator) => {
      const metrics = creatorMetricsMap[creator.id] || {
        creatorId: creator.id,
        agencyLeaderId: creator.teamLeaderId,
        activeOnlineSeconds: 0,
        activeOnlineHours: 0,
        coinsEarnedFromCalls: creator.earningsCoins || 0,
        coinsEarnedFromGifts: 0,
        totalTargetCoins: creator.earningsCoins || 0,
        currentStreakDays: 1,
        totalCallsOffered: creator.totalCallsHosted || 0,
        totalCallsAnswered: creator.totalCallsHosted || 0,
        totalCallsDeclined: 0,
        totalCallsMissed: 0,
        responseHealthScore: 100,
        performanceTier: 'bronze' as CreatorTier,
        isReadyNowActive: false,
        bonusEarnedCoins: 0,
        bonusEarnedUSD: 0,
        lastActiveDate: new Date().toISOString().split('T')[0],
      };

      const totalCoins = metrics.totalTargetCoins || (metrics.coinsEarnedFromCalls + metrics.coinsEarnedFromGifts) || 0;
      const hours = metrics.activeOnlineHours || 0;
      const hostUSD = Number((totalCoins * femalePayoutRatio).toFixed(2));

      return {
        creator,
        metrics,
        totalCoins,
        hours,
        hostUSD,
        tier: metrics.performanceTier || 'bronze',
        healthScore: metrics.responseHealthScore ?? 100,
        streakDays: metrics.currentStreakDays || 0,
        isReadyNow: Boolean(metrics.isReadyNowActive),
      };
    });
  }, [creators, creatorMetricsMap, femalePayoutRatio]);

  // Sort descending by total target coins and active hours
  const sortedCreators = useMemo(() => {
    return [...augmentedCreators].sort((a, b) => {
      if (b.totalCoins !== a.totalCoins) return b.totalCoins - a.totalCoins;
      return b.hours - a.hours;
    });
  }, [augmentedCreators]);

  // Filter
  const filteredCreators = useMemo(() => {
    return sortedCreators.filter((item) => {
      if (tierFilter !== 'all' && item.tier !== tierFilter) return false;
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        return (
          item.creator.name.toLowerCase().includes(q) ||
          (item.creator.email && item.creator.email.toLowerCase().includes(q))
        );
      }
      return true;
    });
  }, [sortedCreators, tierFilter, searchQuery]);

  return (
    <div className="bg-[#161920] border border-slate-800 rounded-2xl p-4 sm:p-6 shadow-xl space-y-4">
      {/* Header & Filter Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-800">
        <div className="flex items-center space-x-2">
          <div className="p-2 rounded-xl bg-indigo-500/15 text-indigo-400 border border-indigo-500/30">
            <Crown className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-base sm:text-lg font-black text-white">Agency Host Target Leaderboard</h3>
            <p className="text-xs text-slate-400">
              Live ranking by host target coins and active hours (TL earnings come from call splits, not a % of host balances)
            </p>
          </div>
        </div>

        {/* Filter and Search Bar */}
        <div className="flex items-center space-x-2">
          <div className="relative">
            <Search className="w-3.5 h-3.5 absolute left-2.5 top-2.5 text-slate-500" />
            <input
              type="text"
              placeholder="Search host..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-8 pr-3 py-1.5 bg-[#0F1115] border border-slate-800 rounded-lg text-xs text-white focus:outline-none focus:border-indigo-500"
            />
          </div>

          <select
            value={tierFilter}
            onChange={(e) => setTierFilter(e.target.value)}
            className="p-1.5 bg-[#0F1115] border border-slate-800 rounded-lg text-xs text-slate-300 focus:outline-none focus:border-indigo-500"
          >
            <option value="all">All Tiers</option>
            <option value="gold">Gold Tier (60h+)</option>
            <option value="silver">Silver Tier (40h+)</option>
            <option value="bronze">Bronze Tier</option>
          </select>
        </div>
      </div>

      {/* Leaderboard Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs font-mono">
          <thead>
            <tr className="border-b border-slate-800 text-slate-400 uppercase text-[10px]">
              <th className="py-2.5 px-3">Rank & Host</th>
              <th className="py-2.5 px-3">Performance Tier</th>
              <th className="py-2.5 px-3">Active Hours</th>
              <th className="py-2.5 px-3">Revenue Coins</th>
              <th className="py-2.5 px-3">Response Health</th>
              <th className="py-2.5 px-3">Streak</th>
              <th className="py-2.5 px-3 text-right">Host USD</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/60 font-sans">
            {filteredCreators.length === 0 ? (
              <tr>
                <td colSpan={7} className="py-8 text-center text-slate-500 text-xs">
                  No agency hosts match the filter criteria.
                </td>
              </tr>
            ) : (
              filteredCreators.map((item, idx) => {
                const isTop3 = idx < 3;
                return (
                  <tr key={item.creator.id} className="hover:bg-slate-800/30 transition-colors">
                    {/* Rank & Host Details */}
                    <td className="py-3 px-3">
                      <div className="flex items-center space-x-3">
                        <span className={`w-6 h-6 rounded-full flex items-center justify-center font-black text-xs font-mono shrink-0 ${
                          idx === 0
                            ? 'bg-yellow-500 text-slate-950 shadow-md shadow-yellow-500/30'
                            : idx === 1
                            ? 'bg-slate-300 text-slate-950 shadow-md'
                            : idx === 2
                            ? 'bg-amber-700 text-white'
                            : 'bg-slate-800 text-slate-400'
                        }`}>
                          {idx + 1}
                        </span>

                        <div className="flex items-center space-x-2">
                          <img
                            src={normalizeMediaUrl(item.creator.avatarUrl)}
                            alt={item.creator.name}
                            onError={(e) => {
                              (e.target as HTMLImageElement).src = getFallbackAvatar(item.creator.name, item.creator.gender, item.creator.role);
                            }}
                            className="w-8 h-8 rounded-full object-cover border border-slate-700 shrink-0"
                          />
                          <div>
                            <div className="flex items-center space-x-1">
                              <span className="font-bold text-white text-xs">{item.creator.name}</span>
                              {item.isReadyNow && (
                                <span className="px-1 py-0.2 rounded bg-orange-950 text-orange-400 border border-orange-600 text-[8px] font-black uppercase">
                                  🔥 READY NOW
                                </span>
                              )}
                            </div>
                            <span className="text-[10px] text-slate-400 font-mono">{item.creator.email || 'Host'}</span>
                          </div>
                        </div>
                      </div>
                    </td>

                    {/* Tier Standing */}
                    <td className="py-3 px-3">
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider border font-mono ${
                        item.tier === 'gold'
                          ? 'bg-yellow-500/20 text-yellow-300 border-yellow-500/50'
                          : item.tier === 'silver'
                          ? 'bg-slate-300/20 text-slate-200 border-slate-300/50'
                          : 'bg-amber-800/20 text-amber-300 border-amber-800/50'
                      }`}>
                        {item.tier === 'gold' ? '👑 GOLD' : item.tier === 'silver' ? '🥈 SILVER' : '🥉 BRONZE'}
                      </span>
                    </td>

                    {/* Active Online Hours */}
                    <td className="py-3 px-3 font-mono font-bold text-slate-200">
                      <div className="flex items-center space-x-1">
                        <Clock className="w-3.5 h-3.5 text-indigo-400" />
                        <span>{item.hours}h</span>
                      </div>
                    </td>

                    {/* Revenue Coins */}
                    <td className="py-3 px-3 font-mono font-extrabold text-amber-400">
                      <div className="flex items-center space-x-1">
                        <Coins className="w-3.5 h-3.5 text-amber-400" />
                        <span>{item.totalCoins.toLocaleString()} 🪙</span>
                      </div>
                    </td>

                    {/* Response Health */}
                    <td className="py-3 px-3 font-mono">
                      <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                        item.healthScore >= 90
                          ? 'bg-emerald-950/80 text-emerald-300 border border-emerald-500/40'
                          : item.healthScore >= 70
                          ? 'bg-amber-950/80 text-amber-300 border border-amber-500/40'
                          : 'bg-rose-950/80 text-rose-300 border border-rose-500/40'
                      }`}>
                        ⚡ {item.healthScore}%
                      </span>
                    </td>

                    {/* Streak */}
                    <td className="py-3 px-3 font-mono text-slate-300">
                      <span className="flex items-center space-x-1 text-orange-400 font-bold">
                        <Flame className="w-3.5 h-3.5 fill-current" />
                        <span>{item.streakDays}d</span>
                      </span>
                    </td>

                    {/* Host USD @ Coin USD Peg (Economy) — not TL commission */}
                    <td className="py-3 px-3 text-right font-mono font-extrabold text-emerald-400">
                      <span>${item.hostUSD.toFixed(2)}</span>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};
