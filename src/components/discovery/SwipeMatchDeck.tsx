import React, { useMemo, useState } from 'react';
import { useApp } from '../../context/AppContext';
import { UserProfile } from '../../types';
import { getUserEffectiveLocation } from '../../utils/location';
import { SvgFlag } from '../common/SvgFlag';
import {
  Heart,
  X,
  Star,
  Video,
  MapPin,
  CheckCircle2,
  Sparkles,
  Languages,
  Flame,
  Info,
  Crown,
  Award,
} from 'lucide-react';
import { rankCreatorsForDiscovery, isCurrentlyPeakHour } from '../../utils/discoveryAlgorithm';
import { normalizeMediaUrl } from '../../utils/r2Storage';
import { getFallbackAvatar } from '../../utils/avatars';

interface SwipeMatchDeckProps {
  onOpenDetailModal: (user: UserProfile) => void;
}

export const SwipeMatchDeck: React.FC<SwipeMatchDeckProps> = ({ onOpenDetailModal }) => {
  const {
    users,
    currentUser,
    startCall,
    favorites,
    isFriend,
    systemSettings,
    likeUser,
    passUser,
    creatorMetricsMap,
    blockedUserIds,
    blockedByUserIds,
    userMatchRecords,
  } = useApp();

  const [swipeDirection, setSwipeDirection] = useState<'left' | 'right' | 'super' | null>(null);
  const [actionBusy, setActionBusy] = useState(false);

  // Dynamic Interest Filter: matches users strictly according to currentUser.interestedIn
  // (same logic as DiscoveryGrid — no always-true fallback)
  const userInterestedIn =
    currentUser.interestedIn && currentUser.interestedIn.length > 0
      ? currentUser.interestedIn
      : currentUser.gender === 'female'
        ? ['male']
        : ['female'];

  const excludedByMatch = useMemo(() => {
    const ids = new Set<string>();
    for (const m of userMatchRecords) {
      // Hide passed, already matched, and one-sided likes we already sent
      if (m.status === 'rejected' || m.status === 'matched') {
        ids.add(m.otherUserId);
      } else if (m.status === 'pending' && m.initiatedBy === currentUser.id) {
        ids.add(m.otherUserId);
      }
    }
    return ids;
  }, [userMatchRecords, currentUser.id]);

  const filteredCandidates = users.filter((u) => {
    if (u.role === 'team_leader' || u.role === 'agency_manager' || u.role === 'admin') return false;
    if (u.id === currentUser.id) return false;
    if (blockedUserIds.includes(u.id) || blockedByUserIds.includes(u.id)) return false;
    if (excludedByMatch.has(u.id)) return false;

    const isFemaleTarget = u.gender === 'female' || u.role === 'female_creator' || u.role === 'female_host';
    const isMaleTarget = u.gender === 'male' || u.role === 'male_user';
    const isOtherTarget = u.gender === 'other' || u.role === 'other_user';

    if (userInterestedIn.includes('everyone') || userInterestedIn.includes('all')) return true;
    if (isFemaleTarget && userInterestedIn.includes('female')) return true;
    if (isMaleTarget && userInterestedIn.includes('male')) return true;
    if (isOtherTarget && (userInterestedIn.includes('other') || userInterestedIn.includes('others'))) return true;

    return false;
  });

  const matchingCandidates = rankCreatorsForDiscovery(filteredCandidates, creatorMetricsMap, {
    peakHoursStart: systemSettings.peakHoursStart,
    peakHoursEnd: systemSettings.peakHoursEnd,
    peakHoursEnabled: systemSettings.peakHoursEnabled,
    targetThresholds: systemSettings,
  }).map((r) => r.user);

  const currentCreator = matchingCandidates.length > 0 ? matchingCandidates[0] : null;
  const isFav = currentCreator ? favorites.includes(currentCreator.id) : false;

  const advanceDeck = () => {
    setSwipeDirection(null);
    // Do not bump index: the passed/liked user is removed from the pool, so the
    // same index now points at the next remaining candidate.
    setActionBusy(false);
  };

  const handlePass = async () => {
    if (!currentCreator || actionBusy) return;
    setActionBusy(true);
    setSwipeDirection('left');
    const ok = await passUser(currentCreator.id);
    setTimeout(() => {
      if (ok) advanceDeck();
      else {
        setSwipeDirection(null);
        setActionBusy(false);
      }
    }, 250);
  };

  const handleLike = async () => {
    if (!currentCreator || actionBusy) return;
    setActionBusy(true);
    setSwipeDirection('right');
    // Like → pending match via backend; do NOT favorite or recordQuickMatch
    const ok = await likeUser(currentCreator.id);
    setTimeout(() => {
      if (ok) advanceDeck();
      else {
        setSwipeDirection(null);
        setActionBusy(false);
      }
    }, 250);
  };

  const handleSuperLike = async () => {
    if (!currentCreator || actionBusy) return;
    setActionBusy(true);
    setSwipeDirection('super');
    // Super like = like with flag only; no fake coin gift credit
    const ok = await likeUser(currentCreator.id, { superLike: true });
    setTimeout(() => {
      if (ok) advanceDeck();
      else {
        setSwipeDirection(null);
        setActionBusy(false);
      }
    }, 300);
  };

  if (!currentCreator) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] p-8 bg-app-card border border-hairline rounded-app-xl text-center">
        <Sparkles className="w-12 h-12 text-brand mb-3" />
        <h3 className="text-lg font-display font-bold text-app-heading">No more profiles</h3>
        <p className="text-xs text-app-muted mt-1">Check back soon or browse Discover.</p>
      </div>
    );
  }

  return (
    <div className="relative w-full max-w-sm mx-auto flex flex-col items-center py-2">
      {/* Top Header Badge */}
      <div className="w-full flex items-center justify-between mb-3 px-2">
        <div className="flex items-center space-x-2">
          <span className="online-dot" />
          <span className="text-xs font-semibold text-app-muted">
            {matchingCandidates.length} left
          </span>
        </div>
        <div className="text-[11px] text-brand bg-brand-soft border border-brand/25 px-2.5 py-0.5 rounded-md font-semibold">
          {isFav ? 'Favorited' : 'Swipe'}
        </div>
      </div>

      {/* Main Swipe Card */}
      <div
        className={`relative w-full aspect-[9/16] max-h-[70vh] bg-app-card border border-hairline rounded-app-xl overflow-hidden shadow-app transition-all duration-300 transform ${
          swipeDirection === 'left'
            ? '-translate-x-32 -rotate-12 opacity-0'
            : swipeDirection === 'right'
            ? 'translate-x-32 rotate-12 opacity-0'
            : swipeDirection === 'super'
            ? '-translate-y-32 scale-105 opacity-0'
            : 'translate-x-0 rotate-0 scale-100'
        }`}
      >
        {/* Creator Main Photo */}
        <img
          src={
            normalizeMediaUrl(currentCreator.avatarUrl) ||
            normalizeMediaUrl(currentCreator.gallery?.[0]) ||
            getFallbackAvatar(currentCreator.name, currentCreator.gender, currentCreator.role)
          }
          alt={currentCreator.name}
          loading="eager"
          decoding="async"
          onError={(e) => {
            const el = e.currentTarget;
            const fallback = getFallbackAvatar(
              currentCreator.name,
              currentCreator.gender,
              currentCreator.role
            );
            if (el.src !== fallback) el.src = fallback;
          }}
          className="w-full h-full object-cover select-none"
        />

        {/* Gradient Overlay */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/35 to-transparent pointer-events-none" />

        {/* Top Badges */}
        <div className="absolute top-4 left-4 right-4 flex items-center justify-between pointer-events-auto">
          {/* Online Badge & Verification */}
          <div className="flex items-center space-x-2">
            <div
              className={`px-2.5 py-1 rounded-full backdrop-blur-md border shadow-md flex items-center space-x-1.5 ${
                currentCreator.onlineStatus === 'online'
                  ? 'bg-emerald-950/80 border-emerald-500/60 text-emerald-300 ring-1 ring-emerald-500/20'
                  : currentCreator.onlineStatus === 'busy' || currentCreator.onlineStatus === 'in_call'
                  ? 'bg-amber-950/80 border-amber-500/60 text-amber-300 ring-1 ring-amber-500/20'
                  : 'bg-slate-950/80 border-slate-700/60 text-slate-400'
              }`}
              title={currentCreator.onlineStatus}
            >
              <span
                className={`w-2 h-2 rounded-full shrink-0 ${
                  currentCreator.onlineStatus === 'online'
                    ? 'bg-emerald-400 animate-pulse ring-2 ring-emerald-400/40'
                    : currentCreator.onlineStatus === 'busy' || currentCreator.onlineStatus === 'in_call'
                    ? 'bg-amber-400'
                    : 'bg-rose-500'
                }`}
              />
              <span className="text-[10px] font-bold tracking-tight uppercase font-mono">
                {currentCreator.onlineStatus === 'online'
                  ? 'Online'
                  : currentCreator.onlineStatus === 'busy' || currentCreator.onlineStatus === 'in_call'
                  ? 'Busy'
                  : 'Offline'}
              </span>
            </div>

            {currentCreator.isVerified && (
              <span className="px-2.5 py-1 rounded-full bg-blue-500/20 border border-blue-500/50 text-blue-300 text-[10px] font-mono font-bold flex items-center space-x-1 backdrop-blur-md">
                <CheckCircle2 className="w-3 h-3 text-blue-400" />
                <span>AI VERIFIED</span>
              </span>
            )}

            {/* Ready Now Peak Hour Surge Badge */}
            {Boolean(creatorMetricsMap[currentCreator.id]?.isReadyNowActive) &&
              currentCreator.onlineStatus === 'online' &&
              isCurrentlyPeakHour(systemSettings.peakHoursStart, systemSettings.peakHoursEnd) && (
                <span className="px-2.5 py-1 rounded-full bg-gradient-to-r from-orange-600 to-amber-500 text-white text-[10px] font-black uppercase tracking-wider flex items-center space-x-1 shadow-lg shadow-orange-950/80 animate-pulse border border-orange-400/60">
                  <Flame className="w-3 h-3 fill-current text-yellow-200" />
                  <span>READY NOW</span>
                </span>
              )}

            {/* Performance Tier */}
            {creatorMetricsMap[currentCreator.id]?.performanceTier === 'gold' && (
              <span className="px-2 py-0.5 rounded bg-yellow-500/90 text-slate-950 text-[10px] font-black flex items-center space-x-1 border border-yellow-300 shadow-sm">
                <Crown className="w-3 h-3" />
                <span>GOLD</span>
              </span>
            )}
            {creatorMetricsMap[currentCreator.id]?.performanceTier === 'silver' && (
              <span className="px-2 py-0.5 rounded bg-slate-300/90 text-slate-950 text-[10px] font-bold flex items-center space-x-1 border border-white shadow-sm">
                <Award className="w-3 h-3" />
                <span>SILVER</span>
              </span>
            )}
          </div>
        </div>

        {/* Swipe Feedback Overlay Indicator */}
        {swipeDirection === 'right' && (
          <div className="absolute top-12 left-6 border-4 border-emerald-400 text-emerald-400 px-4 py-1.5 rounded-xl font-black text-2xl rotate-[-15deg] uppercase tracking-widest backdrop-blur-sm pointer-events-none">
            LIKE ❤️
          </div>
        )}
        {swipeDirection === 'left' && (
          <div className="absolute top-12 right-6 border-4 border-rose-500 text-rose-500 px-4 py-1.5 rounded-xl font-black text-2xl rotate-[15deg] uppercase tracking-widest backdrop-blur-sm pointer-events-none">
            PASS ❌
          </div>
        )}
        {swipeDirection === 'super' && (
          <div className="absolute top-20 inset-x-0 mx-auto w-max border-4 border-cyan-400 text-cyan-300 px-6 py-2 rounded-xl font-black text-2xl uppercase tracking-widest backdrop-blur-sm pointer-events-none">
            SUPER LIKE 🌟
          </div>
        )}

        {/* Bottom Details Section */}
        <div className="absolute bottom-0 inset-x-0 p-5 space-y-2 text-on-media">
          {/* Name, Age, Country Flag & Zodiac */}
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-xl font-display font-bold flex items-center space-x-2 flex-wrap text-on-media">
                <span>
                  {currentCreator.name}, {currentCreator.age}
                </span>
                <SvgFlag countryCode={currentCreator.countryCode} nationality={currentCreator.nationality} size="sm" />
              </h2>
              <div className="flex items-center space-x-3 text-xs text-on-media-muted mt-0.5">
                <span className="flex items-center space-x-1">
                  <MapPin
                    className={`w-3 h-3 ${getUserEffectiveLocation(currentCreator).isMock ? 'text-pink-400' : 'text-emerald-400'}`}
                  />
                  <span>{getUserEffectiveLocation(currentCreator).displayCity}</span>
                  {getUserEffectiveLocation(currentCreator).isMock && (
                    <span className="px-1 py-0.2 rounded bg-pink-600 text-[8px] font-bold text-white">MOCK</span>
                  )}
                </span>
                <span
                  className="flex items-center space-x-1 text-slate-400"
                  title={`Primary: ${currentCreator.spokenLanguages?.[0] || 'English'}`}
                >
                  <Languages className="w-3 h-3 text-amber-400" />
                  <span>{currentCreator.spokenLanguages?.[0] || 'English'}</span>
                </span>
              </div>
            </div>

            <button
              onClick={() => onOpenDetailModal(currentCreator)}
              className="p-2 bg-slate-900/80 hover:bg-slate-800 border border-slate-700 text-slate-300 rounded-full backdrop-blur-md transition-colors"
              title="View Full Profile & Gallery"
            >
              <Info className="w-4 h-4" />
            </button>
          </div>

          {/* Interests Pills */}
          <div className="flex flex-wrap gap-1 pt-1">
            {currentCreator.interests.map((interest) => (
              <span
                key={interest}
                className="px-2 py-0.5 bg-slate-900/70 border border-slate-800 text-[10px] text-slate-300 font-mono rounded-md"
              >
                #{interest}
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* Swipe Action Controls Bar */}
      <div className="flex items-center justify-evenly w-full mt-4 px-4">
        {/* Pass Button */}
        <button
          onClick={() => void handlePass()}
          disabled={actionBusy}
          className="w-12 h-12 rounded-full bg-app-card border border-app text-app-muted hover:border-brand/40 hover:text-brand flex items-center justify-center transition-all transform active:scale-95 group shrink-0 disabled:opacity-50"
          title="Pass (Swipe Left)"
        >
          <X className="w-5 h-5 transition-transform group-hover:scale-110" />
        </button>

        {/* Superlike Button */}
        <button
          onClick={() => void handleSuperLike()}
          disabled={actionBusy}
          className="w-12 h-12 rounded-full bg-app-card border border-brand/30 text-brand hover:bg-brand hover:text-white flex items-center justify-center transition-all transform active:scale-95 group shrink-0 disabled:opacity-50"
          title="Super Like"
        >
          <Star className="w-5 h-5 fill-current transition-transform group-hover:scale-110" />
        </button>

        {/* Like Button */}
        <button
          onClick={() => void handleLike()}
          disabled={actionBusy}
          className="w-12 h-12 rounded-full bg-app-card border border-brand/40 text-brand hover:bg-brand hover:text-white flex items-center justify-center transition-all transform active:scale-95 group shrink-0 disabled:opacity-50"
          title="Like (Swipe Right)"
        >
          <Heart className="w-5 h-5 fill-current transition-transform group-hover:scale-110" />
        </button>

        {/* Direct Call Button */}
        <button
          onClick={() => startCall(currentCreator.id)}
          className="w-12 h-12 rounded-full bg-flirt hover:brightness-110 text-white flex items-center justify-center shadow-brand transition-all transform active:scale-95 group shrink-0 relative"
          title="Start 1-on-1 Direct Video Call"
        >
          <Video className="w-5 h-5 fill-current transition-transform group-hover:scale-110" />
          {isFriend(currentCreator.id) && (
            <span className="absolute -bottom-5 left-1/2 -translate-x-1/2 whitespace-nowrap glass-pill px-1.5 py-0.5 rounded-md text-[9px] font-ticker text-white">
              {systemSettings.coinBurnRateFriendPerMin ?? 80}/m
            </span>
          )}
        </button>
      </div>
    </div>
  );
};
