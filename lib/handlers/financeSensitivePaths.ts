/** Subpaths (under /api/v1/finance) that use the sensitive rate-limit tier. */
const SENSITIVE_EXACT = new Set([
  'config',
  'jobs/close-due-periods',
  'jobs/ensure-open-period',
  'ledger/reversal',
  'funding/admin-credit',
  'funding/checkout-intent',
  'funding/webhook/provider',
  'funding/webhook/paypal',
  'funding/paypal/capture',
  'funding/paypal/cancel',
  'funding/simulate-gateway',
  'manual-payouts',
]);

const SENSITIVE_PREFIXES = [
  'batches/', // reconcile, admin-mark-paid, cancel
  'tl/batches/', // reconcile, mark-paid, confirm-received
  'admin/salary-periods/', // mark-paid
  'host/salary/', // acknowledge
  'admin/payment-gateways', // patch + activate
];

export function isFinanceSensitivePath(sub: string, method: string): boolean {
  const m = method.toUpperCase();
  if (m === 'GET' || m === 'HEAD' || m === 'OPTIONS') {
    // Cron close job is GET but still sensitive
    if (sub === 'jobs/close-due-periods') return true;
    return false;
  }
  if (SENSITIVE_EXACT.has(sub)) return true;
  for (const prefix of SENSITIVE_PREFIXES) {
    if (!sub.startsWith(prefix)) continue;
    if (prefix === 'batches/' && /\/(reconcile|admin-mark-paid|cancel)$/.test(sub)) return true;
    if (prefix === 'tl/batches/' && /\/(reconcile|confirm-received|hosts\/[^/]+\/mark-paid)$/.test(sub))
      return true;
    if (prefix === 'admin/salary-periods/' && sub.endsWith('/mark-paid')) return true;
    if (prefix === 'host/salary/' && sub.endsWith('/acknowledge')) return true;
    if (prefix === 'admin/payment-gateways') return true;
  }
  return false;
}
