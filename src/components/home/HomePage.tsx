import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useApp } from '../../context/AppContext';
import {
  Zap,
  Sparkles,
  Crown,
  Coins,
  ShieldCheck,
  Lock,
  FileText,
  Layers,
  Flame,
  ChevronRight,
  ChevronLeft,
  Gift,
  CheckCircle2,
  Globe,
  ArrowRight,
  UserPlus,
  LogIn,
  Users,
} from 'lucide-react';
import { HomeBanner, PolicyDocument, HomeQuickLink } from '../../types';

interface HomePageProps {
  onStartCall?: (userId: string) => void;
  onOpenChat: (userId?: string) => void;
  onOpenMatch: () => void;
  onOpenStore: () => void;
  onOpenAuth?: (mode?: 'login' | 'register') => void;
  onNavigateToTab: (tab: string) => void;
}

export const HomePage: React.FC<HomePageProps> = ({
  onStartCall,
  onOpenChat,
  onOpenMatch,
  onOpenStore,
  onOpenAuth,
  onNavigateToTab,
}) => {
  const {
    currentUser,
    isLoggedIn,
    users,
    homeBanners,
    policyDocuments,
    homeQuickLinks,
    openPolicyModal,
    claimDailyBonus,
    dailyBonusClaimed,
    openDailyRewardsModal,
    dailyRewardRecord,
    hasUnclaimedDailyRewards,
    systemSettings,
    favorites,
    toggleFavorite,
  } = useApp();

  // Active Banners
  const activeBanners = useMemo(() => {
    return homeBanners.filter((b) => b.active).sort((a, b) => a.order - b.order);
  }, [homeBanners]);
  
  const [currentBannerIndex, setCurrentBannerIndex] = useState(0);
  const [isBannerHovered, setIsBannerHovered] = useState(false);
  const autoSlideTimerRef = useRef<any>(null);

  // Auto cycle banners every 5.5s
  useEffect(() => {
    if (activeBanners.length <= 1 || isBannerHovered) return;

    autoSlideTimerRef.current = setInterval(() => {
      setCurrentBannerIndex((prev) => (prev + 1) % activeBanners.length);
    }, 5500);

    return () => {
      if (autoSlideTimerRef.current) clearInterval(autoSlideTimerRef.current);
    };
  }, [activeBanners.length, isBannerHovered]);

  const handleNextBanner = () => {
    setCurrentBannerIndex((prev) => (prev + 1) % activeBanners.length);
  };

  const handlePrevBanner = () => {
    setCurrentBannerIndex((prev) => (prev - 1 + activeBanners.length) % activeBanners.length);
  };

  const handleBannerAction = (banner: HomeBanner) => {
    if (banner.actionType === 'tab') {
      onNavigateToTab(banner.actionTarget);
    } else if (banner.actionType === 'modal') {
      if (banner.actionTarget === 'match') onOpenMatch();
      else if (banner.actionTarget === 'vip' || banner.actionTarget === 'store') onOpenStore();
      else if (banner.actionTarget === 'chat') onOpenChat();
    } else if (banner.actionType === 'policy') {
      openPolicyModal(banner.actionTarget);
    } else if (banner.actionType === 'external' && banner.actionTarget) {
      window.open(banner.actionTarget, '_blank');
    }
  };

  const handleQuickLinkAction = (link: HomeQuickLink) => {
    if (link.actionType === 'tab') {
      onNavigateToTab(link.actionTarget);
    } else if (link.actionType === 'modal') {
      if (link.actionTarget === 'match') onOpenMatch();
      else if (link.actionTarget === 'vip' || link.actionTarget === 'store') onOpenStore();
      else if (link.actionTarget === 'chat') onOpenChat();
    } else if (link.actionType === 'policy') {
      openPolicyModal(link.actionTarget);
    } else if (link.actionType === 'external' && link.actionTarget) {
      window.open(link.actionTarget, '_blank');
    }
  };

  const getQuickIcon = (iconName: string) => {
    switch (iconName) {
      case 'Zap':
        return <Zap className="w-5 h-5" />;
      case 'Layers':
        return <Layers className="w-5 h-5" />;
      case 'Crown':
        return <Crown className="w-5 h-5" />;
      case 'Coins':
        return <Coins className="w-5 h-5" />;
      case 'Sparkles':
        return <Sparkles className="w-5 h-5" />;
      case 'ShieldCheck':
      default:
        return <ShieldCheck className="w-5 h-5" />;
    }
  };

  const currentBanner = activeBanners[currentBannerIndex] || activeBanners[0];

  return (
    <div id="home-page-root" className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 py-5 space-y-8 animate-in fade-in duration-300">
      

      {/* 1. HERO DATING & LIVE SOCIAL BANNER CAROUSEL */}
      {activeBanners.length > 0 && currentBanner && (
        <section
          className="relative rounded-3xl overflow-hidden shadow-app-lg border border-hairline bg-app-card group"
          onMouseEnter={() => setIsBannerHovered(true)}
          onMouseLeave={() => setIsBannerHovered(false)}
        >
          <div className="relative min-h-[260px] sm:min-h-[340px] md:min-h-[380px] flex items-center">
            {/* Background High-res Image */}
            <div className="absolute inset-0 z-0">
              <img
                src={currentBanner.imageUrl}
                alt={currentBanner.title}
                className="w-full h-full object-cover object-center transform scale-105 transition-transform duration-1000 ease-out group-hover:scale-100"
              />
              {/* Gradient Overlays */}
              <div className={`absolute inset-0 bg-gradient-to-r ${currentBanner.bgGradient || 'from-black/90 via-black/55 to-transparent'}`} />
              <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-black/30" />
            </div>

            {/* Banner Text Content */}
            <div className="relative z-10 p-5 sm:p-8 md:p-12 max-w-2xl space-y-3 sm:space-y-4">
              {currentBanner.tagText && (
                <div
                  className={`inline-flex items-center space-x-1.5 px-2.5 py-1 rounded-full text-[10px] sm:text-xs font-black tracking-wider uppercase shadow-md ${
                    currentBanner.tagColor || 'bg-rose-500 text-white'
                  }`}
                >
                  <Flame className="w-3.5 h-3.5" />
                  <span>{currentBanner.tagText}</span>
                </div>
              )}

              <h1 className="text-2xl sm:text-3xl md:text-4xl font-black text-on-media tracking-tight leading-tight drop-shadow-md">
                {currentBanner.title}
              </h1>

              <p className="text-xs sm:text-sm md:text-base text-on-media-muted line-clamp-3 sm:line-clamp-none font-medium leading-relaxed drop-shadow">
                {currentBanner.subtitle}
              </p>

              {/* Action Buttons */}
              <div className="pt-2 flex flex-wrap items-center gap-3">
                <button
                  onClick={() => handleBannerAction(currentBanner)}
                  className="px-5 sm:px-6 py-2.5 sm:py-3 rounded-2xl bg-flirt hover:brightness-110 text-white font-extrabold text-xs sm:text-sm shadow-brand flex items-center space-x-2 transition-all transform active:scale-95 cursor-pointer"
                >
                  <span>{currentBanner.ctaText || 'Explore Now'}</span>
                  <ArrowRight className="w-4 h-4" />
                </button>

                <button
                  onClick={onOpenMatch}
                  className="px-4 sm:px-5 py-2.5 sm:py-3 rounded-2xl bg-black/45 hover:bg-black/60 text-on-media font-bold text-xs sm:text-sm border border-white/20 backdrop-blur-md flex items-center space-x-2 transition-all"
                >
                  <Zap className="w-4 h-4 text-amber-400 fill-amber-400/20" />
                  <span>Instant Match</span>
                </button>
              </div>
            </div>

            {/* Slider Navigation Arrows */}
            {activeBanners.length > 1 && (
              <>
                <button
                  onClick={handlePrevBanner}
                  className="absolute left-3 top-1/2 -translate-y-1/2 z-20 w-9 h-9 rounded-full bg-black/50 hover:bg-black/80 text-white flex items-center justify-center backdrop-blur-md border border-white/10 opacity-70 group-hover:opacity-100 transition-opacity"
                  title="Previous banner"
                >
                  <ChevronLeft className="w-5 h-5" />
                </button>

                <button
                  onClick={handleNextBanner}
                  className="absolute right-3 top-1/2 -translate-y-1/2 z-20 w-9 h-9 rounded-full bg-black/50 hover:bg-black/80 text-white flex items-center justify-center backdrop-blur-md border border-white/10 opacity-70 group-hover:opacity-100 transition-opacity"
                  title="Next banner"
                >
                  <ChevronRight className="w-5 h-5" />
                </button>
              </>
            )}

            {/* Indicator Dots */}
            {activeBanners.length > 1 && (
              <div className="absolute bottom-3 right-4 sm:right-8 z-20 flex items-center space-x-1.5 bg-black/40 px-3 py-1.5 rounded-full backdrop-blur-sm border border-white/10">
                {activeBanners.map((_, idx) => (
                  <button
                    key={idx}
                    onClick={() => setCurrentBannerIndex(idx)}
                    className={`h-2 rounded-full transition-all cursor-pointer ${
                      idx === currentBannerIndex ? 'w-6 bg-pink-500' : 'w-2 bg-white/40 hover:bg-white/70'
                    }`}
                    title={`Slide ${idx + 1}`}
                  />
                ))}
              </div>
            )}
          </div>
        </section>
      )}

      {/* 2. QUICK ACTION SHORTCUTS (Dating App Style) */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <Sparkles className="w-4 h-4 text-pink-500" />
            <h2 className="text-base sm:text-lg font-black text-app-heading tracking-tight">Hot Activities & Shortcuts</h2>
          </div>
          <span className="text-xs text-app-muted font-mono">1-TAP SHORTCUTS</span>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          {homeQuickLinks
            .filter((l) => {
              if (!l.active) return false;
              // VIP Pass shortcut retired — hide stale CMS/DB rows (coin packages may still say VIP)
              const title = String(l.title || '').trim().toLowerCase();
              const target = String(l.actionTarget || '').trim().toLowerCase();
              if (title === 'vip pass' || target === 'vip' || l.id === 'link_vip_club') return false;
              return true;
            })
            .sort((a, b) => a.order - b.order)
            .map((link) => (
              <button
                key={link.id}
                onClick={() => handleQuickLinkAction(link)}
                className="group relative p-4 rounded-2xl bg-app-card hover:bg-app-card-subtle border border-hairline hover:border-brand/40 shadow-app-sm hover:shadow-brand/10 flex flex-col items-center text-center transition-all transform hover:-translate-y-0.5 active:scale-95 cursor-pointer overflow-hidden"
              >
                {link.badge && (
                  <span className="absolute top-2 right-2 px-1.5 py-0.5 rounded-full bg-gradient-to-r from-pink-600 to-rose-600 text-white font-black text-[8px] uppercase tracking-wider shadow">
                    {link.badge}
                  </span>
                )}

                <div className={`w-12 h-12 rounded-2xl bg-gradient-to-br ${link.colorGradient} flex items-center justify-center text-white shadow-lg mb-2.5 group-hover:scale-110 transition-transform`}>
                  {getQuickIcon(link.icon)}
                </div>

                <span className="text-xs font-bold text-app-heading tracking-tight leading-tight group-hover:text-brand transition-colors">
                  {link.title}
                </span>
                {link.subtitle && (
                  <span className="text-[10px] text-app-muted mt-0.5">{link.subtitle}</span>
                )}
              </button>
            ))}
        </div>
      </section>

      {/* 3. DUAL BANNERS: DAILY REWARD CHEST & QUICK MATCH RADAR */}
      <section className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Daily Bonus Reward Card */}
        <div className="bg-gradient-to-br from-amber-500/10 via-app-card to-app-card-subtle border border-amber-500/30 rounded-3xl p-5 sm:p-6 shadow-app-sm relative overflow-hidden flex flex-col justify-between">
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <div className="inline-flex items-center space-x-1.5 px-2.5 py-0.5 rounded-full bg-amber-400/10 border border-amber-400/30 text-amber-500 text-[10px] font-mono uppercase font-bold">
                <Gift className="w-3 h-3" />
                <span>DAILY REWARDS & QUESTS</span>
              </div>
              <span className="px-2 py-0.5 rounded-full bg-orange-500/15 border border-orange-500/40 text-orange-500 text-[10px] font-mono font-bold">
                🔥 Day {dailyRewardRecord?.streakCount || 1} Streak
              </span>
            </div>
            <h3 className="text-lg sm:text-xl font-black text-app-heading tracking-tight">
              7-Day Streak & Daily Quests
            </h3>
            <p className="text-xs text-app-muted leading-relaxed">
              Earn free coins daily by logging in, chatting with friends, quick matching, and video calling.
            </p>
          </div>

          <div className="pt-4 flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <div className="w-9 h-9 rounded-2xl bg-amber-400/20 text-amber-500 flex items-center justify-center font-black text-sm">
                🪙
              </div>
              <div>
                <span className="text-[10px] text-app-muted uppercase tracking-widest block font-bold">Your Balance</span>
                <span className="text-sm font-extrabold text-amber-500 font-mono">
                  {(currentUser?.coinBalance ?? 0).toLocaleString()} Coins
                </span>
              </div>
            </div>

            <button
              onClick={openDailyRewardsModal}
              className={`px-4 py-2 rounded-2xl font-black text-xs transition-all shadow-lg flex items-center space-x-1.5 cursor-pointer ${
                hasUnclaimedDailyRewards
                  ? 'bg-gradient-to-r from-amber-400 to-yellow-500 hover:from-amber-300 hover:to-yellow-400 text-slate-950 shadow-amber-500/25 active:scale-95 animate-pulse'
                  : 'bg-app-input hover:bg-brand-soft text-app-heading border border-hairline'
              }`}
            >
              <Gift className="w-3.5 h-3.5" />
              <span>{hasUnclaimedDailyRewards ? 'Claim Free Coins 🎁' : 'View Quests & Streak'}</span>
            </button>
          </div>
        </div>

        {/* Quick Match Roulette Promo Card */}
        <div className="bg-app-card border border-hairline rounded-app-xl p-5 sm:p-6 shadow-app-sm relative overflow-hidden flex flex-col justify-between app-fade-up">
          <div className="space-y-2">
            <div className="inline-flex items-center space-x-1.5 px-2.5 py-0.5 rounded-md bg-brand-soft border border-brand/25 text-brand text-[11px] font-semibold">
              <Zap className="w-3 h-3" />
              <span>Quick Match</span>
            </div>
            <h3 className="font-display text-lg sm:text-xl font-bold text-app-heading tracking-tight">
              Instant 1-on-1 video
            </h3>
            <p className="text-xs text-app-muted leading-relaxed">
              Skip browsing. Match with someone live in seconds.
            </p>
          </div>

          <div className="pt-4 flex items-center justify-between">
            <div className="flex items-center space-x-2 text-xs text-app-muted">
              <Globe className="w-4 h-4 text-brand" />
              <span>Real-time translation</span>
            </div>

            <button
              onClick={onOpenMatch}
              className="px-5 py-2 rounded-app bg-brand hover:brightness-110 text-white font-semibold text-xs shadow-brand transition-all flex items-center space-x-1.5 active:scale-95 cursor-pointer"
            >
              <Zap className="w-3.5 h-3.5" />
              <span>Match now</span>
            </button>
          </div>
        </div>
      </section>

      {/* 5. COMMUNITY SAFETY, TRUST & POLICY LINKS GRID */}
      <section className="space-y-4 pt-2">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <div className="flex items-center space-x-2">
              <ShieldCheck className="w-5 h-5 text-indigo-500" />
              <h2 className="text-base sm:text-lg font-black text-app-heading tracking-tight">Platform Trust & Policies</h2>
            </div>
            <p className="text-xs text-app-muted">
              Our safety standards, data privacy encryption, terms of service, and creator monetization guidelines.
            </p>
          </div>

          <div className="flex items-center space-x-2">
            <span className="px-2.5 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-500 text-[10px] font-mono font-bold flex items-center space-x-1">
              <CheckCircle2 className="w-3 h-3" />
              <span>100% REGULATORY COMPLIANT</span>
            </span>
          </div>
        </div>

        {/* Policy Cards Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5">
          {policyDocuments
            .filter((p) => p.isFeaturedOnHome)
            .sort((a, b) => a.order - b.order)
            .map((policy) => (
              <div
                key={policy.id}
                onClick={() => openPolicyModal(policy.id)}
                className="bg-app-card hover:bg-app-card-subtle border border-hairline hover:border-indigo-500/50 rounded-2xl p-4 flex flex-col justify-between transition-all shadow-app-sm hover:shadow-indigo-500/10 cursor-pointer group"
              >
                <div className="space-y-2.5">
                  <div className="flex items-center justify-between">
                    <div className="w-8 h-8 rounded-xl bg-app-input border border-hairline flex items-center justify-center text-indigo-500 group-hover:scale-110 transition-transform">
                      {policy.category === 'safety' ? (
                        <ShieldCheck className="w-4 h-4 text-rose-500" />
                      ) : policy.category === 'privacy' ? (
                        <Lock className="w-4 h-4 text-indigo-500" />
                      ) : policy.category === 'terms' ? (
                        <FileText className="w-4 h-4 text-emerald-500" />
                      ) : policy.category === 'coins' ? (
                        <Coins className="w-4 h-4 text-amber-500" />
                      ) : (
                        <Sparkles className="w-4 h-4 text-pink-500" />
                      )}
                    </div>
                    <span className="text-[10px] text-app-muted font-mono uppercase">{policy.lastUpdated}</span>
                  </div>

                  <h4 className="font-extrabold text-sm text-app-heading group-hover:text-indigo-500 transition-colors leading-snug">
                    {policy.title}
                  </h4>

                  <p className="text-xs text-app-muted line-clamp-2 leading-relaxed">
                    {policy.summary}
                  </p>
                </div>

                <div className="pt-3 mt-3 border-t border-hairline flex items-center justify-between text-xs font-bold text-indigo-500 group-hover:text-indigo-400">
                  <span>Read Official Policy</span>
                  <ChevronRight className="w-4 h-4 transform group-hover:translate-x-1 transition-transform" />
                </div>
              </div>
            ))}
        </div>
      </section>

      {/* 6. PLATFORM CAPABILITY HIGHLIGHTS STRIP */}
      <section className="bg-app-card border border-hairline rounded-3xl p-5 sm:p-6 shadow-app-sm">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-center">
          <div className="p-3 bg-app-card-subtle rounded-2xl border border-hairline">
            <div className="text-xl sm:text-2xl font-black text-app-heading font-mono">1,280+</div>
            <div className="text-[11px] text-app-muted uppercase tracking-wider mt-0.5">Verified Hosts</div>
          </div>
          <div className="p-3 bg-app-card-subtle rounded-2xl border border-hairline">
            <div className="text-xl sm:text-2xl font-black text-emerald-500 font-mono">18ms</div>
            <div className="text-[11px] text-app-muted uppercase tracking-wider mt-0.5">HD WebRTC Latency</div>
          </div>
          <div className="p-3 bg-app-card-subtle rounded-2xl border border-hairline">
            <div className="text-xl sm:text-2xl font-black text-pink-500 font-mono">50% Off</div>
            <div className="text-[11px] text-app-muted uppercase tracking-wider mt-0.5">Friend Calls (5 🪙/m)</div>
          </div>
          <div className="p-3 bg-app-card-subtle rounded-2xl border border-hairline">
            <div className="text-xl sm:text-2xl font-black text-amber-500 font-mono">24/7</div>
            <div className="text-[11px] text-app-muted uppercase tracking-wider mt-0.5">AI Safety Shield</div>
          </div>
        </div>
      </section>

      {/* 6.5 BOTTOM REGISTRATION & DISCOVERY CTA */}
      {onOpenAuth && (
        <section className="rounded-app-xl bg-app-card border border-hairline p-6 sm:p-8 text-center space-y-4 shadow-app app-fade-up">
          <div className="inline-flex items-center space-x-2 px-3 py-1 rounded-md bg-brand-soft text-brand border border-brand/30 text-xs font-semibold">
            <span>Start video calling</span>
          </div>
          <h3 className="font-display text-2xl sm:text-3xl font-bold text-app-heading tracking-tight">
            Join free. Meet someone live.
          </h3>
          <p className="text-xs sm:text-sm text-app-muted max-w-xl mx-auto">
            Private HD video with verified hosts. No subscription required.
          </p>
          <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
            <button
              onClick={() => onOpenAuth('register')}
              className="px-6 py-3 rounded-app bg-brand hover:brightness-110 text-white font-semibold text-sm shadow-brand flex items-center space-x-2 transition-all transform active:scale-95 cursor-pointer"
            >
              <UserPlus className="w-4 h-4" />
              <span>Create free account</span>
            </button>
            <button
              onClick={() => onOpenAuth('login')}
              className="px-5 py-3 rounded-app bg-app-card-subtle hover:bg-brand-soft text-app-heading font-semibold text-xs sm:text-sm border border-hairline transition-all flex items-center space-x-1.5 cursor-pointer"
            >
              <LogIn className="w-3.5 h-3.5 text-app-muted" />
              <span>Sign in</span>
            </button>
          </div>
        </section>
      )}

      {/* 7. LEGAL POLICY FOOTER COMPLIANCE BAR */}
      <section className="border-t border-hairline pt-6 pb-2 text-center sm:text-left flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-app-muted">
        <div className="flex flex-wrap items-center justify-center sm:justify-start gap-x-4 gap-y-2">
          {policyDocuments.map((doc) => (
            <button
              key={doc.id}
              onClick={() => openPolicyModal(doc.id)}
              className="text-app-muted hover:text-app-heading transition-colors underline-offset-2 hover:underline cursor-pointer"
            >
              {doc.title.split('&')[0].trim()}
            </button>
          ))}
        </div>

        <div className="text-[11px] text-app-muted">
          © 2026 Minglecall. All rights reserved. 18+ Only.
        </div>
      </section>

    </div>
  );
};
