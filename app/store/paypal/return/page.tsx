'use client';

import React, { useEffect, useState } from 'react';
import { authFetch } from '../../../../src/utils/apiClient';

/**
 * PayPal return URL — capture order then send user home with coins credited.
 * Query: purchaseId (ours) + token (PayPal order id).
 */
export default function PayPalReturnPage() {
  const [message, setMessage] = useState('Confirming your payment…');

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const params = new URLSearchParams(window.location.search);
        const purchaseId = (params.get('purchaseId') || '').trim();
        const token = (params.get('token') || params.get('orderId') || '').trim();
        if (!purchaseId) {
          if (!cancelled) setMessage('Missing purchase reference. You can return to the coin store.');
          return;
        }
        const res = await authFetch('/api/v1/finance/funding/paypal/capture', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ purchaseId, orderId: token || undefined, token: token || undefined }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok || data?.success === false) {
          if (!cancelled) {
            setMessage(
              data?.error?.message ||
                (typeof data?.error === 'string' ? data.error : null) ||
                'Payment confirmation failed. If you were charged, coins will credit via webhook shortly.'
            );
          }
          return;
        }
        if (!cancelled) setMessage('Payment complete — coins credited. Redirecting…');
        window.setTimeout(() => {
          window.location.assign('/');
        }, 1200);
      } catch {
        if (!cancelled) setMessage('Could not reach the payment API. Try opening the app again.');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <main className="min-h-screen flex items-center justify-center bg-slate-950 text-slate-100 px-4">
      <div className="max-w-md text-center space-y-3">
        <h1 className="text-xl font-black">PayPal checkout</h1>
        <p className="text-sm text-slate-400">{message}</p>
        <a href="/" className="inline-block text-xs text-cyan-400 underline">
          Back to app
        </a>
      </div>
    </main>
  );
}
