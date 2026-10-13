import React from 'react';
import {
  FileText,
  X,
  Printer,
  CheckCircle2,
  Coins,
  PhoneCall,
  ShieldCheck,
} from 'lucide-react';
import { TransactionReceipt } from '../../types';

interface InvoiceDetailModalProps {
  receipt: TransactionReceipt | null;
  onClose: () => void;
}

export const InvoiceDetailModal: React.FC<InvoiceDetailModalProps> = ({ receipt, onClose }) => {
  if (!receipt) return null;

  const handlePrint = () => {
    window.print();
  };

  return (
    <div
      id="call-spending-statement-modal"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md animate-fade-in"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-lg bg-[#0F121A] border border-slate-800 rounded-3xl p-6 sm:p-8 shadow-2xl space-y-6 text-slate-200 overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-slate-800 pb-4">
          <div className="flex items-center space-x-3">
            <div className="p-2.5 bg-indigo-500/10 border border-indigo-500/30 rounded-xl text-indigo-400">
              <FileText className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-black text-white font-mono uppercase tracking-wider">
                Call Spending Statement
              </h3>
              <p className="text-[11px] text-slate-400 font-mono">
                {receipt.statementNumber} · From call history
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition-all cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex items-center justify-between p-3 rounded-2xl bg-slate-900/80 border border-slate-700/60 text-slate-200 text-xs font-mono">
          <div className="flex items-center space-x-2">
            <CheckCircle2 className="w-4 h-4 text-indigo-400" />
            <span className="font-bold uppercase tracking-wider">
              Billing status: {receipt.status}
            </span>
          </div>
          {receipt.callLogId && (
            <span className="text-slate-500 truncate max-w-[40%]">Call {receipt.callLogId.slice(0, 10)}…</span>
          )}
        </div>

        <div className="p-4 rounded-2xl bg-slate-950 border border-slate-800/80 space-y-3 font-mono text-xs">
          <div className="flex justify-between text-slate-400 pb-2 border-b border-slate-800/80 text-[10px] uppercase font-bold">
            <span>Description</span>
            <span>Coins</span>
          </div>

          <div className="flex justify-between items-start text-white">
            <div>
              <div className="font-bold flex items-center space-x-1.5">
                <PhoneCall className="w-3.5 h-3.5 text-pink-400" />
                <span>{receipt.description}</span>
              </div>
              <div className="text-[10px] text-indigo-400 flex items-center space-x-1 mt-0.5">
                <Coins className="w-3 h-3" />
                <span>
                  {receipt.durationMinutes} min
                  {receipt.hostName ? ` · ${receipt.hostName}` : ''}
                </span>
              </div>
            </div>
            <div className="font-bold text-amber-300">−{receipt.coinsDebited.toLocaleString()} 🪙</div>
          </div>

          <div className="pt-3 border-t border-slate-800/80 space-y-1.5 text-[11px]">
            <div className="flex justify-between text-slate-400">
              <span>Estimated USD @ Coin USD Peg (Economy):</span>
              <span>${receipt.amountUSD.toFixed(2)}</span>
            </div>
            <div className="flex justify-between text-white font-bold text-sm pt-2 border-t border-slate-800">
              <span>Coins debited:</span>
              <span className="text-amber-300">{receipt.coinsDebited.toLocaleString()} 🪙</span>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3 text-[11px] font-mono">
          <div className="p-3 bg-slate-900/80 rounded-xl border border-slate-800">
            <span className="text-slate-500 block text-[10px]">Source</span>
            <span className="text-slate-200 font-bold">Call billing (in-app)</span>
          </div>
          <div className="p-3 bg-slate-900/80 rounded-xl border border-slate-800">
            <span className="text-slate-500 block text-[10px]">Date & Time</span>
            <span className="text-slate-200 font-bold">{receipt.createdAt}</span>
          </div>
          <div className="p-3 bg-slate-900/80 rounded-xl border border-slate-800 col-span-2">
            <span className="text-slate-500 block text-[10px]">Caller</span>
            <span className="text-slate-200 font-bold">{receipt.userName}</span>
          </div>
        </div>

        <p className="text-[10px] text-slate-500 font-mono leading-relaxed">
          This is a call spending statement from your call history — not a card processor or app-store purchase invoice. Coin store payment receipts will appear separately when payments go live.
        </p>

        <div className="flex items-center space-x-3 pt-2">
          <button
            onClick={handlePrint}
            className="flex-1 py-2.5 px-4 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-mono font-bold text-xs transition-all flex items-center justify-center space-x-2 border border-slate-700 cursor-pointer"
          >
            <Printer className="w-4 h-4" />
            <span>Print Statement</span>
          </button>
          <button
            onClick={onClose}
            className="flex-1 py-2.5 px-4 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-mono font-bold text-xs transition-all flex items-center justify-center space-x-2 shadow-lg shadow-indigo-600/30 cursor-pointer"
          >
            <ShieldCheck className="w-4 h-4" />
            <span>Close</span>
          </button>
        </div>
      </div>
    </div>
  );
};
