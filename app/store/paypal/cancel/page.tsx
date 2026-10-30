'use client';

import React, { useEffect, useState } from 'react';
import { authFetch } from '../../../../src/utils/apiClient';

/**
 * PayPal cancel URL — mark pending intent failed then offer return home.
 */
export default function PayPalCancelPage() {
  const [message, setMessage] = useState('Cancelling checkout…');

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const params = new URLSearchParams(window.location.search);
      const purchaseId = (params.get('purchaseId') || '').trim();
      if (!purchaseId) {
        if (!cancelled) setMessage('Payment cancelled. No coins were charged.');
        return;
      }
      try {
        await authFetch('/api/v1/finance/funding/paypal/cancel', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ purchaseId }),
        });
      } catch {
        // best-effort
      }
      if (!cancelled) setMessage('You cancelled PayPal checkout. No coins were charged.');
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <main className="min-h-screen flex items-center justify-center bg-slate-950 text-slate-100 px-4">
      <div className="max-w-md text-center space-y-3">
        <h1 className="text-xl font-black">Checkout cancelled</h1>
        <p className="text-sm text-slate-400">{message}</p>
        <a href="/" className="inline-block text-xs text-cyan-400 underline">
          Back to app
        </a>
      </div>
    </main>
  );
}
