import React, { useState, useMemo, useEffect, useRef } from 'react';
import { useApp } from '../../context/AppContext';
import {
  Coins,
  TrendingDown,
  Video,
  Clock,
  AlertCircle,
  CheckCircle2,
  Building,
  CreditCard,
  Wallet,
  ShieldCheck,
  History,
  PhoneCall,
  Users,
  Eye,
  Star,
  Zap,
  Activity,
  Layers,
  Award,
  Calendar,
  Sparkles,
  ArrowUpRight,
  Filter,
  BarChart3,
  FileText,
  Lock,
  MessageCircle,
  Download,
  Printer,
  ChevronRight,
  RefreshCw,
  Search,
  ExternalLink,
} from 'lucide-react';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  CartesianGrid,
} from 'recharts';
import {
  computeCallerSpendingData,
  computeCallerMetrics,
  computeFavoriteHosts,
  computeCallSpendingStatements,
  computeWalletLedger,
  SpendingDataPoint,
} from '../../utils/analyticsHelper';
import { getCoinUsdPeg } from '../../../shared/finance/fx';
import { getFallbackAvatar } from '../../utils/avatars';
import { InvoiceDetailModal } from './InvoiceDetailModal';
import { TransactionReceipt, UserProfile } from '../../types';
import { authFetch } from '../../utils/apiClient';

interface MaleUserAnalyticsDashboardProps {
  user?: UserProfile;
  onOpenStore?: () => void;
  onStartCall?: (creatorId: string) => void;
  onOpenChat?: (creatorId: string) => void;
}

export const MaleUserAnalyticsDashboard: React.FC<MaleUserAnalyticsDashboardProps> = ({
  user,
  onOpenStore,
  onStartCall,
  onOpenChat,
}) => {
  const {
    currentUser,
    systemSettings,
    callLogs,
    friends,
    users,
  } = useApp();
  const activeUser = user || currentUser;

  // Active Timeframe for Spending Chart
  const [timeframe, setTimeframe] = useState<'daily' | 'weekly'>('daily');

  // Active Sub-tab in Male Analytics Dashboard
  const [activeSection, setActiveSection] = useState<
    'financial' | 'history' | 'insights' | 'receipts'
  >('financial');

  // Ledger Filter & Search
  const [ledgerCategoryFilter, setLedgerCategoryFilter] = useState<string>('all');
  const [ledgerSearchQuery, setLedgerSearchQuery] = useState('');

  // Selected Receipt for Invoice Modal
  const [selectedReceipt, setSelectedReceipt] = useState<TransactionReceipt | null>(null);

  // Auto-Recharge is not live billing — Coming soon only (no toggles that pretend it works)
  const autoRechargeEnabled = false;

  // Real Caller Metrics — always scoped to activeUser (admin inspecting another user sees that user's metrics only)
  const callerMetrics = useMemo(() => {
    return computeCallerMetrics(activeUser, callLogs, systemSettings);
  }, [activeUser, callLogs, systemSettings]);

  // Call history for the inspected caller only (never leak platform-wide logs into personal view)
  const myCallLogs = useMemo(() => {
    return callLogs.filter((log) => log.callerId === activeUser.id);
  }, [callLogs, activeUser.id]);

  // Live Wallet Ledger (authoritative wallet_ledger API)
  const [ledgerRows, setLedgerRows] = useState<any[] | null>(null);
  const [ledgerLoadState, setLedgerLoadState] = useState<'loading' | 'ok' | 'error'>('loading');
  const ledgerRowsRef = useRef(ledgerRows);
  ledgerRowsRef.current = ledgerRows;
  const ledgerLoadedForUserRef = useRef<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const loadLedger = async () => {
      const userChanged =
        ledgerLoadedForUserRef.current != null && ledgerLoadedForUserRef.current !== activeUser.id;
      const hasRows = Array.isArray(ledgerRowsRef.current);
      // Full loading skeleton only on first load or when inspecting a different user
      if (userChanged || !hasRows) {
        if (userChanged) setLedgerRows(null);
        setLedgerLoadState('loading');
      }

      try {
        const res = await authFetch(
          `/api/calls/wallet-ledger?userId=${encodeURIComponent(activeUser.id)}`
        );
        const json = await res.json().catch(() => ({}));
        if (cancelled) return;
        ledgerLoadedForUserRef.current = activeUser.id;
        if (json?.success && Array.isArray(json.data)) {
          setLedgerRows(json.data);
          setLedgerLoadState('ok');
        } else {
          setLedgerRows(null);
          setLedgerLoadState('error');
        }
      } catch {
        if (!cancelled) {
          setLedgerRows(null);
          setLedgerLoadState('error');
        }
      }
    };
    void loadLedger();
    return () => {
      cancelled = true;
    };
  }, [activeUser.id]);

  const walletLedger = useMemo(() => {
    return computeWalletLedger(activeUser, callLogs, ledgerRows);
  }, [activeUser, callLogs, ledgerRows]);

  const ledgerIsDerived = useMemo(
    () => walletLedger.some((e) => String(e.id).startsWith('derived_')),
    [walletLedger]
  );

  const peg = getCoinUsdPeg(systemSettings);

  // A1: Call spending statements from real call logs (not purchase invoices)
  const transactionReceipts = useMemo(() => {
    return computeCallSpendingStatements(
      activeUser.id,
      callLogs,
      peg
    );
  }, [activeUser.id, callLogs, peg]);

  // Live Favorite Hosts
  const favoriteHosts = useMemo(() => {
    return computeFavoriteHosts(
      activeUser.id,
      callLogs,
      users,
      friends,
      peg
    );
  }, [activeUser.id, callLogs, users, friends, peg]);

  // Filtered Wallet Ledger Entries
  const filteredLedger = useMemo(() => {
    return walletLedger.filter((item) => {
      if (ledgerCategoryFilter !== 'all' && item.category !== ledgerCategoryFilter) {
        return false;
      }
      if (ledgerSearchQuery.trim()) {
        const q = ledgerSearchQuery.toLowerCase();
        return item.title.toLowerCase().includes(q);
      }
      return true;
    });
  }, [walletLedger, ledgerCategoryFilter, ledgerSearchQuery]);

  const chartData: SpendingDataPoint[] = useMemo(() => {
    return computeCallerSpendingData(activeUser.id, callLogs, peg, timeframe);
  }, [activeUser.id, callLogs, peg, timeframe]);

  return (
    <div id="male-user-analytics-dashboard" className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 py-6 space-y-6">
      {/* 1. Header Banner */}
      <div className="relative rounded-3xl bg-gradient-to-r from-indigo-950 via-[#101426] to-[#0A0E17] border border-indigo-500/30 p-6 sm:p-8 shadow-2xl overflow-hidden">
        {/* Ambient Glow */}
        <div className="absolute top-0 right-0 w-96 h-96 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none" />

        <div className="relative z-10 flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
          <div className="space-y-2">
            <div className="inline-flex items-center space-x-2 px-3 py-1 rounded-full bg-indigo-500/20 border border-indigo-500/40 text-indigo-300 text-xs font-semibold font-mono">
              <Coins className="w-3.5 h-3.5" />
              <span>Male Spender Usage & Calling Analytics Hub</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-black text-white tracking-tight">
              User Spending, Habits & Interaction Ledger
            </h1>
            <p className="text-xs text-slate-300 max-w-2xl leading-relaxed">
              Coin balance, 1-on-1 call spend, favorite hosts, and wallet ledger from your real activity — not payment-gateway invoices.
            </p>
          </div>

          {/* Quick Wallet Pill & Top Up */}
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 bg-slate-900/90 border border-indigo-500/40 p-4 sm:p-5 rounded-2xl shadow-xl">
            <div>
              <div className="text-[11px] font-mono font-bold text-slate-400 uppercase tracking-wider">
                Current Coin Balance
              </div>
              <div className="text-2xl sm:text-3xl font-black text-amber-400 font-mono flex items-center space-x-2">
                <span>🪙</span>
                <span>{(activeUser?.coinBalance ?? 0).toLocaleString()}</span>
              </div>
              <div className="text-[11px] text-slate-400 font-mono mt-0.5">
                Friend call discounts apply when chatting with friends
              </div>
            </div>

            <div className="flex flex-col gap-1.5 mt-2 sm:mt-0">
              {onOpenStore && (
                <button
                  id="user-analytics-topup-btn"
                  onClick={onOpenStore}
                  className="px-4 py-2 rounded-xl bg-gradient-to-r from-amber-500 to-yellow-500 hover:from-amber-400 hover:to-yellow-400 text-slate-950 font-black text-xs font-mono transition-all shadow-lg shadow-amber-500/20 hover:scale-105 cursor-pointer flex items-center space-x-1.5"
                >
                  <Coins className="w-3.5 h-3.5" />
                  <span>Top Up Coins</span>
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Sub-Section Navigation Tabs */}
        <div className="flex items-center space-x-2 mt-6 pt-4 border-t border-slate-800/80 overflow-x-auto pb-1 scrollbar-none">
          <button
            onClick={() => setActiveSection('financial')}
            className={`px-4 py-2 rounded-xl text-xs font-bold font-mono transition-all shrink-0 flex items-center space-x-1.5 ${
              activeSection === 'financial'
                ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/30 font-black'
                : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
            }`}
          >
            <Coins className="w-3.5 h-3.5" />
            <span>Financial & Spending Ledger</span>
          </button>

          <button
            onClick={() => setActiveSection('history')}
            className={`px-4 py-2 rounded-xl text-xs font-bold font-mono transition-all shrink-0 flex items-center space-x-1.5 ${
              activeSection === 'history'
                ? 'bg-pink-600 text-white shadow-md shadow-pink-600/30'
                : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
            }`}
          >
            <PhoneCall className="w-3.5 h-3.5" />
            <span>Call Logs & Consumed Minutes</span>
          </button>

          <button
            onClick={() => setActiveSection('insights')}
            className={`px-4 py-2 rounded-xl text-xs font-bold font-mono transition-all shrink-0 flex items-center space-x-1.5 ${
              activeSection === 'insights'
                ? 'bg-amber-500 text-slate-950 shadow-md shadow-amber-500/20 font-black'
                : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
            }`}
          >
            <Star className="w-3.5 h-3.5" />
            <span>Favorite Hosts</span>
          </button>

          <button
            onClick={() => setActiveSection('receipts')}
            className={`px-4 py-2 rounded-xl text-xs font-bold font-mono transition-all shrink-0 flex items-center space-x-1.5 ${
              activeSection === 'receipts'
                ? 'bg-emerald-600 text-white shadow-md shadow-emerald-600/30'
                : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
            }`}
          >
            <FileText className="w-3.5 h-3.5" />
            <span>Call Spending Statements ({transactionReceipts.length})</span>
          </button>
        </div>
      </div>

      {/* 2. TOP KPI CARDS (Male Spender Metrics) */}
      <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        {/* Card 1: Consumed Call Minutes */}
        <div className="p-4 sm:p-5 bg-[#13161F] border border-slate-800 rounded-2xl shadow-lg space-y-1">
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-[11px] font-bold font-mono uppercase flex items-center space-x-1.5">
              <span>Total Talk Time</span>
            </span>
            <Clock className="w-4 h-4 text-indigo-400" />
          </div>
          <div className="text-xl sm:text-2xl font-black text-white font-mono">
            {callerMetrics.totalMinutes} <span className="text-xs text-slate-400 font-normal">mins</span>
          </div>
          <div className="text-[10px] text-indigo-400 font-mono flex items-center space-x-1">
            <Video className="w-3 h-3" />
            <span>{callerMetrics.videoMinutes}m Video • {callerMetrics.audioMinutes}m Audio</span>
          </div>
        </div>

        {/* Card 2: Total Spent This Month */}
        <div className="p-4 sm:p-5 bg-[#13161F] border border-slate-800 rounded-2xl shadow-lg space-y-1">
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-[11px] font-bold font-mono uppercase flex items-center space-x-1.5">
              <span>Monthly Expenditure</span>
            </span>
            <TrendingDown className="w-4 h-4 text-amber-400" />
          </div>
          <div className="text-xl sm:text-2xl font-black text-white font-mono">
            {callerMetrics.monthlyCoinsSpent.toLocaleString()} <span className="text-xs text-amber-300 font-normal">🪙 coins</span>
          </div>
          <div className="text-[10px] text-slate-400 font-mono">
            ~${callerMetrics.monthlyUSDSpent.toFixed(2)} USD Equivalent
          </div>
        </div>

        {/* Card 3: Total Coins Spent (real call logs) — gifts KPI omitted (no gifts-sent ledger) */}
        <div className="p-4 sm:p-5 bg-[#13161F] border border-slate-800 rounded-2xl shadow-lg space-y-1">
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-[11px] font-bold font-mono uppercase flex items-center space-x-1.5">
              <span>Coins Spent on Calls</span>
            </span>
            <Coins className="w-4 h-4 text-pink-400" />
          </div>
          <div className="text-xl sm:text-2xl font-black text-white font-mono">
            {callerMetrics.totalCoinsSpent.toLocaleString()}{' '}
            <span className="text-xs text-pink-300 font-normal">🪙</span>
          </div>
          <div className="text-[10px] text-pink-400 font-mono">
            ~${callerMetrics.totalUSDSpent.toFixed(2)} USD from call logs
          </div>
        </div>

        {/* Card 4: Friend Discount Savings */}
        <div className="p-4 sm:p-5 bg-[#13161F] border border-slate-800 rounded-2xl shadow-lg space-y-1">
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-[11px] font-bold font-mono uppercase flex items-center space-x-1.5">
              <span>Friend Rate Savings</span>
            </span>
            <Award className="w-4 h-4 text-yellow-400" />
          </div>
          <div className="text-xl sm:text-2xl font-black text-emerald-400 font-mono">
            {callerMetrics.friendSavingsCoins.toLocaleString()} 🪙 <span className="text-xs text-emerald-300 font-normal">saved</span>
          </div>
          <div className="text-[10px] text-yellow-400 font-mono">
            ${callerMetrics.friendSavingsUSD.toFixed(2)} USD Saved via Friend Rates
          </div>
        </div>
      </div>

      {/* 3. SECTION 1: FINANCIAL & SPENDING LEDGER */}
      {activeSection === 'financial' && (
        <div className="space-y-6">
          
          {/* Spending Analytics Graph Card */}
          <div className="p-5 sm:p-6 bg-[#13161F] border border-slate-800 rounded-3xl space-y-5 shadow-xl">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
              <div>
                <h3 className="text-base font-black text-white font-mono uppercase tracking-wider flex items-center space-x-2">
                  <BarChart3 className="w-4 h-4 text-indigo-400" />
                  <span>Spending Distribution & Habits (Coins)</span>
                </h3>
                <p className="text-xs text-slate-400">
                  Coins spent on 1-on-1 calls from live call logs.
                </p>
              </div>

              {/* Timeframe Filter */}
              <div className="flex items-center space-x-1 bg-slate-950 p-1 rounded-xl border border-slate-800">
                <button
                  onClick={() => setTimeframe('daily')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-mono font-bold transition-all cursor-pointer ${
                    timeframe === 'daily'
                      ? 'bg-indigo-600 text-white font-black shadow-sm'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  Daily (7 Days)
                </button>
                <button
                  onClick={() => setTimeframe('weekly')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-mono font-bold transition-all cursor-pointer ${
                    timeframe === 'weekly'
                      ? 'bg-indigo-600 text-white font-black shadow-sm'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  Weekly (8 Weeks)
                </button>
              </div>
            </div>

            {/* Recharts Area Chart — call spend only (no zero Chat/Gifts/Moments series) */}
            <div className="h-72 w-full pt-2">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chartData} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                  <defs>
                    <linearGradient id="colorCallSpend" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#6366F1" stopOpacity={0.4} />
                      <stop offset="95%" stopColor="#6366F1" stopOpacity={0.0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1E293B" />
                  <XAxis dataKey="period" stroke="#64748B" fontSize={11} tickLine={false} />
                  <YAxis stroke="#64748B" fontSize={11} tickFormatter={(val) => `${val}🪙`} tickLine={false} />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: '#0F172A',
                      borderColor: '#334155',
                      borderRadius: '12px',
                      fontSize: '12px',
                      color: '#F8FAFC',
                    }}
                    formatter={(value: any) => [`${Number(value).toLocaleString()} 🪙 Coins`, '']}
                  />
                  <Legend
                    wrapperStyle={{ fontSize: '11px', paddingTop: '8px' }}
                    formatter={(val) => (
                      <span className="text-slate-300 font-mono text-xs capitalize">{val}</span>
                    )}
                  />
                  <Area
                    type="monotone"
                    dataKey="videoCallsCoins"
                    name="1-on-1 Call Spend"
                    stroke="#6366F1"
                    strokeWidth={2}
                    fillOpacity={1}
                    fill="url(#colorCallSpend)"
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Auto-Recharge Control & Wallet Ledger Grid */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            
            {/* Auto-Recharge Widget — Coming soon (not live billing) */}
            <div className="p-5 sm:p-6 bg-[#13161F] border border-slate-800 rounded-3xl space-y-4 shadow-xl opacity-80">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  <Zap className="w-5 h-5 text-amber-400" />
                  <h3 className="text-sm font-black text-white font-mono uppercase tracking-wider">
                    Auto-Recharge
                  </h3>
                </div>
                <span className="px-3 py-1 rounded-full text-xs font-mono font-bold bg-slate-800 text-amber-300 border border-amber-500/30">
                  Coming soon
                </span>
              </div>

              <p className="text-xs text-slate-400">
                Automatic wallet top-ups are not available. Coin purchases will require a real payment integration when this launches.
              </p>

              <div className="p-3 bg-slate-950 rounded-xl border border-slate-800 text-[11px] text-slate-500 font-mono space-y-1">
                <div className="flex justify-between">
                  <span>Status:</span>
                  <span className="text-amber-400 font-bold">Not live</span>
                </div>
                <div className="flex justify-between">
                  <span>Billing:</span>
                  <span>{autoRechargeEnabled ? 'Enabled' : 'Disabled'}</span>
                </div>
              </div>
            </div>

            {/* Wallet Ledger Table (Span 2) */}
            <div className="lg:col-span-2 p-5 sm:p-6 bg-[#13161F] border border-slate-800 rounded-3xl space-y-4 shadow-xl">
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                <div className="flex items-center space-x-2">
                  <History className="w-5 h-5 text-indigo-400" />
                  <h3 className="text-sm font-black text-white font-mono uppercase tracking-wider">
                    Coin Debits & Credits Ledger
                  </h3>
                </div>

                {/* Filters */}
                <div className="flex items-center space-x-2 w-full sm:w-auto">
                  <select
                    value={ledgerCategoryFilter}
                    onChange={(e) => setLedgerCategoryFilter(e.target.value)}
                    className="px-2.5 py-1.5 bg-slate-950 border border-slate-800 rounded-xl text-[11px] font-mono text-slate-300"
                  >
                    <option value="all">All Categories</option>
                    <option value="call_spend">Video Calls</option>
                    <option value="gift_spend">Virtual Gifts</option>
                    <option value="topup_purchase">Top-Up Purchases</option>
                    <option value="daily_bonus">Daily Bonus</option>
                  </select>
                </div>
              </div>

              {ledgerIsDerived && (
                <div className="px-3 py-2 rounded-xl bg-amber-500/10 border border-amber-500/30 text-[11px] text-amber-200 font-mono">
                  Showing call-history estimates — wallet ledger was unavailable. Balances after each entry may be incomplete.
                </div>
              )}
              {ledgerLoadState === 'ok' && Array.isArray(ledgerRows) && ledgerRows.length === 0 && filteredLedger.length === 0 && (
                <div className="px-3 py-2 rounded-xl bg-slate-900 border border-slate-800 text-[11px] text-slate-400 font-mono">
                  No wallet ledger rows yet. Call billing and reward credits will appear here after activity is recorded.
                </div>
              )}

              {/* Transactions List */}
              <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
                {filteredLedger.length === 0 && !(ledgerLoadState === 'ok' && Array.isArray(ledgerRows) && ledgerRows.length === 0) && !ledgerIsDerived ? (
                  <div className="p-6 text-center text-slate-500 font-mono text-xs border border-dashed border-slate-800 rounded-2xl">
                    {ledgerLoadState === 'loading' ? 'Loading wallet ledger…' : 'No ledger entries for this filter.'}
                  </div>
                ) : null}
                {filteredLedger.map((entry) => (
                  <div
                    key={entry.id}
                    className="p-3 bg-slate-950 border border-slate-800/80 rounded-2xl flex items-center justify-between font-mono text-xs hover:border-slate-700 transition-all"
                  >
                    <div className="flex items-center space-x-3">
                      <div
                        className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
                          entry.type === 'credit'
                            ? 'bg-emerald-500/20 border border-emerald-500/40 text-emerald-400'
                            : 'bg-rose-500/20 border border-rose-500/40 text-rose-400'
                        }`}
                      >
                        {entry.type === 'credit' ? '+' : '−'}
                      </div>
                      <div>
                        <div className="font-bold text-white text-xs">{entry.title}</div>
                        <div className="text-[10px] text-slate-500 flex items-center space-x-2 mt-0.5">
                          <span>{entry.timestamp}</span>
                          {entry.counterpartName && (
                            <>
                              <span>•</span>
                              <span className="text-pink-400 font-bold">{entry.counterpartName}</span>
                            </>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="text-right">
                      <div
                        className={`font-black text-xs ${
                          entry.type === 'credit' ? 'text-emerald-400' : 'text-slate-200'
                        }`}
                      >
                        {entry.type === 'credit'
                          ? `+${Math.abs(entry.coins).toLocaleString()}`
                          : `−${Math.abs(entry.coins).toLocaleString()}`}{' '}
                        🪙
                      </div>
                      <div className="text-[10px] text-slate-500 mt-0.5">
                        Bal: {(entry.balanceAfter ?? 0).toLocaleString()} 🪙
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 4. SECTION 2: CALL LOGS & INTERACTION HISTORY */}
      {activeSection === 'history' && (
        <div className="space-y-6">
          <div className="p-5 sm:p-6 bg-[#13161F] border border-slate-800 rounded-3xl space-y-4 shadow-xl">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
              <div>
                <h3 className="text-sm font-black text-white font-mono uppercase tracking-wider flex items-center space-x-2">
                  <PhoneCall className="w-4 h-4 text-pink-400" />
                  <span>Call Logs Timeline & Session Ledger</span>
                </h3>
                <p className="text-xs text-slate-400">
                  History of all incoming and outgoing 1-on-1 calls with duration, rate, coins spent, and 1-click re-dial.
                </p>
              </div>

              <div className="flex items-center space-x-2 font-mono text-xs bg-slate-950 p-2 rounded-xl border border-slate-800">
                <span className="text-slate-400">Total Calls:</span>
                <span className="text-white font-bold">{myCallLogs.length}</span>
              </div>
            </div>

            {/* Timeline List */}
            {myCallLogs.length === 0 ? (
              <div className="p-10 rounded-2xl bg-slate-950/60 border border-dashed border-slate-800 text-center space-y-2">
                <PhoneCall className="w-8 h-8 text-slate-600 mx-auto" />
                <div className="font-bold text-white text-xs">No Call Records Found</div>
                <p className="text-[11px] text-slate-400 max-w-sm mx-auto">
                  Start a video call with female creators from Discovery or the Swipe Deck to populate your calling timeline.
                </p>
              </div>
            ) : (
              <div className="space-y-2.5">
                {myCallLogs.map((log) => {
                  const mins = Math.floor(log.durationSeconds / 60);
                  const secs = log.durationSeconds % 60;
                  const otherUserId = log.receiverId === activeUser.id ? log.callerId : log.receiverId;
                  const otherUser = users.find((u) => u.id === otherUserId);
                  const isUuid = (s?: string) => !s || /^[0-9a-f]{8}-[0-9a-f]{4}/i.test(s) || s.startsWith('user_');
                  const otherDisplayName = otherUser?.name || (!isUuid(log.receiverName) ? log.receiverName : otherUser?.name || 'Creator Host');
                  const otherAvatar = otherUser?.avatarUrl || log.receiverAvatar || getFallbackAvatar(otherDisplayName, 'female');

                  const isMissedCall = log.status === 'missed' || log.status === 'declined' || log.status === 'unanswered' || (log.durationSeconds === 0 && log.coinsSpent === 0);

                  return (
                    <div
                      key={log.id}
                      className={`p-4 rounded-2xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 transition-all font-mono text-xs ${
                        isMissedCall
                          ? 'bg-slate-950/90 border border-rose-900/30 hover:border-rose-700/50'
                          : 'bg-slate-950 border border-slate-800/80 hover:border-slate-700'
                      }`}
                    >
                      <div className="flex items-center space-x-3">
                        <img
                          src={otherAvatar}
                          alt={otherDisplayName}
                          onError={(e) => {
                            (e.target as HTMLImageElement).src = getFallbackAvatar(otherDisplayName, 'female');
                          }}
                          className={`w-10 h-10 rounded-xl object-cover ring-1 bg-slate-800 shrink-0 ${
                            isMissedCall ? 'ring-rose-500/40' : 'ring-pink-500/30'
                          }`}
                        />
                        <div>
                          <div className="font-bold text-white text-xs flex items-center space-x-2">
                            <span>{otherDisplayName}</span>
                            {isMissedCall ? (
                              <span className="px-1.5 py-0.5 rounded bg-rose-500/20 text-rose-300 text-[10px] font-bold">
                                {log.status === 'declined' ? 'Declined / Busy' : 'Unanswered / Missed'}
                              </span>
                            ) : log.wasFriendCall ? (
                              <span className="px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300 text-[10px] font-bold">
                                5🪙 Friend Rate
                              </span>
                            ) : null}
                          </div>
                          <div className="text-[10px] text-slate-400 mt-0.5">
                            {log.timestamp} • Duration: {isMissedCall ? '0m 0s (Unanswered)' : `${mins}m ${secs}s`}
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center space-x-4 self-end sm:self-center">
                        <div className="text-right">
                          <div className={`font-black text-xs ${isMissedCall ? 'text-slate-400' : 'text-amber-400'}`}>
                            {isMissedCall ? '0 🪙' : `-${log.coinsSpent} 🪙 coins`}
                          </div>
                          <div className={`text-[10px] ${isMissedCall ? 'text-rose-400' : 'text-emerald-400'}`}>
                            {isMissedCall ? 'No Answer' : 'Completed Session'}
                          </div>
                        </div>

                        <div className="flex items-center gap-2 shrink-0">
                          {onOpenChat && (
                            <button
                              type="button"
                              onClick={() => onOpenChat(otherUserId)}
                              className="h-10 w-10 flex items-center justify-center rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700 transition-all cursor-pointer"
                              title="Open Direct Chat"
                              aria-label="Open Direct Chat"
                            >
                              <MessageCircle className="w-4 h-4 text-indigo-400" />
                            </button>
                          )}
                          {onStartCall && (
                            <button
                              type="button"
                              onClick={() => onStartCall(otherUserId)}
                              className={`h-10 w-10 flex items-center justify-center rounded-xl transition-all cursor-pointer shadow-md ${
                                isMissedCall
                                  ? 'bg-gradient-to-r from-pink-600 to-rose-600 hover:from-pink-500 hover:to-rose-500 text-white'
                                  : 'bg-pink-600 hover:bg-pink-500 text-white'
                              }`}
                              title={isMissedCall ? 'Redial' : 'Start Video Call'}
                              aria-label={isMissedCall ? 'Redial' : 'Start Video Call'}
                            >
                              <Video className="w-4 h-4" />
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* 5. SECTION 3: FAVORITE HOSTS */}
      {activeSection === 'insights' && (
        <div className="space-y-6">
          
          {/* Favorite Hosts Ledger */}
          <div className="p-5 sm:p-6 bg-[#13161F] border border-slate-800 rounded-3xl space-y-4 shadow-xl">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-black text-white font-mono uppercase tracking-wider flex items-center space-x-2">
                  <Star className="w-4 h-4 text-amber-400 fill-amber-400/20" />
                  <span>Favorite Creators Ledger</span>
                </h3>
                <p className="text-xs text-slate-400">
                  Quick access to your most-called creators with total talk time, friend discounts, and 1-click calling.
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {favoriteHosts.length > 0 ? (
                favoriteHosts.map((host) => (
                <div
                  key={host.creatorId}
                  className="p-4 bg-slate-950 border border-slate-800/80 rounded-2xl space-y-3 hover:border-indigo-500/50 transition-all font-mono text-xs flex flex-col justify-between"
                >
                  <div className="space-y-2.5">
                    <div className="flex items-center space-x-3">
                      <img
                        src={host.avatarUrl}
                        alt={host.name}
                        className="w-12 h-12 rounded-2xl object-cover ring-1 ring-slate-700 shrink-0"
                      />
                      <div className="min-w-0">
                        <div className="font-bold text-white text-xs truncate">{host.name}</div>
                        <div className="text-[10px] text-slate-400">{host.nationality}</div>
                        {host.isFriend ? (
                          <span className="inline-block mt-1 px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300 text-[10px] font-bold">
                            Friend ({systemSettings.coinBurnRateFriendPerMin ?? 80}🪙/min)
                          </span>
                        ) : (
                          <span className="inline-block mt-1 px-1.5 py-0.5 rounded bg-slate-800 text-slate-400 text-[10px]">
                            Standard Rate
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="p-2.5 rounded-xl bg-slate-900 border border-slate-800/80 space-y-1 text-[10px]">
                      <div className="flex justify-between text-slate-400">
                        <span>Total Talk Time:</span>
                        <strong className="text-white">{host.totalMinutes} mins</strong>
                      </div>
                      <div className="flex justify-between text-slate-400">
                        <span>Total Spent:</span>
                        <strong className="text-amber-400">{host.totalCoinsSpent} 🪙</strong>
                      </div>
                      <div className="flex justify-between text-slate-400">
                        <span>Calls:</span>
                        <strong className="text-white">{host.callsCount}</strong>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center space-x-2 pt-1">
                    {onStartCall && (
                      <button
                        onClick={() => onStartCall(host.creatorId)}
                        className="flex-1 py-2 rounded-xl bg-gradient-to-r from-pink-600 to-rose-600 hover:from-pink-500 hover:to-rose-500 text-white font-bold text-xs flex items-center justify-center space-x-1 transition-all cursor-pointer"
                      >
                        <Video className="w-3.5 h-3.5" />
                        <span>Call</span>
                      </button>
                    )}
                    {onOpenChat && (
                      <button
                        onClick={() => onOpenChat(host.creatorId)}
                        className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition-all cursor-pointer"
                      >
                        <MessageCircle className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </div>
              ))
              ) : (
                <div className="col-span-full p-8 bg-slate-950 border border-slate-800 rounded-2xl text-center space-y-2 font-mono">
                  <div className="text-slate-400 text-xs">No favorite creators yet.</div>
                  <p className="text-[11px] text-slate-500">
                    Your frequently called hosts will appear here for fast 1-click calls.
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* 6. SECTION 4: CALL SPENDING STATEMENTS */}
      {activeSection === 'receipts' && (
        <div className="space-y-6">
          <div className="p-5 sm:p-6 bg-[#13161F] border border-slate-800 rounded-3xl space-y-4 shadow-xl">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
              <div>
                <h3 className="text-sm font-black text-white font-mono uppercase tracking-wider flex items-center space-x-2">
                  <FileText className="w-4 h-4 text-emerald-400" />
                  <span>Call Spending Statements</span>
                </h3>
                <p className="text-xs text-slate-400">
                  Itemized coin debits from your 1-on-1 calls. Coin purchase invoices will appear here when payments go live.
                </p>
              </div>

              {onOpenStore && (
                <button
                  onClick={onOpenStore}
                  className="px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold font-mono text-xs transition-all shadow-md flex items-center space-x-1.5 cursor-pointer"
                >
                  <Coins className="w-3.5 h-3.5" />
                  <span>Buy More Coins</span>
                </button>
              )}
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left font-mono text-xs">
                <thead className="bg-slate-950 text-slate-400 border-b border-slate-800 text-[10px] uppercase">
                  <tr>
                    <th className="py-3 px-4">Statement #</th>
                    <th className="py-3 px-4">Description</th>
                    <th className="py-3 px-4">Coins Debited</th>
                    <th className="py-3 px-4">Est. USD</th>
                    <th className="py-3 px-4">Source</th>
                    <th className="py-3 px-4">Status</th>
                    <th className="py-3 px-4">Date</th>
                    <th className="py-3 px-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60 text-slate-300">
                  {transactionReceipts.length > 0 ? (
                    transactionReceipts.map((receipt) => (
                    <tr key={receipt.id} className="hover:bg-slate-900/40 transition-colors">
                      <td className="py-3.5 px-4 font-bold text-indigo-400">{receipt.statementNumber}</td>
                      <td className="py-3.5 px-4 font-bold text-white">{receipt.description}</td>
                      <td className="py-3.5 px-4">
                        <span className="text-amber-400 font-bold">
                          −{receipt.coinsDebited.toLocaleString()} 🪙
                        </span>
                      </td>
                      <td className="py-3.5 px-4 font-black text-white">${receipt.amountUSD.toFixed(2)}</td>
                      <td className="py-3.5 px-4 uppercase text-[11px] text-slate-400">
                        Call billing
                      </td>
                      <td className="py-3.5 px-4">
                        <span className="px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider bg-indigo-500/20 text-indigo-300 border border-indigo-500/40">
                          {receipt.status}
                        </span>
                      </td>
                      <td className="py-3.5 px-4 text-slate-400 text-[11px]">{receipt.createdAt}</td>
                      <td className="py-3.5 px-4 text-right">
                        <button
                          onClick={() => setSelectedReceipt(receipt)}
                          className="px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 hover:text-white font-mono text-[11px] font-bold transition-all inline-flex items-center space-x-1 cursor-pointer border border-slate-700"
                        >
                          <Eye className="w-3.5 h-3.5" />
                          <span>View</span>
                        </button>
                      </td>
                    </tr>
                  ))
                  ) : (
                    <tr>
                      <td colSpan={8} className="py-8 text-center text-slate-400 font-mono text-xs">
                        No call spending yet. Completed calls will appear here as statements. Coin purchase invoices will show when payments go live.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* 7. STATEMENT DETAIL MODAL */}
      <InvoiceDetailModal
        receipt={selectedReceipt}
        onClose={() => setSelectedReceipt(null)}
      />
    </div>
  );
};
