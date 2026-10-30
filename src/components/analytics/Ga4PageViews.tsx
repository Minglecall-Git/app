'use client';

import { useEffect, useRef } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';

declare global {
  interface Window {
    dataLayer?: unknown[];
    gtag?: (...args: unknown[]) => void;
  }
}

function sendPageView(measurementId: string, path: string) {
  if (typeof window === 'undefined' || !measurementId || !window.gtag) return;
  window.gtag('config', measurementId, {
    page_path: path,
  });
}

/**
 * SPA page views for History API tab changes.
 * Initial page_view is sent by the SSR gtag('config') in layout <head>.
 */
export function Ga4PageViews({ measurementId }: { measurementId: string }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const lastPathRef = useRef<string | null>(null);
  const id = String(measurementId || '').trim();

  useEffect(() => {
    if (!id || typeof window === 'undefined') return;

    const current = `${window.location.pathname}${window.location.search}${window.location.hash}`;

    // First mount: seed path from SSR config; do not double-send page_view.
    if (lastPathRef.current === null) {
      lastPathRef.current = current;
      return;
    }

    const nextPath =
      `${pathname || ''}${searchParams?.toString() ? `?${searchParams.toString()}` : ''}` ||
      current;
    if (nextPath === lastPathRef.current) return;
    lastPathRef.current = nextPath;
    sendPageView(id, nextPath);
  }, [id, pathname, searchParams]);

  useEffect(() => {
    if (!id || typeof window === 'undefined') return;

    const report = () => {
      const path = `${window.location.pathname}${window.location.search}${window.location.hash}`;
      if (lastPathRef.current === null) {
        lastPathRef.current = path;
        return;
      }
      if (path === lastPathRef.current) return;
      lastPathRef.current = path;
      sendPageView(id, path);
    };

    const onPopState = () => report();
    window.addEventListener('popstate', onPopState);

    const proto = History.prototype;
    const origPush = proto.pushState;
    const origReplace = proto.replaceState;

    proto.pushState = function (this: History, ...args: Parameters<History['pushState']>) {
      const result = origPush.apply(this, args);
      Promise.resolve().then(report);
      return result;
    };
    proto.replaceState = function (this: History, ...args: Parameters<History['replaceState']>) {
      const result = origReplace.apply(this, args);
      Promise.resolve().then(report);
      return result;
    };

    return () => {
      window.removeEventListener('popstate', onPopState);
      proto.pushState = origPush;
      proto.replaceState = origReplace;
    };
  }, [id]);

  return null;
}
