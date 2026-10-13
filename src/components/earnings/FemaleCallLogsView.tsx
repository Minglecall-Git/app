import React, { useState } from 'react';
import { useApp } from '../../context/AppContext';
import {
  PhoneCall,
  Clock,
  UserPlus,
  CheckCircle2,
  MessageCircle,
  Video,
  Search,
  Filter,
  Users,
  Coins,
  Sparkles,
  ShieldCheck,
  Globe,
  DollarSign,
  User,
} from 'lucide-react';
import { getCountryFlag } from '../../utils/flags';
import { getFallbackAvatar } from '../../utils/avatars';

export type CallLogFilterKey = 'all' | 'missed' | 'answered' | 'non_friends' | 'friends';

interface FemaleCallLogsViewProps {
  onOpenChat: (userId: string) => void;
  onStartCall: (userId: string) => void;
  onOpenProfile?: (userId: string) => void;
  /** When true, hide page banner / filter chips (HostShell owns chrome). */
  shellMode?: boolean;
  /** Controlled filter when used inside HostShell. */
  activeFilter?: CallLogFilterKey;
  onFilterChange?: (filter: CallLogFilterKey) => void;
}

export const FemaleCallLogsView: React.FC<FemaleCallLogsViewProps> = ({
  onOpenChat,
  onStartCall,
  onOpenProfile,
  shellMode = false,
  activeFilter: controlledFilter,
  onFilterChange,
}) => {
  const {
    currentUser,
    callLogs,
    users,
    friends,
    friendRequests,
    sendFriendRequest,
    isFriend,
    systemSettings,
  } = useApp();

  const [internalFilter, setInternalFilter] = useState<CallLogFilterKey>('all');
  const activeFilter = controlledFilter ?? internalFilter;
  const setActiveFilter = (filter: CallLogFilterKey) => {
    onFilterChange?.(filter);
    if (controlledFilter === undefined) setInternalFilter(filter);
  };
  const [searchQuery, setSearchQuery] = useState('');

  const isLikelyUUID = (str?: string) => {
    if (!str) return true;
    const s = str.trim();
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s) || s.startsWith('user_');
  };

  const isFemaleCreator =
    currentUser.role === 'female_creator' || currentUser.role === 'female_host';
  const isAdmin = currentUser.role === 'admin';
  const isCreatorOrAdmin = isFemaleCreator || isAdmin;
  const selfIds = new Set(
    [currentUser.id, currentUser.authId].map((id) => String(id || '').trim()).filter(Boolean)
  );
  const isSelfLogId = (id?: string) => Boolean(id && selfIds.has(String(id)));

  // Filter logs: Creator/Admin/host sees received host calls; regular users see their own activity
  const myLogs = callLogs.filter((log) => {
    if (isCreatorOrAdmin) {
      return (
        isSelfLogId(log.receiverId) ||
        isSelfLogId((log as any).hostId) ||
        isAdmin
      );
    }
    return isSelfLogId(log.callerId) || isSelfLogId(log.receiverId) || isSelfLogId((log as any).hostId);
  });

  const missedLogsCount = myLogs.filter((l) => l.status === 'missed' || l.status === 'declined' || l.status === 'unanswered').length;
  const answeredLogsCount = myLogs.filter((l) => l.status === 'completed' || (!l.status && (l.durationSeconds > 0 || l.coinsEarned > 0 || l.coinsSpent > 0))).length;

  const filteredLogs = myLogs.filter((log) => {
    const isCaller = log.callerId === currentUser.id;
    const targetUserId = isCreatorOrAdmin ? log.callerId : (isCaller ? log.receiverId : log.callerId);
    const isTargetFriend = isFriend(targetUserId);
    const isMissed = log.status === 'missed' || log.status === 'declined' || log.status === 'unanswered';
    const isAnswered = log.status === 'completed' || (!log.status && (log.durationSeconds > 0 || log.coinsEarned > 0 || log.coinsSpent > 0));

    if (activeFilter === 'missed' && !isMissed) return false;
    if (activeFilter === 'answered' && !isAnswered) return false;
    if (activeFilter === 'non_friends' && isTargetFriend) return false;
    if (activeFilter === 'friends' && !isTargetFriend) return false;

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const targetUser = users.find((u) => u.id === targetUserId);
      const targetDisplayName =
        targetUser?.name ||
        (!isLikelyUUID(isCreatorOrAdmin ? log.callerName : log.receiverName) && (isCreatorOrAdmin ? log.callerName : log.receiverName)
          ? (isCreatorOrAdmin ? log.callerName : log.receiverName)
          : targetUser?.name || 'User');
      const targetCountry = targetUser?.nationality || (isCreatorOrAdmin ? log.callerCountry : '') || '';
      const matchName = targetDisplayName.toLowerCase().includes(q);
      const matchCountry = targetCountry.toLowerCase().includes(q);
      return matchName || matchCountry;
    }

    return true;
  });

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}m ${secs.toString().padStart(2, '0')}s`;
  };

  return (
    <div
      className={
        shellMode
          ? 'space-y-5'
          : 'max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8'
      }
    >
      {/* Header Banner — hidden inside HostShell */}
      {!shellMode && (
      <div className="bg-gradient-to-r from-pink-950/80 via-purple-950/40 to-slate-900 border border-pink-500/30 rounded-3xl p-6 sm:p-8 shadow-2xl flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
        <div>
          <div className="inline-flex items-center space-x-2 px-3 py-1 rounded-full bg-pink-500/20 border border-pink-500/40 text-pink-300 text-xs font-semibold mb-2">
            <PhoneCall className="w-3.5 h-3.5" />
            <span>
              {isCreatorOrAdmin
                ? 'Female Creator Call History & Lead Conversion Hub'
                : 'My Call History & Activity Timeline'}
            </span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-white">
            {isCreatorOrAdmin ? 'Call Logs & Friend Conversion Hub' : 'My Video Call History'}
          </h1>
          <p className="text-xs text-slate-300 mt-1 max-w-2xl">
            {isCreatorOrAdmin ? (
              <>
                Review past callers, track earned coins, call back <strong>Missed Calls</strong> to recover earnings, and send <strong>Friend Requests</strong>. When male users accept, discounted <strong>Friend Call Rates ({systemSettings.coinBurnRateFriendPerMin ?? 80} 🪙/min)</strong> apply to keep callers engaged longer!
              </>
            ) : (
              <>
                Review your past video calling sessions, tracked minutes, coins billed, and quickly redial or message your favorite creators!
              </>
            )}
          </p>
        </div>

        {/* Quick Rate & Missed Stats — equal cards, one row on mobile */}
        <div
          className={`grid gap-2 w-full md:w-auto ${
            missedLogsCount > 0 ? 'grid-cols-2 md:min-w-[280px]' : 'grid-cols-1 md:min-w-[140px]'
          }`}
        >
          {missedLogsCount > 0 && (
            <div className="h-full min-w-0 bg-rose-950/80 border border-rose-500/40 p-2.5 rounded-xl shadow-xl flex items-center gap-2">
              <div className="p-2 bg-rose-500/20 border border-rose-500/30 rounded-lg text-rose-400 shrink-0">
                <PhoneCall className="w-4 h-4" />
              </div>
              <div className="min-w-0">
                <div className="text-[10px] font-semibold text-rose-300 truncate">Missed Calls</div>
                <div className="text-sm font-black text-rose-400 truncate">{missedLogsCount} Missed</div>
                <div className="text-[9px] text-slate-400 truncate">
                  {isCreatorOrAdmin ? 'Call back' : 'Redial'}
                </div>
              </div>
            </div>
          )}

          {isCreatorOrAdmin ? (
            <div className="h-full min-w-0 bg-slate-900/90 border border-indigo-500/40 p-2.5 rounded-xl shadow-xl flex items-center gap-2">
              <div className="p-2 bg-pink-500/10 border border-pink-500/20 rounded-lg text-pink-400 shrink-0">
                <Users className="w-4 h-4" />
              </div>
              <div className="min-w-0">
                <div className="text-[10px] font-semibold text-slate-400 truncate">Friend Call Rates</div>
                <div className="text-sm font-black text-emerald-400 truncate">
                  {systemSettings.coinBurnRateFriendPerMin ?? 80} 🪙/min
                </div>
                <div className="text-[9px] text-slate-500 truncate">
                  vs {systemSettings.coinBurnRatePerMin ?? 120}/min
                </div>
              </div>
            </div>
          ) : (
            <div className="h-full min-w-0 bg-slate-900/90 border border-indigo-500/40 p-2.5 rounded-xl shadow-xl flex items-center gap-2">
              <div className="p-2 bg-indigo-500/10 border border-indigo-500/20 rounded-lg text-indigo-400 shrink-0">
                <Coins className="w-4 h-4" />
              </div>
              <div className="min-w-0">
                <div className="text-[10px] font-semibold text-slate-400 truncate">Total Calls</div>
                <div className="text-sm font-black text-amber-400 truncate">{myLogs.length} Sessions</div>
                <div className="text-[9px] text-slate-500 truncate">Completed & Missed</div>
              </div>
            </div>
          )}
        </div>
      </div>
      )}

      {/* Filter Tabs & Search — filter chips hidden in shellMode (L2 owns filters) */}
      <div
        className={`flex flex-col sm:flex-row items-center gap-4 ${
          shellMode
            ? 'justify-end'
            : 'justify-between bg-slate-900 border border-slate-800 p-3 rounded-2xl'
        }`}
      >
        {!shellMode && (
        <div className="flex items-center space-x-1 bg-slate-950 p-1 rounded-xl border border-slate-800 text-xs font-bold w-full sm:w-auto overflow-x-auto">
          <button
            onClick={() => setActiveFilter('all')}
            className={`px-3.5 py-2 rounded-lg transition-all whitespace-nowrap ${
              activeFilter === 'all'
                ? 'bg-indigo-600 text-white shadow-md'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            All Logs ({myLogs.length})
          </button>
          <button
            onClick={() => setActiveFilter('missed')}
            className={`px-3.5 py-2 rounded-lg transition-all flex items-center space-x-1.5 whitespace-nowrap ${
              activeFilter === 'missed'
                ? 'bg-rose-600 text-white shadow-md'
                : 'text-slate-400 hover:text-rose-400'
            }`}
          >
            <span className="w-2 h-2 rounded-full bg-rose-400 inline-block animate-ping"></span>
            <span>Missed Calls ({missedLogsCount})</span>
          </button>
          <button
            onClick={() => setActiveFilter('answered')}
            className={`px-3.5 py-2 rounded-lg transition-all flex items-center space-x-1.5 whitespace-nowrap ${
              activeFilter === 'answered'
                ? 'bg-emerald-600 text-white shadow-md'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <span>Answered ({answeredLogsCount})</span>
          </button>
          <button
            onClick={() => setActiveFilter('non_friends')}
            className={`px-3.5 py-2 rounded-lg transition-all flex items-center space-x-1.5 whitespace-nowrap ${
              activeFilter === 'non_friends'
                ? 'bg-pink-600 text-white shadow-md'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <UserPlus className="w-3.5 h-3.5 text-pink-300" />
            <span>{isCreatorOrAdmin ? 'Add Friend Candidates' : 'Other Users'}</span>
          </button>
          <button
            onClick={() => setActiveFilter('friends')}
            className={`px-3.5 py-2 rounded-lg transition-all flex items-center space-x-1.5 whitespace-nowrap ${
              activeFilter === 'friends'
                ? 'bg-emerald-700 text-white shadow-md'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-300" />
            <span>Current Friends</span>
          </button>
        </div>
        )}

        {/* Search */}
        <div className={`relative w-full shrink-0 ${shellMode ? 'sm:w-72' : 'sm:w-64'}`}>
          <Search className="absolute left-3 top-2.5 w-4 h-4 text-slate-500" />
          <input
            type="text"
            placeholder={isCreatorOrAdmin ? 'Search caller...' : 'Search creator / call...'}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-3 py-2.5 min-h-11 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-pink-500"
          />
        </div>
      </div>

      {/* Call Log List */}
      {filteredLogs.length === 0 ? (
        <div className="bg-slate-900 border border-slate-800 rounded-3xl p-12 text-center space-y-3">
          <div className="w-12 h-12 rounded-full bg-slate-800 text-slate-500 mx-auto flex items-center justify-center">
            <PhoneCall className="w-6 h-6" />
          </div>
          <h3 className="text-base font-bold text-white">No Call Logs Found</h3>
          <p className="text-xs text-slate-400 max-w-md mx-auto">
            {activeFilter === 'missed'
              ? 'Great job! You have no missed calls. Incoming missed calls will appear here.'
              : isCreatorOrAdmin
              ? 'When male users call you, their call session duration, earned coins, and friend request options will appear here automatically!'
              : 'Your video calling history, session durations, and spent coins will appear here automatically!'}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4">
          {filteredLogs.map((log) => {
            const isCaller = log.callerId === currentUser.id;
            const targetUserId = isCreatorOrAdmin ? log.callerId : (isCaller ? log.receiverId : log.callerId);
            const targetUser = users.find((u) => u.id === targetUserId);

            const rawName = isCreatorOrAdmin ? log.callerName : (isCaller ? log.receiverName : log.callerName);
            const targetDisplayName =
              targetUser?.name ||
              (!isLikelyUUID(rawName) && rawName ? rawName : targetUser?.name || (isCreatorOrAdmin ? 'Verified Caller' : 'Creator Host'));

            const rawAvatar = isCreatorOrAdmin ? log.callerAvatar : (isCaller ? log.receiverAvatar : log.callerAvatar);
            const fallbackGender = isCreatorOrAdmin ? 'male' : (targetUser?.gender || 'female');
            const targetAvatar = targetUser?.avatarUrl || rawAvatar || getFallbackAvatar(targetDisplayName, fallbackGender);

            const targetCountry = targetUser?.nationality || (isCreatorOrAdmin ? log.callerCountry : 'Global') || 'Global';
            const targetCode = targetUser?.countryCode || 'US';

            const isMissedCall = log.status === 'missed' || log.status === 'declined' || log.status === 'unanswered' || (log.durationSeconds === 0 && log.coinsEarned === 0 && log.coinsSpent === 0);

            const userIsFriend = isFriend(targetUserId);
            const pendingRequest = friendRequests.find(
              (r) => r.senderId === currentUser.id && r.receiverId === targetUserId && r.status === 'pending'
            );

            return (
              <div
                key={log.id}
                className={`border rounded-2xl p-4 sm:p-5 shadow-xl transition-all flex flex-col md:flex-row md:items-center justify-between gap-4 ${
                  isMissedCall
                    ? 'bg-gradient-to-r from-rose-950/30 via-slate-900 to-slate-900 border-rose-900/40 hover:border-rose-700/60'
                    : 'bg-slate-900 border-slate-800 hover:border-slate-700'
                }`}
              >
                {/* Profile Info */}
                <div className="flex items-center space-x-4">
                  <button
                    type="button"
                    onClick={() => onOpenProfile?.(targetUserId)}
                    className="relative shrink-0 rounded-2xl focus:outline-none focus-visible:ring-2 focus-visible:ring-brand cursor-pointer"
                    title={`View ${targetDisplayName}'s profile`}
                    aria-label={`View ${targetDisplayName}'s profile`}
                  >
                    <img
                      src={targetAvatar}
                      alt={targetDisplayName}
                      onError={(e) => {
                        (e.target as HTMLImageElement).src = getFallbackAvatar(targetDisplayName, fallbackGender);
                      }}
                      className={`w-14 h-14 rounded-2xl object-cover ring-2 shadow-md bg-slate-800 ${
                        isMissedCall ? 'ring-rose-500/50' : 'ring-indigo-500/30'
                      }`}
                    />
                    <span className="absolute -bottom-1 -right-1 p-1 bg-slate-950 rounded-full border border-slate-800 text-[10px]">
                      {getCountryFlag(targetCode, targetCountry)}
                    </span>
                  </button>

                  <div>
                    <div className="flex items-center space-x-2 flex-wrap gap-1">
                      <button
                        type="button"
                        onClick={() => onOpenProfile?.(targetUserId)}
                        className="font-extrabold text-white text-sm sm:text-base hover:text-brand transition-colors cursor-pointer text-left"
                        title={`View ${targetDisplayName}'s profile`}
                      >
                        {targetDisplayName}
                      </button>
                      
                      {isMissedCall ? (
                        <span className="px-2 py-0.5 rounded-full bg-rose-500/20 text-rose-300 border border-rose-500/40 text-[10px] font-bold flex items-center space-x-1">
                          <span className="w-1.5 h-1.5 rounded-full bg-rose-400 inline-block animate-ping"></span>
                          <span>
                            {log.status === 'declined' || log.status === 'rejected'
                              ? 'Declined 🚫'
                              : 'Missed Call 🔴'}
                          </span>
                        </span>
                      ) : (
                        <span className="px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 text-[10px] font-bold flex items-center space-x-1">
                          <span>Connected ✓</span>
                        </span>
                      )}

                      {userIsFriend && (
                        <span className="px-2 py-0.5 rounded-full bg-pink-500/10 text-pink-300 border border-pink-500/30 text-[10px] font-bold flex items-center space-x-1">
                          <CheckCircle2 className="w-3 h-3 text-pink-400" />
                          <span>Friend</span>
                        </span>
                      )}
                    </div>

                    <div className="flex items-center space-x-3 text-xs text-slate-400 mt-1 font-mono">
                      <span>{targetCountry}</span>
                      <span>•</span>
                      <span className="flex items-center space-x-1 text-slate-300">
                        <Clock className="w-3 h-3 text-indigo-400" />
                        <span>{isMissedCall ? '00m 00s (Unanswered)' : formatDuration(log.durationSeconds)}</span>
                      </span>
                      <span>•</span>
                      <span className="text-slate-500">{log.timestamp}</span>
                    </div>

                    {/* Rate pill */}
                    <div className="mt-1.5 flex items-center space-x-2">
                      {isMissedCall ? (
                        <span className="text-[10px] text-rose-300 font-bold bg-rose-500/10 border border-rose-500/20 px-2 py-0.5 rounded-md">
                          {isCreatorOrAdmin ? 'Missed Lead • Call back to earn coins' : 'Unanswered Session • Redial to connect'}
                        </span>
                      ) : userIsFriend ? (
                        <span className="text-[10px] text-emerald-300 font-bold bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded-md">
                          Friend Call Rate Active ({systemSettings.coinBurnRateFriendPerMin} 🪙/min)
                        </span>
                      ) : (
                        <span className="text-[10px] text-amber-300 font-bold bg-amber-500/10 border border-amber-500/20 px-2 py-0.5 rounded-md">
                          Standard Call Rate ({systemSettings.coinBurnRatePerMin} 🪙/min)
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Earnings (Creator/Admin only) vs Spending (Regular users) */}
                <div className="flex items-center justify-between md:justify-end gap-3 border-t md:border-t-0 pt-3 md:pt-0 border-slate-800">
                  {/* Economics Pill */}
                  <div className="text-left md:text-right pr-2">
                    <div className="text-[10px] text-slate-400 font-mono">
                      {isCreatorOrAdmin ? (isMissedCall ? 'Status' : 'Coins Earned') : 'Coins Spent'}
                    </div>
                    <div className={`text-base font-black flex items-center space-x-1 ${
                      isMissedCall
                        ? 'text-rose-400 text-xs font-mono'
                        : isCreatorOrAdmin
                        ? 'text-amber-400'
                        : 'text-rose-400 text-xs font-mono'
                    }`}>
                      {isMissedCall ? (
                        <span>0 🪙 (Unanswered)</span>
                      ) : isCreatorOrAdmin ? (
                        <>
                          <span>+{log.coinsEarned || 0}</span>
                          <span className="text-xs">🪙</span>
                        </>
                      ) : (
                        <>
                          <span>-{log.coinsSpent || 0}</span>
                          <span className="text-xs">🪙</span>
                        </>
                      )}
                    </div>
                  </div>

                  {/* Friend status + equal icon-only actions */}
                  <div className="flex flex-col items-end gap-2 min-w-0">
                    {(userIsFriend || pendingRequest) && (
                      <div className="max-w-full">
                        {userIsFriend ? (
                          <div className="px-3 py-1.5 bg-emerald-950/60 border border-emerald-500/40 text-emerald-300 font-extrabold text-[10px] sm:text-xs rounded-xl flex items-center space-x-1.5 truncate">
                            <CheckCircle2 className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-emerald-400 shrink-0" />
                            <span className="truncate">Friends Connected</span>
                          </div>
                        ) : (
                          <div className="px-3 py-1.5 bg-amber-950/60 border border-amber-500/40 text-amber-300 font-extrabold text-[10px] sm:text-xs rounded-xl flex items-center space-x-1.5 truncate">
                            <Clock className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-amber-400 animate-pulse shrink-0" />
                            <span className="truncate">Request Sent ⏳</span>
                          </div>
                        )}
                      </div>
                    )}

                    <div className="flex items-center gap-2 shrink-0">
                      {!userIsFriend && !pendingRequest && isCreatorOrAdmin && (
                        <button
                          type="button"
                          onClick={() => sendFriendRequest(currentUser.id, targetUserId, log.id)}
                          className="h-10 w-10 flex items-center justify-center rounded-xl bg-gradient-to-r from-pink-600 to-rose-600 hover:from-pink-500 hover:to-rose-500 text-white shadow-lg shadow-pink-600/20 transition-all cursor-pointer"
                          title="Add Friend"
                          aria-label="Add Friend"
                        >
                          <UserPlus className="w-4 h-4 text-pink-200" />
                        </button>
                      )}

                      {onOpenProfile && (
                        <button
                          type="button"
                          onClick={() => onOpenProfile(targetUserId)}
                          className="h-10 w-10 flex items-center justify-center rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition-all cursor-pointer"
                          title="View Profile"
                          aria-label="View Profile"
                        >
                          <User className="w-4 h-4 text-pink-400" />
                        </button>
                      )}

                      <button
                        type="button"
                        onClick={() => onOpenChat(targetUserId)}
                        className="h-10 w-10 flex items-center justify-center rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition-all cursor-pointer"
                        title="Open Direct Chat"
                        aria-label="Open Direct Chat"
                      >
                        <MessageCircle className="w-4 h-4 text-indigo-400" />
                      </button>

                      <button
                        type="button"
                        onClick={() => onStartCall(targetUserId)}
                        className={`h-10 w-10 flex items-center justify-center rounded-xl transition-all cursor-pointer shadow-md ${
                          isMissedCall
                            ? 'bg-rose-600 hover:bg-rose-500 text-white ring-2 ring-rose-500/30'
                            : 'bg-indigo-600/20 hover:bg-indigo-600/30 text-indigo-300 border border-indigo-500/40'
                        }`}
                        title={
                          isMissedCall
                            ? isCreatorOrAdmin
                              ? 'Call Back'
                              : 'Redial'
                            : 'Start Video Call'
                        }
                        aria-label={
                          isMissedCall
                            ? isCreatorOrAdmin
                              ? 'Call Back'
                              : 'Redial'
                            : 'Start Video Call'
                        }
                      >
                        <Video className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
