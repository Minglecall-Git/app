/**
 * Target tier / bonus — system_configs thresholds via Financial Module.
 */

export {
  computePerformanceTier,
  resolveTargetThresholds,
  targetBonusUsdForTier,
  DEFAULT_TARGET_THRESHOLDS,
  type TargetTierThresholds,
} from '../../shared/finance/targetBonus';

import {
  computePerformanceTier as computePerformanceTierPure,
  type TargetTierThresholds,
} from '../../shared/finance/targetBonus';
import type { CreatorPerformanceTier } from '../../shared/finance/types';
import {
  getCachedFinanceConfig,
  loadFinanceSystemConfig,
  refreshFinanceConfigInBackground,
} from './config';

/**
 * Sync tier computation for hot paths (creator online accrual).
 * Uses cached system_configs thresholds; refreshes cache in background.
 */
export function computePerformanceTierFromCache(
  hours: number,
  totalCoins: number
): CreatorPerformanceTier {
  refreshFinanceConfigInBackground();
  const thresholds = getCachedFinanceConfig().thresholds;
  return computePerformanceTierPure(hours, totalCoins, thresholds);
}

export async function computePerformanceTierFromConfig(
  hours: number,
  totalCoins: number,
  thresholds?: TargetTierThresholds
): Promise<CreatorPerformanceTier> {
  const t = thresholds ?? (await loadFinanceSystemConfig()).thresholds;
  return computePerformanceTierPure(hours, totalCoins, t);
}

export async function getTargetThresholds(): Promise<TargetTierThresholds> {
  return (await loadFinanceSystemConfig()).thresholds;
}
