/**
 * Period close orchestrator (Phase 3).
 *
 * Flow per due period:
 * 1. Claim open|failed → closing (optimistic lock)
 * 2. Freeze config_snapshot
 * 3. Aggregate wallet_ledger CALL_DEBIT / HOST_EARN / TL_EARN for [period_start, period_end)
 * 4. Host share true-up (Phase 3): if bronze+ met and no coin_earn_override → TARGET_SHARE_TRUEUP
 *    (append-only wallet + earnings_coins; TL has no true-up; gifts excluded from eligible burn)
 * 5. Compute target cash bonuses from creator_metrics + system thresholds (separate from true-up)
 * 6. Build TL bundles + direct-host batches; persist (unique constraints = no double-pay)
 * 7. Append financial_ledger PLATFORM_EARN + HOST_EARN + TL_EARN + TARGET_SHARE_TRUEUP + TARGET_BONUS + SETTLEMENT_ACCRUAL
 *    (skip if SETTLEMENT_ACCRUAL or PLATFORM_EARN already present — idempotent)
 *    Resume (batches exist, ledger missing): rebuild HOST/TRUEUP/BONUS/TL detail from settlement_line_items
 * 8. settlement_events(created) for new/known batches
 * 9. Snapshot creator_metrics → reset live period counters
 *    Reset is resume-safe: runs when target_period_start !== next open window (not gated only on snap insert)
 * 10. status → closed; ensureOpenPeriod for the next window
 *
 * PLATFORM_EARN invariant:
 *   (CALL_DEBIT + GIFT_DEBIT) − HOST_EARN − TARGET_SHARE_TRUEUP − TL_EARN (coins).
 * True-up increases host obligation and decreases platform retained.
 * PLATFORM USD = retainedCoins × frozen peg (+ optional package load_margin_usd from coin_purchases).
 * FX (Phase 5 Fixed Peg): host/TL/platform USD all use coin_usd_peg (frozen on config_snapshot).
 * Snapshot includes peg, burn rates, call shares (base+target), TL share, gift shares.
 * Legacy female_payout_ratio_usd / coin_to_usd_ratio are mirrored to peg in the snapshot.
 * Rewards excluded from salary accrual; gift HOST/TL remain in settlement lines (product).
 *
 * Payable truth: settlement_line_items (see payableModel.ts).
 * Second close of a closed period is a no-op. Resume of failed/closing is safe.
 * TARGET_SHARE_TRUEUP idempotent via wallet unique (call_id=target_share_trueup:{periodId}, …).
 */

import { getSupabaseAdmin, isSupabaseAdminConfigured } from '../supabaseAdmin';
import { coinsToUsd, getCoinUsdPeg, usdToCoins } from '../../shared/finance/fx';
import {
  computePerformanceTier,
  resolveTargetThresholds,
  targetBonusUsdForTier,
  type TargetTierThresholds,
} from '../../shared/finance/targetBonus';
import type { CreatorPerformanceTier, SettlementConfigSnapshot } from '../../shared/finance/types';
import { toIso } from '../../shared/finance/periodBounds';
import { aggregateWalletLedgerEarnings } from './accrualQuery';
import {
  loadFinanceSystemConfig,
  type FinanceSystemConfig,
} from './config';
import { appendFinancialLedgerEntries, type AppendLedgerInput } from './ledger';
import { freezeFinanceConfigSnapshot } from './configSnapshot';
import { PAYABLE_SOURCE_OF_TRUTH } from './payableModel';
import { ensureOpenPeriod } from './period';
import {
  buildSettlementBatches,
  createSettlementBatchesForPeriod,
  type SettlementPayeeAccrual,
} from './settlement';
import { recordBatchCreatedEvent } from './statusTransition';
import {
  aggregateHostCallBurnForTrueUp,
  planHostShareTrueUps,
  postHostShareTrueUpWallet,
} from './hostShareTrueUp';
import { resolveEconomyBurnRates } from '../../shared/finance/economyBurn';

export interface ClosePeriodResult {
  success: boolean;
  periodId: string;
  status: 'closed' | 'failed' | 'skipped' | 'noop';
  idempotent?: boolean;
  batchIds?: string[];
  ledgerEntriesWritten?: number;
  snapshotsWritten?: number;
  error?: string;
  message?: string;
}

export interface CloseDuePeriodsResult {
  success: boolean;
  ensuredOpenPeriodId?: string | null;
  results: ClosePeriodResult[];
  error?: string;
}

export interface ClosePeriodOptions {
  actorUserId: string;
  at?: Date;
  /** Optional in-memory creator metrics map to reset after DB snapshot. */
  creatorMetricsMap?: Map<string, any>;
  onMetricsReset?: () => void;
}

function freezeConfigSnapshot(config: FinanceSystemConfig): SettlementConfigSnapshot {
  return freezeFinanceConfigSnapshot(config, { includeFrozenAt: true });
}

async function sumPeriodPackageLoadMarginUsd(
  client: NonNullable<ReturnType<typeof getSupabaseAdmin>>,
  periodStart: Date | string,
  periodEnd: Date | string
): Promise<number> {
  const startIso = typeof periodStart === 'string' ? periodStart : toIso(periodStart);
  const endIso = typeof periodEnd === 'string' ? periodEnd : toIso(periodEnd);
  try {
    const { data, error } = await client
      .from('coin_purchases')
      .select('load_margin_usd')
      .eq('status', 'completed')
      .gte('completed_at', startIso)
      .lt('completed_at', endIso);
    if (error) {
      console.warn('[finance/closePeriod] load_margin sum skipped:', error.message);
      return 0;
    }
    let sum = 0;
    for (const row of data || []) {
      const n = Number((row as any).load_margin_usd);
      if (Number.isFinite(n)) sum += n;
    }
    return Math.round(sum * 1e6) / 1e6;
  } catch (err: any) {
    console.warn('[finance/closePeriod] load_margin sum exception:', err?.message || err);
    return 0;
  }
}

function thresholdsFromSnapshot(
  snapshot: unknown,
  fallback: TargetTierThresholds
): TargetTierThresholds {
  if (!snapshot || typeof snapshot !== 'object') return fallback;
  return resolveTargetThresholds(snapshot as Record<string, unknown>);
}

function computeHostTargetBonus(opts: {
  hours: number;
  totalCoins: number;
  thresholds: TargetTierThresholds;
  fxRatio: number;
}): {
  tier: CreatorPerformanceTier;
  bonusUsd: number;
  bonusCoins: number;
} {
  const tier = computePerformanceTier(opts.hours, opts.totalCoins, opts.thresholds);
  const metBronze =
    opts.hours >= opts.thresholds.bronzeHours && opts.totalCoins >= opts.thresholds.bronzeCoins;
  let bonusUsd = 0;
  if (tier === 'gold' || tier === 'silver') {
    bonusUsd = targetBonusUsdForTier(tier, opts.thresholds);
  } else if (metBronze) {
    bonusUsd = targetBonusUsdForTier('bronze', opts.thresholds);
  }
  return {
    tier,
    bonusUsd,
    bonusCoins: bonusUsd > 0 ? usdToCoins(bonusUsd, opts.fxRatio) : 0,
  };
}

async function markPeriodFailed(periodId: string, closeError: string): Promise<void> {
  const client = getSupabaseAdmin();
  if (!client) return;
  await client
    .from('settlement_periods')
    .update({
      status: 'failed',
      close_error: closeError.slice(0, 2000),
      updated_at: new Date().toISOString(),
    })
    .eq('id', periodId);
}

async function resolveSystemActorUserId(preferred?: string | null): Promise<string | null> {
  if (preferred && String(preferred).trim()) return String(preferred).trim();
  const envActor = (process.env.FINANCE_JOB_ACTOR_USER_ID || '').trim();
  if (envActor) return envActor;
  const client = getSupabaseAdmin();
  if (!client) return null;
  const { data } = await client
    .from('profiles')
    .select('id')
    .eq('role', 'admin')
    .limit(1)
    .maybeSingle();
  return data?.id ? String(data.id) : null;
}

/** Find open periods whose close clock is due. */
export async function findDueOpenPeriods(at: Date = new Date()): Promise<any[]> {
  const client = getSupabaseAdmin();
  if (!client) return [];
  const { data, error } = await client
    .from('settlement_periods')
    .select('*')
    .eq('status', 'open')
    .lte('close_scheduled_at', toIso(at))
    .order('period_start', { ascending: true });
  if (error) {
    console.warn('[finance/closePeriod] findDueOpenPeriods:', error.message);
    return [];
  }
  return data || [];
}

/** Also allow resume of failed periods that are still due. */
export async function findRetryableFailedPeriods(at: Date = new Date()): Promise<any[]> {
  const client = getSupabaseAdmin();
  if (!client) return [];
  const { data, error } = await client
    .from('settlement_periods')
    .select('*')
    .eq('status', 'failed')
    .lte('close_scheduled_at', toIso(at))
    .order('period_start', { ascending: true });
  if (error) {
    console.warn('[finance/closePeriod] findRetryableFailedPeriods:', error.message);
    return [];
  }
  return data || [];
}

/**
 * Close a single settlement period idempotently.
 */
export async function closePeriod(
  periodId: string,
  opts: ClosePeriodOptions
): Promise<ClosePeriodResult> {
  if (!isSupabaseAdminConfigured()) {
    return {
      success: false,
      periodId,
      status: 'failed',
      error: 'Supabase admin not configured',
    };
  }
  const client = getSupabaseAdmin();
  if (!client) {
    return {
      success: false,
      periodId,
      status: 'failed',
      error: 'Supabase admin client unavailable',
    };
  }

  const actorUserId = await resolveSystemActorUserId(opts.actorUserId);
  if (!actorUserId) {
    return {
      success: false,
      periodId,
      status: 'failed',
      error: 'No actor user id (pass actorUserId or set FINANCE_JOB_ACTOR_USER_ID / admin profile)',
    };
  }

  const { data: existing, error: loadError } = await client
    .from('settlement_periods')
    .select('*')
    .eq('id', periodId)
    .maybeSingle();

  if (loadError || !existing) {
    return {
      success: false,
      periodId,
      status: 'failed',
      error: loadError?.message || 'Period not found',
    };
  }

  if (existing.status === 'closed') {
    return {
      success: true,
      periodId,
      status: 'noop',
      idempotent: true,
      message: 'Period already closed',
    };
  }

  // Optimistic claim: open|failed → closing (closing stuck can be re-claimed carefully)
  const claimable = existing.status === 'open' || existing.status === 'failed' || existing.status === 'closing';
  if (!claimable) {
    return {
      success: false,
      periodId,
      status: 'skipped',
      error: `Cannot close period in status=${existing.status}`,
    };
  }

  const { data: claimed, error: claimError } = await client
    .from('settlement_periods')
    .update({
      status: 'closing',
      close_error: null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', periodId)
    .in('status', ['open', 'failed', 'closing'])
    .select('*')
    .maybeSingle();

  if (claimError || !claimed) {
    // Lost race — re-read
    const { data: again } = await client
      .from('settlement_periods')
      .select('status')
      .eq('id', periodId)
      .maybeSingle();
    if (again?.status === 'closed') {
      return {
        success: true,
        periodId,
        status: 'noop',
        idempotent: true,
        message: 'Period closed by concurrent worker',
      };
    }
    return {
      success: false,
      periodId,
      status: 'failed',
      error: claimError?.message || 'Failed to claim period for closing',
    };
  }

  try {
    // Existing settlement artifacts (idempotent resume) — check before freezing snapshot
    const { data: existingBatches, error: batchListError } = await client
      .from('settlement_batches')
      .select('id')
      .eq('period_id', periodId);
    if (batchListError) throw new Error(batchListError.message);
    let batchIds = (existingBatches || []).map((b: any) => String(b.id));
    const batchesAlreadyExist = batchIds.length > 0;

    const liveConfig = await loadFinanceSystemConfig({ force: true });
    const priorSnapshot =
      claimed.config_snapshot && typeof claimed.config_snapshot === 'object'
        ? (claimed.config_snapshot as Record<string, unknown>)
        : null;
    const priorFrozen = Boolean(priorSnapshot && priorSnapshot.frozen_at);

    // Freeze snapshot on first close attempt only. Resume must not overwrite rules
    // that already produced batches (mid-period config changes apply to future periods).
    let config = liveConfig;
    let snapshot = freezeConfigSnapshot(liveConfig);
    if (batchesAlreadyExist && priorFrozen) {
      snapshot = { ...priorSnapshot } as SettlementConfigSnapshot;
      const frozenPeg = getCoinUsdPeg(priorSnapshot);
      config = {
        ...liveConfig,
        coinUsdPeg: frozenPeg,
        femalePayoutRatioUsd: frozenPeg,
        coinToUsdRatio: frozenPeg,
        thresholds: thresholdsFromSnapshot(priorSnapshot, liveConfig.thresholds),
      };
    } else {
      await client
        .from('settlement_periods')
        .update({
          config_snapshot: snapshot,
          updated_at: new Date().toISOString(),
        })
        .eq('id', periodId);
    }

    const fxRatio = config.coinUsdPeg;

    const periodStart = claimed.period_start;
    const periodEnd = claimed.period_end;

    const { count: accrualLedgerCount, error: ledgerCountError } = await client
      .from('financial_ledger')
      .select('id', { count: 'exact', head: true })
      .eq('period_id', periodId)
      .eq('entry_type', 'SETTLEMENT_ACCRUAL');
    if (ledgerCountError) throw new Error(ledgerCountError.message);

    const { count: platformLedgerCount, error: platformCountError } = await client
      .from('financial_ledger')
      .select('id', { count: 'exact', head: true })
      .eq('period_id', periodId)
      .eq('entry_type', 'PLATFORM_EARN');
    if (platformCountError) throw new Error(platformCountError.message);

    // Idempotent: any prior SETTLEMENT_ACCRUAL or PLATFORM_EARN means ledger already posted
    const ledgerAlreadyExists =
      (accrualLedgerCount || 0) > 0 || (platformLedgerCount || 0) > 0;

    let ledgerEntriesWritten = 0;
    let builtAccruals: SettlementPayeeAccrual[] = [];
    let hostBonusByUser = new Map<string, { tier: CreatorPerformanceTier; bonusUsd: number; bonusCoins: number; hours: number; coins: number }>();
    /** hostId → true-up coins posted (or already present) for settlement + ledger. */
    const hostTrueUpByUser = new Map<string, number>();
    /** Period burn totals for PLATFORM_EARN (also available when resuming batch-only path). */
    let periodBurnTotals = {
      callDebitCoins: 0,
      hostEarnCoins: 0,
      targetShareTrueUpCoins: 0,
      tlEarnCoins: 0,
      platformRetainedCoins: 0,
    };

    // Always need creator metrics for snapshots/bonuses
    const { data: metricsRows, error: metricsError } = await client
      .from('creator_metrics')
      .select('*');
    if (metricsError) throw new Error(metricsError.message);
    const metricsList = metricsRows || [];

    if (!batchesAlreadyExist) {
      const accrual = await aggregateWalletLedgerEarnings({
        periodStart,
        periodEnd,
        client,
      });
      if (!accrual.success) throw new Error(accrual.error || 'Accrual query failed');

      periodBurnTotals = {
        callDebitCoins: accrual.totals.callDebitCoins,
        hostEarnCoins: accrual.totals.hostEarnCoins,
        targetShareTrueUpCoins: accrual.totals.targetShareTrueUpCoins,
        tlEarnCoins: accrual.totals.tlEarnCoins,
        platformRetainedCoins: accrual.totals.platformRetainedCoins,
      };

      const userIds = Array.from(accrual.byUser.keys());
      // Also include creators with metrics but zero ledger (bonus-only possible)
      for (const m of metricsList) {
        if (m.creator_id && !accrual.byUser.has(m.creator_id)) {
          userIds.push(m.creator_id);
        }
      }

      const profileById = new Map<
        string,
        { teamLeaderId: string | null; role: string; coinEarnOverrideRate: number | null }
      >();
      if (userIds.length) {
        // chunk IN queries
        const chunkSize = 200;
        for (let i = 0; i < userIds.length; i += chunkSize) {
          const chunk = userIds.slice(i, i + chunkSize);
          const { data: profiles, error: profileError } = await client
            .from('profiles')
            .select('id, team_leader_id, created_by_id, role, coin_earn_override_rate')
            .in('id', chunk);
          if (profileError) throw new Error(profileError.message);
          for (const p of profiles || []) {
            profileById.set(String(p.id), {
              teamLeaderId: p.team_leader_id || p.created_by_id || null,
              role: String(p.role || ''),
              coinEarnOverrideRate:
                p.coin_earn_override_rate != null ? Number(p.coin_earn_override_rate) : null,
            });
          }
        }
      }

      const metricsByCreator = new Map<string, any>();
      const metricsHoursCoins = new Map<string, { hours: number; coins: number }>();
      for (const m of metricsList) {
        const cid = String(m.creator_id);
        metricsByCreator.set(cid, m);
        metricsHoursCoins.set(cid, {
          hours: Number(m.active_online_hours || 0),
          coins:
            Number(m.total_target_coins) ||
            Number(m.coins_earned_from_calls || 0) + Number(m.coins_earned_from_gifts || 0),
        });
      }

      // --- Host share true-up (before settlement batches) ---
      const burnRates = resolveEconomyBurnRates(snapshot);
      const trueUpAgg = await aggregateHostCallBurnForTrueUp({
        periodStart,
        periodEnd,
        periodId,
        client,
      });
      if (!trueUpAgg.success) throw new Error(trueUpAgg.error || 'True-up accrual failed');

      const creatorHostIds = Array.from(
        new Set([
          ...Array.from(trueUpAgg.byHost.keys()),
          ...Array.from(metricsByCreator.keys()).filter((id) => {
            const role = profileById.get(id)?.role || '';
            return role === 'female_creator' || role === 'female_host';
          }),
        ])
      ).filter((id) => {
        const role = profileById.get(id)?.role || '';
        // If profile missing, still allow if metrics/agg present (treat as creator)
        if (!role) return true;
        return role === 'female_creator' || role === 'female_host';
      });

      const overrideByHost = new Map<string, number | null | undefined>();
      for (const id of creatorHostIds) {
        overrideByHost.set(id, profileById.get(id)?.coinEarnOverrideRate);
      }

      const trueUpPlans = planHostShareTrueUps({
        hostIds: creatorHostIds,
        aggByHost: trueUpAgg.byHost,
        metricsByCreator: metricsHoursCoins,
        overrideByHost,
        thresholds: config.thresholds,
        targetSharePercent: burnRates.femaleHostTargetSharePercent,
        burnConfig: snapshot,
      });

      let postedTrueUpTotal = 0;
      for (const plan of trueUpPlans) {
        if (plan.skippedAlreadyPosted) {
          const already = trueUpAgg.byHost.get(plan.hostId)?.alreadyTrueUpCoins || 0;
          if (already > 0) hostTrueUpByUser.set(plan.hostId, already);
          continue;
        }
        if (plan.trueUpCoins <= 0) continue;

        const posted = await postHostShareTrueUpWallet({
          hostId: plan.hostId,
          periodId,
          trueUpCoins: plan.trueUpCoins,
          client,
          metadata: {
            period_eligible_call_burn: plan.periodEligibleCallBurn,
            period_host_call_earn: plan.periodHostCallEarn,
            target_share_percent: plan.targetSharePercent,
            hours: plan.hours,
            coins: plan.coins,
          },
        });
        if (!posted.success) {
          throw new Error(posted.error || `True-up wallet post failed for ${plan.hostId}`);
        }
        hostTrueUpByUser.set(plan.hostId, plan.trueUpCoins);
        if (posted.posted) postedTrueUpTotal += plan.trueUpCoins;
      }

      // Adjust PLATFORM_EARN inputs: true-up increases host obligation
      if (postedTrueUpTotal > 0) {
        periodBurnTotals.targetShareTrueUpCoins += postedTrueUpTotal;
        periodBurnTotals.platformRetainedCoins = Math.max(
          0,
          periodBurnTotals.callDebitCoins -
            periodBurnTotals.hostEarnCoins -
            periodBurnTotals.targetShareTrueUpCoins -
            periodBurnTotals.tlEarnCoins
        );
      }

      const hostIds = new Set<string>();
      const tlCommission = new Map<string, number>();

      for (const [userId, totals] of accrual.byUser.entries()) {
        if (totals.hostEarnCoins > 0 || totals.giftHostEarnCoins > 0) {
          hostIds.add(userId);
        }
        if (totals.tlEarnCoins > 0) {
          tlCommission.set(userId, (tlCommission.get(userId) || 0) + totals.tlEarnCoins);
        }
      }
      for (const id of hostTrueUpByUser.keys()) hostIds.add(id);

      // Creators with online time / coins may still get target bonus with zero ledger
      for (const m of metricsList) {
        const cid = String(m.creator_id);
        const hours = Number(m.active_online_hours || 0);
        const coins =
          Number(m.total_target_coins) ||
          Number(m.coins_earned_from_calls || 0) + Number(m.coins_earned_from_gifts || 0);
        const bonus = computeHostTargetBonus({
          hours,
          totalCoins: coins,
          thresholds: config.thresholds,
          fxRatio,
        });
        if (bonus.bonusUsd > 0) {
          hostIds.add(cid);
          hostBonusByUser.set(cid, {
            ...bonus,
            hours,
            coins,
          });
        } else if (hours > 0 || coins > 0) {
          // still track tier for snapshot even without bonus
          hostBonusByUser.set(cid, { ...bonus, hours, coins });
        }
      }

      for (const hostId of hostIds) {
        const totals = accrual.byUser.get(hostId);
        const profile = profileById.get(hostId);
        const metrics = metricsByCreator.get(hostId);
        const teamLeaderId =
          metrics?.agency_leader_id ||
          profile?.teamLeaderId ||
          null;

        let bonus = hostBonusByUser.get(hostId);
        if (!bonus && metrics) {
          const hours = Number(metrics.active_online_hours || 0);
          const coins =
            Number(metrics.total_target_coins) ||
            Number(metrics.coins_earned_from_calls || 0) +
              Number(metrics.coins_earned_from_gifts || 0);
          bonus = {
            ...computeHostTargetBonus({
              hours,
              totalCoins: coins,
              thresholds: config.thresholds,
              fxRatio,
            }),
            hours,
            coins,
          };
          hostBonusByUser.set(hostId, bonus);
        }

        builtAccruals.push({
          userId: hostId,
          teamLeaderId,
          role: 'host',
          callEarningsCoins: totals?.callHostEarnCoins || 0,
          giftEarningsCoins: totals?.giftHostEarnCoins || 0,
          targetShareTrueUpCoins: hostTrueUpByUser.get(hostId) || 0,
          targetBonusCoins: bonus?.bonusCoins || 0,
          targetBonusUsd: bonus?.bonusUsd || 0,
          breakdown: {
            performanceTier: bonus?.tier || 'bronze',
            activeOnlineHours: bonus?.hours ?? Number(metrics?.active_online_hours || 0),
            totalTargetCoins: bonus?.coins ?? 0,
          },
        });
      }

      for (const [tlId, coins] of tlCommission.entries()) {
        builtAccruals.push({
          userId: tlId,
          role: 'team_leader',
          tlCommissionCoins: coins,
          breakdown: { source: 'wallet_ledger.TL_EARN' },
        });
      }

      // Ensure TL rows exist for agency leaders who only have host salary pass-through
      for (const a of builtAccruals) {
        if (a.role === 'host' && a.teamLeaderId && !tlCommission.has(a.teamLeaderId)) {
          // no commission coins — bundle still created for host salaries
          if (!builtAccruals.some((x) => x.role === 'team_leader' && x.userId === a.teamLeaderId)) {
            builtAccruals.push({
              userId: a.teamLeaderId,
              role: 'team_leader',
              tlCommissionCoins: 0,
            });
          }
        }
      }

      const built = buildSettlementBatches({
        accruals: builtAccruals,
        fxRatio,
      }).filter((b) => b.totalDueUsd > 0 || b.lineItems.length > 0);

      const created = await createSettlementBatchesForPeriod({
        periodId,
        batches: built,
      });
      if (!created.success) throw new Error(created.error || 'Batch create failed');
      batchIds = created.batchIds;
    }

    // --- Ledger (append once) ---
    if (!ledgerAlreadyExists) {
      const ledgerInputs: AppendLedgerInput[] = [];

      // Need burn totals for PLATFORM_EARN even when batches already existed (resume)
      if (batchesAlreadyExist && periodBurnTotals.callDebitCoins === 0 && periodBurnTotals.hostEarnCoins === 0) {
        const burnAccrual = await aggregateWalletLedgerEarnings({
          periodStart,
          periodEnd,
          client,
        });
        if (!burnAccrual.success) throw new Error(burnAccrual.error || 'Burn accrual query failed');
        periodBurnTotals = {
          callDebitCoins: burnAccrual.totals.callDebitCoins,
          hostEarnCoins: burnAccrual.totals.hostEarnCoins,
          targetShareTrueUpCoins: burnAccrual.totals.targetShareTrueUpCoins,
          tlEarnCoins: burnAccrual.totals.tlEarnCoins,
          platformRetainedCoins: burnAccrual.totals.platformRetainedCoins,
        };
      }

      // PLATFORM_EARN = (CALL_DEBIT + GIFT_DEBIT) − HOST_EARN − TARGET_SHARE_TRUEUP − TL_EARN
      // Optional: + package load_margin_usd (Phase 4 retail − peg liability) as platform revenue
      {
        const platformCoins = periodBurnTotals.platformRetainedCoins;
        const retainedUsd = coinsToUsd(platformCoins, fxRatio);
        const loadMarginUsd = await sumPeriodPackageLoadMarginUsd(client, periodStart, periodEnd);
        const platformUsd = Math.round((retainedUsd + loadMarginUsd) * 1e4) / 1e4;
        ledgerInputs.push({
          periodId,
          entryType: 'PLATFORM_EARN',
          userId: null,
          teamLeaderId: null,
          counterpartyRole: 'platform',
          amountCoins: platformCoins,
          amountUsd: platformUsd,
          fxRatio,
          sourceRefType: 'settlement_period',
          sourceRefId: periodId,
          metadata: {
            invariant: 'CALL_DEBIT+GIFT_DEBIT - HOST_EARN - TARGET_SHARE_TRUEUP - TL_EARN',
            callDebitCoins: periodBurnTotals.callDebitCoins,
            hostEarnCoins: periodBurnTotals.hostEarnCoins,
            targetShareTrueUpCoins: periodBurnTotals.targetShareTrueUpCoins,
            tlEarnCoins: periodBurnTotals.tlEarnCoins,
            platformRetainedCoins: platformCoins,
            platformRetainedUsd: retainedUsd,
            package_load_margin_usd: loadMarginUsd,
            coin_usd_peg: fxRatio,
            // Legacy mirrors in metadata
            coin_to_usd_ratio: fxRatio,
            female_payout_ratio_usd: fxRatio,
          },
        });
      }

      if (!batchesAlreadyExist && builtAccruals.length) {
        for (const a of builtAccruals) {
          if (a.role === 'host') {
            const call = Number(a.callEarningsCoins) || 0;
            const gift = Number(a.giftEarningsCoins) || 0;
            const trueUp = Number(a.targetShareTrueUpCoins) || 0;
            const hostCoins = call + gift;
            if (hostCoins > 0) {
              ledgerInputs.push({
                periodId,
                entryType: 'HOST_EARN',
                userId: a.userId,
                teamLeaderId: a.teamLeaderId || null,
                counterpartyRole: 'host',
                amountCoins: hostCoins,
                amountUsd: coinsToUsd(hostCoins, fxRatio),
                fxRatio,
                sourceRefType: 'settlement_period',
                sourceRefId: periodId,
                metadata: { call, gift, coin_usd_peg: fxRatio },
              });
            }
            if (trueUp > 0) {
              ledgerInputs.push({
                periodId,
                entryType: 'TARGET_SHARE_TRUEUP',
                userId: a.userId,
                teamLeaderId: a.teamLeaderId || null,
                counterpartyRole: 'host',
                amountCoins: trueUp,
                amountUsd: coinsToUsd(trueUp, fxRatio),
                fxRatio,
                sourceRefType: 'settlement_period',
                sourceRefId: periodId,
                metadata: {
                  kind: 'target_share_trueup',
                  coin_usd_peg: fxRatio,
                  ...(a.breakdown || {}),
                },
              });
            }
            if ((a.targetBonusUsd || 0) > 0) {
              ledgerInputs.push({
                periodId,
                entryType: 'TARGET_BONUS',
                userId: a.userId,
                teamLeaderId: a.teamLeaderId || null,
                counterpartyRole: 'host',
                amountCoins: a.targetBonusCoins || 0,
                amountUsd: a.targetBonusUsd || 0,
                fxRatio,
                sourceRefType: 'settlement_period',
                sourceRefId: periodId,
                metadata: a.breakdown || {},
              });
            }
          } else if (a.role === 'team_leader' && (a.tlCommissionCoins || 0) > 0) {
            const tlCoins = Number(a.tlCommissionCoins) || 0;
            ledgerInputs.push({
              periodId,
              entryType: 'TL_EARN',
              userId: a.userId,
              teamLeaderId: a.userId,
              counterpartyRole: 'team_leader',
              amountCoins: tlCoins,
              amountUsd: coinsToUsd(tlCoins, fxRatio),
              fxRatio,
              sourceRefType: 'settlement_period',
              sourceRefId: periodId,
              metadata: { coin_usd_peg: fxRatio },
            });
          }
        }
      } else if (batchesAlreadyExist && batchIds.length) {
        // Resume path: rebuild per-host / TL financial_ledger detail from settlement lines
        // so PLATFORM_EARN + SETTLEMENT_ACCRUAL are not the only rows written.
        const { data: resumeLines, error: resumeLinesError } = await client
          .from('settlement_line_items')
          .select(
            'payee_user_id, payee_role, component, amount_coins, amount_usd, batch_id, metadata'
          )
          .in('batch_id', batchIds);
        if (resumeLinesError) throw new Error(resumeLinesError.message);

        const { data: resumeBatches } = await client
          .from('settlement_batches')
          .select('id, team_leader_id')
          .in('id', batchIds);
        const tlByBatch = new Map(
          (resumeBatches || []).map((b: any) => [String(b.id), b.team_leader_id || null])
        );

        type Agg = {
          call: number;
          gift: number;
          trueUp: number;
          bonusCoins: number;
          bonusUsd: number;
          tl: number;
          teamLeaderId: string | null;
          meta: Record<string, unknown>;
        };
        const byPayee = new Map<string, Agg>();
        for (const li of resumeLines || []) {
          const uid = String(li.payee_user_id || '');
          if (!uid) continue;
          const cur = byPayee.get(uid) || {
            call: 0,
            gift: 0,
            trueUp: 0,
            bonusCoins: 0,
            bonusUsd: 0,
            tl: 0,
            teamLeaderId: tlByBatch.get(String(li.batch_id)) || null,
            meta: {},
          };
          const coins = Number(li.amount_coins) || 0;
          const usd = Number(li.amount_usd) || 0;
          const c = String(li.component || '');
          if (c === 'call_earnings') cur.call += coins;
          else if (c === 'gift_earnings') cur.gift += coins;
          else if (c === 'target_share_trueup') cur.trueUp += coins;
          else if (c === 'target_bonus') {
            cur.bonusCoins += coins;
            cur.bonusUsd += usd;
          } else if (c === 'tl_commission') cur.tl += coins;
          if (li.metadata && typeof li.metadata === 'object') {
            cur.meta = { ...cur.meta, ...(li.metadata as Record<string, unknown>) };
          }
          byPayee.set(uid, cur);
        }

        for (const [uid, a] of byPayee.entries()) {
          const hostCoins = a.call + a.gift;
          if (hostCoins > 0) {
            ledgerInputs.push({
              periodId,
              entryType: 'HOST_EARN',
              userId: uid,
              teamLeaderId: a.teamLeaderId,
              counterpartyRole: 'host',
              amountCoins: hostCoins,
              amountUsd: coinsToUsd(hostCoins, fxRatio),
              fxRatio,
              sourceRefType: 'settlement_period',
              sourceRefId: periodId,
              metadata: { call: a.call, gift: a.gift, coin_usd_peg: fxRatio, resumed: true },
            });
          }
          if (a.trueUp > 0) {
            ledgerInputs.push({
              periodId,
              entryType: 'TARGET_SHARE_TRUEUP',
              userId: uid,
              teamLeaderId: a.teamLeaderId,
              counterpartyRole: 'host',
              amountCoins: a.trueUp,
              amountUsd: coinsToUsd(a.trueUp, fxRatio),
              fxRatio,
              sourceRefType: 'settlement_period',
              sourceRefId: periodId,
              metadata: {
                kind: 'target_share_trueup',
                coin_usd_peg: fxRatio,
                resumed: true,
                ...a.meta,
              },
            });
          }
          if (a.bonusUsd > 0 || a.bonusCoins > 0) {
            ledgerInputs.push({
              periodId,
              entryType: 'TARGET_BONUS',
              userId: uid,
              teamLeaderId: a.teamLeaderId,
              counterpartyRole: 'host',
              amountCoins: a.bonusCoins,
              amountUsd: a.bonusUsd,
              fxRatio,
              sourceRefType: 'settlement_period',
              sourceRefId: periodId,
              metadata: { resumed: true, ...a.meta },
            });
          }
          if (a.tl > 0) {
            ledgerInputs.push({
              periodId,
              entryType: 'TL_EARN',
              userId: uid,
              teamLeaderId: uid,
              counterpartyRole: 'team_leader',
              amountCoins: a.tl,
              amountUsd: coinsToUsd(a.tl, fxRatio),
              fxRatio,
              sourceRefType: 'settlement_period',
              sourceRefId: periodId,
              metadata: { coin_usd_peg: fxRatio, resumed: true },
            });
          }
        }
      }

      // SETTLEMENT_ACCRUAL from persisted batches (works on resume too)
      const { data: batchRows, error: batchFetchError } = await client
        .from('settlement_batches')
        .select('id, total_due_usd, total_host_salary_coins, total_tl_commission_coins, payee_user_id, team_leader_id, batch_kind')
        .eq('period_id', periodId);
      if (batchFetchError) throw new Error(batchFetchError.message);

      for (const b of batchRows || []) {
        const coins =
          Number(b.total_host_salary_coins || 0) + Number(b.total_tl_commission_coins || 0);
        ledgerInputs.push({
          periodId,
          entryType: 'SETTLEMENT_ACCRUAL',
          userId: b.payee_user_id,
          teamLeaderId: b.team_leader_id,
          counterpartyRole: b.batch_kind === 'team_leader_bundle' ? 'team_leader' : 'host',
          amountCoins: coins,
          amountUsd: Number(b.total_due_usd) || 0,
          fxRatio,
          sourceRefType: 'settlement_batch',
          sourceRefId: b.id,
          metadata: { batchKind: b.batch_kind },
        });
      }

      if (ledgerInputs.length) {
        const written = await appendFinancialLedgerEntries(ledgerInputs);
        if (!written.success) throw new Error(written.error || 'Ledger write failed');
        ledgerEntriesWritten = written.entries.length;
      }
    }

    // --- Events (created) — skip if event already exists for batch ---
    for (const batchId of batchIds) {
      const { count, error: evCountError } = await client
        .from('settlement_events')
        .select('id', { count: 'exact', head: true })
        .eq('batch_id', batchId)
        .eq('event_type', 'created');
      if (evCountError) throw new Error(evCountError.message);
      if ((count || 0) > 0) continue;
      const ev = await recordBatchCreatedEvent({
        batchId,
        periodId,
        actorUserId,
        payload: { payableSourceOfTruth: PAYABLE_SOURCE_OF_TRUTH },
      });
      if (!ev.success) throw new Error(ev.error || 'Failed to record created event');
    }

    // --- Snapshots + reset live metrics ---
    const { count: snapCount, error: snapCountError } = await client
      .from('creator_period_snapshots')
      .select('id', { count: 'exact', head: true })
      .eq('period_id', periodId);
    if (snapCountError) throw new Error(snapCountError.message);

    let snapshotsWritten = snapCount || 0;
    if ((snapCount || 0) === 0 && metricsList.length > 0) {
      const snapRows = metricsList.map((m: any) => {
        const hours = Number(m.active_online_hours || 0);
        const coins =
          Number(m.total_target_coins) ||
          Number(m.coins_earned_from_calls || 0) + Number(m.coins_earned_from_gifts || 0);
        const cached = hostBonusByUser.get(String(m.creator_id));
        const bonus =
          cached ||
          computeHostTargetBonus({
            hours,
            totalCoins: coins,
            thresholds: config.thresholds,
            fxRatio,
          });
        return {
          period_id: periodId,
          creator_id: m.creator_id,
          agency_leader_id: m.agency_leader_id || null,
          active_online_seconds: Number(m.active_online_seconds || 0),
          active_online_hours: hours,
          coins_earned_from_calls: Number(m.coins_earned_from_calls || 0),
          coins_earned_from_gifts: Number(m.coins_earned_from_gifts || 0),
          total_target_coins: Number(m.total_target_coins || coins),
          performance_tier: bonus.tier,
          bonus_earned_coins: bonus.bonusCoins,
          bonus_earned_usd: bonus.bonusUsd,
          current_streak_days: Number(m.current_streak_days || 0),
          response_health_score: Number(m.response_health_score ?? 100),
          metrics_snapshot: m,
        };
      });

      // Insert in chunks
      const chunkSize = 100;
      for (let i = 0; i < snapRows.length; i += chunkSize) {
        const chunk = snapRows.slice(i, i + chunkSize);
        const { error: snapError } = await client.from('creator_period_snapshots').insert(chunk);
        if (snapError) {
          // Unique race on resume
          if (String((snapError as any).code) !== '23505' && !/duplicate|unique/i.test(snapError.message)) {
            throw new Error(snapError.message);
          }
        } else {
          snapshotsWritten += chunk.length;
        }
      }
    }

    // Always advance next-period bounds; reset only creators still on the closed window
    // (resume-safe: if snapshots inserted but reset previously failed, retry still resets).
    if (metricsList.length > 0) {
      const nextBounds = await ensureOpenPeriod({
        at: new Date(new Date(periodEnd).getTime()),
        config,
        cycleType: claimed.cycle_type,
      });
      const nextStart = nextBounds.bounds.periodStart.toISOString().slice(0, 10);
      const nextEndExclusive = nextBounds.bounds.periodEnd;
      const nextEndDate = new Date(nextEndExclusive.getTime() - 1).toISOString().slice(0, 10);

      const resetPayload = {
        active_online_seconds: 0,
        active_online_hours: 0,
        coins_earned_from_calls: 0,
        coins_earned_from_gifts: 0,
        total_target_coins: 0,
        performance_tier: 'bronze',
        bonus_earned_coins: 0,
        bonus_earned_usd: 0,
        target_period_start: nextStart,
        target_period_end: nextEndDate,
        updated_at: new Date().toISOString(),
      };

      const creatorsNeedingReset = metricsList
        .filter((m: any) => {
          const start = m.target_period_start != null ? String(m.target_period_start).slice(0, 10) : '';
          // Already advanced to next open window → do not wipe in-progress next-period counters
          return start !== nextStart;
        })
        .map((m: any) => String(m.creator_id))
        .filter(Boolean);

      const chunkSize = 100;
      for (let i = 0; i < creatorsNeedingReset.length; i += chunkSize) {
        const chunk = creatorsNeedingReset.slice(i, i + chunkSize);
        const { error: resetError } = await client
          .from('creator_metrics')
          .update(resetPayload)
          .in('creator_id', chunk);
        if (resetError) throw new Error(resetError.message);
      }

      if (opts.creatorMetricsMap && creatorsNeedingReset.length) {
        for (const creatorId of creatorsNeedingReset) {
          const prev = opts.creatorMetricsMap.get(creatorId);
          if (!prev) continue;
          opts.creatorMetricsMap.set(creatorId, {
            ...prev,
            activeOnlineSeconds: 0,
            activeOnlineHours: 0,
            coinsEarnedFromCalls: 0,
            coinsEarnedFromGifts: 0,
            totalTargetCoins: 0,
            performanceTier: 'bronze',
            bonusEarnedCoins: 0,
            bonusEarnedUSD: 0,
            targetPeriodStart: nextStart,
            targetPeriodEnd: nextEndDate,
            updatedAt: new Date().toISOString(),
          });
        }
        opts.onMetricsReset?.();
      }
    }

    const { error: closeError } = await client
      .from('settlement_periods')
      .update({
        status: 'closed',
        closed_at: new Date().toISOString(),
        close_error: null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', periodId)
      .eq('status', 'closing');

    if (closeError) throw new Error(closeError.message);

    // Ensure next open period exists
    await ensureOpenPeriod({
      at: new Date(),
      config,
      cycleType: claimed.cycle_type,
    });

    return {
      success: true,
      periodId,
      status: 'closed',
      idempotent: batchesAlreadyExist || ledgerAlreadyExists,
      batchIds,
      ledgerEntriesWritten,
      snapshotsWritten,
      message: batchesAlreadyExist
        ? 'Resumed/finalized existing settlement artifacts'
        : 'Period closed and settlement batches created',
    };
  } catch (err: any) {
    const message = err?.message || String(err);
    console.error('[finance/closePeriod] failed:', periodId, message);
    await markPeriodFailed(periodId, message);
    return {
      success: false,
      periodId,
      status: 'failed',
      error: message,
    };
  }
}

/**
 * Job entry: ensure current open period, close all due periods, ensure next open.
 */
export async function closeDuePeriods(opts: {
  actorUserId?: string | null;
  at?: Date;
  includeFailedRetries?: boolean;
  creatorMetricsMap?: Map<string, any>;
  onMetricsReset?: () => void;
}): Promise<CloseDuePeriodsResult> {
  if (!isSupabaseAdminConfigured()) {
    return { success: false, results: [], error: 'Supabase admin not configured' };
  }

  const at = opts.at ?? new Date();
  const actorUserId = await resolveSystemActorUserId(opts.actorUserId);
  if (!actorUserId) {
    return {
      success: false,
      results: [],
      error: 'No actor user id for settlement_events (FINANCE_JOB_ACTOR_USER_ID or admin profile)',
    };
  }

  const ensured = await ensureOpenPeriod({ at });
  const due = await findDueOpenPeriods(at);
  const failed =
    opts.includeFailedRetries === false ? [] : await findRetryableFailedPeriods(at);

  // Dedupe by id
  const byId = new Map<string, any>();
  for (const p of [...due, ...failed]) byId.set(p.id, p);

  const results: ClosePeriodResult[] = [];
  for (const period of byId.values()) {
    const result = await closePeriod(period.id, {
      actorUserId,
      at,
      creatorMetricsMap: opts.creatorMetricsMap,
      onMetricsReset: opts.onMetricsReset,
    });
    results.push(result);
  }

  // After closes, ensure the *current* window has an open row
  const ensuredAfter = await ensureOpenPeriod({ at: new Date() });

  const anyHardFail = results.some((r) => r.status === 'failed');
  return {
    success: !anyHardFail,
    ensuredOpenPeriodId: ensuredAfter.period?.id || ensured.period?.id || null,
    results,
  };
}
