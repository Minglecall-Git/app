import React, { useState, useEffect } from 'react';
import { Download, X, Smartphone, Sparkles, CheckCircle2 } from 'lucide-react';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

export const PWAInstallPrompt: React.FC = () => {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isInstallable, setIsInstallable] = useState(false);
  const [isInstalled, setIsInstalled] = useState(false);
  const [showBanner, setShowBanner] = useState(false);
  const [isIOS, setIsIOS] = useState(false);

  useEffect(() => {
    // Check if already in standalone mode
    const isStandalone =
      window.matchMedia('(display-mode: standalone)').matches ||
      (window.navigator as any).standalone === true;

    if (isStandalone) {
      setIsInstalled(true);
      return;
    }

    // Detect iOS
    const userAgent = window.navigator.userAgent.toLowerCase();
    const isIosDevice = /iphone|ipad|ipod/.test(userAgent);
    setIsIOS(isIosDevice);

    const dismissedUntil = localStorage.getItem('livecall_pwa_dismissed');
    const isDismissed = dismissedUntil && Date.now() < Number(dismissedUntil);

    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
      setIsInstallable(true);
      if (!isDismissed) {
        setShowBanner(true);
      }
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);

    // If iOS and not dismissed, show banner with instructions after 3 seconds
    if (isIosDevice && !isDismissed) {
      const timer = setTimeout(() => {
        setShowBanner(true);
      }, 3000);
      return () => {
        clearTimeout(timer);
        window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      };
    }

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    };
  }, []);

  const handleInstallClick = async () => {
    if (deferredPrompt) {
      deferredPrompt.prompt();
      const choiceResult = await deferredPrompt.userChoice;
      if (choiceResult.outcome === 'accepted') {
        setIsInstalled(true);
        setShowBanner(false);
      }
      setDeferredPrompt(null);
    }
  };

  const handleDismiss = () => {
    setShowBanner(false);
    // Dismiss for 7 days
    localStorage.setItem('livecall_pwa_dismissed', String(Date.now() + 7 * 24 * 60 * 60 * 1000));
  };

  if (isInstalled || !showBanner) {
    return null;
  }

  return (
    <div
      id="pwa-install-banner"
      className="fixed bottom-20 sm:bottom-6 left-3 right-3 sm:left-auto sm:right-6 sm:max-w-md z-40 animate-in slide-in-from-bottom-5 duration-300"
    >
      <div className="p-4 bg-slate-900/95 backdrop-blur-xl border border-pink-500/40 rounded-2xl shadow-2xl shadow-pink-500/10 text-white flex flex-col gap-3">
        <div className="flex items-start justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-pink-500 to-indigo-600 p-0.5 shadow-md shrink-0">
              <img
                src="/pwa-icon.svg"
                alt="LiveCall App"
                className="w-full h-full rounded-[10px] object-cover"
              />
            </div>
            <div>
              <div className="flex items-center space-x-1.5">
                <span className="font-bold text-sm text-white">Install LiveCall App</span>
                <span className="bg-pink-500/20 text-pink-300 border border-pink-500/40 text-[10px] font-bold px-1.5 py-0.2 rounded-full flex items-center gap-0.5">
                  <Sparkles className="w-2.5 h-2.5" /> PWA
                </span>
              </div>
              <p className="text-xs text-slate-300 mt-0.5">
                Fast full-screen video calls, instant messaging, and home screen access.
              </p>
            </div>
          </div>
          <button
            onClick={handleDismiss}
            className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 transition-colors"
            aria-label="Close install banner"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {isIOS ? (
          <div className="text-[11px] text-slate-300 bg-slate-800/80 p-2.5 rounded-xl border border-slate-700/60 space-y-1">
            <p className="font-medium text-slate-200">To install on iPhone / iPad:</p>
            <p>1. Tap the <strong className="text-pink-400">Share</strong> icon in Safari bottom bar</p>
            <p>2. Scroll down & select <strong className="text-pink-400">"Add to Home Screen"</strong></p>
          </div>
        ) : (
          <div className="flex items-center space-x-2 pt-1">
            <button
              onClick={handleInstallClick}
              className="flex-1 py-2 px-4 rounded-xl bg-gradient-to-r from-pink-600 via-purple-600 to-indigo-600 hover:from-pink-500 hover:to-indigo-500 text-white text-xs font-bold shadow-lg shadow-pink-500/25 flex items-center justify-center space-x-2 transition-all cursor-pointer"
            >
              <Download className="w-4 h-4" />
              <span>Install to Home Screen</span>
            </button>
            <button
              onClick={handleDismiss}
              className="px-3 py-2 rounded-xl text-xs font-semibold text-slate-400 hover:text-slate-200 bg-slate-800/60 hover:bg-slate-800 transition-colors cursor-pointer"
            >
              Maybe Later
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
