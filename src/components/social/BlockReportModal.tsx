import React, { useState } from 'react';
import { useApp } from '../../context/AppContext';
import { X, ShieldAlert, Ban, Flag, CheckCircle2, Loader2 } from 'lucide-react';

interface BlockReportModalProps {
  isOpen: boolean;
  onClose: () => void;
  targetUserId: string | null;
  initialAction?: 'report' | 'block';
}

export const BlockReportModal: React.FC<BlockReportModalProps> = ({
  isOpen,
  onClose,
  targetUserId,
  initialAction = 'report',
}) => {
  const { users, blockUser, reportUser } = useApp();
  const [actionType, setActionType] = useState<'report' | 'block'>(initialAction);
  const [selectedReason, setSelectedReason] = useState<string>('Inappropriate Conduct / Content');
  const [customNote, setCustomNote] = useState<string>('');
  const [submitting, setSubmitting] = useState(false);

  if (!isOpen || !targetUserId) return null;

  const targetUser = users.find((u) => u.id === targetUserId);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return;

    const finalReason =
      selectedReason === 'Other' ? customNote.trim() || 'User Flagged' : selectedReason;
    const details = selectedReason === 'Other' ? customNote.trim() || undefined : undefined;

    setSubmitting(true);
    try {
      let ok = false;
      if (actionType === 'block') {
        ok = await blockUser(targetUserId, finalReason);
      } else {
        ok = await reportUser(targetUserId, finalReason, details);
      }
      if (ok) onClose();
    } finally {
      setSubmitting(false);
    }
  };

  const reasons = [
    'Inappropriate Conduct / Content',
    'Nudity or Sexual Harassment',
    'Fake Profile / Impersonation',
    'Commercial Spam or Scams',
    'Abusive Language',
    'Other',
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md">
      <div className="relative w-full max-w-md bg-[#161920] border border-slate-800 rounded-xl shadow-2xl overflow-hidden my-6">
        {/* Header */}
        <div className="flex items-center justify-between p-4 bg-[#0F1115] border-b border-slate-800">
          <div className="flex items-center space-x-2">
            <ShieldAlert className="w-5 h-5 text-rose-400" />
            <h2 className="text-sm font-black text-white uppercase tracking-wider font-mono">
              Safety Control & Moderation
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="p-1 rounded text-slate-400 hover:text-white hover:bg-slate-800 transition-colors disabled:opacity-50"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          {targetUser && (
            <div className="flex items-center space-x-3 p-3 bg-[#0F1115] border border-slate-800 rounded-lg">
              <img
                src={targetUser.avatarUrl}
                alt={targetUser.name}
                className="w-10 h-10 rounded-full object-cover border border-slate-700"
              />
              <div>
                <div className="font-bold text-white text-xs">{targetUser.name}</div>
                <div className="text-[10px] text-slate-400 font-mono">User ID: {targetUser.id}</div>
              </div>
            </div>
          )}

          {/* Action Selector */}
          <div>
            <label className="block text-[11px] font-mono text-slate-400 uppercase tracking-wider mb-1.5">
              Select Action Type
            </label>
            <div className="grid grid-cols-2 gap-2 font-mono text-xs">
              <button
                type="button"
                disabled={submitting}
                onClick={() => setActionType('report')}
                className={`py-2 px-3 rounded font-bold flex items-center justify-center space-x-1.5 border transition-all disabled:opacity-50 ${
                  actionType === 'report'
                    ? 'bg-amber-500/20 text-amber-300 border-amber-500'
                    : 'bg-[#0F1115] text-slate-400 border-slate-800'
                }`}
              >
                <Flag className="w-3.5 h-3.5" />
                <span>Flag / Report</span>
              </button>

              <button
                type="button"
                disabled={submitting}
                onClick={() => setActionType('block')}
                className={`py-2 px-3 rounded font-bold flex items-center justify-center space-x-1.5 border transition-all disabled:opacity-50 ${
                  actionType === 'block'
                    ? 'bg-rose-600 text-white border-rose-500'
                    : 'bg-[#0F1115] text-slate-400 border-slate-800'
                }`}
              >
                <Ban className="w-3.5 h-3.5" />
                <span>Block User</span>
              </button>
            </div>
          </div>

          {/* Reason Radio Options */}
          <div>
            <label className="block text-[11px] font-mono text-slate-400 uppercase tracking-wider mb-2">
              Primary Reason
            </label>
            <div className="space-y-1.5">
              {reasons.map((r) => (
                <label
                  key={r}
                  onClick={() => !submitting && setSelectedReason(r)}
                  className={`flex items-center justify-between p-2.5 rounded border text-xs cursor-pointer transition-all ${
                    selectedReason === r
                      ? 'bg-indigo-500/10 border-indigo-500 text-white font-bold'
                      : 'bg-[#0F1115] border-slate-800 text-slate-300 hover:border-slate-700'
                  }`}
                >
                  <span>{r}</span>
                  {selectedReason === r && <CheckCircle2 className="w-3.5 h-3.5 text-indigo-400" />}
                </label>
              ))}
            </div>

            {selectedReason === 'Other' && (
              <textarea
                placeholder="Describe the issue for our safety team..."
                value={customNote}
                disabled={submitting}
                onChange={(e) => setCustomNote(e.target.value)}
                className="w-full mt-2 p-2.5 bg-[#0F1115] border border-slate-800 rounded text-xs text-white focus:outline-none focus:border-indigo-500 disabled:opacity-50"
                rows={2}
                maxLength={2000}
              />
            )}
          </div>

          {/* Submit */}
          <div className="flex items-center space-x-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              className="flex-1 py-2 rounded text-xs font-semibold text-slate-400 bg-[#0F1115] border border-slate-800 hover:text-white disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className={`flex-1 py-2 rounded text-xs font-mono font-bold text-white border transition-all disabled:opacity-60 flex items-center justify-center gap-1.5 ${
                actionType === 'block'
                  ? 'bg-rose-600 hover:bg-rose-500 border-rose-500'
                  : 'bg-indigo-600 hover:bg-indigo-500 border-indigo-500'
              }`}
            >
              {submitting && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              {actionType === 'block' ? 'Confirm Block' : 'Submit Report'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
