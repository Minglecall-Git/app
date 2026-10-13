/**
 * Period-end payout policy (Phase 7).
 * Manual mid-period payout creates are always rejected — settlement batches are the only cash-out path.
 */

import { loadFinanceSystemConfig, getCachedFinanceConfig } from './config';

export const PAYOUT_PERIOD_END_ONLY = 'PAYOUT_PERIOD_END_ONLY' as const;

export class PayoutPolicyError extends Error {
  readonly code: typeof PAYOUT_PERIOD_END_ONLY = PAYOUT_PERIOD_END_ONLY;
  readonly httpStatus = 400;

  constructor(message = 'Payouts are only available at period end via settlement batches.') {
    super(message);
    this.name = 'PayoutPolicyError';
  }
}

export interface PayoutPolicyDecision {
  allowed: boolean;
  code?: typeof PAYOUT_PERIOD_END_ONLY;
  message?: string;
  settlementEnabled: boolean;
}

/**
 * Manual payout_requests creates are never allowed.
 * Cash-out happens only through period-end settlement_batches.
 */
export function evaluateManualPayoutPolicy(settlementEnabled: boolean): PayoutPolicyDecision {
  return {
    allowed: false,
    code: PAYOUT_PERIOD_END_ONLY,
    message:
      'Manual mid-period payouts are disabled. Salaries settle at period end via settlement batches only.',
    settlementEnabled,
  };
}

/** Sync check using cached config (defaults to settlement enabled). */
export function assertManualPayoutAllowedSync(): void {
  const decision = evaluateManualPayoutPolicy(getCachedFinanceConfig().settlementEnabled);
  if (!decision.allowed) {
    throw new PayoutPolicyError(decision.message);
  }
}

/** Async check with fresh(ish) config load. */
export async function assertManualPayoutAllowed(): Promise<void> {
  const config = await loadFinanceSystemConfig();
  const decision = evaluateManualPayoutPolicy(config.settlementEnabled);
  if (!decision.allowed) {
    throw new PayoutPolicyError(decision.message);
  }
}

/** Structured result for Express handlers (no throw). */
export async function checkManualPayoutAllowed(): Promise<PayoutPolicyDecision> {
  const config = await loadFinanceSystemConfig();
  return evaluateManualPayoutPolicy(config.settlementEnabled);
}
