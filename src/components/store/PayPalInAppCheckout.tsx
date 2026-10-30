/**
 * In-app PayPal checkout — guest debit/credit card first (no PayPal login).
 * Advanced Card Fields when eligible; Card button as guest popup fallback.
 * PayPal wallet login is secondary only.
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  PayPalScriptProvider,
  PayPalButtons,
  PayPalCardFieldsProvider,
  PayPalNumberField,
  PayPalExpiryField,
  PayPalCVVField,
  PayPalNameField,
  usePayPalCardFields,
  usePayPalScriptReducer,
  FUNDING,
} from '@paypal/react-paypal-js';
import { Loader2, ExternalLink, CreditCard, AlertTriangle, ChevronDown } from 'lucide-react';
import {
  fetchFundingCheckoutConfig,
  postFundingCheckoutIntent,
  postPayPalCapture,
  postPayPalCancel,
} from '../../services/financeApi';

type CheckoutConfig = {
  clientId: string;
  mode: 'sandbox' | 'live';
  currency: string;
  providerDisplayName: string;
};

interface PayPalInAppCheckoutProps {
  packageId: string;
  payLabel: string;
  onPaid: (coinBalance: number) => void;
  onError: (message: string) => void;
  onCancelFlow?: () => void;
  onFallbackRedirect: (approvalUrl: string) => void;
}

declare global {
  interface Window {
    paypal?: {
      CardFields?: (opts: Record<string, unknown>) => { isEligible: () => boolean };
    };
  }
}

const CARD_FIELD_STYLE = {
  input: {
    'font-size': '16px',
    'font-family': 'ui-sans-serif, system-ui, sans-serif',
    color: '#0f172a',
    padding: '12px',
  },
  '.invalid': { color: '#e11d48' },
  body: { background: '#ffffff' },
} as const;

const fieldShellClass =
  'min-h-[48px] rounded-lg border border-slate-300 bg-white overflow-hidden [&>div]:min-h-[48px]';

function CardPayButton({ disabled }: { disabled: boolean }) {
  const { cardFieldsForm } = usePayPalCardFields();
  const [submitting, setSubmitting] = useState(false);

  return (
    <button
      type="button"
      disabled={disabled || submitting || !cardFieldsForm}
      onClick={async () => {
        if (!cardFieldsForm) return;
        setSubmitting(true);
        try {
          await cardFieldsForm.submit();
        } catch {
          // provider onError handles messaging
        } finally {
          setSubmitting(false);
        }
      }}
      className="w-full py-2.5 rounded-xl bg-coin text-slate-950 font-display font-bold text-sm flex items-center justify-center gap-2 disabled:opacity-50 cursor-pointer"
    >
      {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <CreditCard className="w-4 h-4" />}
      {submitting ? 'Processing…' : 'Pay with debit / credit card'}
    </button>
  );
}

function CardFieldsEligibilityProbe({
  onResult,
}: {
  onResult: (eligible: boolean) => void;
}) {
  const [{ isResolved }] = usePayPalScriptReducer();

  useEffect(() => {
    if (!isResolved) return;
    try {
      const factory = window.paypal?.CardFields;
      if (!factory) {
        onResult(false);
        return;
      }
      const probe = factory({
        createOrder: async () => 'probe',
        onApprove: () => undefined,
        onError: () => undefined,
      });
      onResult(Boolean(probe?.isEligible?.()));
    } catch {
      onResult(false);
    }
  }, [isResolved, onResult]);

  return null;
}

function AcdcSetupHint({ mode }: { mode: 'sandbox' | 'live' }) {
  return (
    <div className="rounded-xl border border-amber-700/50 bg-amber-950/40 px-3 py-2.5 space-y-1.5">
      <div className="flex items-start gap-2 text-amber-200 text-[11px] font-bold">
        <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
        In-page card fields are not enabled on this PayPal app yet
      </div>
      <p className="text-[10px] text-amber-100/80 leading-relaxed">
        PayPal hides card number fields until{' '}
        <strong>Advanced Credit and Debit Card Payments</strong> is enabled for your{' '}
        {mode === 'sandbox' ? 'Sandbox' : 'Live'} app. Until then, use the{' '}
        <strong>Debit or Credit Card</strong> button below (guest checkout — no PayPal login).
      </p>
      <ol className="text-[10px] text-amber-100/70 list-decimal pl-4 space-y-0.5">
        <li>Open PayPal Developer Dashboard → your app</li>
        <li>Enable Advanced Credit and Debit Card Payments (ACDC)</li>
        <li>Sandbox: also approve the product on the sandbox business account</li>
        <li>Reload this page — card fields appear when eligible</li>
      </ol>
    </div>
  );
}

function CheckoutInner({
  packageId,
  payLabel,
  config,
  onPaid,
  onError,
  onCancelFlow,
  onFallbackRedirect,
}: {
  packageId: string;
  payLabel: string;
  config: CheckoutConfig;
  onPaid: (coinBalance: number) => void;
  onError: (message: string) => void;
  onCancelFlow?: () => void;
  onFallbackRedirect: (approvalUrl: string) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [cardFieldsEligible, setCardFieldsEligible] = useState<boolean | null>(null);
  const [showWallet, setShowWallet] = useState(false);
  const purchaseIdRef = useRef<string | null>(null);
  const orderIdRef = useRef<string | null>(null);

  const cancelPending = useCallback(async () => {
    const pid = purchaseIdRef.current;
    if (!pid) return;
    await postPayPalCancel({ purchaseId: pid }).catch(() => undefined);
    purchaseIdRef.current = null;
    orderIdRef.current = null;
  }, []);

  const createServerOrder = useCallback(async (): Promise<string> => {
    setBusy(true);
    const res = await postFundingCheckoutIntent({
      packageId,
      checkoutMode: 'sdk',
    });
    if (!res.success || !res.data) {
      setBusy(false);
      const msg = res.error?.message || 'Could not start checkout';
      onError(msg);
      throw new Error(msg);
    }
    const orderId = String(res.data.orderId || res.data.purchase?.externalRef || '').trim();
    const purchaseId = String(res.data.purchase?.id || '').trim();
    if (!orderId || !purchaseId) {
      setBusy(false);
      const msg = 'Payment session missing order id';
      onError(msg);
      throw new Error(msg);
    }
    purchaseIdRef.current = purchaseId;
    orderIdRef.current = orderId;
    setBusy(false);
    return orderId;
  }, [packageId, onError]);

  const captureOrder = useCallback(
    async (orderId: string) => {
      const purchaseId = purchaseIdRef.current;
      if (!purchaseId) {
        onError('Missing purchase reference');
        return;
      }
      setBusy(true);
      const res = await postPayPalCapture({ purchaseId, orderId });
      setBusy(false);
      if (!res.success || !res.data) {
        const msg = (res.error?.message || '').toLowerCase();
        // Soft success if race left payment paid but response still looks like a conflict
        if (
          msg.includes('already') ||
          msg.includes('completed') ||
          res.error?.code === 'DUPLICATE' ||
          res.error?.code === 'INVALID_STATUS'
        ) {
          // NaN = paid OK, do not overwrite local balance (parent should toast + close)
          onPaid(Number.NaN);
          purchaseIdRef.current = null;
          orderIdRef.current = null;
          return;
        }
        onError(res.error?.message || 'Payment capture failed');
        return;
      }
      const balance = Number(res.data.coinBalance);
      onPaid(Number.isFinite(balance) ? balance : Number.NaN);
      purchaseIdRef.current = null;
      orderIdRef.current = null;
    },
    [onError, onPaid]
  );

  const handleFallbackRedirect = useCallback(async () => {
    setBusy(true);
    const res = await postFundingCheckoutIntent({
      packageId,
      checkoutMode: 'redirect',
    });
    setBusy(false);
    if (!res.success || !res.data?.approvalUrl) {
      onError(res.error?.message || 'Could not open PayPal checkout');
      return;
    }
    onFallbackRedirect(res.data.approvalUrl);
  }, [packageId, onError, onFallbackRedirect]);

  const onApproveShared = async (data: { orderID?: string }) => {
    const oid = String(data?.orderID || orderIdRef.current || '').trim();
    if (!oid) {
      onError('Missing PayPal order id');
      return;
    }
    await captureOrder(oid);
  };

  return (
    <div className="space-y-4">
      <CardFieldsEligibilityProbe onResult={setCardFieldsEligible} />

      <p className="text-[11px] text-app-muted">
        Pay with debit or credit card — no PayPal account required. Card data is handled by PayPal
        hosted fields; MingleCall never sees your full card number.
      </p>

      {cardFieldsEligible === false && <AcdcSetupHint mode={config.mode} />}

      {cardFieldsEligible !== false && (
        <div className="space-y-3 rounded-xl border border-hairline bg-slate-100 p-3">
          <div className="text-[10px] font-bold uppercase tracking-wider text-slate-600">
            Debit / credit card (no PayPal login)
          </div>
          {cardFieldsEligible === null ? (
            <div className="flex items-center gap-2 text-[11px] text-slate-500 py-2">
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
              Checking card field eligibility…
            </div>
          ) : (
            <PayPalCardFieldsProvider
              createOrder={createServerOrder}
              onApprove={onApproveShared}
              onError={(err) => {
                const msg =
                  (err && typeof err === 'object' && 'message' in err
                    ? String((err as { message?: string }).message || '')
                    : '') || 'Card payment failed';
                onError(msg);
                void cancelPending();
              }}
              onCancel={async () => {
                await cancelPending();
                onCancelFlow?.();
              }}
              style={CARD_FIELD_STYLE}
            >
              <div className="space-y-2">
                <div>
                  <label className="text-[10px] font-bold text-slate-600 uppercase tracking-wider">
                    Name on card
                  </label>
                  <div className={fieldShellClass}>
                    <PayPalNameField placeholder="Name on card" />
                  </div>
                </div>
                <div>
                  <label className="text-[10px] font-bold text-slate-600 uppercase tracking-wider">
                    Card number
                  </label>
                  <div className={fieldShellClass}>
                    <PayPalNumberField placeholder="Card number" />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-[10px] font-bold text-slate-600 uppercase tracking-wider">
                      Expiry
                    </label>
                    <div className={fieldShellClass}>
                      <PayPalExpiryField placeholder="MM/YY" />
                    </div>
                  </div>
                  <div>
                    <label className="text-[10px] font-bold text-slate-600 uppercase tracking-wider">
                      CVV
                    </label>
                    <div className={fieldShellClass}>
                      <PayPalCVVField placeholder="CVV" />
                    </div>
                  </div>
                </div>
                <CardPayButton disabled={busy} />
              </div>
            </PayPalCardFieldsProvider>
          )}
        </div>
      )}

      {/* Guest card popup — works even when ACDC Card Fields are not eligible */}
      <div className="space-y-2">
        <div className="text-[10px] font-bold uppercase tracking-wider text-app-muted">
          {cardFieldsEligible === false
            ? 'Pay with debit or credit card'
            : 'Or pay with card (PayPal guest)'}
        </div>
        <PayPalButtons
          style={{ layout: 'vertical', shape: 'rect', label: 'pay', height: 45, color: 'black' }}
          fundingSource={FUNDING.CARD}
          disabled={busy}
          createOrder={createServerOrder}
          onApprove={onApproveShared}
          onCancel={async () => {
            await cancelPending();
            onCancelFlow?.();
          }}
          onError={() => {
            onError('Card checkout failed');
            void cancelPending();
          }}
        />
        <p className="text-[10px] text-app-muted">
          Opens a card form — you can pay as a guest without logging into PayPal.
        </p>
      </div>

      <div className="border-t border-hairline pt-2">
        <button
          type="button"
          onClick={() => setShowWallet((v) => !v)}
          className="w-full flex items-center justify-between text-[10px] font-bold uppercase tracking-wider text-app-muted cursor-pointer py-1"
        >
          <span>Pay with PayPal account (requires login)</span>
          <ChevronDown className={`w-3.5 h-3.5 transition-transform ${showWallet ? 'rotate-180' : ''}`} />
        </button>
        {showWallet ? (
          <div className="mt-2 space-y-2">
            <PayPalButtons
              style={{ layout: 'vertical', shape: 'rect', label: 'paypal', height: 42 }}
              fundingSource={FUNDING.PAYPAL}
              disabled={busy}
              createOrder={createServerOrder}
              onApprove={onApproveShared}
              onCancel={async () => {
                await cancelPending();
                onCancelFlow?.();
              }}
              onError={() => {
                onError('PayPal checkout failed');
                void cancelPending();
              }}
            />
          </div>
        ) : null}
      </div>

      <button
        type="button"
        disabled={busy}
        onClick={() => void handleFallbackRedirect()}
        className="w-full py-2 text-[11px] font-semibold text-app-muted hover:text-app-heading flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
      >
        <ExternalLink className="w-3 h-3" />
        Full-page guest checkout · {payLabel}
      </button>
    </div>
  );
}

export const PayPalInAppCheckout: React.FC<PayPalInAppCheckoutProps> = ({
  packageId,
  payLabel,
  onPaid,
  onError,
  onCancelFlow,
  onFallbackRedirect,
}) => {
  const [config, setConfig] = useState<CheckoutConfig | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const res = await fetchFundingCheckoutConfig();
      if (cancelled) return;
      if (!res.success || !res.data?.clientId) {
        setLoadError(res.error?.message || 'Payments temporarily unavailable');
        return;
      }
      if (!res.data.inAppCheckout) {
        setLoadError('In-app checkout is not available for the active gateway');
        return;
      }
      setConfig({
        clientId: res.data.clientId,
        mode: res.data.mode,
        currency: res.data.currency || 'USD',
        providerDisplayName: res.data.providerDisplayName || 'PayPal',
      });
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const handleFallbackRedirect = useCallback(async () => {
    if (!packageId) return;
    setBusy(true);
    const res = await postFundingCheckoutIntent({
      packageId,
      checkoutMode: 'redirect',
    });
    setBusy(false);
    if (!res.success || !res.data?.approvalUrl) {
      onError(res.error?.message || 'Could not open PayPal checkout');
      return;
    }
    onFallbackRedirect(res.data.approvalUrl);
  }, [packageId, onError, onFallbackRedirect]);

  if (loadError) {
    return (
      <div className="space-y-3">
        <p className="text-xs text-rose-300">{loadError}</p>
        <button
          type="button"
          disabled={busy}
          onClick={() => void handleFallbackRedirect()}
          className="w-full py-2.5 rounded-xl border border-hairline text-xs font-bold text-app-heading flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
        >
          {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ExternalLink className="w-3.5 h-3.5" />}
          Continue on PayPal
        </button>
      </div>
    );
  }

  if (!config) {
    return (
      <div className="flex items-center justify-center gap-2 py-6 text-xs text-app-muted">
        <Loader2 className="w-4 h-4 animate-spin" />
        Loading secure checkout…
      </div>
    );
  }

  return (
    <PayPalScriptProvider
      options={{
        clientId: config.clientId,
        currency: config.currency || 'USD',
        intent: 'capture',
        components: 'buttons,card-fields',
        enableFunding: 'card',
        disableFunding: 'paylater,credit',
        ...(config.mode === 'sandbox' ? { buyerCountry: 'US' } : {}),
      }}
    >
      <CheckoutInner
        packageId={packageId}
        payLabel={payLabel}
        config={config}
        onPaid={onPaid}
        onError={onError}
        onCancelFlow={onCancelFlow}
        onFallbackRedirect={onFallbackRedirect}
      />
    </PayPalScriptProvider>
  );
};
