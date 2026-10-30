'use client';

import { useEffect, useRef } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';

declare global {
  interface Window {
    dataLayer?: unknown[];
    gtag?: (...args: unknown[]) => void;
    __mingleGa4?: {
      measurementId: string;
      lastPath: string;
    };
  }
}

/** Canonical path for dedupe: pathname + search only (ignore hash noise). */
function currentPathKey(): string {
  if (typeof window === 'undefined') return '';
  return `${window.location.pathname}${window.location.search}`;
}

function pathFromNext(pathname: string | null, searchParams: URLSearchParams | null): string {
  const path = pathname || '/';
  const q = searchParams?.toString();
  return q ? `${path}?${q}` : path;
}

/**
 * SPA page_view via recommended gtag event (not repeated gtag('config')).
 * SSR layout must call gtag('config', id, { send_page_view: false }).
 *
 * We intentionally do NOT rely on GA4 Enhanced Measurement history tracking —
 * disable "Page changes based on browser history events" in the GA4 stream
 * to avoid double-counting alongside this helper.
 */
function sendPageView(measurementId: string, path: string) {
  if (typeof window === 'undefined' || !measurementId || !window.gtag) return;
  window.gtag('event', 'page_view', {
    page_path: path,
    page_location: `${window.location.origin}${path}`,
    page_title: document.title,
    send_to: measurementId,
  });
}

function rememberPath(measurementId: string, path: string) {
  window.__mingleGa4 = { measurementId, lastPath: path };
}

export function Ga4PageViews({ measurementId }: { measurementId: string }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const id = String(measurementId || '').trim();
  const lastPathRef = useRef<string | null>(null);
  const readyRef = useRef(false);

  const trackIfChanged = (nextPath: string, opts?: { force?: boolean }) => {
    if (!id || !nextPath) return;
    const prev = lastPathRef.current ?? window.__mingleGa4?.lastPath ?? null;
    if (!opts?.force && prev === nextPath) return;
    lastPathRef.current = nextPath;
    rememberPath(id, nextPath);
    sendPageView(id, nextPath);
  };

  // Initial page_view once per full document load (+ SPA Next path changes).
  useEffect(() => {
    if (!id || typeof window === 'undefined') return;

    const nextFromRouter = pathFromNext(pathname, searchParams);
    const next = nextFromRouter || currentPathKey();

    // First paint after SSR config (send_page_view: false): send exactly one page_view.
    if (!readyRef.current) {
      readyRef.current = true;
      // Strict Mode remount: skip if this measurement already recorded this path.
      if (
        window.__mingleGa4?.measurementId === id &&
        window.__mingleGa4.lastPath === next
      ) {
        lastPathRef.current = next;
        return;
      }
      lastPathRef.current = next;
      rememberPath(id, next);
      sendPageView(id, next);
      return;
    }

    trackIfChanged(next);
  }, [id, pathname, searchParams]);

  // History API: real navigations only.
  // - pushState / popstate: track when pathname+search changes
  // - replaceState: track only when pathname+search changes (ignore bootstrap state sync)
  useEffect(() => {
    if (!id || typeof window === 'undefined') return;

    const reportAfterHistory = () => {
      // Defer until URL is updated
      const path = currentPathKey();
      trackIfChanged(path);
    };

    const onPopState = () => {
      void Promise.resolve().then(reportAfterHistory);
    };
    window.addEventListener('popstate', onPopState);

    const proto = History.prototype;
    const origPush = proto.pushState;
    const origReplace = proto.replaceState;

    proto.pushState = function (this: History, ...args: Parameters<History['pushState']>) {
      const before = currentPathKey();
      const result = origPush.apply(this, args);
      void Promise.resolve().then(() => {
        const after = currentPathKey();
        if (after !== before) trackIfChanged(after);
      });
      return result;
    };

    proto.replaceState = function (this: History, ...args: Parameters<History['replaceState']>) {
      const before = currentPathKey();
      const result = origReplace.apply(this, args);
      void Promise.resolve().then(() => {
        const after = currentPathKey();
        // Ignore replaceState that only syncs history.state (same URL) — common on bootstrap.
        if (after !== before) trackIfChanged(after);
      });
      return result;
    };

    return () => {
      window.removeEventListener('popstate', onPopState);
      proto.pushState = origPush;
      proto.replaceState = origReplace;
    };
    // trackIfChanged closes over id/refs; rebind when measurement id changes
  }, [id]);

  return null;
}
