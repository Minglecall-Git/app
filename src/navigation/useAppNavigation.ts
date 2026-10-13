import { useCallback, useEffect, useRef, useState } from 'react';
import {
  DEFAULT_TAB,
  isKnownAppPath,
  isSetupLocation,
  normalizePath,
  parsePublicProfilePath,
  publicProfilePath,
  readTabFromLocation,
  tabToPath,
} from './appRoutes';

export const APP_NAV_STATE_KEY = '__mingleNav' as const;

export interface AppNavHistoryState {
  [APP_NAV_STATE_KEY]: true;
  tab: string;
  /** Depth within this SPA session (0 = entry / root). Used for exit fallback. */
  idx: number;
  /** When set, the URL is a public profile deep link overlaying `tab`. */
  profileId?: string | null;
}

function isAppNavState(state: unknown): state is AppNavHistoryState {
  return (
    !!state &&
    typeof state === 'object' &&
    (state as AppNavHistoryState)[APP_NAV_STATE_KEY] === true &&
    typeof (state as AppNavHistoryState).tab === 'string'
  );
}

function getHistoryIdx(): number {
  const state = window.history.state;
  if (isAppNavState(state) && typeof state.idx === 'number' && state.idx >= 0) {
    return state.idx;
  }
  return 0;
}

function buildState(
  tab: string,
  idx: number,
  profileId?: string | null
): AppNavHistoryState {
  const state: AppNavHistoryState = { [APP_NAV_STATE_KEY]: true, tab, idx };
  if (profileId) state.profileId = profileId;
  return state;
}

function readProfileIdFromLocation(): string | null {
  if (typeof window === 'undefined') return null;
  return parsePublicProfilePath(window.location.pathname);
}

export interface NavigateOptions {
  /** Use replaceState instead of pushState (redirects, auth kickouts, same-tab URL sync). */
  replace?: boolean;
}

export interface UseAppNavigationResult {
  activeTab: string;
  /** Public profile user id from `/profile/:userId`, or null. */
  viewingProfileId: string | null;
  /** Push a new history entry when the tab changes; no-op for same tab (prevents loops). */
  setActiveTab: (tab: string) => void;
  /** Replace the current history entry (auth redirects, setup exit). */
  replaceTab: (tab: string) => void;
  /** Open a peer public profile at `/profile/:userId` (pushes history). */
  openPublicProfile: (userId: string) => void;
  /** Leave public profile (history.back when possible). */
  closePublicProfile: () => void;
  /**
   * Attempt to close the PWA/window. If the environment blocks close(),
   * fall back to the SPA root without trapping the user.
   */
  exitApp: () => void;
  /** True when Back would stay inside the SPA (idx > 0). */
  canGoBackInApp: boolean;
}

/**
 * Centralized SPA navigation + History API sync.
 *
 * - Meaningful URLs for each major tab
 * - Public profile deep links at `/profile/:userId`
 * - Browser Back/Forward updates the screen without re-pushing
 * - Same-tab navigations do not create duplicate history entries
 * - Entry/root Back is left alone so the user can exit the PWA/browser tab
 */
export function useAppNavigation(): UseAppNavigationResult {
  const [activeTab, setActiveTabState] = useState<string>(() => {
    if (typeof window !== 'undefined' && parsePublicProfilePath(window.location.pathname)) {
      const existing = window.history.state;
      if (isAppNavState(existing) && existing.tab) return existing.tab;
      return DEFAULT_TAB;
    }
    return readTabFromLocation();
  });
  const [viewingProfileId, setViewingProfileId] = useState<string | null>(() =>
    readProfileIdFromLocation()
  );
  const [canGoBackInApp, setCanGoBackInApp] = useState(() => getHistoryIdx() > 0);

  const activeTabRef = useRef(activeTab);
  activeTabRef.current = activeTab;
  const viewingProfileIdRef = useRef(viewingProfileId);
  viewingProfileIdRef.current = viewingProfileId;

  /** When true, URL/history already reflects the tab — do not push/replace again. */
  const applyingHistoryRef = useRef(false);

  const syncCanGoBack = useCallback(() => {
    setCanGoBackInApp(getHistoryIdx() > 0);
  }, []);

  const applyFromHistory = useCallback(
    (tab: string, profileId: string | null) => {
      applyingHistoryRef.current = true;
      activeTabRef.current = tab;
      viewingProfileIdRef.current = profileId;
      setActiveTabState(tab);
      setViewingProfileId(profileId);
      syncCanGoBack();
      window.setTimeout(() => {
        applyingHistoryRef.current = false;
      }, 0);
    },
    [syncCanGoBack]
  );

  // Stamp / normalize the initial history entry once (replace only — never push on mount).
  useEffect(() => {
    const currentPath = normalizePath(window.location.pathname);
    const profileId = parsePublicProfilePath(currentPath);
    const existing = window.history.state;
    const idx = isAppNavState(existing) && typeof existing.idx === 'number' ? existing.idx : 0;

    if (profileId) {
      const tab =
        isAppNavState(existing) && existing.tab ? existing.tab : DEFAULT_TAB;
      const state = buildState(tab, idx, profileId);
      window.history.replaceState(state, '', publicProfilePath(profileId));
      if (tab !== activeTabRef.current || profileId !== viewingProfileIdRef.current) {
        applyFromHistory(tab, profileId);
      } else {
        syncCanGoBack();
      }
      return;
    }

    const tab = readTabFromLocation();
    const path = tabToPath(tab);
    const targetPath = normalizePath(path);
    const state = buildState(tab, idx, null);

    // Unknown deep paths → canonical home URL without adding a history entry.
    if (!isKnownAppPath(currentPath) && !isSetupLocation() && currentPath !== '/') {
      window.history.replaceState(state, '', path);
    } else if (currentPath !== targetPath) {
      window.history.replaceState(state, '', path);
    } else if (!isAppNavState(existing) || existing.tab !== tab || existing.profileId) {
      window.history.replaceState(state, '', `${path}${window.location.search}${window.location.hash}`);
    }

    if (tab !== activeTabRef.current || viewingProfileIdRef.current) {
      applyFromHistory(tab, null);
    } else {
      syncCanGoBack();
    }
  }, [applyFromHistory, syncCanGoBack]);

  // Sync screen ← browser Back/Forward
  useEffect(() => {
    const onPopState = (event: PopStateEvent) => {
      let tab: string;
      let profileId: string | null = null;

      if (isAppNavState(event.state)) {
        tab = event.state.tab;
        profileId = event.state.profileId ? String(event.state.profileId) : null;
      } else if (isSetupLocation()) {
        tab = 'server_setup';
      } else {
        profileId = readProfileIdFromLocation();
        tab = profileId
          ? activeTabRef.current || DEFAULT_TAB
          : readTabFromLocation();
      }

      // Prefer URL as source of truth for profile deep links.
      const fromUrl = readProfileIdFromLocation();
      if (fromUrl) profileId = fromUrl;
      else if (!isAppNavState(event.state)) profileId = null;

      applyFromHistory(tab, profileId);
    };

    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, [applyFromHistory]);

  const navigateTo = useCallback(
    (tab: string, options?: NavigateOptions) => {
      const next = tab || DEFAULT_TAB;

      if (applyingHistoryRef.current) {
        return;
      }

      const path = tabToPath(next);
      const currentPath = normalizePath(window.location.pathname);
      const targetPath = normalizePath(path);
      const sameTab = next === activeTabRef.current && !viewingProfileIdRef.current;
      const sameUrl = currentPath === targetPath;

      // Same screen + same URL: ignore (re-renders, repeated taps, effect noise, redirect no-ops).
      if (sameTab && sameUrl) {
        return;
      }

      // Same tab but URL out of sync (rare): repair with replace, never push.
      if (sameTab && !sameUrl) {
        window.history.replaceState(buildState(next, getHistoryIdx(), null), '', path);
        viewingProfileIdRef.current = null;
        setViewingProfileId(null);
        syncCanGoBack();
        return;
      }

      const replace = options?.replace === true;
      const idx = replace ? getHistoryIdx() : getHistoryIdx() + 1;
      const state = buildState(next, idx, null);

      if (replace) {
        window.history.replaceState(state, '', path);
      } else {
        window.history.pushState(state, '', path);
      }

      activeTabRef.current = next;
      viewingProfileIdRef.current = null;
      setActiveTabState(next);
      setViewingProfileId(null);
      syncCanGoBack();
    },
    [syncCanGoBack]
  );

  const setActiveTab = useCallback(
    (tab: string) => {
      navigateTo(tab, { replace: false });
    },
    [navigateTo]
  );

  const replaceTab = useCallback(
    (tab: string) => {
      navigateTo(tab, { replace: true });
    },
    [navigateTo]
  );

  const openPublicProfile = useCallback(
    (userId: string) => {
      const id = String(userId || '').trim();
      if (!id || applyingHistoryRef.current) return;

      if (viewingProfileIdRef.current === id) {
        const currentPath = normalizePath(window.location.pathname);
        if (currentPath === normalizePath(publicProfilePath(id))) return;
      }

      const tab = activeTabRef.current || DEFAULT_TAB;
      const idx = getHistoryIdx() + 1;
      const path = publicProfilePath(id);
      window.history.pushState(buildState(tab, idx, id), '', path);
      viewingProfileIdRef.current = id;
      setViewingProfileId(id);
      syncCanGoBack();
    },
    [syncCanGoBack]
  );

  const closePublicProfile = useCallback(() => {
    if (!viewingProfileIdRef.current) return;

    if (getHistoryIdx() > 0) {
      window.history.back();
      return;
    }

    const tab = activeTabRef.current || DEFAULT_TAB;
    const path = tabToPath(tab);
    window.history.replaceState(buildState(tab, 0, null), '', path);
    viewingProfileIdRef.current = null;
    setViewingProfileId(null);
    syncCanGoBack();
  }, [syncCanGoBack]);

  const exitApp = useCallback(() => {
    // Prefer native close when the browser/PWA allows it (standalone / script-opened).
    try {
      window.close();
    } catch {
      // ignore — many browsers block window.close()
    }

    const finalizeRoot = () => {
      const state = buildState(DEFAULT_TAB, 0, null);
      window.history.replaceState(state, '', tabToPath(DEFAULT_TAB));
      activeTabRef.current = DEFAULT_TAB;
      viewingProfileIdRef.current = null;
      setActiveTabState(DEFAULT_TAB);
      setViewingProfileId(null);
      setCanGoBackInApp(false);
    };

    // If close() is ignored, unwind SPA history to the entry then land on root.
    window.setTimeout(() => {
      if (document.hidden || (window as Window & { closed?: boolean }).closed) {
        return;
      }
      const idx = getHistoryIdx();
      if (idx > 0) {
        const onPop = () => {
          window.removeEventListener('popstate', onPop);
          finalizeRoot();
        };
        window.addEventListener('popstate', onPop);
        window.history.go(-idx);
        // Safety: if go() does not fire (edge cases), still reset.
        window.setTimeout(() => {
          window.removeEventListener('popstate', onPop);
          if (
            activeTabRef.current !== DEFAULT_TAB ||
            viewingProfileIdRef.current ||
            normalizePath(window.location.pathname) !== '/'
          ) {
            finalizeRoot();
          }
        }, 300);
      } else {
        finalizeRoot();
      }
    }, 150);
  }, []);

  return {
    activeTab,
    viewingProfileId,
    setActiveTab,
    replaceTab,
    openPublicProfile,
    closePublicProfile,
    exitApp,
    canGoBackInApp,
  };
}
