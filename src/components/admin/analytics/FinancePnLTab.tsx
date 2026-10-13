/**
 * Analytics "Money map" — Phase 4: Period P&L / waterfall lives in Financial Module.
 * This tab only orients admins (no duplicate Host/TL/Platform money tables).
 */
import React from 'react';
import { Landmark, Coins, BookOpen, Banknote, Settings2, ExternalLink, Activity } from 'lucide-react';
import { PlatformFinanceSnapshot, formatUsd, formatCoins } from '../../../utils/adminAnalytics';

interface FinancePnLTabProps {
  finance: PlatformFinanceSnapshot;
  onOpenFinancialModule?: () => void;
  onOpenEconomyConfig?: () => void;
}

export const FinancePnLTab: React.FC<FinancePnLTabProps> = ({
  finance,
  onOpenFinancialModule,
  onOpenEconomyConfig,
}) => {
  return (
    <div className="space-y-5">
      <div className="p-5 bg-[#13161F] border border-emerald-500/30 rounded-3xl space-y-3">
        <div className="flex items-center gap-2">
          <Landmark className="w-4 h-4 text-emerald-400" />
          <h3 className="text-sm font-black text-white font-mono uppercase">Money of record → Financial Module</h3>
        </div>
        <p className="text-xs text-slate-300 leading-relaxed max-w-3xl">
          Analytics stays product/ops. Detailed Platform / Host / TL payables, period P&amp;L, funding
          credits, live burns, and settlement remittance are owned by the Financial Module — not
          duplicated here.
        </p>
        <div className="flex flex-wrap gap-2">
          {onOpenFinancialModule && (
            <button
              type="button"
              onClick={onOpenFinancialModule}
              className="px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer"
            >
              <Landmark className="w-3.5 h-3.5" /> Open Financial Module <ExternalLink className="w-3 h-3" />
            </button>
          )}
          {onOpenEconomyConfig && (
            <button
              type="button"
              onClick={onOpenEconomyConfig}
              className="px-3.5 py-2 rounded-xl bg-slate-900 border border-slate-700 hover:border-slate-500 text-slate-200 text-xs font-bold flex items-center gap-1.5 cursor-pointer"
            >
              <Settings2 className="w-3.5 h-3.5" /> Coin Burn & Economy
            </button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <div className="p-4 bg-slate-950 border border-slate-800 rounded-2xl space-y-2">
          <div className="flex items-center gap-2 text-amber-300">
            <Coins className="w-4 h-4" />
            <span className="text-[10px] font-mono font-bold uppercase">Funding / Purchases</span>
          </div>
          <p className="text-[11px] text-slate-400 leading-relaxed">
            Admin manual credits and future gateway purchases (`PURCHASE` / `ADMIN_MANUAL` | `GATEWAY`).
          </p>
        </div>
        <div className="p-4 bg-slate-950 border border-slate-800 rounded-2xl space-y-2">
          <div className="flex items-center gap-2 text-indigo-300">
            <BookOpen className="w-4 h-4" />
            <span className="text-[10px] font-mono font-bold uppercase">Live ledger</span>
          </div>
          <p className="text-[11px] text-slate-400 leading-relaxed">
            Minute burns as they happen: `CALL_DEBIT`, `HOST_EARN`, `TL_EARN` — no period close required.
          </p>
        </div>
        <div className="p-4 bg-slate-950 border border-slate-800 rounded-2xl space-y-2">
          <div className="flex items-center gap-2 text-emerald-300">
            <Banknote className="w-4 h-4" />
            <span className="text-[10px] font-mono font-bold uppercase">Settlement / closed P&amp;L</span>
          </div>
          <p className="text-[11px] text-slate-400 leading-relaxed">
            After period close: `PLATFORM_EARN` / Host / TL earnings tabs, batches, and remittance.
          </p>
        </div>
      </div>

      {/* Light ops snapshot only — not a full money waterfall */}
      <div className="p-4 bg-[#13161F] border border-slate-800 rounded-2xl">
        <div className="flex items-center gap-2 mb-3">
          <Activity className="w-4 h-4 text-slate-400" />
          <h4 className="text-xs font-black text-white font-mono uppercase">Light ops snapshot (this filter)</h4>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-xs font-mono">
          <div className="p-3 rounded-xl bg-slate-950 border border-slate-800">
            <div className="text-slate-500 uppercase text-[10px]">Period burn (GMV)</div>
            <div className="text-amber-300 font-black text-base mt-1">{formatUsd(finance.burnUSD)}</div>
            <div className="text-slate-500">{formatCoins(finance.burn.burnedCoins)}</div>
          </div>
          <div className="p-3 rounded-xl bg-slate-950 border border-slate-800">
            <div className="text-slate-500 uppercase text-[10px]">Calls / minutes</div>
            <div className="text-white font-black text-base mt-1">{finance.callCount}</div>
            <div className="text-slate-500">{finance.totalMinutes} mins</div>
          </div>
          <div className="p-3 rounded-xl bg-slate-950 border border-slate-800">
            <div className="text-slate-500 uppercase text-[10px]">Live calls</div>
            <div className="text-pink-300 font-black text-base mt-1">{finance.liveCalls}</div>
            <div className="text-slate-500">
              {finance.activeCallers} callers · {finance.activeHosts} hosts
            </div>
          </div>
        </div>
        <p className="text-[10px] text-slate-500 mt-3 font-mono">
          For Platform retained / Host payable / TL payable and settlement batches, use Financial Module.
        </p>
      </div>
    </div>
  );
};
