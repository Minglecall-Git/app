/**
 * Bump period creator_metrics coin counters used by targetBonus at close.
 * Tier assignment uses shared/finance/targetBonus via the provided computeTier fn.
 */

import type { CreatorPerformanceTier } from '../../shared/finance/types';

export type CreatorMetricsRecord = {
  creatorId: string;
  agencyLeaderId?: string | null;
  activeOnlineSeconds?: number;
  activeOnlineHours?: number;
  coinsEarnedFromCalls?: number;
  coinsEarnedFromGifts?: number;
  totalTargetCoins?: number;
  performanceTier?: CreatorPerformanceTier | string;
  [key: string]: unknown;
};

export function applyCreatorEarnCoins(
  existing: CreatorMetricsRecord | null | undefined,
  opts: {
    creatorId: string;
    agencyLeaderId?: string | null;
    callCoins?: number;
    giftCoins?: number;
    computeTier: (hours: number, totalCoins: number) => CreatorPerformanceTier;
  }
): CreatorMetricsRecord {
  const callAdd = Math.max(0, Math.round(Number(opts.callCoins) || 0));
  const giftAdd = Math.max(0, Math.round(Number(opts.giftCoins) || 0));
  const base: CreatorMetricsRecord = existing
    ? { ...existing, creatorId: opts.creatorId }
    : {
        creatorId: opts.creatorId,
        agencyLeaderId: opts.agencyLeaderId || null,
        activeOnlineSeconds: 0,
        activeOnlineHours: 0,
        coinsEarnedFromCalls: 0,
        coinsEarnedFromGifts: 0,
        totalTargetCoins: 0,
        performanceTier: 'bronze',
      };

  const coinsEarnedFromCalls = Number(base.coinsEarnedFromCalls || 0) + callAdd;
  const coinsEarnedFromGifts = Number(base.coinsEarnedFromGifts || 0) + giftAdd;
  const totalTargetCoins = coinsEarnedFromCalls + coinsEarnedFromGifts;
  const hours = Number(base.activeOnlineHours || 0);
  const performanceTier = opts.computeTier(hours, totalTargetCoins);

  return {
    ...base,
    creatorId: opts.creatorId,
    agencyLeaderId: base.agencyLeaderId || opts.agencyLeaderId || null,
    coinsEarnedFromCalls,
    coinsEarnedFromGifts,
    totalTargetCoins,
    performanceTier,
    lastActiveDate: new Date().toISOString().split('T')[0],
    updatedAt: new Date().toISOString(),
  };
}
