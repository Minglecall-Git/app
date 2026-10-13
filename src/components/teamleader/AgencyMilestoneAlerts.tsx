import React, { useMemo } from 'react';
import { useApp } from '../../context/AppContext';
import {
  Sparkles,
  Award,
  Crown,
  Flame,
  TrendingUp,
  Zap,
  CheckCircle2,
  Calendar,
} from 'lucide-react';
import { UserProfile } from '../../types';

interface AgencyMilestoneAlertsProps {
  creators: UserProfile[];
}

export const AgencyMilestoneAlerts: React.FC<AgencyMilestoneAlertsProps> = ({ creators }) => {
  const { creatorMetricsMap } = useApp();

  // Generate dynamic milestone feeds based on real creator performance data
  const milestones = useMemo(() => {
    const list: Array<{
      id: string;
      creatorName: string;
      avatarUrl?: string;
      type: 'gold_tier' | 'silver_tier' | 'streak_boost' | 'high_health' | 'ready_now';
      title: string;
      description: string;
      timestamp: string;
      highlightBadge: string;
    }> = [];

    for (const creator of creators) {
      const m = creatorMetricsMap[creator.id];
      if (!m) continue;

      if (m.performanceTier === 'gold') {
        list.push({
          id: `gold_${creator.id}`,
          creatorName: creator.name,
          avatarUrl: creator.avatarUrl,
          type: 'gold_tier',
          title: `🏆 Gold Tier Master Achieved!`,
          description: `${creator.name} completed 60+ active hours and 60,000+ target coins. Top Algorithmic Priority unlocked!`,
          timestamp: 'Active Cycle',
          highlightBadge: '+$150 BONUS',
        });
      } else if (m.performanceTier === 'silver') {
        list.push({
          id: `silver_${creator.id}`,
          creatorName: creator.name,
          avatarUrl: creator.avatarUrl,
          type: 'silver_tier',
          title: `🥈 Silver Tier Unlocked!`,
          description: `${creator.name} crossed 40 active hours and 20,000 coins. Trending Creator badge active.`,
          timestamp: 'Active Cycle',
          highlightBadge: '+$50 BONUS',
        });
      }

      if (m.currentStreakDays >= 7 || (m.streakBoostUntil && new Date(m.streakBoostUntil).getTime() > Date.now())) {
        list.push({
          id: `streak_${creator.id}`,
          creatorName: creator.name,
          avatarUrl: creator.avatarUrl,
          type: 'streak_boost',
          title: `🔥 7-Day Algorithmic Streak Boost!`,
          description: `${creator.name} completed a 7-day consistency streak. +30 discovery weight awarded.`,
          timestamp: `${m.currentStreakDays} Days Active`,
          highlightBadge: '+30 BOOST',
        });
      }

      if (m.isReadyNowActive) {
        list.push({
          id: `ready_${creator.id}`,
          creatorName: creator.name,
          avatarUrl: creator.avatarUrl,
          type: 'ready_now',
          title: `⚡ Peak Hour Ready Now Surge!`,
          description: `${creator.name} is online during peak traffic with Instant Match priority active.`,
          timestamp: 'Live Now',
          highlightBadge: 'SURGE ACTIVE',
        });
      }
    }

    // Default motivational feed item if no milestones yet
    if (list.length === 0) {
      list.push({
        id: 'default_tip',
        creatorName: 'Agency Manager',
        type: 'high_health',
        title: '🎯 Target Cycle In Progress',
        description: 'Encourage your hosts to maintain 2+ active hours daily and toggle Ready Now during peak traffic (18:00 - 00:00).',
        timestamp: 'Realtime',
        highlightBadge: 'TARGETS ACTIVE',
      });
    }

    return list;
  }, [creators, creatorMetricsMap]);

  return (
    <div className="bg-[#161920] border border-slate-800 rounded-2xl p-4 sm:p-5 shadow-xl space-y-3.5">
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-2">
          <div className="p-2 rounded-xl bg-amber-500/15 text-amber-400 border border-amber-500/30">
            <Sparkles className="w-5 h-5" />
          </div>
          <div>
            <h4 className="font-extrabold text-sm sm:text-base text-white">Agency Milestone Alerts</h4>
            <p className="text-[11px] text-slate-400">Real-time target threshold completions and performance boosts</p>
          </div>
        </div>

        <span className="text-xs font-mono font-bold text-slate-400 bg-slate-900 px-2.5 py-1 rounded-lg border border-slate-800">
          {milestones.length} Alerts
        </span>
      </div>

      <div className="space-y-2.5 max-h-72 overflow-y-auto pr-1">
        {milestones.map((alert) => (
          <div
            key={alert.id}
            className="p-3 bg-[#0F1115] border border-slate-800/80 rounded-xl flex items-start justify-between gap-3 hover:border-slate-700 transition-colors"
          >
            <div className="flex items-start space-x-3">
              <div className={`p-2 rounded-xl shrink-0 mt-0.5 ${
                alert.type === 'gold_tier'
                  ? 'bg-yellow-500/20 text-yellow-400 border border-yellow-500/30'
                  : alert.type === 'silver_tier'
                  ? 'bg-slate-300/20 text-slate-300 border border-slate-400/30'
                  : alert.type === 'streak_boost'
                  ? 'bg-orange-500/20 text-orange-400 border border-orange-500/30'
                  : 'bg-indigo-500/20 text-indigo-400 border border-indigo-500/30'
              }`}>
                {alert.type === 'gold_tier' ? (
                  <Crown className="w-4 h-4" />
                ) : alert.type === 'silver_tier' ? (
                  <Award className="w-4 h-4" />
                ) : alert.type === 'streak_boost' ? (
                  <Flame className="w-4 h-4" />
                ) : (
                  <Zap className="w-4 h-4" />
                )}
              </div>

              <div>
                <div className="flex items-center space-x-2">
                  <h5 className="font-bold text-xs text-white">{alert.title}</h5>
                  <span className="text-[10px] text-slate-500 font-mono">• {alert.timestamp}</span>
                </div>
                <p className="text-[11px] text-slate-400 mt-0.5">{alert.description}</p>
              </div>
            </div>

            <span className="shrink-0 px-2 py-0.5 rounded bg-emerald-950 text-emerald-300 border border-emerald-700/50 text-[9px] font-black font-mono">
              {alert.highlightBadge}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
};
