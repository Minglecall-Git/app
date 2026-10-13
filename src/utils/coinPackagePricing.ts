/**
 * Shared coin-package pricing helpers (admin preview, store, checkout CTA).
 */

import type { CurrencyItem } from './taxonomies';
import { USD_CURRENCY } from './taxonomies';
import { convertUsdToLocal, formatMoneyAmount, formatMoneyWithCode } from './currencyConvert';
import { DEFAULT_COIN_USD_PEG, normalizeFxRatio } from '../../shared/finance/fx';

export type CoinPackagePricingInput = {
  coins?: number | null;
  bonusCoins?: number | null;
  priceUSD?: number | null;
  discountPriceUSD?: number | null;
  approxCallMinutes?: number | null;
  savingLabel?: string | null;
};

function finiteOrNull(value: unknown): number | null {
  if (value == null || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

export function totalCoins(pkg: CoinPackagePricingInput): number {
  return Math.max(0, Math.round(Number(pkg.coins) || 0) + Math.round(Number(pkg.bonusCoins) || 0));
}

export function listPriceUSD(pkg: CoinPackagePricingInput): number {
  const n = Number(pkg.priceUSD);
  return Number.isFinite(n) ? n : 0;
}

/** Effective pay price = discount_price_usd ?? price_usd */
export function payPriceUSD(pkg: CoinPackagePricingInput): number {
  const discount = finiteOrNull(pkg.discountPriceUSD);
  if (discount != null) return discount;
  return listPriceUSD(pkg);
}

export function hasDiscount(pkg: CoinPackagePricingInput): boolean {
  const discount = finiteOrNull(pkg.discountPriceUSD);
  if (discount == null) return false;
  return discount < listPriceUSD(pkg);
}

export function savingUSD(pkg: CoinPackagePricingInput): number {
  const save = listPriceUSD(pkg) - payPriceUSD(pkg);
  return save > 0 ? Math.round(save * 100) / 100 : 0;
}

export function savingPercent(pkg: CoinPackagePricingInput): number {
  const list = listPriceUSD(pkg);
  const save = savingUSD(pkg);
  if (list <= 0 || save <= 0) return 0;
  return Math.round((save / list) * 100);
}

/**
 * Prefer computed saving from Price − Discount Price.
 * Optional savingLabel overrides the display badge text when present.
 * Returns null when there is no real saving (no fake badges).
 */
export function savingDisplayLabel(
  pkg: CoinPackagePricingInput,
  currency: CurrencyItem = USD_CURRENCY
): string | null {
  const saveUsd = savingUSD(pkg);
  if (saveUsd <= 0) return null;
  const override = typeof pkg.savingLabel === 'string' ? pkg.savingLabel.trim() : '';
  if (override) return override;
  const pct = savingPercent(pkg);
  const saveLocal = convertUsdToLocal(saveUsd, currency.rateFromUsd);
  const formatted = formatMoneyAmount(saveLocal, currency);
  return pct > 0 ? `Save ${formatted} (${pct}%)` : `Save ${formatted}`;
}

export function approxCallMinutes(
  pkg: CoinPackagePricingInput,
  burnRatePerMin: number
): number {
  const override = finiteOrNull(pkg.approxCallMinutes);
  if (override != null) return Math.max(0, Math.floor(override));
  const rate = Number(burnRatePerMin) || 0;
  if (rate <= 0) return 0;
  return Math.floor(totalCoins(pkg) / rate);
}

/** Display amounts in a selected store currency (canonical math still USD). */
export function packageDisplayPrices(
  pkg: CoinPackagePricingInput,
  currency: CurrencyItem = USD_CURRENCY
) {
  const listUsd = listPriceUSD(pkg);
  const payUsd = payPriceUSD(pkg);
  const saveUsd = savingUSD(pkg);
  const rate = currency.rateFromUsd;
  return {
    listUsd,
    payUsd,
    saveUsd,
    listLocal: convertUsdToLocal(listUsd, rate),
    payLocal: convertUsdToLocal(payUsd, rate),
    saveLocal: convertUsdToLocal(saveUsd, rate),
    listFormatted: formatMoneyAmount(convertUsdToLocal(listUsd, rate), currency),
    payFormatted: formatMoneyAmount(convertUsdToLocal(payUsd, rate), currency),
    payFormattedWithCode: formatMoneyWithCode(convertUsdToLocal(payUsd, rate), currency),
    saveFormatted: formatMoneyAmount(convertUsdToLocal(saveUsd, rate), currency),
    currency,
  };
}

/**
 * Peg liability of package coins at Fixed Peg (coins × peg).
 * Package pay price is independent — not forced to this value.
 */
export function pegValueUSD(pkg: CoinPackagePricingInput, pegPerCoin: number): number {
  const peg = Number(pegPerCoin);
  const coins = totalCoins(pkg);
  if (!Number.isFinite(peg) || peg <= 0 || coins <= 0) return 0;
  return Math.round(coins * peg * 1e6) / 1e6;
}

/**
 * Load / retail margin vs Fixed Peg: payPriceUSD − (totalCoins × peg).
 * Positive ⇒ customer paid more than peg liability of coins.
 */
export function loadMarginUSD(pkg: CoinPackagePricingInput, pegPerCoin: number): number {
  return Math.round((payPriceUSD(pkg) - pegValueUSD(pkg, pegPerCoin)) * 1e6) / 1e6;
}

/** Snapshot fields for a completed funding row (paid USD may be null for admin comps). */
export function purchasePegSnapshot(opts: {
  amountCoins: number;
  amountUsd?: number | null;
  pegPerCoin: number;
}): {
  coinUsdPegAtPurchase: number;
  pegValueUsd: number;
  loadMarginUsd: number | null;
} {
  const coinUsdPegAtPurchase = normalizeFxRatio(opts.pegPerCoin, DEFAULT_COIN_USD_PEG);
  const coins = Math.max(0, Math.round(Number(opts.amountCoins) || 0));
  const pegValueUsd = Math.round(coins * coinUsdPegAtPurchase * 1e6) / 1e6;
  const paid = opts.amountUsd == null ? null : Number(opts.amountUsd);
  const loadMarginUsd =
    paid != null && Number.isFinite(paid)
      ? Math.round((paid - pegValueUsd) * 1e6) / 1e6
      : null;
  return { coinUsdPegAtPurchase, pegValueUsd, loadMarginUsd };
}

/** Checkout CTA label: "Pay د.إ18.36 AED (≈ $4.99 USD)" when not USD. */
export function checkoutPayLabel(
  pkg: CoinPackagePricingInput,
  currency: CurrencyItem = USD_CURRENCY
): string {
  const { payUsd, payFormattedWithCode } = packageDisplayPrices(pkg, currency);
  const code = String(currency.code || 'USD').toUpperCase();
  if (code === 'USD') return `Pay ${payFormattedWithCode}`;
  return `Pay ${payFormattedWithCode} (≈ $ ${payUsd.toFixed(2)} USD)`;
}
