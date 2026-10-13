/**
 * Payable model (Phase 3 — locked):
 *
 * settlement_line_items (+ settlement_batches.total_due_usd) are the payable source of truth.
 * profiles.earnings_coins / coin balances remain operational call/gift telemetry and are NOT
 * decremented or treated as withdrawable cash at period close.
 *
 * Mid-period manual payouts are always rejected (PAYOUT_PERIOD_END_ONLY).
 * Admin remits via settlement batches only.
 */

export const PAYABLE_SOURCE_OF_TRUTH =
  'settlement_line_items' as const;

export const PAYABLE_MODEL_NOTES = [
  'Cash obligations exist only as settlement_batches / settlement_line_items after period close.',
  'financial_ledger is the immutable journal of those obligations and related accruals.',
  'profiles.earnings_coins is informational/operational — not the payout queue.',
  'Host-facing salary status is settlement_line_items.host_salary_status (pending|paid).',
].join(' ');
