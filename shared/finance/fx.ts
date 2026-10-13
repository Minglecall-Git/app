/**
 * Fixed Peg FX — ONE coin↔USD rate for host, TL, and platform retained.
 * Canonical setting: system_configs.coin_usd_peg
 * Package price_usd is purchase amount and is NOT forced to coins×peg.
 */

/** Default Fixed Peg ($ USD per coin). 0.003 ⇒ 1000 coins = $3. */
export const DEFAULT_COIN_USD_PEG = 0.003;

/**
 * @deprecated Use DEFAULT_COIN_USD_PEG. Kept as alias for older imports.
 */
export const DEFAULT_FEMALE_PAYOUT_RATIO_USD = DEFAULT_COIN_USD_PEG;

/**
 * @deprecated Dual FX removed in Phase 1; same as DEFAULT_COIN_USD_PEG.
 */
export const DEFAULT_COIN_TO_USD_RATIO = DEFAULT_COIN_USD_PEG;

export function normalizeFxRatio(raw: unknown, fallback = DEFAULT_COIN_USD_PEG): number {
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return n;
}

/**
 * Resolve the Fixed Peg from a settings / config / snapshot object.
 * Prefers coin_usd_peg; falls back to legacy columns only for migration reads.
 */
export function getCoinUsdPeg(source?: unknown): number {
  if (source == null || typeof source !== 'object') return DEFAULT_COIN_USD_PEG;
  const s = source as Record<string, unknown>;
  const preferred = s.coin_usd_peg ?? s.coinUsdPeg;
  if (preferred !== undefined && preferred !== null) {
    return normalizeFxRatio(preferred, DEFAULT_COIN_USD_PEG);
  }
  // Migration fallbacks (legacy dual FX) — do not use these in new writers.
  const legacy = s.female_payout_ratio_usd ?? s.femalePayoutRatioUSD ?? s.coin_to_usd_ratio ?? s.coinToUSDRatio;
  return normalizeFxRatio(legacy, DEFAULT_COIN_USD_PEG);
}

/** Convert coins → USD with Fixed Peg. Rounds to 4 decimal places for cash math. */
export function coinsToUsd(coins: number, peg: unknown = DEFAULT_COIN_USD_PEG): number {
  const ratio = normalizeFxRatio(peg);
  const c = Number(coins);
  if (!Number.isFinite(c)) return 0;
  return Math.round(c * ratio * 10000) / 10000;
}

/** Convert USD → coins (floor) using Fixed Peg. */
export function usdToCoins(usd: number, peg: unknown = DEFAULT_COIN_USD_PEG): number {
  const ratio = normalizeFxRatio(peg);
  const u = Number(usd);
  if (!Number.isFinite(u) || ratio <= 0) return 0;
  return Math.floor(u / ratio);
}

/** Human-readable example: "1000 coins = $3.00". */
export function formatPegExample(peg: unknown = DEFAULT_COIN_USD_PEG, coins = 1000): string {
  const usd = coinsToUsd(coins, peg);
  return `${coins.toLocaleString()} coins = $${usd.toFixed(2)}`;
}
