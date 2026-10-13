import React, { useMemo, useState } from 'react';
import { LayoutDashboard, Users, Landmark, Award, Building2, ShieldAlert } from 'lucide-react';
import { useApp } from '../../../context/AppContext';
import { UserProfile } from '../../../types';
import {
  AdminAnalyticsFilters,
  AdminAnalyticsRole,
  buildDateRange,
  buildUserCohortRows,
  computeActivityMixByRole,
  computeAgencyPnL,
  computePlatformFinance,
  computeRealTrendSeries,
  computeRiskSignals,
  filterCallLogsByRange,
  resolveAdminAnalyticsRole,
} from '../../../utils/adminAnalytics';
import { getCoinUsdPeg } from '../../../../shared/finance/fx';
import { AnalyticsFilterBar } from './AnalyticsFilterBar';
import { OverviewTab } from './OverviewTab';
import { UsersCohortsTab } from './UsersCohortsTab';
import { FinancePnLTab } from './FinancePnLTab';
import { CreatorsSupplyTab } from './CreatorsSupplyTab';
import { AgenciesTab } from './AgenciesTab';
import { RiskQualityTab } from './RiskQualityTab';
import { AdminUserAnalyticsDrawer } from './AdminUserAnalyticsDrawer';

export type AnalyticsHubTab =
  | 'overview'
  | 'users'
  | 'finance'
  | 'creators'
  | 'agencies'
  | 'risk';

interface AdminAnalyticsHubProps {
  onOverrideEarning?: (user: UserProfile) => void;
  /** Optional external inspect hook (AdminDashboard may also track selection). */
  onInspectUser?: (user: UserProfile) => void;
  /** Jump to Admin → Financial Module (money of record). */
  onOpenFinancialModule?: () => void;
  /** Jump to Admin → Economy Config (rates only). */
  onOpenEconomyConfig?: () => void;
  /** Controlled hub tab (sidebar L2). */
  hubTab?: AnalyticsHubTab;
  onHubTabChange?: (tab: AnalyticsHubTab) => void;
  /** Hide inline tab bar when nav lives in AdminShell sidebar. */
  navPlacement?: 'inline' | 'sidebar';
}

const HUB_TABS: { id: AnalyticsHubTab; label: string; icon: React.ReactNode }[] = [
  { id: 'overview', label: 'Overview', icon: <LayoutDashboard className="w-3.5 h-3.5" /> },
  { id: 'users', label: 'Users & Cohorts', icon: <Users className="w-3.5 h-3.5" /> },
  { id: 'finance', label: 'Money map', icon: <Landmark className="w-3.5 h-3.5" /> },
  { id: 'creators', label: 'Creators & Supply', icon: <Award className="w-3.5 h-3.5" /> },
  { id: 'agencies', label: 'Agencies', icon: <Building2 className="w-3.5 h-3.5" /> },
  { id: 'risk', label: 'Risk & Quality', icon: <ShieldAlert className="w-3.5 h-3.5" /> },
];

export const AdminAnalyticsHub: React.FC<AdminAnalyticsHubProps> = ({
  onOverrideEarning,
  onInspectUser,
  onOpenFinancialModule,
  onOpenEconomyConfig,
  hubTab: hubTabProp,
  onHubTabChange,
  navPlacement = 'inline',
}) => {
  const {
    users,
    callLogs,
    payoutRequests,
    systemSettings,
    adminActiveCalls,
  } = useApp();

  const [hubTabInternal, setHubTabInternal] = useState<AnalyticsHubTab>('overview');
  const hubTab = hubTabProp ?? hubTabInternal;
  const setHubTab = (tab: AnalyticsHubTab) => {
    onHubTabChange?.(tab);
    if (hubTabProp === undefined) setHubTabInternal(tab);
  };
  const [filters, setFilters] = useState<AdminAnalyticsFilters>(() => ({
    range: buildDateRange('7d'),
    role: 'all',
    country: 'all',
    agencyId: 'all',
    search: '',
  }));
  const [drawerUser, setDrawerUser] = useState<UserProfile | null>(null);

  const teamLeaders = useMemo(
    () => users.filter((u) => resolveAdminAnalyticsRole(u) === 'team_leader'),
    [users]
  );

  const countries = useMemo(() => {
    const set = new Set<string>();
    users.forEach((u) => {
      const c = u.country || u.nationality || u.countryCode;
      if (c) set.add(c);
    });
    return Array.from(set).sort();
  }, [users]);

  const liveCalls = useMemo(
    () => adminActiveCalls.filter((c) => c.status === 'active').length,
    [adminActiveCalls]
  );

  const periodLogs = useMemo(
    () => filterCallLogsByRange(callLogs, filters.range),
    [callLogs, filters.range]
  );

  const finance = useMemo(
    () =>
      computePlatformFinance(
        users,
        callLogs,
        payoutRequests,
        systemSettings,
        filters.range,
        liveCalls
      ),
    [users, callLogs, payoutRequests, systemSettings, filters.range, liveCalls]
  );

  const trends = useMemo(() => {
    const peg = getCoinUsdPeg(systemSettings);
    return computeRealTrendSeries(periodLogs, filters.range, peg, peg);
  }, [periodLogs, filters.range, systemSettings.coinUsdPeg, systemSettings.femalePayoutRatioUSD, systemSettings.coinToUSDRatio]);

  const activityMix = useMemo(
    () => computeActivityMixByRole(users, periodLogs),
    [users, periodLogs]
  );

  const agencies = useMemo(
    () =>
      computeAgencyPnL(users, callLogs, payoutRequests, systemSettings, filters.range),
    [users, callLogs, payoutRequests, systemSettings, filters.range]
  );

  const cohortRows = useMemo(
    () => buildUserCohortRows(users, callLogs, systemSettings, filters.range, agencies),
    [users, callLogs, systemSettings, filters.range, agencies]
  );

  const risk = useMemo(
    () => computeRiskSignals(users, callLogs, payoutRequests, systemSettings, filters.range),
    [users, callLogs, payoutRequests, systemSettings, filters.range]
  );

  const inspect = (u: UserProfile) => {
    setDrawerUser(u);
    onInspectUser?.(u);
  };

  const gotoUsers = (role?: string) => {
    setHubTab('users');
    if (role) {
      setFilters((f) => ({ ...f, role: role as AdminAnalyticsRole | 'all' }));
    }
  };

  const showFullFilters = hubTab === 'users';
  const showDateFilters = hubTab === 'creators' || hubTab === 'agencies' || hubTab === 'risk';

  return (
    <div id="admin-analytics-hub" className="space-y-5">
      {navPlacement !== 'sidebar' && (
        <div className="flex flex-wrap items-center gap-1.5 bg-[#0F1115] p-1.5 rounded-xl border border-slate-800">
          {HUB_TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setHubTab(t.id)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5 cursor-pointer ${
                hubTab === t.id
                  ? 'bg-indigo-600 text-white font-bold shadow-md'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800'
              }`}
            >
              {t.icon}
              <span>{t.label}</span>
            </button>
          ))}
        </div>
      )}

      {(showFullFilters || showDateFilters) && (
        <AnalyticsFilterBar
          filters={filters}
          onChange={setFilters}
          teamLeaders={teamLeaders}
          countries={countries}
          mode={showFullFilters ? 'full' : 'date'}
        />
      )}

      {hubTab === 'overview' && (
        <OverviewTab
          finance={finance}
          trends={trends}
          activityMix={activityMix}
          onOpenFinancialModule={onOpenFinancialModule}
          onGotoUsers={gotoUsers}
        />
      )}
      {hubTab === 'users' && (
        <UsersCohortsTab rows={cohortRows} filters={filters} onInspectUser={inspect} />
      )}
      {hubTab === 'finance' && (
        <FinancePnLTab
          finance={finance}
          onOpenFinancialModule={onOpenFinancialModule}
          onOpenEconomyConfig={onOpenEconomyConfig}
        />
      )}
      {hubTab === 'creators' && (
        <CreatorsSupplyTab
          users={users}
          callLogs={callLogs}
          settings={systemSettings}
          range={filters.range}
          onInspectUser={inspect}
        />
      )}
      {hubTab === 'agencies' && (
        <AgenciesTab
          agencies={agencies}
          callLogs={callLogs}
          range={filters.range}
          onInspectUser={inspect}
          onOpenFinancialModule={onOpenFinancialModule}
        />
      )}
      {hubTab === 'risk' && (
        <RiskQualityTab risk={risk} settings={systemSettings} onInspectUser={inspect} />
      )}

      <AdminUserAnalyticsDrawer
        isOpen={Boolean(drawerUser)}
        user={drawerUser}
        onClose={() => setDrawerUser(null)}
        range={filters.range}
        onOverrideEarning={onOverrideEarning}
      />
    </div>
  );
};
