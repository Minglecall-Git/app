/**
 * Server FX — Fixed Peg wrappers (Phase 1).
 * All coin→USD uses system_configs.coin_usd_peg (via getCoinUsdPeg).
 */

export {
  coinsToUsd,
  usdToCoins,
  normalizeFxRatio,
  getCoinUsdPeg,
  formatPegExample,
  DEFAULT_COIN_USD_PEG,
  DEFAULT_FEMALE_PAYOUT_RATIO_USD,
  DEFAULT_COIN_TO_USD_RATIO,
} from '../../shared/finance/fx';

import { coinsToUsd as coinsToUsdPure, getCoinUsdPeg } from '../../shared/finance/fx';
import { loadFinanceSystemConfig, getCachedFinanceConfig } from './config';

/** Coins → USD using live (cached) Fixed Peg. */
export async function coinsToUsdWithLiveRatio(coins: number): Promise<number> {
  const config = await loadFinanceSystemConfig();
  return coinsToUsdPure(coins, config.coinUsdPeg);
}

/** Sync variant using last cached peg (defaults if never loaded). */
export function coinsToUsdWithCachedRatio(coins: number): number {
  return coinsToUsdPure(coins, getCachedFinanceConfig().coinUsdPeg);
}

/** Coins → USD with an explicit frozen snapshot peg (preferred at close/settlement). */
export function coinsToUsdWithSnapshot(coins: number, peg: number): number {
  return coinsToUsdPure(coins, peg);
}

/** Live peg from cache (or default). */
export function getCachedCoinUsdPeg(): number {
  return getCoinUsdPeg(getCachedFinanceConfig());
}
