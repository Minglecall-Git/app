import React from 'react';
import { useApp } from '../../context/AppContext';
import {
  ShieldCheck,
  Lock,
  FileText,
  Coins,
  Sparkles,
  UserCheck,
  X,
  ExternalLink,
  CheckCircle2,
  Calendar,
  ArrowRight,
} from 'lucide-react';

interface PolicyDetailModalProps {
  onNavigateToTab?: (tab: string) => void;
}

export const PolicyDetailModal: React.FC<PolicyDetailModalProps> = ({ onNavigateToTab }) => {
  const {
    activePolicyDoc,
    closePolicyModal,
    policyDocuments,
    openPolicyModal,
    currentUser,
  } = useApp();

  if (!activePolicyDoc) return null;

  const getCategoryIcon = (iconName: string) => {
    switch (iconName) {
      case 'Lock':
        return <Lock className="w-5 h-5 text-indigo-500" />;
      case 'FileText':
        return <FileText className="w-5 h-5 text-emerald-500" />;
      case 'Coins':
        return <Coins className="w-5 h-5 text-amber-500" />;
      case 'Sparkles':
        return <Sparkles className="w-5 h-5 text-pink-500" />;
      case 'UserCheck':
        return <UserCheck className="w-5 h-5 text-cyan-500" />;
      case 'ShieldCheck':
      default:
        return <ShieldCheck className="w-5 h-5 text-rose-500" />;
    }
  };

  const formatContent = (content: string) => {
    const lines = content.split('\n');
    return lines.map((line, idx) => {
      if (line.startsWith('### ')) {
        return (
          <h3 key={idx} className="text-base font-extrabold text-app-heading mt-5 mb-2 flex items-center space-x-2 border-b border-hairline pb-1">
            <span className="w-2 h-2 rounded-full bg-pink-500 inline-block"></span>
            <span>{line.replace('### ', '')}</span>
          </h3>
        );
      }
      if (line.startsWith('* ') || line.startsWith('- ')) {
        const itemText = line.replace(/^[\*\-]\s+/, '');
        return (
          <li key={idx} className="text-app-muted text-xs sm:text-sm pl-2 py-1 leading-relaxed list-disc list-inside">
            {itemText}
          </li>
        );
      }
      if (line.trim() === '') {
        return <div key={idx} className="h-2"></div>;
      }
      return (
        <p key={idx} className="text-app-muted text-xs sm:text-sm leading-relaxed py-0.5">
          {line}
        </p>
      );
    });
  };

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-3 sm:p-6 backdrop-blur-md animate-in fade-in duration-200"
      style={{ backgroundColor: 'var(--app-overlay)' }}
    >
      <div
        className="bg-app-card border border-hairline rounded-3xl max-w-2xl w-full max-h-[90vh] flex flex-col shadow-app-lg overflow-hidden relative"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Top Header */}
        <div className="p-4 sm:p-5 bg-app-card-subtle border-b border-hairline flex items-center justify-between shrink-0">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-2xl bg-app-input border border-hairline flex items-center justify-center shadow-inner">
              {getCategoryIcon(activePolicyDoc.icon)}
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <span className="px-2 py-0.5 rounded-full bg-indigo-500/15 text-indigo-500 border border-indigo-500/30 text-[10px] font-mono font-bold uppercase tracking-wider">
                  {activePolicyDoc.category} Policy
                </span>
                <span className="text-[10px] text-app-muted flex items-center space-x-1">
                  <Calendar className="w-3 h-3" />
                  <span>Updated: {activePolicyDoc.lastUpdated}</span>
                </span>
              </div>
              <h2 className="text-base sm:text-lg font-black text-app-heading tracking-tight leading-tight mt-0.5">
                {activePolicyDoc.title}
              </h2>
            </div>
          </div>

          <button
            onClick={closePolicyModal}
            className="w-8 h-8 rounded-full bg-app-input hover:bg-brand-soft text-app-muted hover:text-app-heading border border-hairline flex items-center justify-center transition-colors shrink-0"
            title="Close modal"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Category Quick Tabs */}
        <div className="px-4 py-2.5 bg-app-card-subtle border-b border-hairline flex space-x-1.5 overflow-x-auto no-scrollbar shrink-0">
          {policyDocuments.map((doc) => {
            const isSelected = doc.id === activePolicyDoc.id;
            return (
              <button
                key={doc.id}
                onClick={() => openPolicyModal(doc.id)}
                className={`px-3 py-1 rounded-xl text-xs font-semibold whitespace-nowrap transition-all flex items-center space-x-1.5 cursor-pointer ${
                  isSelected
                    ? 'bg-pink-600 text-white shadow-md shadow-pink-600/30'
                    : 'bg-app-input text-app-muted hover:text-app-heading border border-hairline'
                }`}
              >
                <span>{doc.title.split('&')[0].trim()}</span>
              </button>
            );
          })}
        </div>

        {/* Scrollable Policy Body */}
        <div className="p-4 sm:p-6 overflow-y-auto space-y-4 flex-1 text-app-heading">
          {/* Summary Callout Banner */}
          <div className="p-3.5 rounded-2xl bg-indigo-500/10 border border-indigo-500/30 flex items-start space-x-3">
            <CheckCircle2 className="w-5 h-5 text-indigo-500 shrink-0 mt-0.5" />
            <div className="text-xs sm:text-sm text-app-muted leading-snug">
              <span className="font-bold text-app-heading block mb-0.5">Official Platform Standard:</span>
              {activePolicyDoc.summary}
            </div>
          </div>

          {/* Policy Text / Clauses */}
          <div className="space-y-2 bg-app-input p-4 rounded-2xl border border-hairline">
            {formatContent(activePolicyDoc.content)}
          </div>

          {/* External Legal Link if provided */}
          {activePolicyDoc.externalUrl && (
            <div className="pt-2">
              <a
                href={activePolicyDoc.externalUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center space-x-1.5 px-4 py-2 rounded-xl bg-app-input hover:bg-brand-soft text-indigo-500 text-xs font-bold border border-hairline transition-all"
              >
                <span>View Full Legal PDF Document</span>
                <ExternalLink className="w-3.5 h-3.5" />
              </a>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="p-4 bg-app-card-subtle border-t border-hairline flex items-center justify-between shrink-0">
          <div className="flex items-center space-x-2">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
            <span className="text-[11px] text-app-muted font-mono">100% Verified Community Standard</span>
          </div>

          <div className="flex items-center space-x-2">
            {currentUser.role === 'admin' && onNavigateToTab && (
              <button
                onClick={() => {
                  closePolicyModal();
                  onNavigateToTab('admin');
                }}
                className="px-3 py-1.5 rounded-xl bg-purple-500/10 border border-purple-500/40 text-purple-500 hover:bg-purple-500/20 text-xs font-semibold transition-all flex items-center space-x-1"
              >
                <span>Edit CMS</span>
                <ArrowRight className="w-3 h-3" />
              </button>
            )}
            <button
              onClick={closePolicyModal}
              className="px-4 py-1.5 rounded-xl bg-app-input hover:bg-brand-soft text-app-heading font-bold text-xs transition-colors border border-hairline"
            >
              I Understand & Agree
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
