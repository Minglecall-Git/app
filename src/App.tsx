'use client';

import React, { useState, useEffect, Suspense } from 'react';
import dynamic from 'next/dynamic';
import { AppProvider, useApp } from './context/AppContext';
import { Header } from './components/Header';
import { GlobalBottomNav } from './components/navigation/GlobalBottomNav';
import { UserProfile } from './types';
import { CheckCircle2, AlertTriangle, Info, AlertCircle, X } from 'lucide-react';
import { ErrorBoundary } from './components/common/ErrorBoundary';
import { isSetupLocation } from './navigation/appRoutes';
import { useAppNavigation } from './navigation/useAppNavigation';
import { isRegistrationComplete } from './utils/registrationComplete';

const RouteFallback: React.FC = () => (
  <div className="flex min-h-[40vh] items-center justify-center text-sm text-app-muted">Loading…</div>
);

/** Route-level screens — compiled on demand in `next dev` instead of the whole SPA.
 * next/dynamic requires options as an object literal (not a shared variable). */
const HomePage = dynamic(
  () => import('./components/home/HomePage').then((m) => ({ default: m.HomePage })),
  { ssr: false, loading: () => <RouteFallback /> }
);
const DiscoveryGrid = dynamic(
  () => import('./components/discovery/DiscoveryGrid').then((m) => ({ default: m.DiscoveryGrid })),
  { ssr: false, loading: () => <RouteFallback /> }
);
const SwipeMatchDeck = dynamic(
  () => import('./components/discovery/SwipeMatchDeck').then((m) => ({ default: m.SwipeMatchDeck })),
  { ssr: false, loading: () => <RouteFallback /> }
);
const ProfileDetailModal = dynamic(
  () => import('./components/discovery/ProfileDetailModal').then((m) => ({ default: m.ProfileDetailModal })),
  { ssr: false }
);
const QuickMatchRoulette = dynamic(
  () => import('./components/discovery/QuickMatchRoulette').then((m) => ({ default: m.QuickMatchRoulette })),
  { ssr: false }
);
const UserProfilePage = dynamic(
  () => import('./components/profile/UserProfilePage').then((m) => ({ default: m.UserProfilePage })),
  { ssr: false, loading: () => <RouteFallback /> }
);
const PublicProfilePage = dynamic(
  () => import('./components/profile/PublicProfilePage').then((m) => ({ default: m.PublicProfilePage })),
  { ssr: false }
);
const MomentsFeed = dynamic(
  () => import('./components/social/MomentsFeed').then((m) => ({ default: m.MomentsFeed })),
  { ssr: false, loading: () => <RouteFallback /> }
);
const FemaleEarningsDashboard = dynamic(
  () =>
    import('./components/earnings/FemaleEarningsDashboard').then((m) => ({
      default: m.FemaleEarningsDashboard,
    })),
  { ssr: false, loading: () => <RouteFallback /> }
);
const FemaleCallLogsView = dynamic(
  () => import('./components/earnings/FemaleCallLogsView').then((m) => ({ default: m.FemaleCallLogsView })),
  { ssr: false, loading: () => <RouteFallback /> }
);
const HostDashboard = dynamic(
  () => import('./components/earnings/HostDashboard').then((m) => ({ default: m.HostDashboard })),
  { ssr: false, loading: () => <RouteFallback /> }
);
const AdminDashboard = dynamic(
  () => import('./components/admin/AdminDashboard').then((m) => ({ default: m.AdminDashboard })),
  { ssr: false, loading: () => <RouteFallback /> }
);
const TeamLeaderDashboard = dynamic(
  () =>
    import('./components/teamleader/TeamLeaderDashboard').then((m) => ({
      default: m.TeamLeaderDashboard,
    })),
  { ssr: false, loading: () => <RouteFallback /> }
);
const VideoCallStudio = dynamic(
  () => import('./components/videocall/VideoCallStudio').then((m) => ({ default: m.VideoCallStudio })),
  { ssr: false }
);
const PostCallRatingModal = dynamic(
  () => import('./components/videocall/PostCallRatingModal').then((m) => ({ default: m.PostCallRatingModal })),
  { ssr: false }
);
const CoinStoreModal = dynamic(
  () => import('./components/store/CoinStoreModal').then((m) => ({ default: m.CoinStoreModal })),
  { ssr: false }
);
const AuthModal = dynamic(
  () => import('./components/auth/AuthModal').then((m) => ({ default: m.AuthModal })),
  { ssr: false }
);
const DailyRewardsModal = dynamic(
  () => import('./components/rewards/DailyRewardsModal').then((m) => ({ default: m.DailyRewardsModal })),
  { ssr: false }
);
const ChatDrawer = dynamic(
  () => import('./components/chat/ChatDrawer').then((m) => ({ default: m.ChatDrawer })),
  { ssr: false }
);
const FriendsFavoritesDrawer = dynamic(
  () =>
    import('./components/social/FriendsFavoritesDrawer').then((m) => ({
      default: m.FriendsFavoritesDrawer,
    })),
  { ssr: false }
);
const BlockReportModal = dynamic(
  () => import('./components/social/BlockReportModal').then((m) => ({ default: m.BlockReportModal })),
  { ssr: false }
);
const OnboardingWizard = dynamic(
  () => import('./components/onboarding/OnboardingWizard').then((m) => ({ default: m.OnboardingWizard })),
  { ssr: false }
);
const ServerSetupWizard = dynamic(
  () => import('./components/setup/ServerSetupWizard').then((m) => ({ default: m.ServerSetupWizard })),
  { ssr: false, loading: () => <RouteFallback /> }
);
const PolicyDetailModal = dynamic(
  () => import('./components/home/PolicyDetailModal').then((m) => ({ default: m.PolicyDetailModal })),
  { ssr: false }
);
const PWAInstallPrompt = dynamic(
  () => import('./components/PWAInstallPrompt').then((m) => ({ default: m.PWAInstallPrompt })),
  { ssr: false }
);

const MainApp: React.FC = () => {
  const {
    activeCall,
    startCall,
    toast,
    hideToast,
    users,
    currentUser,
    updateUserProfile,
    isLoggedIn,
    logoutUser,
    pendingRatingCall,
    setPendingRatingCall,
    isDailyRewardsModalOpen,
    closeDailyRewardsModal,
    blockReportModal,
    closeBlockReportModal,
  } = useApp();

  const {
    activeTab,
    viewingProfileId,
    setActiveTab,
    replaceTab,
    openPublicProfile,
    closePublicProfile,
    exitApp,
  } = useAppNavigation();
  const [currentUtcTime, setCurrentUtcTime] = useState<string>(() =>
    new Date().toISOString().slice(0, 16).replace('T', ' ') + ' UTC'
  );

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentUtcTime(new Date().toISOString().slice(0, 16).replace('T', ' ') + ' UTC');
    }, 30000);
    return () => clearInterval(timer);
  }, []);

  const [isSetupRoute, setIsSetupRoute] = useState<boolean>(() => isSetupLocation());

  useEffect(() => {
    const syncSetupRoute = () => {
      setIsSetupRoute(isSetupLocation() || activeTab === 'server_setup');
    };
    syncSetupRoute();
    window.addEventListener('hashchange', syncSetupRoute);
    window.addEventListener('popstate', syncSetupRoute);
    return () => {
      window.removeEventListener('hashchange', syncSetupRoute);
      window.removeEventListener('popstate', syncSetupRoute);
    };
  }, [activeTab]);

  useEffect(() => {
    if (activeTab === 'admin' && (!isLoggedIn || currentUser.role !== 'admin')) {
      replaceTab('home');
    }
    if (
      activeTab === 'team_leader' &&
      (!isLoggedIn || (currentUser.role !== 'team_leader' && currentUser.role !== 'admin'))
    ) {
      replaceTab('home');
    }
  }, [activeTab, isLoggedIn, currentUser.role, replaceTab]);

  const [isStoreOpen, setIsStoreOpen] = useState(false);
  const [isAuthOpen, setIsAuthOpen] = useState(false);
  const [authInitialMode, setAuthInitialMode] = useState<'login' | 'register'>('login');
  const [authInviteToken, setAuthInviteToken] = useState<string | null>(null);
  const [authInviteKind, setAuthInviteKind] = useState<'female_host' | 'team_leader' | null>(
    null
  );
  const [isOnboardingOpen, setIsOnboardingOpen] = useState(false);
  /** Auth succeeded but profile registration not finished — block main app until complete. */
  const needsRegistrationCompletion = Boolean(
    isLoggedIn && currentUser?.id && !isRegistrationComplete(currentUser)
  );

  useEffect(() => {
    if (needsRegistrationCompletion) {
      setIsOnboardingOpen(true);
      setIsAuthOpen(false);
    }
  }, [needsRegistrationCompletion]);

  const [isSocialCircleOpen, setIsSocialCircleOpen] = useState(false);
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [isMatchOpen, setIsMatchOpen] = useState(false);
  const [chatUserId, setChatUserId] = useState<string | null>(null);
  const [selectedDeckUser, setSelectedDeckUser] = useState<UserProfile | null>(null);

  // Invites: /?token=... (host) or /?tl_invite=... (Team Leader) open register locked in
  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const params = new URLSearchParams(window.location.search);
      const tlInvite = params.get('tl_invite')?.trim() || '';
      const hostToken = params.get('token')?.trim() || '';
      const token = tlInvite || hostToken;
      const kind: 'female_host' | 'team_leader' | null = tlInvite
        ? 'team_leader'
        : hostToken
          ? 'female_host'
          : null;
      if (!token || token.length < 16 || !kind) return;
      if (!isLoggedIn) {
        setAuthInviteToken(token);
        setAuthInviteKind(kind);
        setAuthInitialMode('register');
        setIsAuthOpen(true);
      }
      params.delete('token');
      params.delete('tl_invite');
      const next = params.toString();
      const path = `${window.location.pathname}${next ? `?${next}` : ''}${window.location.hash || ''}`;
      window.history.replaceState({}, '', path);
    } catch (e) {
      console.warn('[App] invite token parse notice:', e);
    }
  }, [isLoggedIn]);

  const handleOpenAuth = (mode: 'login' | 'register' = 'register') => {
    setAuthInitialMode(mode);
    setIsAuthOpen(true);
  };

  const handleOpenChat = (targetUserId?: string) => {
    setIsChatOpen(true);
    setChatUserId(targetUserId || null);
  };

  const dismissTransientOverlays = () => {
    setIsChatOpen(false);
    setChatUserId(null);
    setIsMatchOpen(false);
    setIsSocialCircleOpen(false);
    setIsStoreOpen(false);
    setIsAuthOpen(false);
    setSelectedDeckUser(null);
  };

  const handleCloseOverlays = () => {
    dismissTransientOverlays();
    if (viewingProfileId) {
      replaceTab(activeTab);
    }
  };

  const navigateTab = (tab: string) => {
    dismissTransientOverlays();
    setActiveTab(tab);
  };

  const openProfileAndClear = (id: string) => {
    dismissTransientOverlays();
    openPublicProfile(id);
  };

  if (isSetupRoute || activeTab === 'server_setup') {
    return (
      <Suspense fallback={<RouteFallback />}>
        <ServerSetupWizard
          onExit={() => {
            setIsSetupRoute(false);
            if (window.location.hash) {
              window.location.hash = '';
            }
            replaceTab('home');
          }}
          onComplete={() => {
            setIsSetupRoute(false);
            if (window.location.hash) {
              window.location.hash = '';
            }
            replaceTab('home');
          }}
        />
      </Suspense>
    );
  }

  // Logged in but registration incomplete — lock into wizard; no main app chrome.
  if (needsRegistrationCompletion && currentUser) {
    return (
      <div className="bg-app text-app min-h-screen flex flex-col font-sans">
        <Suspense fallback={<RouteFallback />}>
          <OnboardingWizard
            user={currentUser}
            onComplete={(updated) => {
              updateUserProfile(updated.id, updated);
              setIsOnboardingOpen(false);
            }}
            onCancel={() => {
              setIsOnboardingOpen(false);
              void logoutUser({ reason: 'manual' });
            }}
          />
        </Suspense>
      </div>
    );
  }

  const isFemaleHostStudioUser =
    currentUser.role === 'female_creator' ||
    currentUser.role === 'female_host' ||
    currentUser.role === 'team_leader' ||
    currentUser.role === 'agency_manager';

  const isHostStudioSurface =
    isFemaleHostStudioUser && (activeTab === 'earnings' || activeTab === 'call_logs');

  const isShellLayout =
    activeTab === 'admin' ||
    activeTab === 'team_leader' ||
    activeTab === 'profile' ||
    isHostStudioSurface;

  return (
    <div
      className={`bg-app text-app flex flex-col font-sans selection-brand ${
        isShellLayout ? 'h-dvh max-h-dvh overflow-hidden' : 'min-h-screen'
      }`}
    >
      <Header
        activeTab={activeTab}
        setActiveTab={navigateTab}
        onOpenStore={() => {
          handleCloseOverlays();
          setIsStoreOpen(true);
        }}
        onOpenAuth={(mode) => {
          handleCloseOverlays();
          handleOpenAuth(mode || 'register');
        }}
        onOpenSocialCircle={() => {
          handleCloseOverlays();
          setIsSocialCircleOpen(true);
        }}
        onOpenChat={(id) => {
          handleCloseOverlays();
          handleOpenChat(id);
        }}
        onOpenMatch={() => {
          handleCloseOverlays();
          setIsMatchOpen(true);
        }}
      />

      <main
        className={`flex-1 min-h-0 app-fade-up ${
          isShellLayout
            ? 'relative overflow-hidden pb-0 h-full'
            : isLoggedIn
              ? 'pb-24 md:pb-10'
              : 'pb-6'
        }`}
      >
        <Suspense fallback={<RouteFallback />}>
          {activeTab === 'home' && (
            <HomePage
              onStartCall={(id) => startCall(id)}
              onOpenChat={(id) => handleOpenChat(id)}
              onOpenMatch={() => setIsMatchOpen(true)}
              onOpenStore={() => setIsStoreOpen(true)}
              onOpenAuth={(mode) => handleOpenAuth(mode || 'register')}
              onNavigateToTab={(tab) => navigateTab(tab)}
            />
          )}

          {activeTab === 'discovery' && (
            <DiscoveryGrid
              onStartCall={(id) => startCall(id)}
              onOpenChat={(id) => setChatUserId(id)}
              onOpenMatch={() => setIsMatchOpen(true)}
              onNavigateToSwipe={() => navigateTab('swipe')}
            />
          )}

          {activeTab === 'swipe' && (
            <div className="max-w-4xl mx-auto px-4 py-6 space-y-6">
              <SwipeMatchDeck onOpenDetailModal={(user) => setSelectedDeckUser(user)} />
              <ProfileDetailModal
                user={selectedDeckUser}
                onClose={() => setSelectedDeckUser(null)}
                onStartCall={(id) => startCall(id)}
                onOpenChat={(id) => handleOpenChat(id)}
              />
            </div>
          )}

          {activeTab === 'moments' && (
            <MomentsFeed
              onStartCall={(id) => startCall(id)}
              onOpenChat={(id) => setChatUserId(id)}
              onOpenStore={() => setIsStoreOpen(true)}
            />
          )}

          {isHostStudioSurface && (
            <HostDashboard
              appSurface={activeTab === 'call_logs' ? 'call_logs' : 'earnings'}
              onAppSurfaceChange={(surface) => navigateTab(surface)}
              onOpenChat={(id) => setChatUserId(id)}
              onStartCall={(id) => startCall(id)}
              onOpenProfile={(id) => openProfileAndClear(id)}
            />
          )}

          {activeTab === 'earnings' && !isHostStudioSurface && (
            <FemaleEarningsDashboard
              onOpenStore={() => setIsStoreOpen(true)}
              onStartCall={(id) => startCall(id)}
              onOpenChat={(id) => setChatUserId(id)}
              onOpenCallLogs={() => navigateTab('call_logs')}
            />
          )}

          {activeTab === 'call_logs' && !isHostStudioSurface && (
            <FemaleCallLogsView
              onOpenChat={(id) => setChatUserId(id)}
              onStartCall={(id) => startCall(id)}
              onOpenProfile={(id) => openProfileAndClear(id)}
            />
          )}

          {activeTab === 'team_leader' &&
            isLoggedIn &&
            (currentUser.role === 'team_leader' || currentUser.role === 'admin') && (
              <TeamLeaderDashboard
                onStartCall={(id) => startCall(id)}
                onOpenChat={(id) => handleOpenChat(id)}
                onNavigateToTab={(tab) => navigateTab(tab)}
              />
            )}

          {activeTab === 'admin' && isLoggedIn && currentUser.role === 'admin' && <AdminDashboard />}

          {activeTab === 'profile' && (
            <UserProfilePage
              onOpenStore={() => setIsStoreOpen(true)}
              onOpenChat={(id) => handleOpenChat(id)}
              onNavigateToTab={(tab) => navigateTab(tab)}
            />
          )}
        </Suspense>
      </main>

      {viewingProfileId && (
        <Suspense fallback={null}>
          <PublicProfilePage
            userId={viewingProfileId}
            onClose={() => closePublicProfile()}
            onStartCall={(id) => {
              closePublicProfile();
              startCall(id);
            }}
            onOpenChat={(id) => {
              closePublicProfile();
              handleOpenChat(id);
            }}
            onEditOwnProfile={() => {
              closePublicProfile();
              navigateTab('profile');
            }}
          />
        </Suspense>
      )}

      {!isShellLayout && (
        <footer className="h-8 bg-app-surface border-t border-app px-4 sm:px-8 flex items-center justify-between text-[10px] text-app-muted">
          <div className="flex gap-4 items-center">
            <span>LiveCall</span>
            <span className="hidden sm:inline">Video ready</span>
            <span className="hidden md:inline">{users.length} people nearby</span>
          </div>
          <div className="flex gap-4 items-center">
            <span className="flex items-center gap-1.5 text-emerald-400">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
              Live
            </span>
            <span className="hidden sm:inline text-app-muted">{currentUtcTime}</span>
          </div>
        </footer>
      )}

      {activeCall && (
        <Suspense fallback={null}>
          <VideoCallStudio onOpenStore={() => setIsStoreOpen(true)} />
        </Suspense>
      )}

      <Suspense fallback={null}>
        <CoinStoreModal isOpen={isStoreOpen} onClose={() => setIsStoreOpen(false)} />
        <AuthModal
          isOpen={isAuthOpen}
          onClose={() => {
            setIsAuthOpen(false);
            setAuthInviteToken(null);
            setAuthInviteKind(null);
          }}
          initialMode={authInitialMode}
          inviteToken={authInviteToken}
          inviteKind={authInviteKind}
          onNavigateToTab={(tab) => navigateTab(tab)}
        />
        {isOnboardingOpen && currentUser && (
          <OnboardingWizard
            user={currentUser}
            onComplete={(updated) => {
              updateUserProfile(updated.id, updated);
              setIsOnboardingOpen(false);
            }}
            onCancel={() => {
              setIsOnboardingOpen(false);
              if (!isRegistrationComplete(currentUser)) {
                void logoutUser({ reason: 'manual' });
              }
            }}
          />
        )}
        <DailyRewardsModal
          isOpen={isDailyRewardsModalOpen}
          onClose={closeDailyRewardsModal}
          onNavigateTab={(tab) => navigateTab(tab)}
        />
        <BlockReportModal
          key={
            blockReportModal ? `${blockReportModal.userId}-${blockReportModal.action}` : 'closed'
          }
          isOpen={!!blockReportModal}
          onClose={closeBlockReportModal}
          targetUserId={blockReportModal?.userId ?? null}
          initialAction={blockReportModal?.action ?? 'report'}
        />
        <QuickMatchRoulette
          isOpen={isMatchOpen}
          onClose={() => setIsMatchOpen(false)}
          onOpenChat={(id) => handleOpenChat(id)}
        />
        <FriendsFavoritesDrawer
          isOpen={isSocialCircleOpen}
          onClose={() => setIsSocialCircleOpen(false)}
          onStartCall={(id) => startCall(id)}
          onOpenChat={(id) => setChatUserId(id)}
        />
        <ChatDrawer
          isOpen={isChatOpen || chatUserId !== null}
          userId={chatUserId}
          onClose={() => {
            setIsChatOpen(false);
            setChatUserId(null);
          }}
          onStartCall={(id) => startCall(id)}
          onOpenProfile={(id) => openProfileAndClear(id)}
        />
        <PolicyDetailModal onNavigateToTab={(tab) => navigateTab(tab)} />
        {pendingRatingCall && (
          <PostCallRatingModal
            creatorId={pendingRatingCall.creatorId}
            creatorName={pendingRatingCall.creatorName}
            creatorAvatar={pendingRatingCall.creatorAvatar}
            callLogId={pendingRatingCall.callLogId || undefined}
            durationSeconds={pendingRatingCall.durationSeconds}
            ratingRequestMessageId={pendingRatingCall.ratingRequestMessageId}
            onClose={() => setPendingRatingCall(null)}
          />
        )}
      </Suspense>

      {isLoggedIn && !activeCall && (
        <GlobalBottomNav
          activeTab={activeTab}
          setActiveTab={setActiveTab}
          onExitApp={exitApp}
          onOpenMatch={() => setIsMatchOpen(true)}
          onOpenChat={(id) => handleOpenChat(id)}
          isChatOpen={isChatOpen || chatUserId !== null}
          isMatchOpen={isMatchOpen}
          onCloseOverlays={handleCloseOverlays}
        />
      )}

      {!activeCall && (
        <Suspense fallback={null}>
          <PWAInstallPrompt />
        </Suspense>
      )}

      {toast && (
        <div
          id="global-toast-alert"
          className="fixed top-16 left-1/2 -translate-x-1/2 z-[11000] w-[calc(100%-1.25rem)] max-w-md pointer-events-none transition-all animate-in slide-in-from-top-3 fade-in duration-200"
        >
          <div
            className={`p-3.5 sm:p-4 rounded-2xl border shadow-2xl backdrop-blur-xl flex items-start space-x-3 text-xs pointer-events-auto overflow-hidden relative ${
              toast.type === 'success'
                ? 'bg-[#0b1b14]/95 border-emerald-500/70 text-emerald-100 shadow-emerald-950/50'
                : toast.type === 'error'
                  ? 'bg-[#220d13]/95 border-rose-500/70 text-rose-100 shadow-rose-950/50'
                  : toast.type === 'warning'
                    ? 'bg-[#231808]/95 border-amber-500/70 text-amber-100 shadow-amber-950/50'
                    : 'bg-[#101420]/95 border-sky-500/70 text-sky-100 shadow-sky-950/50'
            }`}
          >
            <div className="shrink-0 mt-0.5">
              {toast.type === 'success' ? (
                <div className="w-7 h-7 rounded-xl bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center text-emerald-400">
                  <CheckCircle2 className="w-4 h-4 stroke-[2.5]" />
                </div>
              ) : toast.type === 'error' ? (
                <div className="w-7 h-7 rounded-xl bg-rose-500/20 border border-rose-500/40 flex items-center justify-center text-rose-400">
                  <AlertCircle className="w-4 h-4 stroke-[2.5]" />
                </div>
              ) : toast.type === 'warning' ? (
                <div className="w-7 h-7 rounded-xl bg-amber-500/20 border border-amber-500/40 flex items-center justify-center text-amber-400">
                  <AlertTriangle className="w-4 h-4 stroke-[2.5]" />
                </div>
              ) : (
                <div className="w-7 h-7 rounded-xl bg-sky-500/20 border border-sky-500/40 flex items-center justify-center text-sky-400">
                  <Info className="w-4 h-4 stroke-[2.5]" />
                </div>
              )}
            </div>

            <div className="flex-1 min-w-0 pr-1 space-y-0.5">
              <h4 className="font-extrabold text-xs sm:text-sm text-white tracking-tight flex items-center space-x-1.5">
                <span>{toast.title}</span>
              </h4>
              <p className="leading-snug text-[11px] sm:text-xs opacity-90 break-words">{toast.message}</p>
            </div>

            <button
              onClick={hideToast}
              className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 transition-colors shrink-0 cursor-pointer"
              title="Dismiss notification"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default function App() {
  return (
    <ErrorBoundary>
      <AppProvider>
        <MainApp />
      </AppProvider>
    </ErrorBoundary>
  );
}
