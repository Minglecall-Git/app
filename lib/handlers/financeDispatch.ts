/**
 * Native finance route dispatch (ported from server/routes/finance.routes.ts).
 */
import type { NextRequest } from 'next/server';
import {
  createServiceClient,
  jsonErr,
  jsonOk,
  requireAdmin,
  requireAuth,
  requireTeamLeader,
  TEAM_LEADER_ROLES,
  type AuthOk,
} from '../nextAuth';
import { requireFinanceJobAuth } from '../financeJobAuth';
import {
  FINANCE_CRON_CADENCES,
  normalizeFinanceCronCadence,
} from '../../shared/finance/cronCadence';
import {
  closeDuePeriods,
  ensureOpenPeriod,
  loadFinanceSystemConfig,
  updateFinanceSystemConfig,
  markBatchAdminPaid,
  markPeriodAdminPaid,
  reconcileBatch,
  agencyMarkHostPaid,
  acknowledgePayeeSalary,
  markBatchTlConfirmed,
  cancelSettlementBatch,
  normalizePayeeSalaryStatus,
  getNextCloseAt,
  getCurrentPeriodBounds,
  checkManualPayoutAllowed,
  PAYOUT_PERIOD_END_ONLY,
  appendReversalEntry,
  completeCoinPurchase,
  createCheckoutIntent,
  failCheckoutIntent,
  attachCheckoutExternalRef,
  getActivePaymentGateway,
  listPaymentGateways,
  updatePaymentGateway,
  activatePaymentGateway,
  resolveProvider,
  serializeGatewayForAdmin,
  getPaymentGateway,
  getCoinUsdPeg,
  coinsToUsd,
  aggregateWalletLedgerEarnings,
  listSalaryPeriods,
  loadSalaryPeriodDetail,
  buildSalaryEstimatePreview,
  buildSalaryPeriodXlsx,
  buildSalaryPeriodPdf,
  resolveEarningsScopeAccess,
  buildEarningsOverview,
  buildEarningsLedger,
} from '../../server/finance';
import { PAYABLE_MODEL_NOTES, PAYABLE_SOURCE_OF_TRUTH } from '../../server/finance/payableModel';
import { summarizeHostSettlementLines } from '../../shared/finance/hostEarningsBreakdown';

function qstr(req: NextRequest, key: string): string {
  const v = req.nextUrl.searchParams.get(key);
  return v ? String(v).trim() : '';
}

function authProfileId(auth: AuthOk): string {
  return String(auth.profileId || '').trim();
}

function authRole(auth: AuthOk): string {
  return String(auth.role || '').trim();
}

function sendError(status: number, message: string, code: string) {
  return jsonErr(status, message, code);
}

function sendOk(data: unknown, status = 200) {
  return jsonOk({ success: true, data: data as Record<string, unknown> }, status);
}

function requireDb() {
  return createServiceClient();
}

function appBaseUrl(req: NextRequest): string {
  const env =
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.APP_URL ||
    process.env.PUBLIC_APP_URL ||
    '';
  if (env.trim()) return env.trim().replace(/\/$/, '');
  try {
    return req.nextUrl.origin.replace(/\/$/, '');
  } catch {
    return 'http://localhost:3000';
  }
}

function requestHeadersRecord(req: NextRequest): Record<string, string> {
  const out: Record<string, string> = {};
  req.headers.forEach((value, key) => {
    out[key] = value;
  });
  return out;
}

function timingSafeEqualString(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let out = 0;
  for (let i = 0; i < a.length; i++) out |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return out === 0;
}

async function readFinanceCronCadence(): Promise<{
  value: ReturnType<typeof normalizeFinanceCronCadence>;
  lastRunAt: string | null;
}> {
  const fallback = { value: normalizeFinanceCronCadence('daily'), lastRunAt: null as string | null };
  const admin = createServiceClient();
  if (!admin) return fallback;
  try {
    const { data, error } = await admin
      .from('system_configs')
      .select('finance_cron_cadence, finance_cron_last_run_at')
      .limit(1)
      .maybeSingle();
    if (error || !data) return fallback;
    return {
      value: normalizeFinanceCronCadence((data as { finance_cron_cadence?: string }).finance_cron_cadence),
      lastRunAt: (data as { finance_cron_last_run_at?: string }).finance_cron_last_run_at || null,
    };
  } catch {
    return fallback;
  }
}

async function stampFinanceCronRun(): Promise<void> {
  const admin = createServiceClient();
  if (!admin) return;
  try {
    const { data } = await admin.from('system_configs').select('id').limit(1).maybeSingle();
    const id = (data as { id?: string } | null)?.id;
    if (!id) return;
    await admin
      .from('system_configs')
      .update({ finance_cron_last_run_at: new Date().toISOString() })
      .eq('id', id);
  } catch {
    /* non-fatal */
  }
}

function mapPeriod(row: any) {
  return {
    id: row.id,
    cycleType: row.cycle_type,
    periodStart: row.period_start,
    periodEnd: row.period_end,
    closeScheduledAt: row.close_scheduled_at,
    closedAt: row.closed_at ?? null,
    status: row.status,
    configSnapshot: row.config_snapshot || {},
    closeError: row.close_error ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapBatch(row: any) {
  return {
    id: row.id,
    periodId: row.period_id,
    batchKind: row.batch_kind,
    teamLeaderId: row.team_leader_id ?? null,
    payeeUserId: row.payee_user_id,
    status: row.status,
    reconcileStatus: row.reconcile_status === 'reconciled' ? 'reconciled' : 'unreconciled',
    reconciledAt: row.reconciled_at ?? null,
    reconciledBy: row.reconciled_by ?? null,
    reconciledByRole: row.reconciled_by_role ?? null,
    totalHostSalaryUsd: Number(row.total_host_salary_usd) || 0,
    totalTlCommissionUsd: Number(row.total_tl_commission_usd) || 0,
    totalDueUsd: Number(row.total_due_usd) || 0,
    totalHostSalaryCoins: Number(row.total_host_salary_coins) || 0,
    totalTlCommissionCoins: Number(row.total_tl_commission_coins) || 0,
    currency: row.currency || 'USD',
    paymentReference: row.payment_reference ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapLineItem(row: any) {
  return {
    id: row.id,
    batchId: row.batch_id,
    payeeUserId: row.payee_user_id,
    payeeRole: row.payee_role,
    amountCoins: Number(row.amount_coins) || 0,
    amountUsd: Number(row.amount_usd) || 0,
    component: row.component,
    breakdown: row.breakdown || {},
    hostSalaryStatus: row.host_salary_status,
    createdAt: row.created_at,
  };
}

function mapLedgerEntry(row: any) {
  return {
    id: row.id,
    createdAt: row.created_at,
    periodId: row.period_id ?? null,
    entryType: row.entry_type,
    userId: row.user_id ?? null,
    teamLeaderId: row.team_leader_id ?? null,
    counterpartyRole: row.counterparty_role ?? null,
    amountCoins: Number(row.amount_coins) || 0,
    amountUsd: Number(row.amount_usd) || 0,
    fxRatio: Number(row.fx_ratio) || 0,
    sourceRefType: row.source_ref_type ?? null,
    sourceRefId: row.source_ref_id ?? null,
    metadata: row.metadata || {},
  };
}

function mapLiveWalletLedgerRow(row: any, profile?: { id?: string; name?: string; email?: string } | null) {
  const metadata = row.metadata && typeof row.metadata === 'object' ? row.metadata : {};
  return {
    id: row.id,
    userId: row.user_id,
    userName: profile?.name ?? null,
    userEmail: profile?.email ?? null,
    callId: row.call_id ?? null,
    transactionType: row.transaction_type,
    amountCoins: Number(row.amount) || 0,
    balanceAfter: Number(row.balance_after) || 0,
    billingMinute: Number(row.billing_minute) || 0,
    metadata,
    createdAt: row.created_at,
  };
}

function mapEvent(row: any) {
  return {
    id: row.id,
    batchId: row.batch_id ?? null,
    periodId: row.period_id ?? null,
    eventType: row.event_type,
    actorUserId: row.actor_user_id,
    note: row.note ?? null,
    payload: row.payload || {},
    createdAt: row.created_at,
  };
}

function mapCoinPurchase(row: any, profile?: { id?: string; name?: string; email?: string } | null) {
  return {
    id: row.id,
    userId: row.user_id,
    userName: profile?.name ?? null,
    userEmail: profile?.email ?? null,
    channel: row.channel,
    status: row.status,
    amountCoins: Number(row.amount_coins) || 0,
    amountUsd: row.amount_usd != null ? Number(row.amount_usd) : null,
    coinUsdPegAtPurchase:
      row.coin_usd_peg_at_purchase != null ? Number(row.coin_usd_peg_at_purchase) : null,
    pegValueUsd: row.peg_value_usd != null ? Number(row.peg_value_usd) : null,
    loadMarginUsd: row.load_margin_usd != null ? Number(row.load_margin_usd) : null,
    packageId: row.package_id ?? null,
    paymentProvider: row.payment_provider ?? null,
    externalRef: row.external_ref ?? null,
    actorAdminId: row.actor_admin_id ?? null,
    reason: row.reason ?? null,
    walletLedgerId: row.wallet_ledger_id ?? null,
    createdAt: row.created_at,
    completedAt: row.completed_at ?? null,
  };
}



function transitionHttpStatus(code?: string) {
  if (code === 'NOT_FOUND') return 404;
  if (code === 'FORBIDDEN') return 403;
  if (code === 'INVALID_TRANSITION' || code === 'RECONCILE_REQUIRED') return 409;
  return 400;
}

export async function dispatchFinance(
  req: NextRequest,
  sub: string,
  method: string,
  body: Record<string, unknown>
): Promise<Response> {
  try {
    // -----------------------------------------------------------------------
    // GET /health
    // -----------------------------------------------------------------------
    if (sub === 'health' && method === 'GET') {
      return sendOk({
        module: 'finance',
        phase: 4,
        payableSourceOfTruth: PAYABLE_SOURCE_OF_TRUTH,
        payableModelNotes: PAYABLE_MODEL_NOTES,
      });
    }

    // -----------------------------------------------------------------------
    // GET /period-clock (authenticated)
    // -----------------------------------------------------------------------
    if (sub === 'period-clock' && method === 'GET') {
      const auth = await requireAuth(req);
      if (auth.ok === false) return jsonErr(auth.status, auth.error.message, auth.error.code);
      const client = requireDb(); if (!client) return sendError(503, "Finance backend unavailable", "NO_ADMIN");
      const config = await loadFinanceSystemConfig();
      const ensured = await ensureOpenPeriod({ at: new Date(), config });
      const nextCloseAt = await getNextCloseAt({ at: new Date(), config });
      const bounds = getCurrentPeriodBounds(config.creatorTargetCycle, new Date());
      return sendOk({
        cycleType: config.creatorTargetCycle,
        periodCloseUtcTime: config.periodCloseUtcTime,
        settlementEnabled: config.settlementEnabled,
        periodStart: bounds.periodStart.toISOString(),
        periodEnd: bounds.periodEnd.toISOString(),
        nextCloseAt: nextCloseAt.toISOString(),
        periodId: ensured.period?.id ?? null,
        periodStatus: ensured.period?.status ?? null,
      });
    }

    // -----------------------------------------------------------------------
    // ADMIN — periods
    // -----------------------------------------------------------------------
    if (sub === 'periods' && method === 'GET') {
      const auth = await requireAdmin(req);
      if (auth.ok === false) return jsonErr(auth.status, auth.error.message, auth.error.code);
      const client = requireDb(); if (!client) return sendError(503, "Finance backend unavailable", "NO_ADMIN");
      const status = qstr(req, 'status');
      const cycleType = qstr(req, 'cycleType');
      const limit = Math.min(Math.max(Number(qstr(req, 'limit')) || 50, 1), 200);
      const offset = Math.max(Number(qstr(req, 'offset')) || 0, 0);

      let q = client
        .from('settlement_periods')
        .select('*')
        .order('period_start', { ascending: false })
        .range(offset, offset + limit - 1);
      if (status) q = q.eq('status', status);
      if (cycleType) q = q.eq('cycle_type', cycleType);

      const { data, error } = await q;
      if (error) return sendError(500, error.message, 'PERIODS_LOAD_FAILED');
      return sendOk({
        periods: (data || []).map(mapPeriod),
        pagination: { limit, offset, count: (data || []).length },
      });
    }

    if (sub === 'periods/current' && method === 'GET') {
      const auth = await requireAdmin(req);
      if (auth.ok === false) return jsonErr(auth.status, auth.error.message, auth.error.code);
      const client = requireDb(); if (!client) return sendError(503, "Finance backend unavailable", "NO_ADMIN");
      const config = await loadFinanceSystemConfig();
      const ensured = await ensureOpenPeriod({ at: new Date(), config });
      const nextCloseAt = await getNextCloseAt({ at: new Date(), config });
      const bounds = getCurrentPeriodBounds(config.creatorTargetCycle, new Date());
      return sendOk({
        period: ensured.period,
        created: ensured.created,
        bounds: {
          cycleType: bounds.cycleType,
          periodStart: bounds.periodStart.toISOString(),
          periodEnd: bounds.periodEnd.toISOString(),
        },
        nextCloseAt: nextCloseAt.toISOString(),
        config: {
          creatorTargetCycle: config.creatorTargetCycle,
          periodCloseUtcTime: config.periodCloseUtcTime,
          settlementEnabled: config.settlementEnabled,
        },
      });
    }

    const periodIdMatch = sub.match(/^periods\/([^/]+)$/);
    if (periodIdMatch && method === 'GET') {
      const auth = await requireAdmin(req);
      if (auth.ok === false) return jsonErr(auth.status, auth.error.message, auth.error.code);
      const client = requireDb(); if (!client) return sendError(503, "Finance backend unavailable", "NO_ADMIN");
      const id = String(periodIdMatch[1] || '').trim();
      if (!id) return sendError(400, 'Period id required', 'INVALID_ID');
      const { data, error } = await client
        .from('settlement_periods')
        .select('*')
        .eq('id', id)
        .maybeSingle();
      if (error) return sendError(500, error.message, 'PERIOD_LOAD_FAILED');
      if (!data) return sendError(404, 'Period not found', 'NOT_FOUND');
      return sendOk({ period: mapPeriod(data) });
    }

    // -----------------------------------------------------------------------
    // PATCH /config (admin)
    // -----------------------------------------------------------------------
    if (sub === 'config' && method === 'PATCH') {
      const auth = await requireAdmin(req);
      if (auth.ok === false) return jsonErr(auth.status, auth.error.message, auth.error.code);
      const client = requireDb(); if (!client) return sendError(503, "Finance backend unavailable", "NO_ADMIN");
      const updated = await updateFinanceSystemConfig({
        creatorTargetCycle:
          (body.creatorTargetCycle ?? body.creator_target_cycle) as string | undefined,
        periodCloseUtcTime:
          (body.periodCloseUtcTime ?? body.period_close_utc_time) as string | undefined,
        settlementEnabled:
          (body.settlementEnabled ?? body.settlement_enabled) as boolean | undefined,
      });
      if (!updated.success || !updated.config) {
        return sendError(400, updated.error || 'Config update failed', 'CONFIG_UPDATE_FAILED');
      }

      await ensureOpenPeriod({ at: new Date(), config: updated.config });

      return sendOk({
        config: {
          creatorTargetCycle: updated.config.creatorTargetCycle,
          periodCloseUtcTime: updated.config.periodCloseUtcTime,
          settlementEnabled: updated.config.settlementEnabled,
          coinUsdPeg: updated.config.coinUsdPeg,
          femalePayoutRatioUsd: updated.config.femalePayoutRatioUsd,
          coinToUsdRatio: updated.config.coinToUsdRatio,
          thresholds: updated.config.thresholds,
        },
      });
    }

    // -----------------------------------------------------------------------
    // JOBS
    // -----------------------------------------------------------------------
    // GET = Vercel Cron; POST = admin UI / manual job
    if (sub === 'jobs/close-due-periods' && (method === 'POST' || method === 'GET')) {
      const jobAuth = await requireFinanceJobAuth(req, body);
      if (jobAuth.ok === false) {
        return jsonErr(jobAuth.status, jobAuth.error.message, jobAuth.error.code);
      }
      const actorFromAdmin = jobAuth.mode === "admin" && jobAuth.profileId ? jobAuth.profileId : null;
      const actorUserId =
        (typeof body.actorUserId === 'string' && body.actorUserId.trim()) ||
        actorFromAdmin ||
        process.env.FINANCE_JOB_ACTOR_USER_ID ||
        null;

      const cadence = await readFinanceCronCadence();
      const lastRunAt = cadence.lastRunAt;
      const rule = FINANCE_CRON_CADENCES[cadence.value];
      if (lastRunAt) {
        const elapsed = Date.now() - new Date(lastRunAt).getTime();
        if (Number.isFinite(elapsed) && elapsed >= 0 && elapsed < rule.minGapMs) {
          return sendOk({
            skipped: true,
            cadence: cadence.value,
            expression: rule.expression,
            lastRunAt,
            reason: 'Sooner than the Control Center schedule',
          });
        }
      }
      await ensureOpenPeriod({ at: new Date() });
      await loadFinanceSystemConfig({ force: true });

      const result = await closeDuePeriods({
        actorUserId,
        includeFailedRetries: body.includeFailedRetries !== false,
        creatorMetricsMap: new Map(),
        onMetricsReset: () => {},
      });

      // Best-effort: flush Redis creator online-seconds into Postgres (same daily cron window)
      try {
        const { isRedisConfigured } = await import('../redis');
        const db = requireDb();
        if (isRedisConfigured() && db) {
          const { flushDirtyCreatorOnlineSeconds } = await import('../creatorOnlineAccrual');
          await flushDirtyCreatorOnlineSeconds(db, 500);
        }
      } catch (flushErr: any) {
        console.warn('[finance/jobs/close-due-periods] creator online flush:', flushErr?.message || flushErr);
      }

      if (result.success) {
        await stampFinanceCronRun();
      }
      const httpStatus = result.success ? 200 : 500;
      return Response.json(
        {
          success: result.success,
          data: {
            ensuredOpenPeriodId: result.ensuredOpenPeriodId,
            results: result.results,
            payableSourceOfTruth: PAYABLE_SOURCE_OF_TRUTH,
            payableModelNotes: PAYABLE_MODEL_NOTES,
            authMode: jobAuth.mode,
          },
          error: result.error
            ? { message: result.error, code: 'CLOSE_DUE_PERIODS_FAILED' }
            : undefined,
        },
        { status: httpStatus, headers: { 'Cache-Control': 'no-store' } }
      );
    }

    if (sub === 'jobs/ensure-open-period' && method === 'POST') {
      const jobAuth = await requireFinanceJobAuth(req, body);
      if (jobAuth.ok === false) {
        return jsonErr(jobAuth.status, jobAuth.error.message, jobAuth.error.code);
      }
      const ensured = await ensureOpenPeriod({ at: new Date() });
      return Response.json(
        {
          success: ensured.success,
          data: {
            period: ensured.period,
            bounds: {
              cycleType: ensured.bounds.cycleType,
              periodStart: ensured.bounds.periodStart.toISOString(),
              periodEnd: ensured.bounds.periodEnd.toISOString(),
            },
            created: ensured.created,
          },
          error: ensured.error
            ? { message: ensured.error, code: 'ENSURE_OPEN_PERIOD_FAILED' }
            : undefined,
        },
        {
          status: ensured.success ? 200 : 500,
          headers: { 'Cache-Control': 'no-store' },
        }
      );
    }

    // -----------------------------------------------------------------------
    // ADMIN — ledger
    // -----------------------------------------------------------------------
    if (sub === 'ledger' && method === 'GET') {
      const auth = await requireAdmin(req);
      if (auth.ok === false) return jsonErr(auth.status, auth.error.message, auth.error.code);
      const client = requireDb(); if (!client) return sendError(503, "Finance backend unavailable", "NO_ADMIN");
      const periodId = qstr(req, 'periodId');
      const userId = qstr(req, 'userId');
      const entryType = qstr(req, 'entryType');
      const teamLeaderId = qstr(req, 'teamLeaderId');
      const limit = Math.min(Math.max(Number(qstr(req, 'limit')) || 100, 1), 500);
      const offset = Math.max(Number(qstr(req, 'offset')) || 0, 0);

      let q = client
        .from('financial_ledger')
        .select('*')
        .order('created_at', { ascending: false })
        .range(offset, offset + limit - 1);
      if (periodId) q = q.eq('period_id', periodId);
      if (userId) q = q.eq('user_id', userId);
      if (entryType) q = q.eq('entry_type', entryType);
      if (teamLeaderId) q = q.eq('team_leader_id', teamLeaderId);

      const { data, error } = await q;
      if (error) return sendError(500, error.message, 'LEDGER_LOAD_FAILED');
      return sendOk({
        entries: (data || []).map(mapLedgerEntry),
        pagination: { limit, offset, count: (data || []).length },
      });
    }

    if (sub === 'ledger/live' && method === 'GET') {
      const auth = await requireAdmin(req);
      if (auth.ok === false) return jsonErr(auth.status, auth.error.message, auth.error.code);
      const client = requireDb(); if (!client) return sendError(503, "Finance backend unavailable", "NO_ADMIN");

      const transactionType = qstr(req, 'transactionType');
      const userId = qstr(req, 'userId');
      const callId = qstr(req, 'callId');
      const from = qstr(req, 'from');
      const to = qstr(req, 'to');
      const limit = Math.min(Math.max(Number(qstr(req, 'limit')) || 300, 1), 1000);
      const offset = Math.max(Number(qstr(req, 'offset')) || 0, 0);

      let q = client
        .from('wallet_ledger')
        .select('*')
        .order('created_at', { ascending: false })
        .range(offset, offset + limit - 1);

      if (transactionType) q = q.eq('transaction_type', transactionType);
      if (userId) q = q.eq('user_id', userId);
      if (callId) q = q.eq('call_id', callId);
      if (from) q = q.gte('created_at', from);
      if (to) q = q.lte('created_at', to);

      const { data, error } = await q;
      if (error) return sendError(500, error.message, 'LIVE_LEDGER_LOAD_FAILED');

      const rows = data || [];
      const userIds = Array.from(new Set(rows.map((r) => String(r.user_id || '')).filter(Boolean)));
      const { data: profiles } = userIds.length
        ? await client.from('profiles').select('id, name, email').in('id', userIds)
        : { data: [] };
      const profileById = new Map(
        (profiles || []).map((p) => [String(p.id), { id: p.id, name: p.name, email: p.email }])
      );

      // Ops detail view: raw per-minute / per-event rows (not call-composite).
      const entries = rows.map((row) =>
        mapLiveWalletLedgerRow(row, profileById.get(String(row.user_id)) || null)
      );

      let callDebitCoins = 0;
      let giftDebitCoins = 0;
      let hostEarnCoins = 0;
      let targetShareTrueUpCoins = 0;
      let tlEarnCoins = 0;
      let purchaseCoins = 0;
      let rewardCoins = 0;
      for (const row of entries) {
        const t = String(row.transactionType || '');
        const amount = Number(row.amountCoins) || 0;
        if (t === 'CALL_DEBIT') callDebitCoins += Math.abs(amount);
        else if (t === 'GIFT_DEBIT') giftDebitCoins += Math.abs(amount);
        else if (t === 'HOST_EARN') hostEarnCoins += Math.max(0, amount);
        else if (t === 'TARGET_SHARE_TRUEUP') targetShareTrueUpCoins += Math.max(0, amount);
        else if (t === 'TL_EARN') tlEarnCoins += Math.max(0, amount);
        else if (t === 'PURCHASE') purchaseCoins += Math.max(0, amount);
        else if (t.startsWith('REWARD_')) rewardCoins += Math.max(0, amount);
      }

      const cfg = await loadFinanceSystemConfig();
      const peg = Number(cfg.coinUsdPeg) || getCoinUsdPeg(cfg);
      const burnDebitCoins = callDebitCoins + giftDebitCoins;
      const platformRetainedCoins =
        burnDebitCoins - hostEarnCoins - targetShareTrueUpCoins - tlEarnCoins;
      const aggregates = {
        callDebitCoins,
        giftDebitCoins,
        hostEarnCoins,
        targetShareTrueUpCoins,
        tlEarnCoins,
        platformRetainedCoins,
        purchaseCoins,
        rewardCoins,
        callDebitUsd: coinsToUsd(callDebitCoins, peg),
        giftDebitUsd: coinsToUsd(giftDebitCoins, peg),
        hostPayableUsd: coinsToUsd(hostEarnCoins, peg),
        tlPayableUsd: coinsToUsd(tlEarnCoins, peg),
        platformRetainedUsd: coinsToUsd(platformRetainedCoins, peg),
        coinUsdPeg: peg,
      };

      return sendOk({
        entries,
        aggregates,
        pagination: { limit, offset, count: entries.length },
      });
    }

    if (sub === 'ledger/reversal' && method === 'POST') {
      const auth = await requireAdmin(req);
      if (auth.ok === false) return jsonErr(auth.status, auth.error.message, auth.error.code);
      const client = requireDb(); if (!client) return sendError(503, "Finance backend unavailable", "NO_ADMIN");

      const amountCoins = Number(body.amountCoins ?? body.amount_coins);
      const fxRatio = Number(body.fxRatio ?? body.fx_ratio);
      if (!Number.isFinite(amountCoins) || amountCoins === 0) {
        return sendError(400, 'amountCoins required (typically negative)', 'INVALID_AMOUNT');
      }
      if (!Number.isFinite(fxRatio) || fxRatio <= 0) {
        return sendError(400, 'fxRatio required', 'INVALID_FX');
      }

      const result = await appendReversalEntry({
        periodId:
          typeof body.periodId === 'string'
            ? body.periodId
            : typeof body.period_id === 'string'
              ? body.period_id
              : null,
        userId:
          typeof body.userId === 'string'
            ? body.userId
            : typeof body.user_id === 'string'
              ? body.user_id
              : null,
        teamLeaderId:
          typeof body.teamLeaderId === 'string'
            ? body.teamLeaderId
            : typeof body.team_leader_id === 'string'
              ? body.team_leader_id
              : null,
        counterpartyRole:
          body.counterpartyRole === 'platform' ||
          body.counterpartyRole === 'host' ||
          body.counterpartyRole === 'team_leader'
            ? body.counterpartyRole
            : null,
        amountCoins,
        amountUsd:
          body.amountUsd !== undefined
            ? Number(body.amountUsd)
            : body.amount_usd !== undefined
              ? Number(body.amount_usd)
              : undefined,
        fxRatio,
        reversesEntryId:
          typeof body.reversesEntryId === 'string'
            ? body.reversesEntryId
            : typeof body.reverses_entry_id === 'string'
              ? body.reverses_entry_id
              : null,
        reason: typeof body.reason === 'string' ? body.reason : undefined,
        metadata:
          body.metadata && typeof body.metadata === 'object' && !Array.isArray(body.metadata)
            ? (body.metadata as Record<string, unknown>)
            : undefined,
      });

      if (!result.success) {
        return sendError(500, result.error || 'Reversal failed', 'REVERSAL_FAILED');
      }
      return sendOk({ entry: result.entry }, 201);
    }

    // -----------------------------------------------------------------------
    // ADMIN — batches
    // -----------------------------------------------------------------------
    if (sub === 'batches' && method === 'GET') {
      const auth = await requireAdmin(req);
      if (auth.ok === false) return jsonErr(auth.status, auth.error.message, auth.error.code);
      const client = requireDb(); if (!client) return sendError(503, "Finance backend unavailable", "NO_ADMIN");
      const periodId = qstr(req, 'periodId');
      const status = qstr(req, 'status');
      const batchKind = qstr(req, 'batchKind');
      const limit = Math.min(Math.max(Number(qstr(req, 'limit')) || 100, 1), 500);
      const offset = Math.max(Number(qstr(req, 'offset')) || 0, 0);

      let q = client
        .from('settlement_batches')
        .select('*')
        .order('created_at', { ascending: false })
        .range(offset, offset + limit - 1);
      if (periodId) q = q.eq('period_id', periodId);
      if (status) q = q.eq('status', status);
      if (batchKind) q = q.eq('batch_kind', batchKind);

      const { data, error } = await q;
      if (error) return sendError(500, error.message, 'BATCHES_LOAD_FAILED');
      return sendOk({
        batches: (data || []).map(mapBatch),
        pagination: { limit, offset, count: (data || []).length },
      });
    }

    const batchReconcileMatch = sub.match(/^batches\/([^/]+)\/reconcile$/);
    if (batchReconcileMatch && method === 'POST') {
      const auth = await requireAdmin(req);
      if (auth.ok === false) return jsonErr(auth.status, auth.error.message, auth.error.code);
      const client = requireDb(); if (!client) return sendError(503, "Finance backend unavailable", "NO_ADMIN");
      const id = String(batchReconcileMatch[1] || '').trim();
      const actorUserId = authProfileId(auth as AuthOk);
      if (!id) return sendError(400, 'Batch id required', 'INVALID_ID');
      if (!actorUserId) return sendError(401, 'Unauthorized', 'UNAUTHORIZED');

      const result = await reconcileBatch({
        batchId: id,
        actorUserId,
        actorRole: 'admin',
        note: typeof body.note === 'string' ? body.note : undefined,
      });
      if (!result.success) {
        return sendError(transitionHttpStatus(result.code),
          result.error || 'Reconcile failed',
          result.code || 'RECONCILE_FAILED'
        );
      }
      const { data: batch } = await client
        .from('settlement_batches')
        .select('*')
        .eq('id', id)
        .maybeSingle();
      return sendOk({
        batch: batch ? mapBatch(batch) : null,
        alreadyReconciled: Boolean(result.alreadyReconciled),
      });
    }

    const batchAdminPaidMatch = sub.match(/^batches\/([^/]+)\/admin-mark-paid$/);
    if (batchAdminPaidMatch && method === 'POST') {
      const auth = await requireAdmin(req);
      if (auth.ok === false) return jsonErr(auth.status, auth.error.message, auth.error.code);
      const client = requireDb(); if (!client) return sendError(503, "Finance backend unavailable", "NO_ADMIN");
      const id = String(batchAdminPaidMatch[1] || '').trim();
      const actorUserId = authProfileId(auth as AuthOk);
      if (!id) return sendError(400, 'Batch id required', 'INVALID_ID');
      if (!actorUserId) return sendError(401, 'Unauthorized', 'UNAUTHORIZED');

      const result = await markBatchAdminPaid({
        batchId: id,
        actorUserId,
        note: typeof body.note === 'string' ? body.note : undefined,
        paymentReference:
          typeof body.paymentReference === 'string'
            ? body.paymentReference
            : typeof body.payment_reference === 'string'
              ? body.payment_reference
              : undefined,
        markHostsPaidNow: false,
      });

      if (!result.success) {
        return sendError(transitionHttpStatus(result.code),
          result.error || 'Mark paid failed',
          result.code || 'MARK_PAID_FAILED'
        );
      }

      const { data: batch } = await client
        .from('settlement_batches')
        .select('*')
        .eq('id', id)
        .maybeSingle();

      return sendOk({ batch: batch ? mapBatch(batch) : null });
    }

    const batchCancelMatch = sub.match(/^batches\/([^/]+)\/cancel$/);
    if (batchCancelMatch && method === 'POST') {
      const auth = await requireAdmin(req);
      if (auth.ok === false) return jsonErr(auth.status, auth.error.message, auth.error.code);
      const client = requireDb(); if (!client) return sendError(503, "Finance backend unavailable", "NO_ADMIN");
      const id = String(batchCancelMatch[1] || '').trim();
      const actorUserId = authProfileId(auth as AuthOk);
      if (!id) return sendError(400, 'Batch id required', 'INVALID_ID');
      if (!actorUserId) return sendError(401, 'Unauthorized', 'UNAUTHORIZED');

      const result = await cancelSettlementBatch({
        batchId: id,
        actorUserId,
        note: typeof body.note === 'string' ? body.note : undefined,
      });
      if (!result.success) {
        const status =
          result.code === 'NOT_FOUND' ? 404 : result.code === 'INVALID_TRANSITION' ? 409 : 400;
        return sendError(status, result.error || 'Cancel failed', result.code || 'CANCEL_FAILED');
      }

      const { data: batch } = await client
        .from('settlement_batches')
        .select('*')
        .eq('id', id)
        .maybeSingle();
      return sendOk({ batch: batch ? mapBatch(batch) : null });
    }

    const batchGetMatch = sub.match(/^batches\/([^/]+)$/);
    if (batchGetMatch && method === 'GET') {
      const auth = await requireAdmin(req);
      if (auth.ok === false) return jsonErr(auth.status, auth.error.message, auth.error.code);
      const client = requireDb(); if (!client) return sendError(503, "Finance backend unavailable", "NO_ADMIN");
      const id = String(batchGetMatch[1] || '').trim();
      if (!id) return sendError(400, 'Batch id required', 'INVALID_ID');

      const { data: batch, error } = await client
        .from('settlement_batches')
        .select('*')
        .eq('id', id)
        .maybeSingle();
      if (error) return sendError(500, error.message, 'BATCH_LOAD_FAILED');
      if (!batch) return sendError(404, 'Batch not found', 'NOT_FOUND');

      const [{ data: lines }, { data: events }, { data: period }] = await Promise.all([
        client.from('settlement_line_items').select('*').eq('batch_id', id).order('created_at'),
        client
          .from('settlement_events')
          .select('*')
          .eq('batch_id', id)
          .order('created_at', { ascending: false }),
        client.from('settlement_periods').select('*').eq('id', batch.period_id).maybeSingle(),
      ]);

      return sendOk({
        batch: mapBatch(batch),
        lineItems: (lines || []).map(mapLineItem),
        events: (events || []).map(mapEvent),
        period: period ? mapPeriod(period) : null,
      });
    }

    // -----------------------------------------------------------------------
    // PAYMENT GATEWAYS (admin)
    // -----------------------------------------------------------------------
    if (sub === 'admin/payment-gateways' && method === 'GET') {
      const auth = await requireAdmin(req);
      if (auth.ok === false) return jsonErr(auth.status, auth.error.message, auth.error.code);
      const client = requireDb(); if (!client) return sendError(503, "Finance backend unavailable", "NO_ADMIN");

      const listed = await listPaymentGateways(client);
      if (!listed.success || !listed.gateways) {
        return sendError(500, listed.error || 'Failed to load gateways', 'GATEWAY_LIST_FAILED');
      }

      const active = listed.gateways.find((g) => g.is_active) || null;
      return sendOk({
        gateways: listed.gateways.map(serializeGatewayForAdmin),
        activeGatewayId: active?.id || null,
        activeGatewayName: active?.display_name || null,
        webhookUrls: {
          paypal: `${appBaseUrl(req)}/api/v1/finance/funding/webhook/paypal`,
        },
        note: 'Coin store uses the Active gateway. Manual coin credit remains available.',
      });
    }

    if (sub.match(/^admin\/payment-gateways\/[^/]+$/) && method === 'PATCH') {
      const auth = await requireAdmin(req);
      if (auth.ok === false) return jsonErr(auth.status, auth.error.message, auth.error.code);
      const client = requireDb(); if (!client) return sendError(503, "Finance backend unavailable", "NO_ADMIN");
      const actorAdminId = authProfileId(auth as AuthOk);

      const gatewayId = decodeURIComponent(sub.split('/')[2] || '').trim();
      if (!gatewayId) return sendError(400, 'gateway id required', 'INVALID_ID');

      const modeRaw = typeof body.mode === 'string' ? body.mode.trim().toLowerCase() : '';
      const mode = modeRaw === 'live' || modeRaw === 'sandbox' ? (modeRaw as 'live' | 'sandbox') : undefined;
      const enabled = typeof body.enabled === 'boolean' ? body.enabled : undefined;

      const publicConfig: Record<string, unknown> = {};
      if (typeof body.clientId === 'string') publicConfig.client_id = body.clientId;
      else if (typeof body.client_id === 'string') publicConfig.client_id = body.client_id;
      if (typeof body.webhookId === 'string') publicConfig.webhook_id = body.webhookId;
      else if (typeof body.webhook_id === 'string') publicConfig.webhook_id = body.webhook_id;
      if (body.publicConfig && typeof body.publicConfig === 'object') {
        Object.assign(publicConfig, body.publicConfig as Record<string, unknown>);
      }

      const secrets: Record<string, string | null | undefined> = {};
      if (typeof body.clientSecret === 'string') secrets.client_secret = body.clientSecret;
      else if (typeof body.client_secret === 'string') secrets.client_secret = body.client_secret;
      if (typeof body.clientId === 'string') secrets.client_id = body.clientId;
      else if (typeof body.client_id === 'string') secrets.client_id = body.client_id;
      if (typeof body.webhookId === 'string') secrets.webhook_id = body.webhookId;
      else if (typeof body.webhook_id === 'string') secrets.webhook_id = body.webhook_id;
      if (body.secrets && typeof body.secrets === 'object') {
        Object.assign(secrets, body.secrets as Record<string, string>);
      }

      const updated = await updatePaymentGateway(client, gatewayId, {
        enabled,
        mode,
        public_config: Object.keys(publicConfig).length ? publicConfig : undefined,
        secrets: Object.keys(secrets).length ? secrets : undefined,
        updated_by: actorAdminId || null,
      });

      if (!updated.success || !updated.gateway) {
        const st =
          updated.code === 'NOT_FOUND' ? 404 : updated.code === 'COMING_SOON' ? 400 : 500;
        return sendError(st, updated.error || 'Update failed', updated.code || 'GATEWAY_UPDATE_FAILED');
      }

      return sendOk({ gateway: serializeGatewayForAdmin(updated.gateway) });
    }

    if (sub.match(/^admin\/payment-gateways\/[^/]+\/activate$/) && method === 'POST') {
      const auth = await requireAdmin(req);
      if (auth.ok === false) return jsonErr(auth.status, auth.error.message, auth.error.code);
      const client = requireDb(); if (!client) return sendError(503, "Finance backend unavailable", "NO_ADMIN");
      const actorAdminId = authProfileId(auth as AuthOk);

      const gatewayId = decodeURIComponent(sub.split('/')[2] || '').trim();
      if (!gatewayId) return sendError(400, 'gateway id required', 'INVALID_ID');

      const activated = await activatePaymentGateway(client, gatewayId, actorAdminId || null);
      if (!activated.success || !activated.gateway) {
        const st =
          activated.code === 'NOT_FOUND'
            ? 404
            : activated.code === 'COMING_SOON' ||
                activated.code === 'NOT_ENABLED' ||
                activated.code === 'NOT_CONFIGURED'
              ? 400
              : 500;
        return sendError(st, activated.error || 'Activate failed', activated.code || 'GATEWAY_ACTIVATE_FAILED');
      }

      return sendOk({
        gateway: serializeGatewayForAdmin(activated.gateway),
        activeGatewayId: activated.gateway.id,
      });
    }

    // -----------------------------------------------------------------------
    // FUNDING
    // -----------------------------------------------------------------------
    if (sub === 'funding/admin-credit' && method === 'POST') {
      const auth = await requireAdmin(req);
      if (auth.ok === false) return jsonErr(auth.status, auth.error.message, auth.error.code);
      const client = requireDb(); if (!client) return sendError(503, "Finance backend unavailable", "NO_ADMIN");
      const actorAdminId = authProfileId(auth as AuthOk);
      if (!actorAdminId) return sendError(401, 'Unauthorized', 'UNAUTHORIZED');

      const userId =
        typeof body.userId === 'string'
          ? body.userId.trim()
          : typeof body.user_id === 'string'
            ? body.user_id.trim()
            : '';
      const amountCoins = Number(body.amountCoins ?? body.amount_coins);
      const reason =
        typeof body.reason === 'string' && body.reason.trim()
          ? body.reason.trim().slice(0, 500)
          : 'Manual Admin Credit';
      const amountUsd =
        body.amountUsd !== undefined
          ? Number(body.amountUsd)
          : body.amount_usd !== undefined
            ? Number(body.amount_usd)
            : undefined;

      if (!userId) return sendError(400, 'userId required', 'INVALID_USER');
      if (!Number.isFinite(amountCoins) || amountCoins <= 0) {
        return sendError(400, 'amountCoins must be a positive number', 'INVALID_AMOUNT');
      }

      const result = await completeCoinPurchase({
        userId,
        amountCoins,
        channel: 'ADMIN_MANUAL',
        amountUsd: Number.isFinite(amountUsd) ? amountUsd : undefined,
        actorAdminId,
        reason,
      });

      if (!result.success) {
        const status =
          result.code === 'NOT_FOUND'
            ? 404
            : result.code === 'INVALID_AMOUNT' || result.code === 'INVALID_USER'
              ? 400
              : 500;
        return sendError(status,
          result.error || 'Admin credit failed',
          result.code || 'ADMIN_CREDIT_FAILED'
        );
      }

      const { data: profile } = await client
        .from('profiles')
        .select('id, auth_id, email, coin_balance, earnings_coins, name')
        .eq('id', userId)
        .maybeSingle();

      const { data: purchaseRow } = await client
        .from('coin_purchases')
        .select('*')
        .eq('id', result.purchaseId)
        .maybeSingle();

      return sendOk({
          purchase: purchaseRow ? mapCoinPurchase(purchaseRow, profile) : null,
          walletLedgerId: result.walletLedgerId,
          coinBalance: result.coinBalance,
          duplicate: result.duplicate === true,
        },
        201
      );
    }

    if (sub === 'funding' && method === 'GET') {
      const auth = await requireAdmin(req);
      if (auth.ok === false) return jsonErr(auth.status, auth.error.message, auth.error.code);
      const client = requireDb(); if (!client) return sendError(503, "Finance backend unavailable", "NO_ADMIN");
      const channel = qstr(req, 'channel');
      const userId = qstr(req, 'userId');
      const from = qstr(req, 'from');
      const to = qstr(req, 'to');
      const limit = Math.min(Math.max(Number(qstr(req, 'limit')) || 100, 1), 500);
      const offset = Math.max(Number(qstr(req, 'offset')) || 0, 0);

      let q = client
        .from('coin_purchases')
        .select('*')
        .order('created_at', { ascending: false })
        .range(offset, offset + limit - 1);
      if (channel === 'ADMIN_MANUAL' || channel === 'GATEWAY') q = q.eq('channel', channel);
      if (userId) q = q.eq('user_id', userId);
      if (from) q = q.gte('created_at', from);
      if (to) q = q.lte('created_at', to);

      const { data, error } = await q;
      if (error) return sendError(500, error.message, 'FUNDING_LOAD_FAILED');

      const userIds = Array.from(new Set((data || []).map((r) => String(r.user_id))));
      const { data: profiles } = userIds.length
        ? await client.from('profiles').select('id, name, email').in('id', userIds)
        : { data: [] };
      const profileById = new Map(
        (profiles || []).map((p) => [String(p.id), { id: p.id, name: p.name, email: p.email }])
      );

      return sendOk({
        purchases: (data || []).map((row) =>
          mapCoinPurchase(row, profileById.get(String(row.user_id)) || null)
        ),
        pagination: { limit, offset, count: (data || []).length },
      });
    }

    if (sub === 'funding/mine' && method === 'GET') {
      const auth = await requireAuth(req);
      if (auth.ok === false) return jsonErr(auth.status, auth.error.message, auth.error.code);
      const client = requireDb(); if (!client) return sendError(503, "Finance backend unavailable", "NO_ADMIN");
      const userId = authProfileId(auth as AuthOk);
      if (!userId) return sendError(401, 'Unauthorized', 'UNAUTHORIZED');

      const limit = Math.min(Math.max(Number(qstr(req, 'limit')) || 50, 1), 200);
      const offset = Math.max(Number(qstr(req, 'offset')) || 0, 0);

      const { data, error } = await client
        .from('coin_purchases')
        .select('*')
        .eq('user_id', userId)
        .eq('status', 'completed')
        .order('created_at', { ascending: false })
        .range(offset, offset + limit - 1);
      if (error) return sendError(500, error.message, 'FUNDING_MINE_FAILED');

      return sendOk({
        purchases: (data || []).map((row) => mapCoinPurchase(row)),
        pagination: { limit, offset, count: (data || []).length },
      });
    }

    if (sub === 'funding/checkout-config' && method === 'GET') {
      const auth = await requireAuth(req);
      if (auth.ok === false) return jsonErr(auth.status, auth.error.message, auth.error.code);
      const client = requireDb(); if (!client) return sendError(503, "Finance backend unavailable", "NO_ADMIN");

      const activeRes = await getActivePaymentGateway(client);
      if (!activeRes.success) {
        return sendError(500, activeRes.error || 'Gateway lookup failed', 'GATEWAY_LOOKUP_FAILED');
      }
      const active = activeRes.gateway;
      if (!active) {
        return sendError(
          503,
          'Payments temporarily unavailable — no active payment gateway',
          'NO_ACTIVE_GATEWAY'
        );
      }

      const clientId = String(
        active.public_config?.client_id ||
          active.secrets_encrypted?.client_id ||
          (active.id === 'paypal' ? process.env.PAYPAL_CLIENT_ID : '') ||
          ''
      ).trim();
      if (!clientId) {
        return sendError(503, 'Payment gateway is not configured', 'NOT_CONFIGURED');
      }

      return sendOk({
        provider: active.id,
        providerDisplayName: active.display_name,
        clientId,
        mode: active.mode === 'live' ? 'live' : 'sandbox',
        currency: 'USD',
        inAppCheckout: active.id === 'paypal',
      });
    }

    if (sub === 'funding/checkout-intent' && method === 'POST') {
      const auth = await requireAuth(req);
      if (auth.ok === false) return jsonErr(auth.status, auth.error.message, auth.error.code);
      const client = requireDb(); if (!client) return sendError(503, "Finance backend unavailable", "NO_ADMIN");
      const userId = authProfileId(auth as AuthOk);
      if (!userId) return sendError(401, 'Unauthorized', 'UNAUTHORIZED');

      const packageId =
        typeof body.packageId === 'string'
          ? body.packageId.trim()
          : typeof body.package_id === 'string'
            ? body.package_id.trim()
            : '';

      if (!packageId) return sendError(400, 'packageId required', 'INVALID_PACKAGE');

      const checkoutModeRaw = String(body.checkoutMode || body.checkout_mode || 'sdk').toLowerCase();
      const checkoutMode = checkoutModeRaw === 'redirect' ? 'redirect' : 'sdk';

      const activeRes = await getActivePaymentGateway(client);
      if (!activeRes.success) {
        return sendError(500, activeRes.error || 'Gateway lookup failed', 'GATEWAY_LOOKUP_FAILED');
      }
      const active = activeRes.gateway;
      if (!active) {
        return sendError(
          503,
          'Payments temporarily unavailable — no active payment gateway',
          'NO_ACTIVE_GATEWAY'
        );
      }

      const providerImpl = resolveProvider(active);
      if (!providerImpl) {
        return sendError(503, 'Active gateway is not supported yet', 'GATEWAY_UNSUPPORTED');
      }

      const result = await createCheckoutIntent({ userId, packageId, provider: active.id });
      if (!result.success || !result.purchase) {
        const status =
          result.code === 'PACKAGE_NOT_FOUND' || result.code === 'NOT_FOUND'
            ? 404
            : result.code === 'INVALID_PACKAGE' || result.code === 'INVALID_USER' || result.code === 'NO_ACTIVE_GATEWAY'
              ? 400
              : 500;
        return sendError(status,
          result.error || 'Checkout intent failed',
          result.code || 'CHECKOUT_INTENT_FAILED'
        );
      }

      const amountUsd = Number(result.purchase.amountUsd);
      if (!Number.isFinite(amountUsd) || amountUsd <= 0) {
        await failCheckoutIntent({
          purchaseId: result.purchase.id,
          reason: 'Package has no payable USD amount',
          provider: active.id,
        });
        return sendError(400, 'Package has no payable USD amount', 'INVALID_AMOUNT');
      }

      const base = appBaseUrl(req);
      const returnUrl = `${base}/store/paypal/return?purchaseId=${encodeURIComponent(result.purchase.id)}`;
      const cancelUrl = `${base}/store/paypal/cancel?purchaseId=${encodeURIComponent(result.purchase.id)}`;

      const checkout = await providerImpl.createCheckout({
        purchaseId: result.purchase.id,
        amountUsd,
        currency: 'USD',
        description: result.package?.title || `Coins · ${packageId}`,
        returnUrl,
        cancelUrl,
        customId: result.purchase.id,
        checkoutMode,
      });

      if (!checkout.success || !checkout.externalRef) {
        await failCheckoutIntent({
          purchaseId: result.purchase.id,
          reason: checkout.error || 'Gateway checkout create failed',
          provider: active.id,
        });
        return sendError(
          502,
          checkout.error || 'Could not create payment session',
          checkout.code || 'CHECKOUT_CREATE_FAILED'
        );
      }

      const attached = await attachCheckoutExternalRef({
        purchaseId: result.purchase.id,
        externalRef: checkout.externalRef,
        provider: active.id,
      });
      if (!attached.success) {
        return sendError(500, attached.error || 'Failed to store payment reference', attached.code || 'ATTACH_REF_FAILED');
      }

      return sendOk({
          purchase: {
            ...result.purchase,
            paymentProvider: active.id,
            externalRef: checkout.externalRef,
          },
          package: result.package,
          checkoutToken: result.checkoutToken,
          approvalUrl: checkout.approvalUrl || null,
          orderId: checkout.externalRef,
          checkoutMode,
          provider: active.id,
          providerDisplayName: active.display_name,
        },
        201
      );
    }

    if (sub === 'funding/paypal/cancel' && method === 'POST') {
      const auth = await requireAuth(req);
      if (auth.ok === false) return jsonErr(auth.status, auth.error.message, auth.error.code);
      const client = requireDb(); if (!client) return sendError(503, "Finance backend unavailable", "NO_ADMIN");
      const userId = authProfileId(auth as AuthOk);
      if (!userId) return sendError(401, 'Unauthorized', 'UNAUTHORIZED');

      const purchaseId =
        typeof body.purchaseId === 'string'
          ? body.purchaseId.trim()
          : typeof body.purchase_id === 'string'
            ? body.purchase_id.trim()
            : '';
      if (!purchaseId) return sendError(400, 'purchaseId required', 'INVALID_ID');

      const { data: pending } = await client
        .from('coin_purchases')
        .select('id, user_id, status, payment_provider, external_ref')
        .eq('id', purchaseId)
        .maybeSingle();
      if (!pending) return sendError(404, 'Purchase not found', 'NOT_FOUND');
      if (String(pending.user_id) !== userId) return sendError(403, 'Not your purchase', 'FORBIDDEN');
      if (String(pending.status) === 'completed') {
        return sendError(409, 'Purchase already completed', 'ALREADY_COMPLETED');
      }

      const failed = await failCheckoutIntent({
        purchaseId,
        reason: 'User cancelled PayPal checkout',
        provider: pending.payment_provider || 'paypal',
        externalRef: pending.external_ref,
      });
      if (!failed.success) {
        return sendError(400, failed.error || 'Cancel failed', failed.code || 'CANCEL_FAILED');
      }
      return sendOk({ purchaseId, status: 'failed' });
    }

    if (sub === 'funding/paypal/capture' && method === 'POST') {
      const auth = await requireAuth(req);
      if (auth.ok === false) return jsonErr(auth.status, auth.error.message, auth.error.code);
      const client = requireDb(); if (!client) return sendError(503, "Finance backend unavailable", "NO_ADMIN");
      const userId = authProfileId(auth as AuthOk);
      if (!userId) return sendError(401, 'Unauthorized', 'UNAUTHORIZED');

      const purchaseId =
        typeof body.purchaseId === 'string'
          ? body.purchaseId.trim()
          : typeof body.purchase_id === 'string'
            ? body.purchase_id.trim()
            : '';
      const orderId =
        typeof body.orderId === 'string'
          ? body.orderId.trim()
          : typeof body.token === 'string'
            ? body.token.trim()
            : typeof body.externalRef === 'string'
              ? body.externalRef.trim()
              : typeof body.external_ref === 'string'
                ? body.external_ref.trim()
                : '';

      if (!purchaseId) return sendError(400, 'purchaseId required', 'INVALID_ID');

      const { data: pending } = await client
        .from('coin_purchases')
        .select('*')
        .eq('id', purchaseId)
        .maybeSingle();
      if (!pending) return sendError(404, 'Purchase intent not found', 'NOT_FOUND');
      if (String(pending.user_id) !== userId) {
        return sendError(403, 'Not your purchase', 'FORBIDDEN');
      }
      if (String(pending.channel) !== 'GATEWAY') {
        return sendError(400, 'Not a gateway purchase', 'INVALID_CHANNEL');
      }
      if (String(pending.status) === 'completed') {
        return sendOk({
          purchaseId,
          status: 'completed',
          coinBalance: undefined,
          duplicate: true,
        });
      }
      if (String(pending.status) !== 'pending') {
        return sendError(409, `Purchase status is ${pending.status}`, 'INVALID_STATUS');
      }

      const providerId = String(pending.payment_provider || 'paypal');
      const gwRes = await getPaymentGateway(client, providerId);
      const gateway = gwRes.gateway;
      if (!gateway) return sendError(503, 'Payment gateway not found', 'GATEWAY_NOT_FOUND');
      const providerImpl = resolveProvider(gateway);
      if (!providerImpl) return sendError(503, 'Gateway unsupported', 'GATEWAY_UNSUPPORTED');

      const externalRef = orderId || String(pending.external_ref || '').trim();
      if (!externalRef) return sendError(400, 'PayPal order id required', 'INVALID_EXTERNAL_REF');

      const captured = await providerImpl.captureOrVerify({
        externalRef,
        purchaseId,
      });
      if (!captured.success) {
        // Webhook may have completed the purchase while capture raced — treat as success
        const { data: afterRace } = await client
          .from('coin_purchases')
          .select('id, status, wallet_ledger_id, user_id')
          .eq('id', purchaseId)
          .maybeSingle();
        if (afterRace && String(afterRace.status) === 'completed') {
          const { data: profile } = await client
            .from('profiles')
            .select('coin_balance')
            .eq('id', userId)
            .maybeSingle();
          return sendOk({
            purchaseId,
            walletLedgerId: afterRace.wallet_ledger_id || undefined,
            coinBalance: Number(profile?.coin_balance) || 0,
            duplicate: true,
            status: 'completed',
            provider: providerId,
          });
        }
        return sendError(
          402,
          captured.error || 'Payment capture failed',
          captured.code || 'CAPTURE_FAILED'
        );
      }

      const result = await completeCoinPurchase({
        purchaseId,
        userId,
        amountCoins: Number(pending.amount_coins) || 0,
        channel: 'GATEWAY',
        amountUsd: pending.amount_usd != null ? Number(pending.amount_usd) : undefined,
        packageId: pending.package_id,
        provider: providerId,
        externalRef: captured.externalRef || externalRef,
        reason: pending.reason || 'PayPal purchase',
      });

      if (!result.success) {
        // Idempotent credit already applied (webhook won) — still return success UX
        if (result.code === 'DUPLICATE' || result.code === 'INVALID_STATUS') {
          const { data: after } = await client
            .from('coin_purchases')
            .select('id, status, wallet_ledger_id')
            .eq('id', purchaseId)
            .maybeSingle();
          if (after && String(after.status) === 'completed') {
            const { data: profile } = await client
              .from('profiles')
              .select('coin_balance')
              .eq('id', userId)
              .maybeSingle();
            return sendOk({
              purchaseId,
              walletLedgerId: after.wallet_ledger_id || result.walletLedgerId,
              coinBalance: Number(profile?.coin_balance) || result.coinBalance || 0,
              duplicate: true,
              status: 'completed',
              provider: providerId,
            });
          }
        }
        const st =
          result.code === 'NOT_FOUND'
            ? 404
            : result.code === 'INVALID_STATUS' || result.code === 'DUPLICATE'
              ? 409
              : 500;
        return sendError(st, result.error || 'Capture complete failed', result.code || 'CAPTURE_COMPLETE_FAILED');
      }

      return sendOk({
        purchaseId: result.purchaseId,
        walletLedgerId: result.walletLedgerId,
        coinBalance: result.coinBalance,
        duplicate: result.duplicate === true,
        status: 'completed',
        provider: providerId,
      });
    }

    if (sub === 'funding/webhook/paypal' && method === 'POST') {
      const client = requireDb(); if (!client) return sendError(503, "Finance backend unavailable", "NO_ADMIN");

      const gwRes = await getPaymentGateway(client, 'paypal');
      if (!gwRes.success || !gwRes.gateway) {
        return sendError(503, 'PayPal gateway not configured', 'GATEWAY_NOT_FOUND');
      }
      const providerImpl = resolveProvider(gwRes.gateway);
      if (!providerImpl) return sendError(503, 'PayPal provider unavailable', 'GATEWAY_UNSUPPORTED');

      const parsed = await providerImpl.parseWebhook(requestHeadersRecord(req), body);
      if (!parsed.ok) {
        const st = parsed.code === 'WEBHOOK_AUTH_FAILED' ? 401 : 400;
        return sendError(st, parsed.error || 'Webhook rejected', parsed.code || 'WEBHOOK_REJECTED');
      }

      if (!parsed.shouldComplete && !parsed.shouldFail) {
        return sendOk({ ignored: true, eventType: parsed.eventType });
      }

      let purchaseId = parsed.purchaseId ? String(parsed.purchaseId).trim() : '';
      const externalRef = parsed.externalRef ? String(parsed.externalRef).trim() : '';

      let pending: Record<string, unknown> | null = null;
      if (purchaseId) {
        const { data } = await client.from('coin_purchases').select('*').eq('id', purchaseId).maybeSingle();
        pending = data as Record<string, unknown> | null;
      }
      if (!pending && externalRef) {
        const { data } = await client
          .from('coin_purchases')
          .select('*')
          .eq('payment_provider', 'paypal')
          .eq('external_ref', externalRef)
          .maybeSingle();
        pending = data as Record<string, unknown> | null;
        if (pending) purchaseId = String(pending.id);
      }

      if (!pending || !purchaseId) {
        return sendError(404, 'Purchase intent not found for webhook', 'NOT_FOUND');
      }

      if (parsed.shouldFail) {
        const failed = await failCheckoutIntent({
          purchaseId,
          reason: parsed.reason || 'PayPal payment failed',
          provider: 'paypal',
          externalRef: externalRef || null,
        });
        if (!failed.success && failed.code !== 'ALREADY_COMPLETED') {
          return sendError(400, failed.error || 'Fail intent failed', failed.code || 'WEBHOOK_FAIL');
        }
        return sendOk({ purchaseId, status: 'failed', eventType: parsed.eventType });
      }

      // Ensure capture before credit (APPROVED may arrive before return URL capture)
      if (externalRef || pending.external_ref) {
        const orderId = externalRef || String(pending.external_ref || '');
        const captured = await providerImpl.captureOrVerify({
          externalRef: orderId,
          purchaseId,
        });
        if (!captured.success) {
          return sendError(
            402,
            captured.error || 'PayPal capture failed',
            captured.code || 'CAPTURE_FAILED'
          );
        }
      }

      const result = await completeCoinPurchase({
        purchaseId,
        userId: String(pending.user_id),
        amountCoins: Number(pending.amount_coins) || 0,
        channel: 'GATEWAY',
        amountUsd: pending.amount_usd != null ? Number(pending.amount_usd) : undefined,
        packageId: pending.package_id != null ? String(pending.package_id) : null,
        provider: 'paypal',
        externalRef: externalRef || String(pending.external_ref || `paypal_${purchaseId}`),
        reason: pending.reason != null ? String(pending.reason) : 'PayPal webhook',
      });

      if (!result.success) {
        const st =
          result.code === 'NOT_FOUND'
            ? 404
            : result.code === 'INVALID_STATUS' || result.code === 'DUPLICATE'
              ? 409
              : 500;
        return sendError(st, result.error || 'Webhook complete failed', result.code || 'WEBHOOK_COMPLETE_FAILED');
      }

      return sendOk({
        purchaseId: result.purchaseId,
        walletLedgerId: result.walletLedgerId,
        coinBalance: result.coinBalance,
        duplicate: result.duplicate === true,
        eventType: parsed.eventType,
      });
    }

    if (sub === 'funding/webhook/provider' && method === 'POST') {
      const client = requireDb(); if (!client) return sendError(503, "Finance backend unavailable", "NO_ADMIN");

      const configuredSecret = (
        process.env.FINANCE_WEBHOOK_SECRET ||
        process.env.PAYMENT_WEBHOOK_SECRET ||
        ''
      ).trim();
      const provided =
        String(
          req.headers['x-finance-webhook-secret'] ||
            req.headers['X-Finance-Webhook-Secret'] ||
            req.headers['x-payment-webhook-secret'] ||
            ''
        ).trim() ||
        (typeof body.webhookSecret === 'string' ? String(body.webhookSecret).trim() : '');

      const isProd = String(process.env.NODE_ENV || '').toLowerCase() === 'production';
      if (configuredSecret) {
        if (!provided || !timingSafeEqualString(provided, configuredSecret)) {
          return sendError(401, 'Invalid webhook secret', 'WEBHOOK_AUTH_FAILED');
        }
      } else if (isProd) {
        return sendError(503,
          'FINANCE_WEBHOOK_SECRET must be configured in production before accepting gateway webhooks',
          'WEBHOOK_SECRET_REQUIRED'
        );
      }

      const purchaseId =
        typeof body.purchaseId === 'string'
          ? body.purchaseId.trim()
          : typeof body.purchase_id === 'string'
            ? body.purchase_id.trim()
            : '';
      const statusRaw = String(body.status || body.event || 'completed').toLowerCase();
      const provider =
        typeof body.provider === 'string'
          ? body.provider.trim()
          : typeof body.payment_provider === 'string'
            ? body.payment_provider.trim()
            : 'stub';
      const externalRef =
        typeof body.externalRef === 'string'
          ? body.externalRef.trim()
          : typeof body.external_ref === 'string'
            ? body.external_ref.trim()
            : typeof body.eventId === 'string'
              ? body.eventId.trim()
              : null;

      if (!purchaseId) return sendError(400, 'purchaseId required', 'INVALID_ID');

      if (statusRaw === 'failed' || statusRaw === 'canceled' || statusRaw === 'cancelled') {
        const failed = await failCheckoutIntent({
          purchaseId,
          reason: typeof body.reason === 'string' ? body.reason : 'Payment failed',
          provider,
          externalRef,
        });
        if (!failed.success) {
          const st = failed.code === 'NOT_FOUND' ? 404 : failed.code === 'ALREADY_COMPLETED' ? 409 : 400;
          return sendError(st, failed.error || 'Fail intent failed', failed.code || 'WEBHOOK_FAIL');
        }
        return sendOk({ purchaseId, status: 'failed' });
      }

      if (statusRaw !== 'completed' && statusRaw !== 'success' && statusRaw !== 'paid') {
        return sendError(400, 'Unsupported webhook status', 'INVALID_STATUS');
      }

      const { data: pending } = await client
        .from('coin_purchases')
        .select('*')
        .eq('id', purchaseId)
        .maybeSingle();
      if (!pending) return sendError(404, 'Purchase intent not found', 'NOT_FOUND');

      const result = await completeCoinPurchase({
        purchaseId,
        userId: String(pending.user_id),
        amountCoins: Number(pending.amount_coins) || 0,
        channel: 'GATEWAY',
        amountUsd: pending.amount_usd != null ? Number(pending.amount_usd) : undefined,
        packageId: pending.package_id,
        provider: provider || pending.payment_provider || 'stub',
        externalRef: externalRef || `webhook_${purchaseId}`,
        reason: pending.reason || 'Gateway purchase',
      });

      if (!result.success) {
        const st =
          result.code === 'NOT_FOUND'
            ? 404
            : result.code === 'INVALID_STATUS' || result.code === 'DUPLICATE'
              ? 409
              : 500;
        return sendError(st,
          result.error || 'Webhook complete failed',
          result.code || 'WEBHOOK_COMPLETE_FAILED'
        );
      }

      const { data: profile } = await client
        .from('profiles')
        .select('id, auth_id, email, coin_balance, earnings_coins, name')
        .eq('id', pending.user_id)
        .maybeSingle();

      const { data: purchaseRow } = await client
        .from('coin_purchases')
        .select('*')
        .eq('id', result.purchaseId)
        .maybeSingle();

      return sendOk({
        purchase: purchaseRow ? mapCoinPurchase(purchaseRow, profile) : null,
        walletLedgerId: result.walletLedgerId,
        coinBalance: result.coinBalance,
        duplicate: result.duplicate === true,
        extensionPoint:
          'Replace stub verification with real PSP signature checks; keep completeCoinPurchase as the sole credit path.',
      });
    }

    if (sub === 'funding/simulate-gateway' && method === 'POST') {
      const auth = await requireAdmin(req);
      if (auth.ok === false) return jsonErr(auth.status, auth.error.message, auth.error.code);
      const client = requireDb(); if (!client) return sendError(503, "Finance backend unavailable", "NO_ADMIN");
      const isProd = String(process.env.NODE_ENV || '').toLowerCase() === 'production';
      if (isProd) {
        return sendError(403, 'simulate-gateway disabled in production', 'FORBIDDEN');
      }

      const actorAdminId = authProfileId(auth as AuthOk);
      const userId =
        typeof body.userId === 'string'
          ? body.userId.trim()
          : typeof body.user_id === 'string'
            ? body.user_id.trim()
            : '';
      const packageId =
        typeof body.packageId === 'string'
          ? body.packageId.trim()
          : typeof body.package_id === 'string'
            ? body.package_id.trim()
            : '';

      if (!userId) return sendError(400, 'userId required', 'INVALID_USER');
      if (!packageId) return sendError(400, 'packageId required', 'INVALID_PACKAGE');

      const intent = await createCheckoutIntent({
        userId,
        packageId,
        provider: 'simulate',
      });
      if (!intent.success || !intent.purchase) {
        return sendError(intent.code === 'PACKAGE_NOT_FOUND' ? 404 : 400,
          intent.error || 'Intent failed',
          intent.code || 'SIMULATE_FAILED'
        );
      }

      const externalRef = `sim_${intent.purchase.id}_${Date.now()}`;
      const result = await completeCoinPurchase({
        purchaseId: intent.purchase.id,
        userId,
        amountCoins: intent.purchase.amountCoins,
        channel: 'GATEWAY',
        amountUsd: intent.purchase.amountUsd,
        packageId,
        provider: 'simulate',
        externalRef,
        actorAdminId: actorAdminId || null,
        reason: `Simulated gateway purchase · ${intent.package?.title || packageId}`,
      });

      if (!result.success) {
        return sendError(500, result.error || 'Simulate complete failed', result.code || 'SIMULATE_FAILED');
      }

      const { data: profile } = await client
        .from('profiles')
        .select('id, auth_id, email, coin_balance, earnings_coins, name')
        .eq('id', userId)
        .maybeSingle();

      const { data: purchaseRow } = await client
        .from('coin_purchases')
        .select('*')
        .eq('id', result.purchaseId)
        .maybeSingle();

      return sendOk({
          purchase: purchaseRow ? mapCoinPurchase(purchaseRow, profile) : null,
          package: intent.package,
          walletLedgerId: result.walletLedgerId,
          coinBalance: result.coinBalance,
          path: 'createCheckoutIntent → completeCoinPurchase(GATEWAY)',
        },
        201
      );
    }

    // -----------------------------------------------------------------------
    // ADMIN summary
    // -----------------------------------------------------------------------
    if (sub === 'admin/summary' && method === 'GET') {
      const auth = await requireAdmin(req);
      if (auth.ok === false) return jsonErr(auth.status, auth.error.message, auth.error.code);
      const client = requireDb(); if (!client) return sendError(503, "Finance backend unavailable", "NO_ADMIN");
      const periodId = qstr(req, 'periodId');
      const now = new Date();

      const ensured = await ensureOpenPeriod({ at: now });
      const openPeriod = ensured.period;
      const openPeriodId = openPeriod?.id || null;

      let settlementPeriodId = periodId;
      let settlementPeriodStatus = null;
      if (!settlementPeriodId) {
        const { data: latestClosed } = await client
          .from('settlement_periods')
          .select('id, status')
          .eq('status', 'closed')
          .order('period_end', { ascending: false })
          .limit(1)
          .maybeSingle();
        settlementPeriodId = latestClosed?.id || openPeriodId || '';
        settlementPeriodStatus = latestClosed?.status || openPeriod?.status || null;
      } else {
        const { data: selected } = await client
          .from('settlement_periods')
          .select('id, status')
          .eq('id', settlementPeriodId)
          .maybeSingle();
        settlementPeriodStatus = selected?.status || null;
      }

      let batchesQuery = client.from('settlement_batches').select('*');
      if (settlementPeriodId) batchesQuery = batchesQuery.eq('period_id', settlementPeriodId);
      const { data: batches, error: batchesError } = await batchesQuery;
      if (batchesError) return sendError(500, batchesError.message, 'SUMMARY_FAILED');

      let ledgerQuery = client
        .from('financial_ledger')
        .select('entry_type, amount_usd, amount_coins');
      if (settlementPeriodId) ledgerQuery = ledgerQuery.eq('period_id', settlementPeriodId);
      const { data: ledgerRows, error: ledgerError } = await ledgerQuery;
      if (ledgerError) return sendError(500, ledgerError.message, 'SUMMARY_FAILED');

      const list = batches || [];
      const ledger = ledgerRows || [];

      const sumUsd = (pred) =>
        list.filter(pred).reduce((s, b) => s + (Number(b.total_due_usd) || 0), 0);

      const platformEarnedUsd = ledger
        .filter((r) => r.entry_type === 'PLATFORM_EARN')
        .reduce((s, r) => s + (Number(r.amount_usd) || 0), 0);
      const hostAccruedUsd = ledger
        .filter(
          (r) =>
            r.entry_type === 'HOST_EARN' ||
            r.entry_type === 'TARGET_BONUS' ||
            r.entry_type === 'TARGET_SHARE_TRUEUP'
        )
        .reduce((s, r) => s + (Number(r.amount_usd) || 0), 0);
      const tlAccruedUsd = ledger
        .filter((r) => r.entry_type === 'TL_EARN')
        .reduce((s, r) => s + (Number(r.amount_usd) || 0), 0);

      const outstanding = list.filter((b) => b.status === 'pending_admin_pay');

      const { data: allPendingBatches, error: pendingError } = await client
        .from('settlement_batches')
        .select('id, total_due_usd, batch_kind, status')
        .eq('status', 'pending_admin_pay');
      if (pendingError) return sendError(500, pendingError.message, 'SUMMARY_FAILED');
      const pendingAll = allPendingBatches || [];
      const outstandingDueUsdAll = pendingAll.reduce(
        (s, b) => s + (Number(b.total_due_usd) || 0),
        0
      );

      const cfg = await loadFinanceSystemConfig();
      const peg = Number(cfg.coinUsdPeg) || getCoinUsdPeg(cfg);
      const bounds = getCurrentPeriodBounds(cfg.creatorTargetCycle, now);
      const nextCloseAtDate = await getNextCloseAt({ at: now, config: cfg });
      const periodStartIso = bounds.periodStart.toISOString();
      const periodEndIso = bounds.periodEnd.toISOString();
      const nextCloseAtIso = nextCloseAtDate.toISOString();

      let live = {
        periodId: openPeriodId,
        periodStart: periodStartIso,
        periodEnd: periodEndIso,
        nextCloseAt: nextCloseAtIso,
        coinUsdPeg: peg,
        callDebitCoins: 0,
        giftDebitCoins: 0,
        hostEarnCoins: 0,
        tlEarnCoins: 0,
        targetShareTrueUpCoins: 0,
        platformRetainedCoins: 0,
        callDebitUsd: 0,
        giftDebitUsd: 0,
        hostPayableUsd: 0,
        tlPayableUsd: 0,
        platformRetainedUsd: 0,
      };

      const accrual = await aggregateWalletLedgerEarnings({
        periodStart: bounds.periodStart,
        periodEnd: bounds.periodEnd,
        client,
      });
      if (accrual.success) {
        const t = accrual.totals;
        live = {
          ...live,
          callDebitCoins: t.callDebitCoins,
          giftDebitCoins: t.giftDebitCoins,
          hostEarnCoins: t.hostEarnCoins,
          tlEarnCoins: t.tlEarnCoins,
          targetShareTrueUpCoins: t.targetShareTrueUpCoins,
          platformRetainedCoins: t.platformRetainedCoins,
          callDebitUsd: coinsToUsd(t.callDebitCoins, peg),
          giftDebitUsd: coinsToUsd(t.giftDebitCoins, peg),
          hostPayableUsd: coinsToUsd(t.hostEarnCoins, peg),
          tlPayableUsd: coinsToUsd(t.tlEarnCoins, peg),
          platformRetainedUsd: coinsToUsd(t.platformRetainedCoins, peg),
        };
      }

      let fundingCompletedCoins = 0;
      let fundingPaidUsd = 0;
      let fundingPegValueUsd = 0;
      let fundingLoadMarginUsd = 0;
      let fundingCompletedCount = 0;
      {
        const { data: fundingRows, error: fundingError } = await client
          .from('coin_purchases')
          .select('amount_coins, amount_usd, peg_value_usd, load_margin_usd, status')
          .eq('status', 'completed')
          .gte('created_at', periodStartIso)
          .lt('created_at', periodEndIso);
        if (fundingError) return sendError(500, fundingError.message, 'SUMMARY_FAILED');
        for (const row of fundingRows || []) {
          fundingCompletedCount += 1;
          fundingCompletedCoins += Number(row.amount_coins) || 0;
          fundingPaidUsd += Number(row.amount_usd) || 0;
          fundingPegValueUsd += Number(row.peg_value_usd) || 0;
          fundingLoadMarginUsd += Number(row.load_margin_usd) || 0;
        }
      }

      return sendOk({
        periodId: settlementPeriodId || null,
        settlementPeriodId: settlementPeriodId || null,
        settlementPeriodStatus,
        openPeriodId,
        payableSourceOfTruth: PAYABLE_SOURCE_OF_TRUTH,
        platformEarnedUsd,
        hostAccruedUsd,
        tlAccruedUsd,
        totalDueToTeamLeadersUsd: sumUsd((b) => b.batch_kind === 'team_leader_bundle'),
        totalDueToDirectHostsUsd: sumUsd((b) => b.batch_kind === 'direct_host'),
        outstandingBatchCount: outstanding.length,
        outstandingDueUsd: outstanding.reduce((s, b) => s + (Number(b.total_due_usd) || 0), 0),
        batchCountsByStatus: {
          pending_admin_pay: list.filter((b) => b.status === 'pending_admin_pay').length,
          admin_paid: list.filter((b) => b.status === 'admin_paid').length,
          tl_confirmed: list.filter((b) => b.status === 'tl_confirmed').length,
          cancelled: list.filter((b) => b.status === 'cancelled').length,
        },
        live,
        funding: {
          periodId: openPeriodId,
          completedCount: fundingCompletedCount,
          completedCoins: fundingCompletedCoins,
          paidUsd: fundingPaidUsd,
          pegValueUsd: fundingPegValueUsd,
          loadMarginUsd: fundingLoadMarginUsd,
        },
        remittanceAll: {
          outstandingBatchCount: pendingAll.length,
          outstandingDueUsd: outstandingDueUsdAll,
          directHostCount: pendingAll.filter((b) => b.batch_kind === 'direct_host').length,
          tlBundleCount: pendingAll.filter((b) => b.batch_kind === 'team_leader_bundle').length,
        },
        period: {
          cycleType: cfg.creatorTargetCycle,
          periodCloseUtcTime: cfg.periodCloseUtcTime,
          settlementEnabled: cfg.settlementEnabled !== false,
          coinUsdPeg: peg,
          periodStart: periodStartIso,
          periodEnd: periodEndIso,
          nextCloseAt: nextCloseAtIso,
          openPeriodId,
          settlementPeriodId: settlementPeriodId || null,
          settlementPeriodStatus,
        },
      });
    }

    if (sub === 'admin/host-period-earnings' && method === 'GET') {
      const auth = await requireAdmin(req);
      if (auth.ok === false) return jsonErr(auth.status, auth.error.message, auth.error.code);
      const client = requireDb(); if (!client) return sendError(503, "Finance backend unavailable", "NO_ADMIN");
      const userId = qstr(req, 'userId') || qstr(req, 'user_id');
      if (!userId) return sendError(400, 'userId required', 'INVALID_USER');

      const periodIdFilter = qstr(req, 'periodId') || qstr(req, 'period_id');
      const limit = Math.min(Math.max(Number(qstr(req, 'limit')) || 20, 1), 50);

      const { data: lines, error } = await client
        .from('settlement_line_items')
        .select(
          'id, batch_id, component, amount_coins, amount_usd, host_salary_status, payee_role, created_at'
        )
        .eq('payee_user_id', userId)
        .eq('payee_role', 'host')
        .order('created_at', { ascending: false })
        .limit(800);
      if (error) return sendError(500, error.message, 'ADMIN_HOST_EARNINGS_FAILED');

      const batchIds = Array.from(new Set((lines || []).map((l) => String(l.batch_id))));
      if (!batchIds.length) return sendOk({ userId, periods: [] });

      const { data: batches, error: batchError } = await client
        .from('settlement_batches')
        .select('id, period_id, batch_kind, status')
        .in('id', batchIds);
      if (batchError) return sendError(500, batchError.message, 'ADMIN_HOST_EARNINGS_FAILED');

      const periodIds = Array.from(
        new Set(
          (batches || [])
            .map((b) => String(b.period_id))
            .filter((id) => id && (!periodIdFilter || id === periodIdFilter))
        )
      );
      if (!periodIds.length) return sendOk({ userId, periods: [] });

      const { data: periods } = await client
        .from('settlement_periods')
        .select('id, cycle_type, period_start, period_end, status, closed_at')
        .in('id', periodIds)
        .order('period_start', { ascending: false });

      const batchById = new Map((batches || []).map((b) => [String(b.id), b]));

      const linesByPeriod = new Map();
      for (const line of lines || []) {
        const batch = batchById.get(String(line.batch_id));
        if (!batch) continue;
        const pid = String(batch.period_id);
        if (periodIdFilter && pid !== periodIdFilter) continue;
        const list = linesByPeriod.get(pid) || [];
        list.push(line);
        linesByPeriod.set(pid, list);
      }

      const result = (periods || [])
        .map((p) => {
          const pid = String(p.id);
          const periodLines = linesByPeriod.get(pid) || [];
          if (!periodLines.length) return null;
          const breakdown = summarizeHostSettlementLines(periodLines);
          return {
            periodId: pid,
            cycleType: p.cycle_type,
            periodStart: p.period_start,
            periodEnd: p.period_end,
            periodStatus: p.status,
            closedAt: p.closed_at ?? null,
            breakdown,
            hasTrueUp: breakdown.targetShareTrueUpCoins > 0 || breakdown.targetShareTrueUpUsd > 0,
            lineItems: periodLines.map(mapLineItem),
          };
        })
        .filter(Boolean)
        .slice(0, limit);

      return sendOk({ userId, periods: result });
    }

    // -----------------------------------------------------------------------
    // TEAM LEADER batches
    // -----------------------------------------------------------------------
    if (sub === 'tl/salary-estimate-preview' && method === 'GET') {
      const auth = await requireTeamLeader(req);
      if (auth.ok === false) return jsonErr(auth.status, auth.error.message, auth.error.code);
      const client = requireDb(); if (!client) return sendError(503, "Finance backend unavailable", "NO_ADMIN");
      const tlId = authProfileId(auth as AuthOk);
      if (!tlId) return sendError(401, 'Unauthorized', 'UNAUTHORIZED');
      const result = await buildSalaryEstimatePreview({
        scope: 'team_leader',
        actorUserId: tlId,
      });
      if (!result.success || !result.data) {
        return sendError(500,
          result.error || 'Failed to build salary estimate',
          'SALARY_ESTIMATE_FAILED'
        );
      }
      return sendOk( result.data);
    }

    if (sub === 'tl/batches' && method === 'GET') {
      const auth = await requireTeamLeader(req);
      if (auth.ok === false) return jsonErr(auth.status, auth.error.message, auth.error.code);
      const client = requireDb(); if (!client) return sendError(503, "Finance backend unavailable", "NO_ADMIN");
      const tlId = authProfileId(auth as AuthOk);
      if (!tlId) return sendError(401, 'Unauthorized', 'UNAUTHORIZED');
      const role = authRole(auth as AuthOk);
      if (!TEAM_LEADER_ROLES.has(role) && role !== 'admin') {
        return sendError(403, 'Team leader role required', 'FORBIDDEN');
      }

      const periodId = qstr(req, 'periodId');
      const limit = Math.min(Math.max(Number(qstr(req, 'limit')) || 50, 1), 200);
      const offset = Math.max(Number(qstr(req, 'offset')) || 0, 0);

      let q = client
        .from('settlement_batches')
        .select('*')
        .eq('batch_kind', 'team_leader_bundle')
        .or(`team_leader_id.eq.${tlId},payee_user_id.eq.${tlId}`)
        .order('created_at', { ascending: false })
        .range(offset, offset + limit - 1);
      if (periodId) q = q.eq('period_id', periodId);

      const { data, error } = await q;
      if (error) return sendError(500, error.message, 'TL_BATCHES_LOAD_FAILED');
      return sendOk({
        batches: (data || []).map(mapBatch),
        pagination: { limit, offset, count: (data || []).length },
      });
    }

    const tlReconcileMatch = sub.match(/^tl\/batches\/([^/]+)\/reconcile$/);
    if (tlReconcileMatch && method === 'POST') {
      const auth = await requireTeamLeader(req);
      if (auth.ok === false) return jsonErr(auth.status, auth.error.message, auth.error.code);
      const client = requireDb(); if (!client) return sendError(503, "Finance backend unavailable", "NO_ADMIN");
      const tlId = authProfileId(auth as AuthOk);
      const id = String(tlReconcileMatch[1] || '').trim();
      if (!tlId) return sendError(401, 'Unauthorized', 'UNAUTHORIZED');
      if (!id) return sendError(400, 'Batch id required', 'INVALID_ID');

      const result = await reconcileBatch({
        batchId: id,
        actorUserId: tlId,
        actorRole: 'team_leader',
        note: typeof body.note === 'string' ? body.note : undefined,
      });
      if (!result.success) {
        return sendError(transitionHttpStatus(result.code),
          result.error || 'Reconcile failed',
          result.code || 'RECONCILE_FAILED'
        );
      }
      const { data: batch } = await client
        .from('settlement_batches')
        .select('*')
        .eq('id', id)
        .maybeSingle();
      return sendOk({
        batch: batch ? mapBatch(batch) : null,
        alreadyReconciled: Boolean(result.alreadyReconciled),
      });
    }

    const tlHostMarkPaidMatch = sub.match(/^tl\/batches\/([^/]+)\/hosts\/([^/]+)\/mark-paid$/);
    if (tlHostMarkPaidMatch && method === 'POST') {
      const auth = await requireTeamLeader(req);
      if (auth.ok === false) return jsonErr(auth.status, auth.error.message, auth.error.code);
      const client = requireDb(); if (!client) return sendError(503, "Finance backend unavailable", "NO_ADMIN");
      const tlId = authProfileId(auth as AuthOk);
      const id = String(tlHostMarkPaidMatch[1] || '').trim();
      const hostId = String(tlHostMarkPaidMatch[2] || '').trim();
      if (!tlId) return sendError(401, 'Unauthorized', 'UNAUTHORIZED');
      if (!id || !hostId) return sendError(400, 'Batch and host id required', 'INVALID_ID');

      const result = await agencyMarkHostPaid({
        batchId: id,
        hostUserId: hostId,
        actorUserId: tlId,
        note: typeof body.note === 'string' ? body.note : undefined,
      });
      if (!result.success) {
        return sendError(transitionHttpStatus(result.code),
          result.error || 'Mark host paid failed',
          result.code || 'AGENCY_MARK_HOST_PAID_FAILED'
        );
      }
      const { data: batch } = await client
        .from('settlement_batches')
        .select('*')
        .eq('id', id)
        .maybeSingle();
      return sendOk({
        batch: batch ? mapBatch(batch) : null,
        alreadyPaid: Boolean(result.alreadyPaid),
      });
    }

    const tlConfirmMatch = sub.match(/^tl\/batches\/([^/]+)\/confirm-received$/);
    if (tlConfirmMatch && method === 'POST') {
      const auth = await requireTeamLeader(req);
      if (auth.ok === false) return jsonErr(auth.status, auth.error.message, auth.error.code);
      const client = requireDb(); if (!client) return sendError(503, "Finance backend unavailable", "NO_ADMIN");
      const tlId = authProfileId(auth as AuthOk);
      const id = String(tlConfirmMatch[1] || '').trim();
      if (!tlId) return sendError(401, 'Unauthorized', 'UNAUTHORIZED');
      if (!id) return sendError(400, 'Batch id required', 'INVALID_ID');

      const result = await markBatchTlConfirmed({
        batchId: id,
        actorUserId: tlId,
        note: typeof body.note === 'string' ? body.note : undefined,
      });

      if (!result.success) {
        return sendError(transitionHttpStatus(result.code),
          result.error || 'Confirm received failed',
          result.code || 'TL_CONFIRM_FAILED'
        );
      }

      const { data: batch } = await client
        .from('settlement_batches')
        .select('*')
        .eq('id', id)
        .maybeSingle();

      return sendOk({ batch: batch ? mapBatch(batch) : null });
    }

    const tlBatchGetMatch = sub.match(/^tl\/batches\/([^/]+)$/);
    if (tlBatchGetMatch && method === 'GET') {
      const auth = await requireTeamLeader(req);
      if (auth.ok === false) return jsonErr(auth.status, auth.error.message, auth.error.code);
      const client = requireDb(); if (!client) return sendError(503, "Finance backend unavailable", "NO_ADMIN");
      const tlId = authProfileId(auth as AuthOk);
      const id = String(tlBatchGetMatch[1] || '').trim();
      if (!tlId) return sendError(401, 'Unauthorized', 'UNAUTHORIZED');
      if (!id) return sendError(400, 'Batch id required', 'INVALID_ID');

      const { data: batch, error } = await client
        .from('settlement_batches')
        .select('*')
        .eq('id', id)
        .maybeSingle();
      if (error) return sendError(500, error.message, 'TL_BATCH_LOAD_FAILED');
      if (!batch) return sendError(404, 'Batch not found', 'NOT_FOUND');

      const isOwner =
        authRole(auth as AuthOk) === 'admin' ||
        batch.team_leader_id === tlId ||
        batch.payee_user_id === tlId;
      if (!isOwner) return sendError(403, 'Not your settlement batch', 'FORBIDDEN');

      const { data: lines } = await client
        .from('settlement_line_items')
        .select('*')
        .eq('batch_id', id)
        .order('created_at');
      const { data: events } = await client
        .from('settlement_events')
        .select('*')
        .eq('batch_id', id)
        .order('created_at', { ascending: false });

      return sendOk({
        batch: mapBatch(batch),
        lineItems: (lines || []).map(mapLineItem),
        events: (events || []).map(mapEvent),
      });
    }

    // -----------------------------------------------------------------------
    // Manual payouts (legacy reject)
    // -----------------------------------------------------------------------
    if (sub === 'manual-payouts' && method === 'POST') {
      const auth = await requireAuth(req);
      if (auth.ok === false) return jsonErr(auth.status, auth.error.message, auth.error.code);
      try {
        const decision = await checkManualPayoutAllowed();
        return sendError(400,
          decision.message || 'Manual payouts are disabled. Use period-end settlement batches.',
          decision.code || PAYOUT_PERIOD_END_ONLY
        );
      } catch (err) {
        return sendError(400,
          (err && err.message) || 'Manual payouts are disabled',
          PAYOUT_PERIOD_END_ONLY
        );
      }
    }

    // -----------------------------------------------------------------------
    // ADMIN — Salary periods
    // -----------------------------------------------------------------------
    if (sub === 'admin/salary-estimate-preview' && method === 'GET') {
      const auth = await requireAdmin(req);
      if (auth.ok === false) return jsonErr(auth.status, auth.error.message, auth.error.code);
      const client = requireDb(); if (!client) return sendError(503, "Finance backend unavailable", "NO_ADMIN");
      const actorUserId = authProfileId(auth as AuthOk) || 'admin';
      const result = await buildSalaryEstimatePreview({
        scope: 'admin',
        actorUserId,
      });
      if (!result.success || !result.data) {
        return sendError(500,
          result.error || 'Failed to build salary estimate',
          'SALARY_ESTIMATE_FAILED'
        );
      }
      return sendOk( result.data);
    }

    if (sub === 'admin/salary-periods' && method === 'GET') {
      const auth = await requireAdmin(req);
      if (auth.ok === false) return jsonErr(auth.status, auth.error.message, auth.error.code);
      const client = requireDb(); if (!client) return sendError(503, "Finance backend unavailable", "NO_ADMIN");
      const limit = Math.min(Math.max(Number(qstr(req, 'limit')) || 40, 1), 100);
      const result = await listSalaryPeriods({ limit });
      if (!result.success) {
        return sendError(500, result.error || 'Failed to load salary periods', 'SALARY_PERIODS_FAILED');
      }
      return sendOk({ periods: result.periods || [] });
    }

    const salaryPeriodExportMatch = sub.match(/^admin\/salary-periods\/([^/]+)\/export$/);
    if (salaryPeriodExportMatch && method === 'GET') {
      const auth = await requireAdmin(req);
      if (auth.ok === false) return jsonErr(auth.status, auth.error.message, auth.error.code);
      const client = requireDb(); if (!client) return sendError(503, "Finance backend unavailable", "NO_ADMIN");
      const periodId = String(salaryPeriodExportMatch[1] || '').trim();
      if (!periodId) return sendError(400, 'Period id required', 'INVALID_ID');
      const format = String(qstr(req, 'format') || 'xlsx').toLowerCase();
            if (format === 'pdf') {
        const built = await buildSalaryPeriodPdf(periodId);
        if (!built.success || !built.buffer) {
          return sendError(500, built.error || 'PDF export failed', 'SALARY_EXPORT_FAILED');
        }
        return new Response(built.buffer, {
          status: 200,
          headers: {
            'Content-Type': 'application/pdf',
            'Content-Disposition': `attachment; filename="${built.filename || 'salary.pdf'}"`,
            'Cache-Control': 'no-store',
          },
        });
      }
      const built = await buildSalaryPeriodXlsx(periodId);
      if (!built.success || !built.buffer) {
        return sendError(500, built.error || 'Excel export failed', 'SALARY_EXPORT_FAILED');
      }
      return new Response(built.buffer, {
        status: 200,
        headers: {
          'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          'Content-Disposition': `attachment; filename="${built.filename || 'salary.xlsx'}"`,
          'Cache-Control': 'no-store',
        },
      });
    }

    const salaryPeriodMarkPaidMatch = sub.match(/^admin\/salary-periods\/([^/]+)\/mark-paid$/);
    if (salaryPeriodMarkPaidMatch && method === 'POST') {
      const auth = await requireAdmin(req);
      if (auth.ok === false) return jsonErr(auth.status, auth.error.message, auth.error.code);
      const client = requireDb(); if (!client) return sendError(503, "Finance backend unavailable", "NO_ADMIN");
      const periodId = String(salaryPeriodMarkPaidMatch[1] || '').trim();
      const actorUserId = authProfileId(auth as AuthOk);
      if (!periodId) return sendError(400, 'Period id required', 'INVALID_ID');
      if (!actorUserId) return sendError(401, 'Unauthorized', 'UNAUTHORIZED');
      const result = await markPeriodAdminPaid({
        periodId,
        actorUserId,
        note: typeof body.note === 'string' ? body.note : undefined,
        paymentReference:
          typeof body.paymentReference === 'string'
            ? body.paymentReference
            : typeof body.payment_reference === 'string'
              ? body.payment_reference
              : undefined,
      });
      if (!result.success) {
        const status =
          result.code === 'NOT_FOUND' ? 404 : result.code === 'INVALID_TRANSITION' ? 409 : 400;
        return sendError(status,
          result.error || 'Mark period paid failed',
          result.code || 'PERIOD_MARK_PAID_FAILED'
        );
      }
      const detail = await loadSalaryPeriodDetail(periodId);
      return sendOk({
        batchesUpdated: result.batchesUpdated || 0,
        alreadyPaid: result.alreadyPaid === true,
        detail: detail.data || null,
      });
    }

    const salaryPeriodDetailMatch = sub.match(/^admin\/salary-periods\/([^/]+)$/);
    if (salaryPeriodDetailMatch && method === 'GET') {
      const auth = await requireAdmin(req);
      if (auth.ok === false) return jsonErr(auth.status, auth.error.message, auth.error.code);
      const client = requireDb(); if (!client) return sendError(503, "Finance backend unavailable", "NO_ADMIN");
      const periodId = String(salaryPeriodDetailMatch[1] || '').trim();
      if (!periodId) return sendError(400, 'Period id required', 'INVALID_ID');
      const result = await loadSalaryPeriodDetail(periodId);
      if (!result.success || !result.data) {
        const status = String(result.error || '').includes('not found') ? 404 : 500;
        return sendError(status,
          result.error || 'Failed to load salary period',
          'SALARY_PERIOD_FAILED'
        );
      }
      return sendOk( result.data);
    }

    // -----------------------------------------------------------------------
    // HOST routes
    // -----------------------------------------------------------------------
    if (sub === 'host/salary-estimate-preview' && method === 'GET') {
      const auth = await requireAuth(req);
      if (auth.ok === false) return jsonErr(auth.status, auth.error.message, auth.error.code);
      const client = requireDb(); if (!client) return sendError(503, "Finance backend unavailable", "NO_ADMIN");
      const hostId = authProfileId(auth as AuthOk);
      if (!hostId) return sendError(401, 'Unauthorized', 'UNAUTHORIZED');
      const result = await buildSalaryEstimatePreview({
        scope: 'host',
        actorUserId: hostId,
      });
      if (!result.success || !result.data) {
        return sendError(500,
          result.error || 'Failed to build salary estimate',
          'SALARY_ESTIMATE_FAILED'
        );
      }
      return sendOk( result.data);
    }

    if (sub === 'host/salary-status' && method === 'GET') {
      const auth = await requireAuth(req);
      if (auth.ok === false) return jsonErr(auth.status, auth.error.message, auth.error.code);
      const client = requireDb(); if (!client) return sendError(503, "Finance backend unavailable", "NO_ADMIN");
      const hostId = authProfileId(auth as AuthOk);
      if (!hostId) return sendError(401, 'Unauthorized', 'UNAUTHORIZED');

      const limit = Math.min(Math.max(Number(qstr(req, 'limit')) || 50, 1), 200);

      const { data: lines, error } = await client
        .from('settlement_line_items')
        .select('id, batch_id, host_salary_status, payee_role, created_at')
        .eq('payee_user_id', hostId)
        .eq('payee_role', 'host')
        .order('created_at', { ascending: false })
        .limit(limit * 5);
      if (error) return sendError(500, error.message, 'HOST_STATUS_FAILED');

      const batchIds = Array.from(new Set((lines || []).map((l) => String(l.batch_id))));
      if (!batchIds.length) {
        return sendOk({ items: [] });
      }

      const { data: batches, error: batchError } = await client
        .from('settlement_batches')
        .select('id, period_id, batch_kind, status, created_at')
        .in('id', batchIds);
      if (batchError) return sendError(500, batchError.message, 'HOST_STATUS_FAILED');

      const periodIds = Array.from(
        new Set((batches || []).map((b) => String(b.period_id)).filter(Boolean))
      );
      const { data: periods } = periodIds.length
        ? await client
            .from('settlement_periods')
            .select('id, cycle_type, period_start, period_end, status')
            .in('id', periodIds)
        : { data: [] };

      const batchById = new Map((batches || []).map((b) => [String(b.id), b]));
      const periodById = new Map((periods || []).map((p) => [String(p.id), p]));

      const byBatch = new Map();
      for (const line of lines || []) {
        const bid = String(line.batch_id);
        const st = normalizePayeeSalaryStatus(line.host_salary_status);
        const mapped =
          st === 'acknowledged' ? 'acknowledged' : st === 'admin_paid' ? 'admin_paid' : 'unpaid';
        const prev = byBatch.get(bid) || { salaryStatus: 'acknowledged', lineCount: 0 };
        prev.lineCount += 1;
        const rank = { unpaid: 0, admin_paid: 1, acknowledged: 2 };
        if (rank[mapped] < rank[prev.salaryStatus]) prev.salaryStatus = mapped;
        byBatch.set(bid, prev);
      }

      const items = Array.from(byBatch.entries())
        .map(([batchId, agg]) => {
          const batch = batchById.get(batchId);
          if (!batch) return null;
          const period = periodById.get(String(batch.period_id));
          return {
            periodId: batch.period_id,
            cycleType: period?.cycle_type ?? null,
            periodStart: period?.period_start ?? null,
            periodEnd: period?.period_end ?? null,
            periodStatus: period?.status ?? null,
            batchId,
            batchKind: batch.batch_kind,
            batchStatus: batch.status,
            salaryStatus: agg.salaryStatus,
            canAcknowledge: agg.salaryStatus === 'admin_paid',
          };
        })
        .filter(Boolean)
        .slice(0, limit);

      return sendOk({ items });
    }

    const hostAckMatch = sub.match(/^host\/salary\/([^/]+)\/acknowledge$/);
    if (hostAckMatch && method === 'POST') {
      const auth = await requireAuth(req);
      if (auth.ok === false) return jsonErr(auth.status, auth.error.message, auth.error.code);
      const client = requireDb(); if (!client) return sendError(503, "Finance backend unavailable", "NO_ADMIN");
      const hostId = authProfileId(auth as AuthOk);
      const batchId = String(hostAckMatch[1] || '').trim();
      if (!hostId) return sendError(401, 'Unauthorized', 'UNAUTHORIZED');
      if (!batchId) return sendError(400, 'Batch id required', 'INVALID_ID');
      const result = await acknowledgePayeeSalary({
        batchId,
        actorUserId: hostId,
        note: typeof body.note === 'string' ? body.note : undefined,
      });
      if (!result.success) {
        const status =
          result.code === 'NOT_FOUND'
            ? 404
            : result.code === 'FORBIDDEN'
              ? 403
              : result.code === 'INVALID_TRANSITION'
                ? 409
                : 400;
        return sendError(status,
          result.error || 'Acknowledge failed',
          result.code || 'HOST_ACK_FAILED'
        );
      }
      return sendOk({
        acknowledged: true,
        alreadyAcknowledged: result.alreadyPaid === true,
      });
    }

    if (sub === 'host/period-earnings' && method === 'GET') {
      const auth = await requireAuth(req);
      if (auth.ok === false) return jsonErr(auth.status, auth.error.message, auth.error.code);
      const client = requireDb(); if (!client) return sendError(503, "Finance backend unavailable", "NO_ADMIN");
      const hostId = authProfileId(auth as AuthOk);
      if (!hostId) return sendError(401, 'Unauthorized', 'UNAUTHORIZED');

      const limit = Math.min(Math.max(Number(qstr(req, 'limit')) || 20, 1), 50);
      const periodIdFilter = qstr(req, 'periodId');

      const { data: lines, error } = await client
        .from('settlement_line_items')
        .select(
          'id, batch_id, component, amount_coins, amount_usd, host_salary_status, payee_role, created_at'
        )
        .eq('payee_user_id', hostId)
        .eq('payee_role', 'host')
        .order('created_at', { ascending: false })
        .limit(500);
      if (error) return sendError(500, error.message, 'HOST_EARNINGS_FAILED');

      const batchIds = Array.from(new Set((lines || []).map((l) => String(l.batch_id))));
      if (!batchIds.length) return sendOk({ periods: [] });

      const { data: batches, error: batchError } = await client
        .from('settlement_batches')
        .select('id, period_id, batch_kind, status')
        .in('id', batchIds);
      if (batchError) return sendError(500, batchError.message, 'HOST_EARNINGS_FAILED');

      const periodIds = Array.from(
        new Set(
          (batches || [])
            .map((b) => String(b.period_id))
            .filter((id) => id && (!periodIdFilter || id === periodIdFilter))
        )
      );
      if (!periodIds.length) return sendOk({ periods: [] });

      const { data: periods } = await client
        .from('settlement_periods')
        .select('id, cycle_type, period_start, period_end, status, closed_at')
        .in('id', periodIds)
        .order('period_start', { ascending: false });

      const batchById = new Map((batches || []).map((b) => [String(b.id), b]));

      const linesByPeriod = new Map();
      for (const line of lines || []) {
        const batch = batchById.get(String(line.batch_id));
        if (!batch) continue;
        const pid = String(batch.period_id);
        if (periodIdFilter && pid !== periodIdFilter) continue;
        const list = linesByPeriod.get(pid) || [];
        list.push(line);
        linesByPeriod.set(pid, list);
      }

      const result = (periods || [])
        .map((p) => {
          const pid = String(p.id);
          const periodLines = linesByPeriod.get(pid) || [];
          if (!periodLines.length) return null;
          const breakdown = summarizeHostSettlementLines(periodLines);
          const statuses = periodLines.map((l) =>
            normalizePayeeSalaryStatus(l.host_salary_status)
          );
          const salaryStatus = statuses.some((s) => s === 'pending')
            ? 'unpaid'
            : statuses.some((s) => s === 'admin_paid')
              ? 'admin_paid'
              : 'acknowledged';
          return {
            periodId: pid,
            cycleType: p.cycle_type,
            periodStart: p.period_start,
            periodEnd: p.period_end,
            periodStatus: p.status,
            closedAt: p.closed_at ?? null,
            salaryStatus,
            breakdown,
            hasTrueUp: breakdown.targetShareTrueUpCoins > 0 || breakdown.targetShareTrueUpUsd > 0,
          };
        })
        .filter(Boolean)
        .slice(0, limit);

      return sendOk({ periods: result });
    }

    // -----------------------------------------------------------------------
    // GET /earnings-overview — role-scoped Platform / TL / Host KPIs
    // -----------------------------------------------------------------------
    if (sub === 'earnings-overview' && method === 'GET') {
      const auth = await requireAuth(req);
      if (auth.ok === false) return jsonErr(auth.status, auth.error.message, auth.error.code);
      const client = requireDb(); if (!client) return sendError(503, "Finance backend unavailable", "NO_ADMIN");
      const scope = qstr(req, 'scope');
      if (scope !== 'platform' && scope !== 'tl' && scope !== 'host') {
        return sendError(400, 'scope must be platform|tl|host', 'INVALID_SCOPE');
      }
      const access = await resolveEarningsScopeAccess({
        scope,
        actorId: authProfileId(auth as AuthOk),
        actorRole: authRole(auth as AuthOk),
        userId: qstr(req, 'userId') || qstr(req, 'user_id') || null,
        teamLeaderId: qstr(req, 'teamLeaderId') || qstr(req, 'team_leader_id') || null,
      });
      if (access.ok === false) {
        return sendError(access.status, access.message, access.code);
      }
      const data = await buildEarningsOverview({
        scope: access.scope,
        userIds: access.userIds,
        teamLeaderId: access.teamLeaderId,
        client,
      });
      return sendOk( data);
    }

    // -----------------------------------------------------------------------
    // GET /earnings-ledger — week / month / lifetime ledger
    // -----------------------------------------------------------------------
    if (sub === 'earnings-ledger' && method === 'GET') {
      const auth = await requireAuth(req);
      if (auth.ok === false) return jsonErr(auth.status, auth.error.message, auth.error.code);
      const client = requireDb(); if (!client) return sendError(503, "Finance backend unavailable", "NO_ADMIN");
      const scope = qstr(req, 'scope');
      if (scope !== 'platform' && scope !== 'tl' && scope !== 'host') {
        return sendError(400, 'scope must be platform|tl|host', 'INVALID_SCOPE');
      }
      const mode = qstr(req, 'mode') || 'week';
      if (mode !== 'week' && mode !== 'month' && mode !== 'lifetime') {
        return sendError(400, 'mode must be week|month|lifetime', 'INVALID_MODE');
      }
      const groupBy = qstr(req, 'groupBy') === 'month' ? 'month' : 'week';
      const periodKey = qstr(req, 'periodKey') || qstr(req, 'period_key') || null;
      const limit = Math.min(Math.max(Number(qstr(req, 'limit')) || 200, 1), 500);
      const access = await resolveEarningsScopeAccess({
        scope,
        actorId: authProfileId(auth as AuthOk),
        actorRole: authRole(auth as AuthOk),
        userId: qstr(req, 'userId') || qstr(req, 'user_id') || null,
        teamLeaderId: qstr(req, 'teamLeaderId') || qstr(req, 'team_leader_id') || null,
      });
      if (access.ok === false) {
        return sendError(access.status, access.message, access.code);
      }
      try {
        const data = await buildEarningsLedger({
          scope: access.scope,
          userIds: access.userIds,
          mode,
          groupBy,
          periodKey,
          limit,
          client,
        });
        return sendOk( data);
      } catch (err) {
        if (err && err.code === 'INVALID_PERIOD_KEY') {
          return sendError(400, err.message || 'Invalid periodKey', 'INVALID_PERIOD_KEY');
        }
        throw err;
      }
    }

    
    return jsonErr(404, 'Finance route not found', 'NOT_FOUND', { path: sub });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Finance request failed';
    console.error('[financeDispatch]', err);
    return sendError(500, message, 'FINANCE_ERROR');
  }
}
