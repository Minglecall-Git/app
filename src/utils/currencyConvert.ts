/**
 * Store display FX — convert canonical USD package prices to local currency.
 * Does not affect ledger/checkout amount_usd (still USD until multi-currency PSP).
 */

import type { CurrencyItem } from './taxonomies';
import { USD_CURRENCY } from './taxonomies';

export function normalizeRateFromUsd(rate: unknown): number {
  const n = Number(rate);
  if (!Number.isFinite(n) || n <= 0) return 1;
  return n;
}

/** Convert a USD amount to local currency using rate_from_usd (local units per 1 USD). */
export function convertUsdToLocal(usdAmount: number, rateFromUsd: number): number {
  const usd = Number(usdAmount);
  if (!Number.isFinite(usd)) return 0;
  const rate = normalizeRateFromUsd(rateFromUsd);
  const decimals = rate >= 50 ? 0 : 2;
  const factor = Math.pow(10, decimals);
  return Math.round(usd * rate * factor) / factor;
}

export function currencyDecimals(currency: Pick<CurrencyItem, 'code' | 'rateFromUsd'>): number {
  const code = String(currency.code || '').toUpperCase();
  if (code === 'JPY' || code === 'KRW' || code === 'PKR') return 0;
  if (normalizeRateFromUsd(currency.rateFromUsd) >= 50) return 0;
  return 2;
}

export function formatMoneyAmount(
  amount: number,
  currency: Pick<CurrencyItem, 'code' | 'symbol' | 'rateFromUsd'> = USD_CURRENCY
): string {
  const n = Number(amount);
  const safe = Number.isFinite(n) ? n : 0;
  const decimals = currencyDecimals(currency);
  const symbol = currency.symbol || currency.code || '$';
  return `${symbol} ${safe.toFixed(decimals)}`;
}

/** e.g. "د.إ18.36 AED" or "$4.99" */
export function formatMoneyWithCode(
  amount: number,
  currency: Pick<CurrencyItem, 'code' | 'symbol' | 'rateFromUsd'> = USD_CURRENCY
): string {
  const code = String(currency.code || 'USD').toUpperCase();
  const formatted = formatMoneyAmount(amount, currency);
  if (code === 'USD') return formatted;
  return `${formatted} ${code}`;
}
