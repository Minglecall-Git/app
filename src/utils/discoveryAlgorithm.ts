import { UserProfile, CreatorMetrics, CreatorTier, SystemSettings } from '../types';
import {
  computePerformanceTier,
  resolveTargetThresholds,
  type TargetTierThresholds,
} from '../../shared/finance/targetBonus';

export interface CreatorScoreBreakdown {
  onlineScore: number;
  tierScore: number;
  readyNowScore: number;
  healthScorePts: number;
  streakScore: number;
  trustScore: number;
  diversityJitter: number;
  totalScore: number;
}

export interface RankedCreatorItem {
  user: UserProfile;
  metrics: CreatorMetrics;
  calculatedScore: number;
  isReadyNow: boolean;
  tier: CreatorTier;
  healthScore: number;
  hasStreakBoost: boolean;
  isTrending: boolean;
  breakdown: CreatorScoreBreakdown;
}

export interface DynamicAlgorithmWeights {
  onlineAvailable?: number;
  busyInCall?: number;
  goldTier?: number;
  silverTier?: number;
  bronzeTier?: number;
  readyNowSurge?: number;
  responseHealthMax?: number;
  streakBoost?: number;
  diversityJitterMax?: number;
  verified?: number;
  highRating?: number;
}

/**
 * Checks if the current local time falls within configured peak hours (e.g. 18:00 - 00:00)
 */
export function isCurrentlyPeakHour(start = '18:00', end = '00:00'): boolean {
  try {
    const now = new Date();
    const currentMinutes = now.getHours() * 60 + now.getMinutes();

    const [startH, startM] = start.split(':').map(Number);
    const startMinutes = (startH || 18) * 60 + (startM || 0);

    const [endH, endM] = end.split(':').map(Number);
    const endMinutes = (endH || 0) * 60 + (endM || 0);

    if (startMinutes <= endMinutes) {
      // Normal range e.g. 14:00 to 22:00
      return currentMinutes >= startMinutes && currentMinutes <= endMinutes;
    } else {
      // Overnight range e.g. 18:00 to 00:00 (or 18:00 to 02:00)
      return currentMinutes >= startMinutes || currentMinutes <= endMinutes;
    }
  } catch (e) {
    return true; // Fallback to true if parse error
  }
}

/**
 * Computes transparent, detailed scoring breakdown for any female creator.
 */
export function getDetailedCreatorScoreBreakdown(
  user: UserProfile,
  metrics?: CreatorMetrics | null,
  options?: {
    peakHoursStart?: string;
    peakHoursEnd?: string;
    peakHoursEnabled?: boolean;
    weights?: DynamicAlgorithmWeights;
    disableJitter?: boolean;
    /** system_configs / SystemSettings — tiers via shared/finance/targetBonus */
    targetThresholds?: TargetTierThresholds | Record<string, unknown> | SystemSettings | null;
  }
): CreatorScoreBreakdown {
  const isFemale = user.gender === 'female' || user.role === 'female_creator' || user.role === 'female_host';
  if (!isFemale) {
    const onlineScore = user.onlineStatus === 'online' ? 50 : 10;
    return {
      onlineScore,
      tierScore: 0,
      readyNowScore: 0,
      healthScorePts: 0,
      streakScore: 0,
      trustScore: 0,
      diversityJitter: 0,
      totalScore: onlineScore,
    };
  }

  const m = metrics || {
    creatorId: user.id,
    activeOnlineSeconds: 0,
    activeOnlineHours: 0,
    coinsEarnedFromCalls: user.earningsCoins || 0,
    coinsEarnedFromGifts: 0,
    totalTargetCoins: user.earningsCoins || 0,
    currentStreakDays: 1,
    totalCallsOffered: user.totalCallsHosted || 0,
    totalCallsAnswered: user.totalCallsHosted || 0,
    totalCallsDeclined: 0,
    totalCallsMissed: 0,
    responseHealthScore: 100,
    performanceTier: 'bronze' as CreatorTier,
    isReadyNowActive: false,
    bonusEarnedCoins: 0,
    bonusEarnedUSD: 0,
    lastActiveDate: new Date().toISOString().split('T')[0],
  };

  const w = {
    onlineAvailable: options?.weights?.onlineAvailable ?? 100,
    busyInCall: options?.weights?.busyInCall ?? 40,
    goldTier: options?.weights?.goldTier ?? 100,
    silverTier: options?.weights?.silverTier ?? 50,
    bronzeTier: options?.weights?.bronzeTier ?? 20,
    readyNowSurge: options?.weights?.readyNowSurge ?? 80,
    responseHealthMax: options?.weights?.responseHealthMax ?? 40,
    streakBoost: options?.weights?.streakBoost ?? 30,
    diversityJitterMax: options?.weights?.diversityJitterMax ?? 25,
    verified: options?.weights?.verified ?? 15,
    highRating: options?.weights?.highRating ?? 10,
  };

  // 1. Online / Activity Base Weight
  let onlineScore = 5; // Offline default
  if (user.onlineStatus === 'online') {
    onlineScore = w.onlineAvailable;
  } else if (user.onlineStatus === 'busy' || user.onlineStatus === 'in_call') {
    onlineScore = w.busyInCall;
  }

  // 2. Performance Tier Weight — recompute from config via shared targetBonus helper
  const thresholds = resolveTargetThresholds(
    (options?.targetThresholds || null) as Record<string, unknown> | null
  );
  const hours = Number(m.activeOnlineHours || 0);
  const coins =
    Number(m.totalTargetCoins || 0) ||
    Number(m.coinsEarnedFromCalls || 0) + Number(m.coinsEarnedFromGifts || 0);
  const tier = computePerformanceTier(hours, coins, thresholds);
  let tierScore = w.bronzeTier;
  if (tier === 'gold') tierScore = w.goldTier;
  else if (tier === 'silver') tierScore = w.silverTier;

  // 3. Ready Now Surge Priority
  const isPeak = options?.peakHoursEnabled !== false
    ? isCurrentlyPeakHour(options?.peakHoursStart || '18:00', options?.peakHoursEnd || '00:00')
    : true;
  const isReadyNowActive = Boolean(m.isReadyNowActive) && isPeak && user.onlineStatus === 'online';
  const readyNowScore = isReadyNowActive ? w.readyNowSurge : 0;

  // 4. Response Health Score Multiplier
  const healthScore = Math.max(0, Math.min(100, m.responseHealthScore ?? 100));
  const healthScorePts = Math.round(((healthScore / 100) * w.responseHealthMax) * 10) / 10;

  // 5. 7-Day Streak Boost Reward
  const isStreakActive = m.streakBoostUntil ? new Date(m.streakBoostUntil).getTime() > Date.now() : false;
  const streakScore = (isStreakActive || m.currentStreakDays >= 7) ? w.streakBoost : 0;

  // 6. Trust & Standing (Verified + Rating)
  let trustScore = 0;
  if (user.isVerified) trustScore += w.verified;
  if ((user.ratingScore || 5) >= 4.8) trustScore += w.highRating;

  // 7. Fresh Face / Anti-Fatigue Diversity Jitter (stable per user — no Math.random per render)
  let diversityJitter = 0;
  if (!options?.disableJitter && w.diversityJitterMax > 0) {
    const id = String(user.id || user.name || '');
    let hash = 0;
    for (let i = 0; i < id.length; i++) {
      hash = (hash * 31 + id.charCodeAt(i)) >>> 0;
    }
    diversityJitter = Math.round(((hash % 1000) / 1000) * w.diversityJitterMax * 10) / 10;
  }

  const totalScore = Math.round((onlineScore + tierScore + readyNowScore + healthScorePts + streakScore + trustScore + diversityJitter) * 10) / 10;

  return {
    onlineScore,
    tierScore,
    readyNowScore,
    healthScorePts,
    streakScore,
    trustScore,
    diversityJitter,
    totalScore,
  };
}

/**
 * Calculates a dynamic priority weight score for a creator.
 */
export function calculateCreatorPriorityScore(
  user: UserProfile,
  metrics?: CreatorMetrics | null,
  peakHoursConfig?: { start?: string; end?: string; enabled?: boolean; weights?: DynamicAlgorithmWeights }
): number {
  const breakdown = getDetailedCreatorScoreBreakdown(user, metrics, {
    peakHoursStart: peakHoursConfig?.start,
    peakHoursEnd: peakHoursConfig?.end,
    peakHoursEnabled: peakHoursConfig?.enabled,
    weights: peakHoursConfig?.weights,
  });
  return breakdown.totalScore;
}

/**
 * Ranks all callable creators for Discovery Grid, applying weighted probability rotation and diversity.
 */
export function rankCreatorsForDiscovery(
  users: UserProfile[],
  creatorMetricsMap: Record<string, CreatorMetrics> = {},
  options?: {
    peakHoursStart?: string;
    peakHoursEnd?: string;
    peakHoursEnabled?: boolean;
    trendingOnly?: boolean;
    readyNowOnly?: boolean;
    weights?: DynamicAlgorithmWeights;
    disableJitter?: boolean;
    targetThresholds?: TargetTierThresholds | Record<string, unknown> | SystemSettings | null;
  }
): RankedCreatorItem[] {
  const thresholds = resolveTargetThresholds(
    (options?.targetThresholds || null) as Record<string, unknown> | null
  );
  const peakConfig = {
    peakHoursStart: options?.peakHoursStart || '18:00',
    peakHoursEnd: options?.peakHoursEnd || '00:00',
    peakHoursEnabled: options?.peakHoursEnabled ?? true,
    weights: options?.weights,
    disableJitter: options?.disableJitter,
    targetThresholds: thresholds,
  };

  const isPeak = peakConfig.peakHoursEnabled ? isCurrentlyPeakHour(peakConfig.peakHoursStart, peakConfig.peakHoursEnd) : true;

  const rankedItems: RankedCreatorItem[] = [];

  for (const user of users) {
    // Exclude administrative & team leader roles from discovery callable pool
    if (user.role === 'team_leader' || user.role === 'agency_manager' || user.role === 'admin') {
      continue;
    }

    const metrics = creatorMetricsMap[user.id] || {
      creatorId: user.id,
      agencyLeaderId: user.teamLeaderId,
      activeOnlineSeconds: 0,
      activeOnlineHours: 0,
      coinsEarnedFromCalls: user.earningsCoins || 0,
      coinsEarnedFromGifts: 0,
      totalTargetCoins: user.earningsCoins || 0,
      currentStreakDays: 1,
      totalCallsOffered: user.totalCallsHosted || 0,
      totalCallsAnswered: user.totalCallsHosted || 0,
      totalCallsDeclined: 0,
      totalCallsMissed: 0,
      responseHealthScore: 100,
      performanceTier: 'bronze' as CreatorTier,
      isReadyNowActive: false,
      bonusEarnedCoins: 0,
      bonusEarnedUSD: 0,
      lastActiveDate: new Date().toISOString().split('T')[0],
    };

    const hours = Number(metrics.activeOnlineHours || 0);
    const coins =
      Number(metrics.totalTargetCoins || 0) ||
      Number(metrics.coinsEarnedFromCalls || 0) + Number(metrics.coinsEarnedFromGifts || 0);
    const tier = computePerformanceTier(hours, coins, thresholds);
    const isReadyNow = Boolean(metrics.isReadyNowActive) && isPeak && user.onlineStatus === 'online';
    const isTrending = tier === 'gold' || tier === 'silver' || isReadyNow;
    const hasStreakBoost = metrics.streakBoostUntil ? new Date(metrics.streakBoostUntil).getTime() > Date.now() : (metrics.currentStreakDays >= 7);

    if (options?.trendingOnly && !isTrending) continue;
    if (options?.readyNowOnly && !isReadyNow) continue;

    const breakdown = getDetailedCreatorScoreBreakdown(user, metrics, peakConfig);

    rankedItems.push({
      user,
      metrics,
      calculatedScore: breakdown.totalScore,
      isReadyNow,
      tier,
      healthScore: metrics.responseHealthScore ?? 100,
      hasStreakBoost,
      isTrending,
      breakdown,
    });
  }

  // Sort descending by calculated dynamic priority score
  rankedItems.sort((a, b) => b.calculatedScore - a.calculatedScore);

  return rankedItems;
}

/**
 * Filter and get top Trending Creators (Gold, Silver & Active Surge hosts)
 */
export function getTrendingCreators(
  users: UserProfile[],
  creatorMetricsMap: Record<string, CreatorMetrics> = {}
): RankedCreatorItem[] {
  return rankCreatorsForDiscovery(users, creatorMetricsMap, { trendingOnly: true });
}

/**
 * Shuffles Roulette & Swipe Deck matching pool with weighted priority and fresh face distribution
 */
export function shuffleRouletteDeck(
  candidates: UserProfile[],
  creatorMetricsMap: Record<string, CreatorMetrics> = {}
): UserProfile[] {
  const ranked = rankCreatorsForDiscovery(candidates, creatorMetricsMap);
  return ranked.map((r) => r.user);
}
