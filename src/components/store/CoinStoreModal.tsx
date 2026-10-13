import React, { useMemo, useState } from 'react';
import { useApp } from '../../context/AppContext';
import {
  X,
  CreditCard,
  Smartphone,
  Bitcoin,
  ShieldCheck,
  Zap,
} from 'lucide-react';
import {
  totalCoins,
  hasDiscount,
  savingDisplayLabel,
  approxCallMinutes,
  packageDisplayPrices,
  checkoutPayLabel,
  payPriceUSD,
} from '../../utils/coinPackagePricing';
import { DEFAULT_COIN_BURN_RATE_PER_MIN } from '../../../shared/finance/economyBurn';
import {
  getEnabledCurrencies,
  findCurrencyByCode,
  USD_CURRENCY,
} from '../../utils/taxonomies';

interface CoinStoreModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const STORE_CURRENCY_LS_KEY = 'livecall_store_currency';

function readStoredCurrencyCode(): string {
  try {
    const raw = localStorage.getItem(STORE_CURRENCY_LS_KEY);
    return raw ? String(raw).toUpperCase() : 'USD';
  } catch {
    return 'USD';
  }
}

export const CoinStoreModal: React.FC<CoinStoreModalProps> = ({ isOpen, onClose }) => {
  const {
    coinPackages,
    buyCoinPackage,
    currentUser,
    manualGrantCoins,
    systemSettings,
    currencyConfigs,
  } = useApp();

  const enabledCurrencies = useMemo(
    () => getEnabledCurrencies(currencyConfigs),
    [currencyConfigs]
  );

  const [selectedPackageId, setSelectedPackageId] = useState<string>(
    coinPackages.find((p) => p.popular)?.id || coinPackages[0]?.id || ''
  );
  const [paymentMethod, setPaymentMethod] = useState<'card' | 'apple' | 'crypto'>('card');
  const [isProcessing, setIsProcessing] = useState(false);
  const [currencyCode, setCurrencyCode] = useState<string>(() => {
    const stored = readStoredCurrencyCode();
    const enabled = getEnabledCurrencies(currencyConfigs);
    const match = enabled.find((c) => c.code.toUpperCase() === stored);
    return match?.code || 'USD';
  });

  if (!isOpen) return null;

  const selectedCurrency =
    findCurrencyByCode(currencyCode, enabledCurrencies) ||
    enabledCurrencies[0] ||
    USD_CURRENCY;

  const selectedPkg = coinPackages.find((p) => p.id === selectedPackageId) || coinPackages[0];
  const selectedTotal = selectedPkg ? totalCoins(selectedPkg) : 0;
  const burnRate = systemSettings.coinBurnRatePerMin || DEFAULT_COIN_BURN_RATE_PER_MIN;

  const handleCurrencyChange = (code: string) => {
    const next = String(code || 'USD').toUpperCase();
    setCurrencyCode(next);
    try {
      localStorage.setItem(STORE_CURRENCY_LS_KEY, next);
    } catch {
      /* UI preference only */
    }
  };

  const handleCheckout = () => {
    if (!selectedPkg) return;
    setIsProcessing(true);

    setTimeout(() => {
      buyCoinPackage(selectedPkg.id);
      setIsProcessing(false);
      onClose();
    }, 800);
  };

  return (
    <div className="fixed inset-0 z-[85] flex items-center justify-center p-3 sm:p-4 backdrop-blur-md app-scale-in" style={{ backgroundColor: 'var(--app-overlay)' }}>
      <div className="relative w-full max-w-3xl max-h-[88vh] sm:max-h-[90vh] bg-app-card border border-hairline rounded-app-xl shadow-app-lg flex flex-col overflow-hidden my-auto">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 sm:px-5 sm:py-4 bg-app-card-subtle border-b border-hairline shrink-0 gap-3">
          <div className="flex items-center space-x-3 min-w-0">
            <div className="w-9 h-9 rounded-2xl bg-coin text-slate-950 flex items-center justify-center font-display font-bold text-lg shrink-0">
              🪙
            </div>
            <div className="min-w-0">
              <h2 className="text-base sm:text-lg font-display font-bold text-app-heading truncate">Get more talk time</h2>
              <p className="text-xs text-app-muted">
                Balance:{' '}
                <span className="font-display font-bold text-amber-300">{currentUser.coinBalance}</span>
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <label className="flex items-center gap-1.5 text-[10px] text-app-muted">
              <span className="hidden sm:inline font-bold uppercase tracking-wider">Currency</span>
              <select
                value={selectedCurrency.code}
                onChange={(e) => handleCurrencyChange(e.target.value)}
                className="px-2 py-1.5 rounded-lg bg-app-input border border-hairline text-xs font-bold text-app-heading focus:outline-none focus:border-amber-500 max-w-[140px]"
                title="Display currency"
              >
                {enabledCurrencies.map((c) => (
                  <option key={c.code} value={c.code}>
                    {c.code} · {c.symbol}
                  </option>
                ))}
              </select>
            </label>
            <button
              onClick={onClose}
              className="p-2 rounded-full text-app-muted hover:text-app-heading bg-app-card border border-hairline hover:bg-brand-soft transition-colors cursor-pointer"
              title="Close modal"
            >
              <X className="w-4 h-4 sm:w-5 sm:h-5" />
            </button>
          </div>
        </div>

        <div className="px-3 py-3 sm:px-5 sm:py-4 space-y-4 overflow-y-auto flex-1 overscroll-contain">
          <div>
            <h3 className="text-[11px] font-semibold text-app-muted mb-2 px-0.5">
              Choose a package
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 sm:gap-2.5">
              {coinPackages.map((pkg) => {
                const isSelected = selectedPackageId === pkg.id;
                const coinsTotal = totalCoins(pkg);
                const display = packageDisplayPrices(pkg, selectedCurrency);
                const discounted = hasDiscount(pkg);
                const saveLabel = savingDisplayLabel(pkg, selectedCurrency);
                const mins = approxCallMinutes(pkg, burnRate);
                const isPopular = Boolean(pkg.popular);
                const bestValueId = [...coinPackages].sort(
                  (a, b) =>
                    approxCallMinutes(b, burnRate) / Math.max(0.01, payPriceUSD(b)) -
                    approxCallMinutes(a, burnRate) / Math.max(0.01, payPriceUSD(a))
                )[0]?.id;
                const isBestValue = pkg.id === bestValueId && !isPopular;

                return (
                  <button
                    key={pkg.id}
                    type="button"
                    onClick={() => setSelectedPackageId(pkg.id)}
                    className={`relative text-left p-3 sm:p-3.5 rounded-app-lg border cursor-pointer transition-all ${
                      isSelected
                        ? 'bg-coin/15 border-amber-400/60 shadow-app-sm ring-1 ring-amber-400/40'
                        : 'bg-app-card-subtle border-hairline hover:border-brand/30'
                    }`}
                  >
                    <div className="absolute -top-2 right-2 flex gap-1 max-w-[90%]">
                      {isPopular && (
                        <span className="px-1.5 py-0.5 rounded-md bg-flirt text-white font-display font-bold text-[8px] uppercase tracking-wide shadow-sm">
                          Most Popular
                        </span>
                      )}
                      {isBestValue && (
                        <span className="px-1.5 py-0.5 rounded-md bg-coin text-slate-950 font-display font-bold text-[8px] uppercase tracking-wide shadow-sm">
                          Best Value
                        </span>
                      )}
                      {!isPopular && !isBestValue && pkg.badgeTag && (
                        <span className="px-1.5 py-0.5 rounded-md bg-brand-soft text-brand font-semibold text-[8px] uppercase tracking-wide">
                          {pkg.badgeTag}
                        </span>
                      )}
                    </div>

                    <div className="font-display text-xl sm:text-2xl font-bold text-app-heading leading-tight mb-0.5">
                      {mins} min
                      <span className="text-sm font-semibold text-app-muted ml-1">talk time</span>
                    </div>
                    <div className="text-[11px] text-app-muted mb-2">
                      {coinsTotal.toLocaleString()} coins
                      {pkg.bonusCoins > 0 ? ` · +${pkg.bonusCoins} bonus` : ''}
                    </div>
                    <div className="flex items-end justify-between gap-1">
                      <div className="text-[11px] font-semibold text-app-muted truncate">{pkg.title}</div>
                      <div className="text-right shrink-0">
                        {discounted && (
                          <div className="text-[10px] text-app-muted line-through leading-none mb-0.5">
                            {display.listFormatted}
                          </div>
                        )}
                        <div className="text-sm font-display font-bold text-amber-300 leading-none">{display.payFormatted}</div>
                      </div>
                    </div>
                    {saveLabel && (
                      <p className="text-[9px] text-emerald-400 font-semibold mt-1.5">{saveLabel}</p>
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Payment Method Selector */}
          <div>
            <h3 className="text-[10px] font-bold text-app-muted uppercase tracking-wider mb-2">Payment Method</h3>
            <div className="grid grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() => setPaymentMethod('card')}
                className={`p-2 rounded-xl border text-xs font-semibold flex items-center justify-center space-x-1.5 transition-all cursor-pointer ${
                  paymentMethod === 'card'
                    ? 'bg-pink-500/20 text-pink-300 border-pink-500 shadow-sm'
                    : 'bg-app-input border-hairline text-app-muted hover:text-app-heading'
                }`}
              >
                <CreditCard className="w-3.5 h-3.5 shrink-0" />
                <span className="truncate">Card</span>
              </button>

              <button
                type="button"
                onClick={() => setPaymentMethod('apple')}
                className={`p-2 rounded-xl border text-xs font-semibold flex items-center justify-center space-x-1.5 transition-all cursor-pointer ${
                  paymentMethod === 'apple'
                    ? 'bg-pink-500/20 text-pink-300 border-pink-500 shadow-sm'
                    : 'bg-app-input border-hairline text-app-muted hover:text-app-heading'
                }`}
              >
                <Smartphone className="w-3.5 h-3.5 shrink-0" />
                <span className="truncate">Apple/Google</span>
              </button>

              <button
                type="button"
                onClick={() => setPaymentMethod('crypto')}
                className={`p-2 rounded-xl border text-xs font-semibold flex items-center justify-center space-x-1.5 transition-all cursor-pointer ${
                  paymentMethod === 'crypto'
                    ? 'bg-pink-500/20 text-pink-300 border-pink-500 shadow-sm'
                    : 'bg-app-input border-hairline text-app-muted hover:text-app-heading'
                }`}
              >
                <Bitcoin className="w-3.5 h-3.5 shrink-0" />
                <span className="truncate">USDT Crypto</span>
              </button>
            </div>
          </div>

          <div className="flex items-center space-x-2 text-[10px] text-app-muted bg-app-input p-2.5 rounded-xl border border-hairline">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
            <span>Encrypted billing. Coins credited instantly. Charged amount recorded in USD.</span>
          </div>

          <div className="space-y-2 pb-1">
            <button
              id="coin-store-checkout-btn"
              onClick={handleCheckout}
              disabled={isProcessing || !selectedPkg}
              className="w-full py-3 bg-coin hover:brightness-110 text-slate-950 rounded-app font-display font-bold text-sm flex items-center justify-center space-x-2 shadow-app-sm transition-all cursor-pointer"
            >
              {isProcessing ? (
                <span className="animate-pulse">Processing Payment...</span>
              ) : (
                <>
                  <Zap className="w-4 h-4 fill-current" />
                  <span>
                    {selectedPkg
                      ? `${checkoutPayLabel(selectedPkg, selectedCurrency)} · ${selectedTotal} Coins`
                      : 'Select a package'}
                  </span>
                </>
              )}
            </button>

            <button
              type="button"
              onClick={() => {
                manualGrantCoins(currentUser.id, 500, 'Manual Store Quick Credit');
              }}
              className="w-full py-2 bg-app-input border border-hairline hover:border-amber-500/50 text-amber-500 hover:text-amber-400 rounded-xl text-xs font-mono font-bold flex items-center justify-center space-x-1.5 transition-all cursor-pointer"
            >
              <span>🪙</span>
              <span>Manual Test Grant (+500 Free Coins)</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
