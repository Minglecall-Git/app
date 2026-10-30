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
 * Sends GA4 page_view on Next.js route changes and History API SPA navigations
 * (MingleCall uses pushState/replaceState for tab routing).
 */
export function Ga4PageViews({ measurementId }: { measurementId: string }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const lastPathRef = useRef<string>('');
  const id = String(measurementId || '').trim();

  // Next.js App Router path changes
  useEffect(() => {
    if (!id || typeof window === 'undefined') return;
    const path = `${pathname || ''}${searchParams?.toString() ? `?${searchParams.toString()}` : ''}`;
    const full = path || `${window.location.pathname}${window.location.search}`;
    if (full === lastPathRef.current) return;
    lastPathRef.current = full;
    sendPageView(id, full);
  }, [id, pathname, searchParams]);

  // History API SPA tab navigations (pushState / replaceState / popstate)
  useEffect(() => {
    if (!id || typeof window === 'undefined') return;

    const report = () => {
      const path = `${window.location.pathname}${window.location.search}${window.location.hash}`;
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
