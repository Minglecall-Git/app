import React, { useState, useEffect } from 'react';
import { useApp } from '../../context/AppContext';
import {
  Crown,
  Award,
  TrendingUp,
  Clock,
  Coins,
  DollarSign,
  Save,
  Flame,
  Zap,
  Calendar,
  Sparkles,
  ShieldCheck,
  HelpCircle,
  Info,
  CheckCircle2,
  AlertTriangle,
  Sliders,
  Wallet,
  ArrowUpRight,
  Layers,
  Activity,
  BarChart3,
  Users,
} from 'lucide-react';
import { AdminRotationalPriorityMatrix } from './AdminRotationalPriorityMatrix';
import { AdminCreatorPerformanceAnalytics } from './AdminCreatorPerformanceAnalytics';
import { patchFinanceConfig } from '../../services/financeApi';

type CreatorOpsSubView = 'analytics' | 'matrix' | 'targets';

interface AdminCreatorTargetConfigProps {
  activeSubView?: CreatorOpsSubView;
  onSubViewChange?: (view: CreatorOpsSubView) => void;
  navPlacement?: 'inline' | 'sidebar';
}

export const AdminCreatorTargetConfig: React.FC<AdminCreatorTargetConfigProps> = ({
  activeSubView: activeSubViewProp,
  onSubViewChange,
  navPlacement = 'inline',
}) => {
  const { systemSettings, updateSystemSettings, showToast } = useApp();

  const [activeSubViewInternal, setActiveSubViewInternal] = useState<CreatorOpsSubView>('analytics');
  const activeSubView = activeSubViewProp ?? activeSubViewInternal;
  const setActiveSubView = (view: CreatorOpsSubView) => {
    onSubViewChange?.(view);
    if (activeSubViewProp === undefined) setActiveSubViewInternal(view);
  };

  useEffect(() => {
    const handler = (ev: Event) => {
      const detail = (ev as CustomEvent).detail as { creatorOpsView?: string } | undefined;
      if (detail?.creatorOpsView === 'targets') {
        setActiveSubView('targets');
      }
    };
    window.addEventListener('minglecall:admin-navigate', handler as EventListener);
    return () => window.removeEventListener('minglecall:admin-navigate', handler as EventListener);
  }, [activeSubViewProp, onSubViewChange]);

  const [formData, setFormData] = useState({
    creatorTargetCycle: systemSettings.creatorTargetCycle || 'weekly',
    periodCloseUtcTime: systemSettings.periodCloseUtcTime || '00:00',
    creatorTargetBronzeHours: systemSettings.creatorTargetBronzeHours ?? 20,
    creatorTargetBronzeCoins: systemSettings.creatorTargetBronzeCoins ?? 5000,
    creatorTargetBronzeBonusUSD: systemSettings.creatorTargetBronzeBonusUSD ?? 15,
    creatorTargetSilverHours: systemSettings.creatorTargetSilverHours ?? 40,
    creatorTargetSilverCoins: systemSettings.creatorTargetSilverCoins ?? 20000,
    creatorTargetSilverBonusUSD: systemSettings.creatorTargetSilverBonusUSD ?? 50,
    creatorTargetGoldHours: systemSettings.creatorTargetGoldHours ?? 60,
    creatorTargetGoldCoins: systemSettings.creatorTargetGoldCoins ?? 60000,
    creatorTargetGoldBonusUSD: systemSettings.creatorTargetGoldBonusUSD ?? 150,
    peakHoursStart: systemSettings.peakHoursStart || '18:00',
    peakHoursEnd: systemSettings.peakHoursEnd || '00:00',
    peakHoursEnabled: systemSettings.peakHoursEnabled ?? true,
    callRingTimeoutSeconds: systemSettings.callRingTimeoutSeconds ?? 30,
    dailyFirstCallBonusCoins: systemSettings.dailyFirstCallBonusCoins ?? 100,
    dailyFirstCallBonusUSD: systemSettings.dailyFirstCallBonusUSD ?? 1.00,
    dailyFirstCallMinDurationSec: systemSettings.dailyFirstCallMinDurationSec ?? 30,
    streakTargetDays: systemSettings.streakTargetDays ?? 7,
    streakBoostDurationDays: systemSettings.streakBoostDurationDays ?? 3,
    minDailyActiveHoursForStreak: systemSettings.minDailyActiveHoursForStreak ?? 2,
  });

  const [isSaving, setIsSaving] = useState(false);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    try {
      updateSystemSettings(formData);
      // Keep Financial Module period clock in sync (source of truth for close job)
      const financePatch = await patchFinanceConfig({
        creatorTargetCycle: formData.creatorTargetCycle,
        periodCloseUtcTime: formData.periodCloseUtcTime,
      });
      if (!financePatch.success) {
        showToast(
          'Targets saved; finance clock warning',
          financePatch.error?.message || 'Could not sync period_close_utc_time via Finance API.',
          'error'
        );
      } else {
        showToast(
          'Settings Saved 🎯',
          'Creator targets saved. Period cycle & UTC close time synced to Financial Module.',
          'success'
        );
      }
    } catch (err: any) {
      showToast('Save Error', err.message || 'Failed to update target configurations.', 'error');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* 3-Way Sub-Navigation — hidden when AdminShell sidebar owns L2 */}
      {navPlacement !== 'sidebar' ? (
        <div className="bg-[#12151F] border border-slate-800 rounded-2xl p-2 flex flex-wrap items-center justify-between gap-2 shadow-lg">
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => setActiveSubView('analytics')}
              className={`px-4 py-2.5 rounded-xl text-xs font-mono font-bold transition-all flex items-center space-x-2 cursor-pointer ${
                activeSubView === 'analytics'
                  ? 'bg-gradient-to-r from-amber-500 via-orange-500 to-yellow-500 text-slate-950 shadow-lg shadow-amber-950/60 font-black ring-1 ring-amber-300'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
              }`}
            >
              <BarChart3 className="w-4 h-4 text-slate-950" />
              <span>Creator Performance & Intelligence</span>
              <span className="px-1.5 py-0.2 rounded-full bg-slate-950 text-amber-300 text-[10px] font-mono">
                ANALYTICS
              </span>
            </button>

            <button
              onClick={() => setActiveSubView('matrix')}
              className={`px-4 py-2.5 rounded-xl text-xs font-mono font-bold transition-all flex items-center space-x-2 cursor-pointer ${
                activeSubView === 'matrix'
                  ? 'bg-gradient-to-r from-indigo-600 to-purple-600 text-white shadow-lg shadow-indigo-950/60 ring-1 ring-indigo-400'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
              }`}
            >
              <Zap className="w-4 h-4 text-amber-300" />
              <span>Rotational Priority & Diversity Matrix</span>
              <span className="px-1.5 py-0.2 rounded-full bg-emerald-950 border border-emerald-500/40 text-emerald-300 text-[10px]">
                LIVE
              </span>
            </button>

            <button
              onClick={() => setActiveSubView('targets')}
              className={`px-4 py-2.5 rounded-xl text-xs font-mono font-bold transition-all flex items-center space-x-2 cursor-pointer ${
                activeSubView === 'targets'
                  ? 'bg-gradient-to-r from-emerald-600 to-teal-500 text-white shadow-lg shadow-emerald-950/60 font-black ring-1 ring-emerald-400'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
              }`}
            >
              <Crown className="w-4 h-4 text-yellow-300" />
              <span>Target Thresholds & Cash Bonuses</span>
            </button>
          </div>

          <div className="text-xs text-slate-400 font-mono px-3 py-1 bg-[#0F1115] border border-slate-800 rounded-xl hidden xl:block">
            Active Cycle:{' '}
            <span className="text-white font-bold uppercase">{systemSettings.creatorTargetCycle || 'weekly'}</span>
          </div>
        </div>
      ) : (
        <div className="text-xs text-slate-400 font-mono px-3 py-2 bg-[#0F1115] border border-slate-800 rounded-xl">
          Active Cycle:{' '}
          <span className="text-white font-bold uppercase">{systemSettings.creatorTargetCycle || 'weekly'}</span>
        </div>
      )}

      {/* VIEW 1: Dedicated Female Creator Performance Analytics & Intelligence Dashboard */}
      {activeSubView === 'analytics' && (
        <AdminCreatorPerformanceAnalytics />
      )}

      {/* VIEW 2: Rotational Priority, Scoring & Diversity System */}
      {activeSubView === 'matrix' && (
        <AdminRotationalPriorityMatrix />
      )}

      {/* VIEW 3: Target Thresholds & Cash Bonuses Form */}
      {activeSubView === 'targets' && (
        <form onSubmit={handleSave} className="space-y-6">
          {/* Header with Title and Save Button */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-5 bg-gradient-to-r from-[#161922] via-[#1A1D2B] to-[#12141F] border border-amber-500/30 rounded-2xl shadow-xl">
            <div className="flex items-center space-x-3">
              <div className="p-3 rounded-2xl bg-gradient-to-tr from-amber-500 to-yellow-400 text-slate-950 shadow-lg shadow-amber-950/50">
                <Crown className="w-6 h-6 fill-current" />
              </div>
              <div>
                <div className="flex items-center space-x-2">
                  <h2 className="text-lg sm:text-xl font-black text-white">Female Creator Targets & Algorithmic Boost Governance</h2>
                  <span className="px-2 py-0.5 rounded bg-amber-500/20 border border-amber-500/40 text-amber-300 text-[10px] font-mono font-extrabold uppercase">
                    ADMIN CONTROL
                  </span>
                </div>
                <p className="text-xs text-slate-300 mt-0.5">
                  Configure dual-metric targets (Active Online Hours + Revenue Coins), cash bonuses, Ready Now peak hours, and discovery ranking weights.
                </p>
              </div>
            </div>

            <button
              type="submit"
              disabled={isSaving}
              className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-slate-950 font-black text-xs sm:text-sm shadow-lg shadow-emerald-950/50 flex items-center space-x-2 transition-all cursor-pointer disabled:opacity-50 shrink-0 transform hover:-translate-y-0.5"
            >
              <Save className="w-4 h-4" />
              <span>{isSaving ? 'Saving...' : 'Save All Configurations'}</span>
            </button>
          </div>

          {/* 1. Target Engine Cycle Configuration */}
          <div className="p-5 bg-[#161922] border border-slate-800 rounded-2xl space-y-4 shadow-lg">
            <div className="flex items-start justify-between">
              <div className="space-y-1">
                <h3 className="text-sm font-bold text-white flex items-center space-x-2">
                  <Calendar className="w-4 h-4 text-indigo-400" />
                  <span>1. Global Target Engine Cycle (Weekly vs Monthly)</span>
                </h3>
                <p className="text-xs text-slate-400">
                  Determines the evaluation window for female creator hours & revenue goals before tier cash bonuses are calculated and paid out.
                </p>
              </div>
              <span className="px-2 py-0.5 rounded bg-indigo-950 border border-indigo-700/60 text-indigo-300 text-[10px] font-mono font-bold">
                RESET FREQUENCY
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <label className={`p-4 rounded-xl border cursor-pointer flex items-center justify-between transition-all ${
                formData.creatorTargetCycle === 'weekly'
                  ? 'bg-indigo-950/50 border-indigo-500 text-white ring-2 ring-indigo-500/40 shadow-lg shadow-indigo-950/40'
                  : 'bg-[#0F1115] border-slate-800 text-slate-400 hover:border-slate-700'
              }`}>
                <div className="flex items-center space-x-3">
                  <input
                    type="radio"
                    name="targetCycle"
                    value="weekly"
                    checked={formData.creatorTargetCycle === 'weekly'}
                    onChange={() => setFormData({ ...formData, creatorTargetCycle: 'weekly' })}
                    className="w-4 h-4 accent-indigo-500"
                  />
                  <div>
                    <span className="font-bold text-sm block text-white">Weekly Target Cycle</span>
                    <span className="text-[11px] text-slate-400 block mt-0.5">
                      Monday 00:00 UTC → next Monday 00:00 UTC. Period close runs at the configured UTC close time on the end boundary day.
                    </span>
                  </div>
                </div>
                <span className="text-xs font-mono font-bold text-indigo-400 px-2 py-0.5 rounded bg-indigo-950 border border-indigo-800 shrink-0 ml-2">
                  MON→MON
                </span>
              </label>

              <label className={`p-4 rounded-xl border cursor-pointer flex items-center justify-between transition-all ${
                formData.creatorTargetCycle === 'monthly'
                  ? 'bg-indigo-950/50 border-indigo-500 text-white ring-2 ring-indigo-500/40 shadow-lg shadow-indigo-950/40'
                  : 'bg-[#0F1115] border-slate-800 text-slate-400 hover:border-slate-700'
              }`}>
                <div className="flex items-center space-x-3">
                  <input
                    type="radio"
                    name="targetCycle"
                    value="monthly"
                    checked={formData.creatorTargetCycle === 'monthly'}
                    onChange={() => setFormData({ ...formData, creatorTargetCycle: 'monthly' })}
                    className="w-4 h-4 accent-indigo-500"
                  />
                  <div>
                    <span className="font-bold text-sm block text-white">Monthly Target Cycle</span>
                    <span className="text-[11px] text-slate-400 block mt-0.5">
                      Calendar month 1st 00:00 UTC → next month 1st 00:00 UTC (not rolling 30 days). Best for agency payroll calendars.
                    </span>
                  </div>
                </div>
                <span className="text-xs font-mono font-bold text-indigo-400 px-2 py-0.5 rounded bg-indigo-950 border border-indigo-800 shrink-0 ml-2">
                  1st→1st
                </span>
              </label>
            </div>

            <div className="mt-4 p-3.5 rounded-xl bg-[#0F1115] border border-slate-800 space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold text-slate-300 flex items-center gap-1.5">
                  <Clock className="w-3.5 h-3.5 text-emerald-400" />
                  Period close UTC time (HH:mm)
                </label>
                <span className="text-[10px] font-mono text-emerald-400">Financial Module</span>
              </div>
              <input
                type="text"
                placeholder="00:00"
                value={formData.periodCloseUtcTime}
                onChange={(e) => setFormData({ ...formData, periodCloseUtcTime: e.target.value })}
                className="w-full sm:w-40 p-2 bg-slate-900 border border-slate-700 rounded-lg text-white font-mono focus:outline-none focus:border-emerald-500"
              />
              <p className="text-[10px] text-slate-500">
                Synced to <span className="font-mono text-slate-400">system_configs.period_close_utc_time</span> via Finance API on save. Cash bonuses settle in the same period-end batch (not mid-period).
              </p>
            </div>
          </div>

          {/* 2. Performance Tiers Dual-Metric Matrix (Hours + Coins + USD Cash Bonus) */}
          <div className="p-5 bg-[#161922] border border-slate-800 rounded-2xl space-y-4 shadow-lg">
            <div className="flex items-start justify-between">
              <div className="space-y-1">
                <h3 className="text-sm font-bold text-white flex items-center space-x-2">
                  <Crown className="w-4 h-4 text-yellow-400" />
                  <span>2. Dual-Metric Target Thresholds & Cash Bonuses</span>
                </h3>
                <p className="text-xs text-slate-400">
                  Female hosts must achieve <strong className="text-slate-200">BOTH</strong> the Active Online Hours threshold and the Coin Revenue threshold within the active cycle to qualify for the tier bonus.
                </p>
              </div>
              <span className="px-2 py-0.5 rounded bg-yellow-950/80 border border-yellow-500/40 text-yellow-300 text-[10px] font-mono font-bold">
                DUAL-METRIC ENGINE
              </span>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              {/* Bronze Tier Card */}
              <div className="p-4 bg-[#0F1115] border border-amber-800/50 rounded-xl space-y-3.5 shadow-md">
                <div className="flex items-center justify-between border-b border-slate-800/80 pb-2.5">
                  <div className="flex items-center space-x-2">
                    <span className="px-2 py-0.5 rounded bg-amber-800/20 text-amber-300 border border-amber-800/50 text-xs font-black uppercase font-mono">
                      🥉 Bronze Tier
                    </span>
                  </div>
                  <span className="text-[10px] text-slate-400 font-mono">+20 Discovery Weight</span>
                </div>

                <div className="space-y-3 text-xs">
                  {/* Bronze Hours */}
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="text-slate-300 font-bold flex items-center gap-1">
                        <Clock className="w-3.5 h-3.5 text-indigo-400" />
                        <span>Active Hours Goal</span>
                      </label>
                      <span className="text-[10px] text-slate-500 font-mono">Min. Foreground Time</span>
                    </div>
                    <input
                      type="number"
                      min="1"
                      value={formData.creatorTargetBronzeHours}
                      onChange={(e) => setFormData({ ...formData, creatorTargetBronzeHours: Number(e.target.value) })}
                      className="w-full p-2 bg-slate-900 border border-slate-700 rounded-lg text-white font-mono focus:outline-none focus:border-amber-500"
                    />
                    <span className="text-[10px] text-slate-500 mt-1 block">
                      Total online & in-call hours required (e.g. 20 hrs). Tracked via 60s active heartbeats.
                    </span>
                  </div>

                  {/* Bronze Coins */}
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="text-slate-300 font-bold flex items-center gap-1">
                        <Coins className="w-3.5 h-3.5 text-amber-400" />
                        <span>Coin Revenue Goal</span>
                      </label>
                      <span className="text-[10px] text-slate-500 font-mono">Calls + Gifts</span>
                    </div>
                    <input
                      type="number"
                      min="100"
                      step="500"
                      value={formData.creatorTargetBronzeCoins}
                      onChange={(e) => setFormData({ ...formData, creatorTargetBronzeCoins: Number(e.target.value) })}
                      className="w-full p-2 bg-slate-900 border border-slate-700 rounded-lg text-white font-mono focus:outline-none focus:border-amber-500"
                    />
                    <span className="text-[10px] text-slate-500 mt-1 block">
                      Total coin earnings from 1-on-1 calls, audio calls, and tip gifts required (e.g. 5,000 🪙).
                    </span>
                  </div>

                  {/* Bronze Cash Bonus USD */}
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="text-slate-300 font-bold flex items-center gap-1">
                        <DollarSign className="w-3.5 h-3.5 text-emerald-400" />
                        <span>Cash Bonus (USD)</span>
                      </label>
                      <span className="text-[10px] text-emerald-400 font-mono font-bold">Paid to Balance</span>
                    </div>
                    <input
                      type="number"
                      min="0"
                      step="1"
                      value={formData.creatorTargetBronzeBonusUSD}
                      onChange={(e) => setFormData({ ...formData, creatorTargetBronzeBonusUSD: Number(e.target.value) })}
                      className="w-full p-2 bg-slate-900 border border-slate-700 rounded-lg text-emerald-400 font-mono font-bold focus:outline-none focus:border-emerald-500"
                    />
                    <span className="text-[10px] text-slate-500 mt-1 block">
                      Cash reward credited to host's withdrawable balance upon meeting Bronze targets.
                    </span>
                  </div>
                </div>
              </div>

              {/* Silver Tier Card */}
              <div className="p-4 bg-[#0F1115] border border-slate-500/50 rounded-xl space-y-3.5 shadow-md">
                <div className="flex items-center justify-between border-b border-slate-800/80 pb-2.5">
                  <div className="flex items-center space-x-2">
                    <span className="px-2 py-0.5 rounded bg-slate-300/20 text-slate-200 border border-slate-400/50 text-xs font-black uppercase font-mono">
                      🥈 Silver Tier
                    </span>
                  </div>
                  <span className="text-[10px] text-slate-300 font-mono">+50 Trending Boost</span>
                </div>

                <div className="space-y-3 text-xs">
                  {/* Silver Hours */}
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="text-slate-300 font-bold flex items-center gap-1">
                        <Clock className="w-3.5 h-3.5 text-indigo-400" />
                        <span>Active Hours Goal</span>
                      </label>
                      <span className="text-[10px] text-slate-500 font-mono">Min. Foreground Time</span>
                    </div>
                    <input
                      type="number"
                      min="1"
                      value={formData.creatorTargetSilverHours}
                      onChange={(e) => setFormData({ ...formData, creatorTargetSilverHours: Number(e.target.value) })}
                      className="w-full p-2 bg-slate-900 border border-slate-700 rounded-lg text-white font-mono focus:outline-none focus:border-indigo-500"
                    />
                    <span className="text-[10px] text-slate-500 mt-1 block">
                      Hours required to unlock Silver standing (e.g. 40 hrs).
                    </span>
                  </div>

                  {/* Silver Coins */}
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="text-slate-300 font-bold flex items-center gap-1">
                        <Coins className="w-3.5 h-3.5 text-amber-400" />
                        <span>Coin Revenue Goal</span>
                      </label>
                      <span className="text-[10px] text-slate-500 font-mono">Calls + Gifts</span>
                    </div>
                    <input
                      type="number"
                      min="100"
                      step="1000"
                      value={formData.creatorTargetSilverCoins}
                      onChange={(e) => setFormData({ ...formData, creatorTargetSilverCoins: Number(e.target.value) })}
                      className="w-full p-2 bg-slate-900 border border-slate-700 rounded-lg text-white font-mono focus:outline-none focus:border-indigo-500"
                    />
                    <span className="text-[10px] text-slate-500 mt-1 block">
                      Coins required for Silver status (e.g. 20,000 🪙).
                    </span>
                  </div>

                  {/* Silver Cash Bonus USD */}
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="text-slate-300 font-bold flex items-center gap-1">
                        <DollarSign className="w-3.5 h-3.5 text-emerald-400" />
                        <span>Cash Bonus (USD)</span>
                      </label>
                      <span className="text-[10px] text-emerald-400 font-mono font-bold">Paid to Balance</span>
                    </div>
                    <input
                      type="number"
                      min="0"
                      step="1"
                      value={formData.creatorTargetSilverBonusUSD}
                      onChange={(e) => setFormData({ ...formData, creatorTargetSilverBonusUSD: Number(e.target.value) })}
                      className="w-full p-2 bg-slate-900 border border-slate-700 rounded-lg text-emerald-400 font-mono font-bold focus:outline-none focus:border-emerald-500"
                    />
                    <span className="text-[10px] text-slate-500 mt-1 block">
                      Cash reward credited directly to host for achieving Silver tier.
                    </span>
                  </div>
                </div>
              </div>

              {/* Gold Tier Card */}
              <div className="p-4 bg-[#0F1115] border border-yellow-500/50 rounded-xl space-y-3.5 shadow-md">
                <div className="flex items-center justify-between border-b border-slate-800/80 pb-2.5">
                  <div className="flex items-center space-x-2">
                    <span className="px-2 py-0.5 rounded bg-yellow-500/20 text-yellow-300 border border-yellow-500/50 text-xs font-black uppercase font-mono">
                      👑 Gold Tier
                    </span>
                  </div>
                  <span className="text-[10px] text-yellow-400 font-mono font-bold">+100 VIP Top Priority</span>
                </div>

                <div className="space-y-3 text-xs">
                  {/* Gold Hours */}
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="text-slate-300 font-bold flex items-center gap-1">
                        <Clock className="w-3.5 h-3.5 text-indigo-400" />
                        <span>Active Hours Goal</span>
                      </label>
                      <span className="text-[10px] text-slate-500 font-mono">Min. Foreground Time</span>
                    </div>
                    <input
                      type="number"
                      min="1"
                      value={formData.creatorTargetGoldHours}
                      onChange={(e) => setFormData({ ...formData, creatorTargetGoldHours: Number(e.target.value) })}
                      className="w-full p-2 bg-slate-900 border border-slate-700 rounded-lg text-white font-mono focus:outline-none focus:border-yellow-500"
                    />
                    <span className="text-[10px] text-slate-500 mt-1 block">
                      Elite hours requirement (e.g. 60 hrs) to unlock top discovery rank.
                    </span>
                  </div>

                  {/* Gold Coins */}
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="text-slate-300 font-bold flex items-center gap-1">
                        <Coins className="w-3.5 h-3.5 text-amber-400" />
                        <span>Coin Revenue Goal</span>
                      </label>
                      <span className="text-[10px] text-slate-500 font-mono">Calls + Gifts</span>
                    </div>
                    <input
                      type="number"
                      min="100"
                      step="5000"
                      value={formData.creatorTargetGoldCoins}
                      onChange={(e) => setFormData({ ...formData, creatorTargetGoldCoins: Number(e.target.value) })}
                      className="w-full p-2 bg-slate-900 border border-slate-700 rounded-lg text-white font-mono focus:outline-none focus:border-yellow-500"
                    />
                    <span className="text-[10px] text-slate-500 mt-1 block">
                      Elite coin revenue requirement (e.g. 60,000 🪙).
                    </span>
                  </div>

                  {/* Gold Cash Bonus USD */}
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="text-slate-300 font-bold flex items-center gap-1">
                        <DollarSign className="w-3.5 h-3.5 text-emerald-400" />
                        <span>Cash Bonus (USD)</span>
                      </label>
                      <span className="text-[10px] text-emerald-400 font-mono font-bold">Paid to Balance</span>
                    </div>
                    <input
                      type="number"
                      min="0"
                      step="1"
                      value={formData.creatorTargetGoldBonusUSD}
                      onChange={(e) => setFormData({ ...formData, creatorTargetGoldBonusUSD: Number(e.target.value) })}
                      className="w-full p-2 bg-slate-900 border border-slate-700 rounded-lg text-emerald-400 font-mono font-bold focus:outline-none focus:border-emerald-500"
                    />
                    <span className="text-[10px] text-slate-500 mt-1 block">
                      Major cash bonus credited to host's withdrawable balance for Gold tier completion.
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* 3. Peak Hours & Ready Now Surge Rules */}
          <div className="p-5 bg-[#161922] border border-slate-800 rounded-2xl space-y-4 shadow-lg">
            <div className="flex items-start justify-between">
              <div className="space-y-1">
                <h3 className="text-sm font-bold text-white flex items-center space-x-2">
                  <Flame className="w-4 h-4 text-orange-400" />
                  <span>3. Peak Traffic Hours & Ready Now Surge Engine</span>
                </h3>
                <p className="text-xs text-slate-400">
                  When female hosts toggle <strong className="text-orange-400 font-mono">"Ready Now"</strong> during peak traffic hours, they receive an instant <strong className="text-yellow-300 font-mono">+80 Algorithmic Boost</strong> to appear at the very top of male discovery feeds.
                </p>
              </div>
              <span className="px-2 py-0.5 rounded bg-orange-950/80 border border-orange-500/40 text-orange-300 text-[10px] font-mono font-bold">
                SURGE DISCOVERY
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
              {/* Peak Hours Start */}
              <div className="bg-[#0F1115] p-3.5 rounded-xl border border-slate-800 space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="text-slate-300 font-bold">Peak Hours Start (HH:MM)</label>
                  <span className="text-[10px] text-slate-500 font-mono">24h format</span>
                </div>
                <input
                  type="text"
                  placeholder="18:00"
                  value={formData.peakHoursStart}
                  onChange={(e) => setFormData({ ...formData, peakHoursStart: e.target.value })}
                  className="w-full p-2 bg-slate-900 border border-slate-700 rounded-lg text-white font-mono focus:outline-none focus:border-orange-500"
                />
                <span className="text-[10px] text-slate-400 block">
                  Time when peak evening traffic begins (e.g. 18:00 for 6:00 PM).
                </span>
              </div>

              {/* Peak Hours End */}
              <div className="bg-[#0F1115] p-3.5 rounded-xl border border-slate-800 space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="text-slate-300 font-bold">Peak Hours End (HH:MM)</label>
                  <span className="text-[10px] text-slate-500 font-mono">24h format</span>
                </div>
                <input
                  type="text"
                  placeholder="00:00"
                  value={formData.peakHoursEnd}
                  onChange={(e) => setFormData({ ...formData, peakHoursEnd: e.target.value })}
                  className="w-full p-2 bg-slate-900 border border-slate-700 rounded-lg text-white font-mono focus:outline-none focus:border-orange-500"
                />
                <span className="text-[10px] text-slate-400 block">
                  Time when peak traffic ends (e.g. 00:00 for midnight). Supports overnight wraparound.
                </span>
              </div>

              {/* Call Ring Timeout */}
              <div className="bg-[#0F1115] p-3.5 rounded-xl border border-slate-800 space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="text-slate-300 font-bold flex items-center gap-1">
                    <span>Call Ring Timeout (Seconds)</span>
                  </label>
                  <span className="text-[10px] text-slate-500 font-mono">10 - 120s</span>
                </div>
                <input
                  type="number"
                  min="10"
                  max="120"
                  value={formData.callRingTimeoutSeconds}
                  onChange={(e) => setFormData({ ...formData, callRingTimeoutSeconds: Number(e.target.value) })}
                  className="w-full p-2 bg-slate-900 border border-slate-700 rounded-lg text-white font-mono focus:outline-none focus:border-orange-500"
                />
                <span className="text-[10px] text-slate-400 block">
                  Window a female host has to answer an incoming call before it is flagged as missed/declined and impacts their Response Health Score.
                </span>
              </div>
            </div>
          </div>

          {/* 4. Daily Gamification & Consecutive Streak Rewards */}
          <div className="p-5 bg-[#161922] border border-slate-800 rounded-2xl space-y-4 shadow-lg">
            <div className="flex items-start justify-between">
              <div className="space-y-1">
                <h3 className="text-sm font-bold text-white flex items-center space-x-2">
                  <Sparkles className="w-4 h-4 text-pink-400" />
                  <span>4. Daily Gamification, 1st Paid Call Bonus & Consecutive Streaks</span>
                </h3>
                <p className="text-xs text-slate-400">
                  Incentivize daily host check-ins and sustained attendance with micro-rewards and 7-day consistency boost multipliers.
                </p>
              </div>
              <span className="px-2 py-0.5 rounded bg-pink-950/80 border border-pink-500/40 text-pink-300 text-[10px] font-mono font-bold">
                DAILY STREAKS
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
              {/* 1st Call Bonus Coins */}
              <div className="bg-[#0F1115] p-3.5 rounded-xl border border-slate-800 space-y-1.5">
                <label className="text-slate-300 font-bold block">1st Paid Call Bonus (Coins)</label>
                <input
                  type="number"
                  min="0"
                  value={formData.dailyFirstCallBonusCoins}
                  onChange={(e) => setFormData({ ...formData, dailyFirstCallBonusCoins: Number(e.target.value) })}
                  className="w-full p-2 bg-slate-900 border border-slate-700 rounded-lg text-white font-mono focus:outline-none focus:border-pink-500"
                />
                <span className="text-[10px] text-slate-400 block">
                  Coins granted immediately upon the creator completing her first paid call of the calendar day.
                </span>
              </div>

              {/* 1st Call Bonus USD */}
              <div className="bg-[#0F1115] p-3.5 rounded-xl border border-slate-800 space-y-1.5">
                <label className="text-slate-300 font-bold block">1st Paid Call Bonus (USD Cash)</label>
                <input
                  type="number"
                  min="0"
                  step="0.1"
                  value={formData.dailyFirstCallBonusUSD}
                  onChange={(e) => setFormData({ ...formData, dailyFirstCallBonusUSD: Number(e.target.value) })}
                  className="w-full p-2 bg-slate-900 border border-slate-700 rounded-lg text-emerald-400 font-mono font-bold focus:outline-none focus:border-emerald-500"
                />
                <span className="text-[10px] text-slate-400 block">
                  USD equivalent credited directly to host earnings for immediate withdrawal.
                </span>
              </div>

              {/* Min Duration for 1st Call Bonus */}
              <div className="bg-[#0F1115] p-3.5 rounded-xl border border-slate-800 space-y-1.5">
                <label className="text-slate-300 font-bold block">Min. Duration for 1st Call Bonus (Sec)</label>
                <input
                  type="number"
                  min="10"
                  value={formData.dailyFirstCallMinDurationSec}
                  onChange={(e) => setFormData({ ...formData, dailyFirstCallMinDurationSec: Number(e.target.value) })}
                  className="w-full p-2 bg-slate-900 border border-slate-700 rounded-lg text-white font-mono focus:outline-none focus:border-pink-500"
                />
                <span className="text-[10px] text-slate-400 block">
                  Minimum duration (e.g. 30 sec) required to qualify as a valid paid call and prevent micro-drop fraud.
                </span>
              </div>

              {/* Consecutive Days for Streak Boost */}
              <div className="bg-[#0F1115] p-3.5 rounded-xl border border-slate-800 space-y-1.5">
                <label className="text-slate-300 font-bold block">Streak Target (Consecutive Days)</label>
                <input
                  type="number"
                  min="3"
                  value={formData.streakTargetDays}
                  onChange={(e) => setFormData({ ...formData, streakTargetDays: Number(e.target.value) })}
                  className="w-full p-2 bg-slate-900 border border-slate-700 rounded-lg text-white font-mono focus:outline-none focus:border-pink-500"
                />
                <span className="text-[10px] text-slate-400 block">
                  Number of consecutive active days required to unlock the <strong className="text-amber-300 font-mono">+30 Algorithmic Boost</strong> (e.g. 7 days).
                </span>
              </div>

              {/* Streak Boost Duration */}
              <div className="bg-[#0F1115] p-3.5 rounded-xl border border-slate-800 space-y-1.5">
                <label className="text-slate-300 font-bold block">Streak Boost Active Duration (Days)</label>
                <input
                  type="number"
                  min="1"
                  value={formData.streakBoostDurationDays}
                  onChange={(e) => setFormData({ ...formData, streakBoostDurationDays: Number(e.target.value) })}
                  className="w-full p-2 bg-slate-900 border border-slate-700 rounded-lg text-white font-mono focus:outline-none focus:border-pink-500"
                />
                <span className="text-[10px] text-slate-400 block">
                  Duration the +30 discovery priority boost lasts once a creator achieves the streak target.
                </span>
              </div>

              {/* Min Daily Active Hours */}
              <div className="bg-[#0F1115] p-3.5 rounded-xl border border-slate-800 space-y-1.5">
                <label className="text-slate-300 font-bold block">Min. Daily Active Hours for Streak</label>
                <input
                  type="number"
                  min="1"
                  value={formData.minDailyActiveHoursForStreak}
                  onChange={(e) => setFormData({ ...formData, minDailyActiveHoursForStreak: Number(e.target.value) })}
                  className="w-full p-2 bg-slate-900 border border-slate-700 rounded-lg text-white font-mono focus:outline-none focus:border-pink-500"
                />
                <span className="text-[10px] text-slate-400 block">
                  Minimum foreground active hours a host must log today (e.g. 2 hrs) for the day to count toward her streak.
                </span>
              </div>
            </div>
          </div>

          {/* 5. Settlement Compatibility */}
          <div className="p-5 bg-[#161922] border border-slate-800 rounded-2xl space-y-3 shadow-lg">
            <div className="flex items-center space-x-2">
              <Wallet className="w-4 h-4 text-emerald-400" />
              <h4 className="text-sm font-bold text-white">Period-end settlement compatibility</h4>
            </div>
            <p className="text-xs text-slate-400">
              At period close: (1) live call minutes stay at Economy base share; (2) if bronze+ hours AND
              coins are met, Finance posts a target share true-up so effective call commission equals the
              Economy target share %; (3) bronze/silver/gold USD cash bonuses settle separately. All three
              appear as distinct settlement lines — not mid-period withdrawals.
            </p>

            <div className="p-4 rounded-xl bg-[#0F1115] border border-slate-800 space-y-3 text-xs">
              <div className="flex items-center justify-between border-b border-slate-800/80 pb-2">
                <span className="text-slate-300 font-medium">Call earnings (base share):</span>
                <span className="font-mono font-bold text-white">Accrue live → settle at close</span>
              </div>
              <div className="flex items-center justify-between border-b border-slate-800/80 pb-2">
                <span className="text-slate-300 font-medium">Target share true-up:</span>
                <span className="font-mono font-bold text-rose-300">If bronze+ met · Economy target %</span>
              </div>
              <div className="flex items-center justify-between border-b border-slate-800/80 pb-2">
                <span className="text-slate-300 font-medium">Tier cash bonuses:</span>
                <span className="font-mono font-bold text-emerald-400">
                  +${formData.creatorTargetGoldBonusUSD.toFixed(2)} Gold / +$
                  {formData.creatorTargetSilverBonusUSD.toFixed(2)} Silver
                </span>
              </div>
              <div className="p-2.5 rounded-lg bg-amber-950/30 border border-amber-500/30 text-amber-200 text-[11px]">
                Hosts with <code className="text-amber-100">coin_earn_override_rate</code> &gt; 0 at close
                skip share true-up (override path). TL share stays static — no TL true-up. Gifts are
                excluded from eligible burn for share true-up.
              </div>
              <div className="p-2.5 rounded-lg bg-emerald-950/30 border border-emerald-500/30 text-emerald-300 text-[11px] flex items-center space-x-2">
                <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400" />
                <span>
                  Admin remits via Financial Module settlement batches (TL bundles / direct hosts). See
                  Admin → Financial Module for per-host breakdown.
                </span>
              </div>
            </div>
          </div>
        </form>
      )}
    </div>
  );
};
