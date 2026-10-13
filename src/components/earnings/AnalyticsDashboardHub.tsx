import React, { useState } from 'react';
import { useApp } from '../../context/AppContext';
import { FemaleHostAnalyticsDashboard } from './FemaleHostAnalyticsDashboard';
import { MaleUserAnalyticsDashboard } from './MaleUserAnalyticsDashboard';
import { UserProfile } from '../../types';
import {
  TrendingUp,
  Coins,
  DollarSign,
  UserCheck,
  Zap,
  PhoneCall,
  Sparkles,
  SlidersHorizontal,
} from 'lucide-react';

interface AnalyticsDashboardHubProps {
  user?: UserProfile;
  onOpenStore?: () => void;
  onStartCall?: (creatorId: string) => void;
  onOpenChat?: (creatorId: string) => void;
  onOpenCallLogs?: () => void;
}

export const AnalyticsDashboardHub: React.FC<AnalyticsDashboardHubProps> = ({
  user,
  onOpenStore,
  onStartCall,
  onOpenChat,
  onOpenCallLogs,
}) => {
  const { currentUser, switchRolePersona } = useApp();
  const activeUser = user || currentUser;

  // Mode Override: allow switching view for preview/testing
  const [viewRoleOverride, setViewRoleOverride] = useState<'auto' | 'female' | 'male'>('auto');

  // Host view for female creators/hosts; Team Leaders land on Host Activity hub (managed roster)
  const isHostCreator = activeUser.role === 'female_creator' || activeUser.role === 'female_host';
  const isTeamLeader =
    activeUser.role === 'team_leader' || activeUser.role === 'agency_manager';
  const effectiveRole =
    viewRoleOverride === 'auto'
      ? isHostCreator || isTeamLeader
        ? 'female'
        : 'male'
      : viewRoleOverride;

  return (
    <div id="analytics-dashboard-hub" className="space-y-4">
      {/* Top View Mode Switcher for Fast Demonstration & Multi-Role Inspection */}
      <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 pt-4">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 p-3 rounded-2xl bg-[#0E1118] border border-slate-800 text-xs font-mono">
          <div className="flex items-center space-x-2 text-slate-300">
            <SlidersHorizontal className="w-4 h-4 text-indigo-400" />
            <span className="font-bold">Analytics Dashboard Mode:</span>
            <span className="text-slate-400">
              {effectiveRole === 'female' ? 'Female Creator Earnings & Quality' : 'Male User Spending & Habits'}
            </span>
            {user && (
              <span className="px-2 py-0.5 rounded bg-slate-800 text-indigo-300 text-[11px] font-semibold border border-slate-700">
                Inspecting: {user.name} ({user.id})
              </span>
            )}
          </div>

          <div className="flex items-center space-x-1.5 bg-slate-950 p-1 rounded-xl border border-slate-800 self-stretch sm:self-auto">
            <button
              onClick={() => setViewRoleOverride('female')}
              className={`flex-1 sm:flex-none px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center justify-center space-x-1.5 ${
                effectiveRole === 'female'
                  ? 'bg-emerald-500 text-slate-950 shadow-md shadow-emerald-500/20'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <DollarSign className="w-3.5 h-3.5" />
              <span>Host View</span>
            </button>

            <button
              onClick={() => setViewRoleOverride('male')}
              className={`flex-1 sm:flex-none px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center justify-center space-x-1.5 ${
                effectiveRole === 'male'
                  ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/30'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <Coins className="w-3.5 h-3.5" />
              <span>Caller View</span>
            </button>
          </div>
        </div>
      </div>

      {/* Main Dashboard Render */}
      {effectiveRole === 'female' ? (
        <FemaleHostAnalyticsDashboard
          user={activeUser}
          onOpenCallLogs={onOpenCallLogs}
          onOpenChat={onOpenChat}
          onStartCall={onStartCall}
        />
      ) : (
        <MaleUserAnalyticsDashboard
          user={activeUser}
          onOpenStore={onOpenStore}
          onStartCall={onStartCall}
          onOpenChat={onOpenChat}
        />
      )}
    </div>
  );
};
