/**
 * HOST TARGET TRUE-UP — Phase 6 QA matrix (pure unit coverage).
 * Run: npx tsx --test shared/finance/phase6.trueup.qa.test.ts
 * Or: npm run test:finance
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  computeCallMinuteSplit,
  resolveCallHostSharePercent,
  hasMetCreatorPeriodTarget,
} from './economyBurn.ts';
import { computeGiftCoinSplit } from './economyGift.ts';
import {
  computeHostShareTrueUpCoins,
  shouldSkipHostShareTrueUp,
  targetShareTrueUpCallId,
} from './hostShareTrueUp.ts';
import { getHostPeriodTargetProgress } from './hostPeriodTargetProgress.ts';
import { coinsToUsd } from './fx.ts';
import {
  DEFAULT_TARGET_THRESHOLDS,
  computePerformanceTier,
  targetBonusUsdForTier,
} from './targetBonus.ts';
import { summarizeHostSettlementLines } from './hostEarningsBreakdown.ts';
import { planHostShareTrueUps } from '../../server/finance/hostShareTrueUp.ts';
import { buildSettlementBatches } from '../../server/finance/settlement.ts';

const BRONZE = DEFAULT_TARGET_THRESHOLDS;
const PEG = 0.01;
const BASE = 30;
const TARGET = 40;
const TL = 10;
/** Matrix #6: burn 120 @ base 30 / target 40 */
const BURN = 120;

function emptyAgg(hostId: string, burn: number, earn: number, alreadyTrueUp = 0) {
  return new Map([
    [
      hostId,
      {
        hostId,
        periodEligibleCallBurn: burn,
        periodHostCallEarn: earn,
        alreadyTrueUpCoins: alreadyTrueUp,
      },
    ],
  ]);
}

describe('Phase 6 QA — HOST TARGET TRUE-UP matrix', () => {
  it('1) never hits target → true-up 0; no bronze+ cash bonus gate', () => {
    const hostId = 'h_miss';
    const plans = planHostShareTrueUps({
      hostIds: [hostId],
      aggByHost: emptyAgg(hostId, 10_000, 3_000),
      metricsByCreator: new Map([[hostId, { hours: 5, coins: 100 }]]),
      overrideByHost: new Map([[hostId, 0]]),
      thresholds: BRONZE,
      targetSharePercent: TARGET,
    });
    assert.equal(plans[0]!.targetMet, false);
    assert.equal(plans[0]!.trueUpCoins, 0);

    // Tier cash bonus: below bronze → no bonus USD (closePeriod rule)
    const metBronze =
      5 >= BRONZE.bronzeHours && 100 >= BRONZE.bronzeCoins;
    assert.equal(metBronze, false);
    assert.equal(hasMetCreatorPeriodTarget(5, 100, BRONZE), false);
  });

  it('2) hits target → true-up ≈ (target%−base%)×call burn; minutes not rewritten', () => {
    const hostId = 'h_hit';
    const periodBurn = BURN * 10; // 10 live minutes already posted at base
    const already = Math.round(periodBurn * (BASE / 100)); // 360
    const expectedTrueUp = Math.round(periodBurn * (TARGET / 100)) - already; // 120
    assert.equal(expectedTrueUp, Math.round(periodBurn * ((TARGET - BASE) / 100)));

    const plans = planHostShareTrueUps({
      hostIds: [hostId],
      aggByHost: emptyAgg(hostId, periodBurn, already),
      metricsByCreator: new Map([
        [hostId, { hours: BRONZE.bronzeHours, coins: BRONZE.bronzeCoins }],
      ]),
      overrideByHost: new Map([[hostId, null]]),
      thresholds: BRONZE,
      targetSharePercent: TARGET,
    });
    assert.equal(plans[0]!.targetMet, true);
    assert.equal(plans[0]!.trueUpCoins, expectedTrueUp);

    // Append-only: live minutes always BASE even after targetMet; true-up is separate call_id
    const live = computeCallMinuteSplit({
      coinsBurned: BURN,
      hostSharePercent: BASE,
      tlSharePercent: TL,
      hasTeamLeader: true,
      targetMet: true,
    });
    assert.equal(live.hostCoins, Math.round(BURN * (BASE / 100)));
    assert.equal(targetShareTrueUpCallId('period_x'), 'target_share_trueup:period_x');
    assert.notEqual(targetShareTrueUpCallId('period_x'), 'some_live_call_id');
  });

  it('3) TL earnings = static % of burn; no TL true-up line', () => {
    const miss = computeCallMinuteSplit({
      coinsBurned: BURN,
      hostSharePercent: BASE,
      tlSharePercent: TL,
      hasTeamLeader: true,
      targetMet: false,
    });
    const hit = computeCallMinuteSplit({
      coinsBurned: BURN,
      hostSharePercent: BASE,
      tlSharePercent: TL,
      hasTeamLeader: true,
      targetMet: true,
    });
    assert.equal(miss.tlCoins, Math.round(BURN * (TL / 100)));
    assert.equal(hit.tlCoins, miss.tlCoins);

    const batches = buildSettlementBatches({
      fxRatio: PEG,
      accruals: [
        {
          userId: 'host',
          teamLeaderId: 'tl',
          role: 'host',
          callEarningsCoins: 36,
          targetShareTrueUpCoins: 12,
        },
        { userId: 'tl', role: 'team_leader', tlCommissionCoins: 12 },
      ],
    });
    const bundle = batches.find((b) => b.batchKind === 'team_leader_bundle');
    assert.ok(bundle);
    assert.equal(
      bundle!.lineItems.filter((l) => l.component === 'tl_commission').length,
      1
    );
    assert.equal(
      bundle!.lineItems.some((l) => l.payeeRole === 'team_leader' && l.component === 'target_share_trueup'),
      false
    );
    assert.equal(bundle!.totalTlCommissionCoins, 12);
  });

  it('4) gift-heavy host: gift HOST_EARN unchanged; true-up ignores gift volume', () => {
    const gift = computeGiftCoinSplit({
      giftCost: 500,
      hostSharePercent: 70,
      tlSharePercent: 10,
      hasTeamLeader: true,
    });
    assert.equal(gift.hostCoins, 350);
    assert.equal(gift.tlCoins, 50);

    // Eligible burn is CALL only (1000); gift 5000 volume must not inflate true-up
    const hostId = 'h_gift';
    const callBurn = 1000;
    const callEarn = 300;
    const plans = planHostShareTrueUps({
      hostIds: [hostId],
      aggByHost: emptyAgg(hostId, callBurn, callEarn),
      metricsByCreator: new Map([
        [hostId, { hours: BRONZE.bronzeHours, coins: BRONZE.bronzeCoins + 50_000 }],
      ]),
      overrideByHost: new Map(),
      thresholds: BRONZE,
      targetSharePercent: TARGET,
    });
    assert.equal(plans[0]!.trueUpCoins, computeHostShareTrueUpCoins({
      periodEligibleCallBurn: callBurn,
      periodHostCallEarnCoinsAlready: callEarn,
      targetSharePercent: TARGET,
    }));
    assert.equal(plans[0]!.trueUpCoins, 100);
    // Gift earn stays on its own settlement component
    const rollup = summarizeHostSettlementLines([
      { component: 'call_earnings', amountCoins: callEarn, amountUsd: 3 },
      { component: 'gift_earnings', amountCoins: gift.hostCoins, amountUsd: 3.5 },
      { component: 'target_share_trueup', amountCoins: 100, amountUsd: 1 },
    ]);
    assert.equal(rollup.giftEarningsCoins, gift.hostCoins);
    assert.equal(rollup.targetShareTrueUpCoins, 100);
  });

  it('5) override host: no share true-up', () => {
    assert.equal(shouldSkipHostShareTrueUp(15), true);
    const hostId = 'h_ovr';
    const plans = planHostShareTrueUps({
      hostIds: [hostId],
      aggByHost: emptyAgg(hostId, 10_000, 3_000),
      metricsByCreator: new Map([
        [hostId, { hours: BRONZE.bronzeHours, coins: BRONZE.bronzeCoins }],
      ]),
      overrideByHost: new Map([[hostId, 50]]),
      thresholds: BRONZE,
      targetSharePercent: TARGET,
    });
    assert.equal(plans[0]!.skippedOverride, true);
    assert.equal(plans[0]!.trueUpCoins, 0);
  });

  it('6) base 30 / target 40 / burn 120 — hand-calc matches ledger + settlement', () => {
    const live = computeCallMinuteSplit({
      coinsBurned: BURN,
      hostSharePercent: BASE,
      tlSharePercent: TL,
      hasTeamLeader: true,
      targetMet: false,
    });
    assert.equal(live.hostCoins, 36);
    assert.equal(live.tlCoins, 12);
    assert.equal(live.platformCoins, 72);

    const trueUp = computeHostShareTrueUpCoins({
      periodEligibleCallBurn: BURN,
      periodHostCallEarnCoinsAlready: live.hostCoins,
      targetSharePercent: TARGET,
    });
    assert.equal(trueUp, 12); // 48 − 36

    const hostId = 'h_calc';
    const plans = planHostShareTrueUps({
      hostIds: [hostId],
      aggByHost: emptyAgg(hostId, BURN, live.hostCoins),
      metricsByCreator: new Map([
        [hostId, { hours: BRONZE.bronzeHours, coins: BRONZE.bronzeCoins }],
      ]),
      overrideByHost: new Map(),
      thresholds: BRONZE,
      targetSharePercent: TARGET,
    });
    assert.equal(plans[0]!.trueUpCoins, 12);

    const batches = buildSettlementBatches({
      fxRatio: PEG,
      accruals: [
        {
          userId: hostId,
          role: 'host',
          callEarningsCoins: live.hostCoins,
          targetShareTrueUpCoins: trueUp,
          targetBonusCoins: 0,
          targetBonusUsd: 0,
        },
      ],
    });
    const direct = batches.find((b) => b.batchKind === 'direct_host');
    assert.ok(direct);
    assert.equal(direct!.totalHostSalaryCoins, 36 + 12);
    assert.equal(direct!.totalDueUsd, coinsToUsd(48, PEG));
    const lines = summarizeHostSettlementLines(direct!.lineItems);
    assert.equal(lines.callEarningsCoins, 36);
    assert.equal(lines.targetShareTrueUpCoins, 12);
    assert.equal(lines.totalCoins, 48);
    assert.equal(lines.totalUsd, 0.48);
  });

  it('7) second close: no duplicate true-up (already posted)', () => {
    const hostId = 'h_idem';
    const plans = planHostShareTrueUps({
      hostIds: [hostId],
      aggByHost: emptyAgg(hostId, BURN, 36, /* alreadyTrueUp */ 12),
      metricsByCreator: new Map([
        [hostId, { hours: BRONZE.bronzeHours, coins: BRONZE.bronzeCoins }],
      ]),
      overrideByHost: new Map(),
      thresholds: BRONZE,
      targetSharePercent: TARGET,
    });
    assert.equal(plans[0]!.skippedAlreadyPosted, true);
    assert.equal(plans[0]!.trueUpCoins, 0);
  });

  it('8) progress bar 100% when metrics cross bronze; admin + host agree', () => {
    const metrics = {
      activeOnlineHours: BRONZE.bronzeHours,
      totalTargetCoins: BRONZE.bronzeCoins,
    };
    const settings = {
      creator_target_bronze_hours: BRONZE.bronzeHours,
      creator_target_bronze_coins: BRONZE.bronzeCoins,
      female_host_share_percent: BASE,
      female_host_target_share_percent: TARGET,
    };
    const hostView = getHostPeriodTargetProgress({
      creatorId: 'same_host',
      metrics,
      systemSettings: settings,
    });
    const adminView = getHostPeriodTargetProgress({
      creatorId: 'same_host',
      periodHours: BRONZE.bronzeHours,
      periodCoins: BRONZE.bronzeCoins,
      systemSettings: settings,
    });
    assert.equal(hostView.pctHours, 100);
    assert.equal(hostView.pctCoins, 100);
    assert.equal(hostView.targetMet, true);
    assert.equal(adminView.targetMet, hostView.targetMet);
    assert.equal(adminView.pctHours, hostView.pctHours);
    assert.equal(adminView.pctCoins, hostView.pctCoins);
    assert.equal(hasMetCreatorPeriodTarget(hostView.periodHours, hostView.periodCoins, BRONZE), true);
  });

  it('9) Finance amount to pay host = (call + true-up + bonus coins) × peg', () => {
    const call = 36;
    const trueUp = 12;
    const bonusUsd = targetBonusUsdForTier('bronze', BRONZE); // 15
    const bonusCoins = Math.round(bonusUsd / PEG); // 1500 at peg 0.01
    const batches = buildSettlementBatches({
      fxRatio: PEG,
      accruals: [
        {
          userId: 'h_pay',
          role: 'host',
          callEarningsCoins: call,
          targetShareTrueUpCoins: trueUp,
          targetBonusCoins: bonusCoins,
          targetBonusUsd: bonusUsd,
        },
      ],
    });
    const direct = batches.find((b) => b.batchKind === 'direct_host')!;
    const salaryCoins = call + trueUp + bonusCoins;
    assert.equal(direct.totalHostSalaryCoins, salaryCoins);
    // Payable USD: call+true-up via peg; bonus uses explicit USD
    const expectedUsd =
      coinsToUsd(call, PEG) + coinsToUsd(trueUp, PEG) + bonusUsd;
    assert.equal(direct.totalDueUsd, expectedUsd);
    const rollup = summarizeHostSettlementLines(direct.lineItems);
    assert.equal(rollup.totalUsd, expectedUsd);
  });

  it('10) new period after close: live burns again at base %', () => {
    // Even if host already met bronze (as if prior period), live share stays BASE
    assert.equal(
      resolveCallHostSharePercent({
        targetMet: true,
        baseSharePercent: BASE,
        targetSharePercent: TARGET,
      }),
      BASE
    );
    const split = computeCallMinuteSplit({
      coinsBurned: BURN,
      hostSharePercent: resolveCallHostSharePercent({
        targetMet: true,
        baseSharePercent: BASE,
        targetSharePercent: TARGET,
      }),
      tlSharePercent: TL,
      hasTeamLeader: true,
      targetMet: true,
    });
    assert.equal(split.hostSharePercentApplied, BASE);
    assert.equal(split.hostCoins, 36);
    assert.equal(computePerformanceTier(0, 0, BRONZE), 'bronze');
  });
});
