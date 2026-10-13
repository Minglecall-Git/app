import React, { useState, useEffect } from 'react';
import { useApp } from '../../context/AppContext';
import { X, PlusCircle, MinusCircle, RefreshCw } from 'lucide-react';
import { UserProfile } from '../../types';
import { postAdminFundingCredit } from '../../services/financeApi';
import { coinsToUsd, getCoinUsdPeg, formatPegExample } from '../../../shared/finance/fx';

interface ManualCoinModalProps {
  isOpen: boolean;
  onClose: () => void;
  targetUserId?: string | null;
}

export const ManualCoinModal: React.FC<ManualCoinModalProps> = ({
  isOpen,
  onClose,
  targetUserId,
}) => {
  const { users, showToast, systemSettings } = useApp();

  const [selectedUserId, setSelectedUserId] = useState<string>('');
  const [amount, setAmount] = useState<number>(500);
  const [operation, setOperation] = useState<'add' | 'subtract' | 'set'>('add');
  const [reason, setReason] = useState<string>('🎁 Loyalty / Promotional Gift');
  const [customReason, setCustomReason] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (targetUserId) {
      setSelectedUserId(targetUserId);
    } else if (users.length > 0 && !selectedUserId) {
      setSelectedUserId(users[0].id);
    }
  }, [targetUserId, users, selectedUserId]);

  if (!isOpen) return null;

  const targetUser: UserProfile | undefined = users.find((u) => u.id === selectedUserId) || users[0];
  const currentBalance = targetUser?.coinBalance || 0;
  const peg = getCoinUsdPeg(systemSettings);

  let newBalancePreview = currentBalance;
  if (operation === 'add') {
    newBalancePreview = currentBalance + (Number(amount) || 0);
  } else if (operation === 'subtract') {
    newBalancePreview = Math.max(0, currentBalance - (Number(amount) || 0));
  } else if (operation === 'set') {
    newBalancePreview = Math.max(0, Number(amount) || 0);
  }

  let creditCoinsPreview = 0;
  if (operation === 'add') {
    creditCoinsPreview = Math.max(0, Number(amount) || 0);
  } else if (operation === 'set') {
    creditCoinsPreview = Math.max(0, (Number(amount) || 0) - (Number(targetUser?.coinBalance) || 0));
  }
  const pegValuePreview = coinsToUsd(creditCoinsPreview, peg);

  const handleApply = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!targetUser) return;

    setError(null);
    const numAmount = Math.max(0, Number(amount) || 0);
    const finalReason = reason === 'Other / Custom' ? customReason || 'Manual Admin Credit' : reason;

    let creditCoins = numAmount;
    if (operation === 'subtract') {
      setError('Coin debits are not supported in Phase 1. Use credit (+) only — ledger requires PURCHASE funding.');
      return;
    }
    if (operation === 'set') {
      const diff = numAmount - (Number(targetUser.coinBalance) || 0);
      if (diff <= 0) {
        setError(
          diff === 0
            ? 'Balance already matches target — no credit needed.'
            : 'Setting a lower balance (debit) is not supported in Phase 1.'
        );
        return;
      }
      creditCoins = diff;
    }

    if (creditCoins <= 0) {
      setError('Enter a positive coin amount.');
      return;
    }

    setIsSubmitting(true);
    const res = await postAdminFundingCredit({
      userId: targetUser.id,
      amountCoins: creditCoins,
      reason:
        operation === 'set'
          ? `Balance Set to ${numAmount} (${finalReason})`
          : finalReason,
    });
    setIsSubmitting(false);

    if (!res.success || !res.data) {
      const msg = res.error?.message || 'Ledger post failed — balance was not updated.';
      setError(msg);
      showToast('Admin credit failed', msg, 'error');
      return;
    }

    const newBalance = res.data.coinBalance;

    showToast(
      'Coins credited via ledger',
      `+${creditCoins.toLocaleString()} PURCHASE (ADMIN_MANUAL) → ${(newBalance ?? 0).toLocaleString()} coins`,
      'success'
    );
    onClose();
  };

  const presetAmounts = [100, 500, 1000, 5000, 10000, 50000];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md overflow-y-auto">
      <div className="relative w-full max-w-lg bg-[#161920] border border-slate-800 rounded-xl shadow-2xl overflow-hidden my-6">
        <div className="flex items-center justify-between p-4 bg-[#0F1115] border-b border-slate-800">
          <div className="flex items-center space-x-2.5">
            <div className="w-8 h-8 rounded bg-amber-500/10 border border-amber-500/20 text-amber-400 flex items-center justify-center font-bold text-sm shadow-md">
              🪙
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <h2 className="text-sm font-black text-white uppercase tracking-wider font-mono">
                  Admin Coin Credit (PURCHASE)
                </h2>
                <span className="text-[9px] px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300 font-mono font-bold">
                  LEDGER
                </span>
              </div>
              <p className="text-[10px] text-slate-400 font-sans">
                Credits post via Financial Module — wallet_ledger PURCHASE + coin_purchases.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleApply} className="p-5 space-y-4">
          <div>
            <label className="block text-[11px] font-mono text-slate-400 uppercase tracking-wider mb-1">
              Select Target User Account
            </label>
            <select
              value={selectedUserId}
              onChange={(e) => setSelectedUserId(e.target.value)}
              className="w-full px-3 py-2 bg-[#0F1115] border border-slate-800 rounded text-xs text-white focus:outline-none focus:border-indigo-500 font-mono"
            >
              {users.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name} ({u.email}) — Balance: {(u.coinBalance ?? 0).toLocaleString()} Coins [{(u.role || 'user').toUpperCase()}]
                </option>
              ))}
            </select>
          </div>

          {targetUser && (
            <div className="flex items-center justify-between p-3 bg-[#0F1115] border border-slate-800/80 rounded-lg">
              <div className="flex items-center space-x-3">
                <img
                  src={targetUser.avatarUrl}
                  alt={targetUser.name}
                  className="w-10 h-10 rounded-full object-cover border border-slate-700"
                />
                <div>
                  <div className="font-bold text-xs text-white">{targetUser.name}</div>
                  <div className="text-[10px] text-slate-400 font-mono mt-0.5">{targetUser.id}</div>
                </div>
              </div>
              <div className="text-right font-mono">
                <div className="text-[9px] text-slate-500 uppercase tracking-widest font-bold">Current Balance</div>
                <div className="text-sm font-extrabold text-amber-300">🪙 {(currentBalance ?? 0).toLocaleString()}</div>
              </div>
            </div>
          )}

          <div>
            <label className="block text-[11px] font-mono text-slate-400 uppercase tracking-wider mb-1.5">
              Adjustment Operation
            </label>
            <div className="grid grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() => setOperation('add')}
                className={`py-1.5 px-3 rounded text-xs font-mono font-bold flex items-center justify-center space-x-1 border transition-all ${
                  operation === 'add'
                    ? 'bg-emerald-600 text-white border-emerald-500 shadow-md shadow-emerald-600/20'
                    : 'bg-[#0F1115] text-slate-400 border-slate-800 hover:text-white'
                }`}
              >
                <PlusCircle className="w-3.5 h-3.5" />
                <span>Credit (+)</span>
              </button>
              <button
                type="button"
                onClick={() => setOperation('subtract')}
                className={`py-1.5 px-3 rounded text-xs font-mono font-bold flex items-center justify-center space-x-1 border transition-all opacity-60 ${
                  operation === 'subtract'
                    ? 'bg-rose-600 text-white border-rose-500'
                    : 'bg-[#0F1115] text-slate-400 border-slate-800'
                }`}
                title="Debits not supported in Phase 1"
              >
                <MinusCircle className="w-3.5 h-3.5" />
                <span>Debit (-)</span>
              </button>
              <button
                type="button"
                onClick={() => setOperation('set')}
                className={`py-1.5 px-3 rounded text-xs font-mono font-bold flex items-center justify-center space-x-1 border transition-all ${
                  operation === 'set'
                    ? 'bg-indigo-600 text-white border-indigo-500 shadow-md shadow-indigo-600/20'
                    : 'bg-[#0F1115] text-slate-400 border-slate-800 hover:text-white'
                }`}
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>Set Exact (=)</span>
              </button>
            </div>
            {operation !== 'add' && (
              <p className="text-[10px] text-amber-400/90 mt-1.5 font-mono">
                Only positive credits post to PURCHASE ledger in Phase 1.
              </p>
            )}
          </div>

          <div>
            <label className="block text-[11px] font-mono text-slate-400 uppercase tracking-wider mb-1.5">
              Quick Preset Amount
            </label>
            <div className="grid grid-cols-3 sm:grid-cols-6 gap-1.5">
              {presetAmounts.map((preset) => (
                <button
                  key={preset}
                  type="button"
                  onClick={() => setAmount(preset)}
                  className={`py-1 px-2 rounded text-[11px] font-mono font-bold border transition-all ${
                    amount === preset
                      ? 'bg-amber-500/20 text-amber-300 border-amber-500/60'
                      : 'bg-[#0F1115] text-slate-400 border-slate-800 hover:text-white hover:border-slate-700'
                  }`}
                >
                  +{preset >= 1000 ? `${preset / 1000}k` : preset}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-[11px] font-mono text-slate-400 uppercase tracking-wider mb-1">
              Custom Amount (Coins)
            </label>
            <div className="relative">
              <span className="absolute left-3 top-2.5 text-xs text-amber-400 font-mono">🪙</span>
              <input
                type="number"
                min="1"
                value={amount}
                onChange={(e) => setAmount(Number(e.target.value))}
                className="w-full pl-8 pr-3 py-2 bg-[#0F1115] border border-slate-800 rounded text-xs text-white font-mono focus:outline-none focus:border-indigo-500 font-bold"
              />
            </div>
          </div>

          <div>
            <label className="block text-[11px] font-mono text-slate-400 uppercase tracking-wider mb-1">
              Reason / Transaction Note
            </label>
            <select
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className="w-full px-3 py-2 bg-[#0F1115] border border-slate-800 rounded text-xs text-white focus:outline-none focus:border-indigo-500 font-sans"
            >
              <option value="🎁 Loyalty / Promotional Gift">🎁 Loyalty / Promotional Gift</option>
              <option value="🎧 Customer Support Compensation">🎧 Customer Support Compensation</option>
              <option value="🧪 System & Call Testing">🧪 System & Call Testing</option>
              <option value="🏆 VIP Welcome Reward">🏆 VIP Welcome Reward</option>
              <option value="Other / Custom">Other / Custom Note...</option>
            </select>
            {reason === 'Other / Custom' && (
              <input
                type="text"
                placeholder="Enter custom reason for audit log..."
                value={customReason}
                onChange={(e) => setCustomReason(e.target.value)}
                className="w-full mt-2 px-3 py-2 bg-[#0F1115] border border-slate-800 rounded text-xs text-white focus:outline-none focus:border-indigo-500 font-sans"
              />
            )}
          </div>

          {error && (
            <div className="p-3 rounded-lg bg-rose-950/40 border border-rose-700/50 text-rose-200 text-xs font-mono">
              {error}
            </div>
          )}

          <div className="p-3 bg-[#0F1115] border border-slate-800 rounded-lg space-y-2 text-xs font-mono">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-[10px] text-slate-500 uppercase font-bold">Preview balance</div>
                <div className="text-slate-400 font-bold">
                  {(currentBalance ?? 0).toLocaleString()} ➔{' '}
                  <span className="text-emerald-400 font-extrabold">
                    {(newBalancePreview ?? 0).toLocaleString()} Coins
                  </span>
                </div>
              </div>
              <span className="text-[10px] px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-bold">
                PURCHASE · ADMIN_MANUAL
              </span>
            </div>
            {operation === 'add' || (operation === 'set' && creditCoinsPreview > 0) ? (
              <div className="text-[10px] text-slate-500 border-t border-slate-800 pt-2">
                Peg estimate (no cash paid):{' '}
                <span className="text-cyan-300 font-bold">${pegValuePreview.toFixed(4)}</span>
                {' '}liability @ Fixed Peg ({formatPegExample(peg)}). Paid USD stays empty;
                funding tab shows peg_value_usd.
              </div>
            ) : null}
          </div>

          <div className="flex items-center space-x-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-2 rounded text-xs font-semibold text-slate-400 hover:text-white bg-[#0F1115] border border-slate-800 hover:border-slate-700 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="flex-1 py-2 rounded text-xs font-mono font-bold text-white bg-indigo-600 hover:bg-indigo-500 border border-indigo-500 shadow-lg shadow-indigo-600/30 transition-all disabled:opacity-50"
            >
              {isSubmitting ? 'Posting ledger…' : 'Confirm PURCHASE Credit'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
