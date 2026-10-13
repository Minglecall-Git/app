/**
 * Fixed Peg / Economy — Phase 7 verification (pure unit coverage).
 * Run: npx tsx --test shared/finance/phase7.verification.test.ts
 * Or: npm run test:finance
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  coinsToUsd,
  getCoinUsdPeg,
  DEFAULT_COIN_USD_PEG,
} from './fx.ts';
import {
  computeCallMinuteSplit,
  resolveCallHostSharePercent,
  resolveEconomyBurnRates,
  DEFAULT_COIN_BURN_RATE_PER_MIN,
  DEFAULT_COIN_BURN_RATE_FRIEND_PER_MIN,
  DEFAULT_FEMALE_HOST_SHARE_PERCENT,
  DEFAULT_TEAM_LEADER_SHARE_PERCENT,
} from './economyBurn.ts';
import {
  computeGiftCoinSplit,
  resolveEconomyGiftShares,
  DEFAULT_GIFT_FEMALE_HOST_SHARE_PERCENT,
  DEFAULT_GIFT_TEAM_LEADER_SHARE_PERCENT,
} from './economyGift.ts';
import { getHostPeriodTargetProgress } from './hostPeriodTargetProgress.ts';
import { summarizeHostSettlementLines } from './hostEarningsBreakdown.ts';
import { DEFAULT_TARGET_THRESHOLDS } from './targetBonus.ts';
import {
  computeHostShareTrueUpCoins,
  shouldSkipHostShareTrueUp,
} from './hostShareTrueUp.ts';
import { freezeFinanceConfigSnapshot } from '../../server/finance/configSnapshot.ts';
import type { FinanceSystemConfig } from '../../server/finance/config.ts';
import { buildSettlementBatches } from '../../server/finance/settlement.ts';

/** Display FX only — mirrors taxonomies AED rate (not coin peg). */
const AED_RATE_FROM_USD = 3.6725;

function packageLoadMargin(amountCoins: number, amountUsd: number, peg: number) {
  const pegValueUsd = coinsToUsd(amountCoins, peg);
  return Math.round((amountUsd - pegValueUsd) * 1e6) / 1e6;
}

describe('Phase 7 — economy resolve + defaults', () => {
  it('loads peg / burn / shares from config keys (camel + snake)', () => {
    const burn = resolveEconomyBurnRates({
      coin_usd_peg: 0.005,
      coin_burn_rate_per_min: 150,
      coinBurnRateFriendPerMin: 90,
      female_host_share_percent: 45,
      femaleHostTargetSharePercent: 55,
      team_leader_share_percent: 12,
    });
    assert.equal(burn.coinBurnRatePerMin, 150);
    assert.equal(burn.coinBurnRateFriendPerMin, 90);
    assert.equal(burn.femaleHostSharePercent, 45);
    assert.equal(burn.femaleHostTargetSharePercent, 55);
    assert.equal(burn.teamLeaderSharePercent, 12);
    assert.equal(getCoinUsdPeg({ coin_usd_peg: 0.005 }), 0.005);

    const gifts = resolveEconomyGiftShares({
      giftFemaleHostSharePercent: 65,
      gift_team_leader_share_percent: 8,
    });
    assert.equal(gifts.giftFemaleHostSharePercent, 65);
    assert.equal(gifts.giftTeamLeaderSharePercent, 8);
  });

  it('falls back to schema defaults only when missing', () => {
    const burn = resolveEconomyBurnRates({});
    assert.equal(burn.coinBurnRatePerMin, DEFAULT_COIN_BURN_RATE_PER_MIN);
    assert.equal(burn.coinBurnRateFriendPerMin, DEFAULT_COIN_BURN_RATE_FRIEND_PER_MIN);
    assert.equal(burn.femaleHostSharePercent, DEFAULT_FEMALE_HOST_SHARE_PERCENT);
    assert.equal(burn.teamLeaderSharePercent, DEFAULT_TEAM_LEADER_SHARE_PERCENT);
    assert.equal(getCoinUsdPeg({}), DEFAULT_COIN_USD_PEG);
    const gifts = resolveEconomyGiftShares({});
    assert.equal(gifts.giftFemaleHostSharePercent, DEFAULT_GIFT_FEMALE_HOST_SHARE_PERCENT);
    assert.equal(gifts.giftTeamLeaderSharePercent, DEFAULT_GIFT_TEAM_LEADER_SHARE_PERCENT);
  });
});

describe('Phase 7 — non-friend / friend call minute splits', () => {
  it('non-friend: burn×shares; USD = coins×peg', () => {
    const peg = 0.003;
    const rates = resolveEconomyBurnRates({
      coin_burn_rate_per_min: 120,
      female_host_share_percent: 30,
      team_leader_share_percent: 10,
    });
    const split = computeCallMinuteSplit({
      coinsBurned: rates.coinBurnRatePerMin,
      hostSharePercent: rates.femaleHostSharePercent,
      tlSharePercent: rates.teamLeaderSharePercent,
      hasTeamLeader: true,
      targetMet: false,
    });
    assert.equal(split.coinsBurned, 120);
    assert.equal(split.hostCoins, 36);
    assert.equal(split.tlCoins, 12);
    assert.equal(split.platformCoins, 72);
    assert.equal(coinsToUsd(split.coinsBurned, peg), 0.36);
    assert.equal(coinsToUsd(split.hostCoins, peg), 0.108);
  });

  it('friend: uses friend burn rate', () => {
    const rates = resolveEconomyBurnRates({
      coin_burn_rate_per_min: 120,
      coin_burn_rate_friend_per_min: 80,
      female_host_share_percent: 30,
      team_leader_share_percent: 10,
    });
    const split = computeCallMinuteSplit({
      coinsBurned: rates.coinBurnRateFriendPerMin,
      hostSharePercent: rates.femaleHostSharePercent,
      tlSharePercent: rates.teamLeaderSharePercent,
      hasTeamLeader: true,
    });
    assert.equal(split.coinsBurned, 80);
    assert.equal(split.hostCoins, 24);
    assert.equal(split.tlCoins, 8);
    assert.equal(split.platformCoins, 48);
  });

  it('targetMet does not raise live host % — always base (true-up is period-end)', () => {
    const base = 30;
    const target = 40;
    const applied = resolveCallHostSharePercent({
      targetMet: true,
      baseSharePercent: base,
      targetSharePercent: target,
    });
    assert.equal(applied, 30);
    const split = computeCallMinuteSplit({
      coinsBurned: 100,
      hostSharePercent: applied,
      tlSharePercent: 10,
      hasTeamLeader: true,
      targetMet: true,
    });
    assert.equal(split.hostCoins, 30);
    assert.equal(split.tlCoins, 10);
    assert.equal(split.targetMet, true);
    assert.equal(split.hostSharePercentApplied, 30);
  });

  it('host already above bronze still earns base % on new minutes', () => {
    const rates = resolveEconomyBurnRates({
      coin_burn_rate_per_min: 120,
      female_host_share_percent: 30,
      female_host_target_share_percent: 40,
      team_leader_share_percent: 10,
    });
    // Metrics already above bronze — targetMet true mid-period
    const targetMet = true;
    const hostPct = resolveCallHostSharePercent({
      targetMet,
      baseSharePercent: rates.femaleHostSharePercent,
      targetSharePercent: rates.femaleHostTargetSharePercent,
    });
    assert.equal(hostPct, 30);
    const split = computeCallMinuteSplit({
      coinsBurned: rates.coinBurnRatePerMin,
      hostSharePercent: hostPct,
      tlSharePercent: rates.teamLeaderSharePercent,
      hasTeamLeader: true,
      targetMet,
    });
    assert.equal(split.hostCoins, 36); // 120 × 30%
    assert.notEqual(split.hostCoins, 48); // would be 120 × 40% if mid-period target applied
  });
});

describe('Phase 7 — gift split', () => {
  it('debits gift cost; host/TL/platform shares; catalog price untouched', () => {
    const catalogCoinCost = 500;
    const shares = resolveEconomyGiftShares({
      gift_female_host_share_percent: 70,
      gift_team_leader_share_percent: 10,
    });
    const split = computeGiftCoinSplit({
      giftCost: catalogCoinCost,
      hostSharePercent: shares.giftFemaleHostSharePercent,
      tlSharePercent: shares.giftTeamLeaderSharePercent,
      hasTeamLeader: true,
    });
    assert.equal(split.giftCost, 500);
    assert.equal(split.hostCoins, 350);
    assert.equal(split.tlCoins, 50);
    assert.equal(split.platformCoins, 100);
    // Catalog SKU price is input — split does not mutate it
    assert.equal(catalogCoinCost, 500);
  });
});

describe('Phase 7 — package margin vs peg', () => {
  it('load margin = paid USD − (coins × peg)', () => {
    const peg = 0.003;
    const coins = 1000;
    const paid = 4.99;
    const pegValue = coinsToUsd(coins, peg);
    assert.equal(pegValue, 3);
    assert.equal(packageLoadMargin(coins, paid, peg), 1.99);
  });
});

describe('Phase 7 — period close snapshot under peg', () => {
  it('freezeFinanceConfigSnapshot includes peg, burns, call+gift shares', () => {
    const burn = resolveEconomyBurnRates({
      coin_burn_rate_per_min: 130,
      coin_burn_rate_friend_per_min: 70,
      female_host_share_percent: 42,
      female_host_target_share_percent: 52,
      team_leader_share_percent: 11,
    });
    const config = {
      coinUsdPeg: 0.004,
      femalePayoutRatioUsd: 0.004,
      coinToUsdRatio: 0.004,
      settlementEnabled: true,
      periodCloseUtcTime: '18:00',
      creatorTargetCycle: 'weekly',
      burn,
      raw: {
        gift_female_host_share_percent: 68,
        gift_team_leader_share_percent: 9,
      },
      thresholds: {
        bronzeHours: 10,
        bronzeCoins: 1000,
        bronzeBonusUsd: 5,
        silverHours: 20,
        silverCoins: 2000,
        silverBonusUsd: 15,
        goldHours: 40,
        goldCoins: 5000,
        goldBonusUsd: 40,
      },
    } as FinanceSystemConfig;

    const snap = freezeFinanceConfigSnapshot(config, { includeFrozenAt: true });
    assert.equal(snap.coin_usd_peg, 0.004);
    assert.equal(snap.female_payout_ratio_usd, 0.004);
    assert.equal(snap.coin_to_usd_ratio, 0.004);
    assert.equal(snap.coin_burn_rate_per_min, 130);
    assert.equal(snap.coin_burn_rate_friend_per_min, 70);
    assert.equal(snap.female_host_share_percent, 42);
    assert.equal(snap.female_host_target_share_percent, 52);
    assert.equal(snap.team_leader_share_percent, 11);
    assert.equal(snap.gift_female_host_share_percent, 68);
    assert.equal(snap.gift_team_leader_share_percent, 9);
    assert.ok(snap.frozen_at);

    // Close USD under peg
    const platformCoins = 60;
    assert.equal(coinsToUsd(platformCoins, snap.coin_usd_peg), 0.24);
  });
});

describe('Phase 7 — store AED display (FX only)', () => {
  it('AED label from USD package price × display rate', () => {
    const usd = 4.99;
    const aed = Math.round(usd * AED_RATE_FROM_USD * 100) / 100;
    assert.equal(aed, 18.33);
    assert.notEqual(AED_RATE_FROM_USD, DEFAULT_COIN_USD_PEG);
  });
});

describe('Phase 2 — host period bronze target progress', () => {
  it('pctHours/pctCoins vs Creator Ops bronze; targetMet matches hasMet gate', () => {
    const progress = getHostPeriodTargetProgress({
      creatorId: 'host-1',
      periodHours: 10,
      periodCoins: 2500,
      systemSettings: {
        creator_target_bronze_hours: 20,
        creator_target_bronze_coins: 5000,
        female_host_share_percent: 30,
        female_host_target_share_percent: 40,
      },
    });
    assert.equal(progress.bronzeHours, 20);
    assert.equal(progress.bronzeCoins, 5000);
    assert.equal(progress.pctHours, 50);
    assert.equal(progress.pctCoins, 50);
    assert.equal(progress.targetMet, false);
    assert.equal(progress.baseSharePercent, 30);
    assert.equal(progress.targetSharePercent, 40);
  });

  it('targetMet true when hours AND coins meet bronze defaults', () => {
    const progress = getHostPeriodTargetProgress({
      creatorId: 'host-2',
      metrics: {
        activeOnlineHours: DEFAULT_TARGET_THRESHOLDS.bronzeHours,
        totalTargetCoins: DEFAULT_TARGET_THRESHOLDS.bronzeCoins,
      },
      systemSettings: {},
    });
    assert.equal(progress.targetMet, true);
    assert.equal(progress.pctHours, 100);
    assert.equal(progress.pctCoins, 100);
  });

  it('estimatedTrueUpPreview from eligible burn; override forces 0', () => {
    const withEstimate = getHostPeriodTargetProgress({
      creatorId: 'host-3',
      periodHours: 25,
      periodCoins: 6000,
      systemSettings: {
        female_host_share_percent: 30,
        female_host_target_share_percent: 40,
      },
      periodEligibleCallBurnCoins: 1000,
      periodHostCallEarnCoinsAlready: 300, // already at base 30%
    });
    // round(1000*40/100) - 300 = 100
    assert.equal(withEstimate.estimatedTrueUpPreview, 100);
    assert.equal(withEstimate.trueUpSkippedDueToOverride, false);

    const skipped = getHostPeriodTargetProgress({
      creatorId: 'host-3',
      periodHours: 25,
      periodCoins: 6000,
      systemSettings: {
        female_host_target_share_percent: 40,
      },
      periodEligibleCallBurnCoins: 1000,
      periodHostCallEarnCoinsAlready: 300,
      coinEarnOverrideRate: 50,
    });
    assert.equal(skipped.trueUpSkippedDueToOverride, true);
    assert.equal(skipped.estimatedTrueUpPreview, 0);
  });

  it('estimatedTrueUpPreview is 0 when bronze target not met (same as close)', () => {
    const progress = getHostPeriodTargetProgress({
      creatorId: 'host-4',
      periodHours: 1,
      periodCoins: 10,
      systemSettings: {
        female_host_target_share_percent: 40,
      },
      periodEligibleCallBurnCoins: 10000,
      periodHostCallEarnCoinsAlready: 3000,
    });
    assert.equal(progress.targetMet, false);
    assert.equal(progress.estimatedTrueUpPreview, 0);
  });
});

describe('Phase 3 — host share true-up math', () => {
  it('burn 10000 base credited 3000 target 40% → trueUp 1000', () => {
    const trueUp = computeHostShareTrueUpCoins({
      periodEligibleCallBurn: 10000,
      periodHostCallEarnCoinsAlready: 3000,
      targetSharePercent: 40,
    });
    assert.equal(trueUp, 1000);
  });

  it('target not met path: caller should pass 0 (math alone still computes gap)', () => {
    // Pure math always returns gap; closePeriod gates on targetMet / override
    assert.equal(
      computeHostShareTrueUpCoins({
        periodEligibleCallBurn: 10000,
        periodHostCallEarnCoinsAlready: 4000,
        targetSharePercent: 40,
      }),
      0
    );
  });

  it('override skip rule: profile override > 0', () => {
    assert.equal(shouldSkipHostShareTrueUp(50), true);
    assert.equal(shouldSkipHostShareTrueUp(0), false);
    assert.equal(shouldSkipHostShareTrueUp(null), false);
  });

  it('settlement batch includes target_share_trueup in host salary; TL unchanged', () => {
    const batches = buildSettlementBatches({
      fxRatio: 0.01,
      accruals: [
        {
          userId: 'host_a',
          teamLeaderId: 'tl_1',
          role: 'host',
          callEarningsCoins: 3000,
          targetShareTrueUpCoins: 1000,
          targetBonusCoins: 0,
          targetBonusUsd: 15,
        },
        { userId: 'tl_1', role: 'team_leader', tlCommissionCoins: 1000 },
      ],
    });
    const bundle = batches.find((b) => b.batchKind === 'team_leader_bundle');
    assert.ok(bundle);
    const trueUpLine = bundle!.lineItems.find((l) => l.component === 'target_share_trueup');
    assert.ok(trueUpLine);
    assert.equal(trueUpLine!.amountCoins, 1000);
    assert.equal(bundle!.totalTlCommissionCoins, 1000);
    assert.equal(bundle!.totalHostSalaryCoins, 3000 + 1000);
  });
});

describe('host earnings breakdown (Phase 4)', () => {
  it('settlement lines roll up call / true-up / bonus separately', () => {
    const b = summarizeHostSettlementLines([
      { component: 'call_earnings', amountCoins: 3000, amountUsd: 3 },
      { component: 'target_share_trueup', amountCoins: 1000, amountUsd: 1 },
      { component: 'target_bonus', amountCoins: 0, amountUsd: 15 },
      { component: 'gift_earnings', amountCoins: 200, amountUsd: 0.2 },
    ]);
    assert.equal(b.callEarningsCoins, 3000);
    assert.equal(b.targetShareTrueUpCoins, 1000);
    assert.equal(b.targetBonusUsd, 15);
    assert.equal(b.giftEarningsCoins, 200);
    assert.equal(b.totalCoins, 4200);
    assert.equal(b.totalUsd, 19.2);
  });
});
