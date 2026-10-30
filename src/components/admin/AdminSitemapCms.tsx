/**
 * Admin CMS — Sitemap: copy URL for Google Search Console + update lastmod / extra paths.
 */
import React, { useCallback, useEffect, useState } from 'react';
import { Check, Copy, ExternalLink, Loader2, Map, RefreshCw } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { authFetch } from '../../utils/apiClient';
import {
  DEFAULT_SITEMAP_PATHS,
  formatSitemapExtraPaths,
} from '../../../shared/cms/sitemap';

type SitemapAdminData = {
  sitemapUrl: string;
  robotsUrl: string;
  lastUpdated: string | null;
  paths: string[];
  extraPaths: string[];
  defaultPaths: string[];
};

export const AdminSitemapCms: React.FC = () => {
  const { showToast } = useApp();
  const [data, setData] = useState<SitemapAdminData | null>(null);
  const [extraPathsText, setExtraPathsText] = useState('');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await authFetch('/api/admin/cms/sitemap');
      const body = await res.json().catch(() => ({}));
      if (!res.ok || !body?.success) {
        setError(body?.error?.message || body?.error || `HTTP ${res.status}`);
        setData(null);
        return;
      }
      const d = body.data as SitemapAdminData;
      // Prefer the browser origin when server env still points at localhost
      const browserOrigin =
        typeof window !== 'undefined' ? window.location.origin.replace(/\/$/, '') : '';
      const sitemapUrl =
        browserOrigin && /localhost|127\.0\.0\.1/i.test(d.sitemapUrl || '')
          ? `${browserOrigin}/sitemap.xml`
          : d.sitemapUrl;
      const robotsUrl =
        browserOrigin && /localhost|127\.0\.0\.1/i.test(d.robotsUrl || '')
          ? `${browserOrigin}/robots.txt`
          : d.robotsUrl;
      setData({ ...d, sitemapUrl, robotsUrl });
      setExtraPathsText(formatSitemapExtraPaths(d.extraPaths || []));
    } catch (e: any) {
      setError(e?.message || 'Failed to load sitemap settings');
      setData(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const copyUrl = async () => {
    const url = data?.sitemapUrl;
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      showToast('Copied', 'Sitemap URL copied — paste it into Google Search Console.', 'success');
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      showToast('Copy failed', 'Select the URL and copy manually.', 'error');
    }
  };

  const updateSitemap = async () => {
    setSaving(true);
    try {
      const res = await authFetch('/api/admin/cms/sitemap', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'update',
          extraPaths: extraPathsText,
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok || !body?.success) {
        showToast('Update failed', body?.error?.message || body?.error || 'Error', 'error');
        return;
      }
      const d = body.data as SitemapAdminData;
      const browserOrigin = window.location.origin.replace(/\/$/, '');
      const sitemapUrl =
        browserOrigin && /localhost|127\.0\.0\.1/i.test(d.sitemapUrl || '')
          ? `${browserOrigin}/sitemap.xml`
          : d.sitemapUrl;
      const robotsUrl =
        browserOrigin && /localhost|127\.0\.0\.1/i.test(d.robotsUrl || '')
          ? `${browserOrigin}/robots.txt`
          : d.robotsUrl;
      setData({ ...d, sitemapUrl, robotsUrl });
      setExtraPathsText(formatSitemapExtraPaths(d.extraPaths || []));
      showToast(
        'Sitemap updated',
        'lastmod refreshed. Submit or recrawl the sitemap URL in Google Search Console.',
        'success'
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <h3 className="text-lg font-bold text-white flex items-center gap-2">
            <Map className="w-5 h-5 text-cyan-400" />
            Sitemap
          </h3>
          <p className="text-xs text-slate-400 mt-1 max-w-2xl">
            Copy the sitemap URL into Google Search Console → Sitemaps. Use Update sitemap to
            refresh lastmod after content changes.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => void load()}
            disabled={loading}
            className="inline-flex items-center gap-1.5 rounded-xl border border-slate-700 text-slate-200 text-xs font-bold px-3 py-2 cursor-pointer"
          >
            {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
            Refresh
          </button>
          <button
            type="button"
            disabled={saving || loading}
            onClick={() => void updateSitemap()}
            className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 text-white text-xs font-black px-3 py-2 cursor-pointer disabled:opacity-50"
          >
            {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
            Update sitemap
          </button>
        </div>
      </div>

      {error && (
        <div className="rounded-xl border border-rose-700/40 bg-rose-950/30 px-3 py-2 text-xs text-rose-200">
          {error}
        </div>
      )}

      <div className="rounded-2xl border border-slate-800 bg-slate-950/50 p-4 space-y-3">
        <h4 className="text-sm font-bold text-white">Sitemap URL (for GSC)</h4>
        <div className="flex flex-col sm:flex-row gap-2">
          <input
            readOnly
            value={data?.sitemapUrl || ''}
            placeholder={loading ? 'Loading…' : 'https://your-domain.com/sitemap.xml'}
            className="flex-1 rounded-xl bg-slate-950 border border-slate-700 px-3 py-2 text-xs text-sky-300 font-mono"
          />
          <div className="flex gap-2">
            <button
              type="button"
              disabled={!data?.sitemapUrl}
              onClick={() => void copyUrl()}
              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-600 text-white text-xs font-bold px-3 py-2 cursor-pointer disabled:opacity-50"
            >
              {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
              {copied ? 'Copied' : 'Copy'}
            </button>
            {data?.sitemapUrl ? (
              <a
                href={data.sitemapUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 rounded-xl border border-slate-600 text-slate-200 text-xs font-bold px-3 py-2"
              >
                <ExternalLink className="w-3.5 h-3.5" />
                Open
              </a>
            ) : null}
          </div>
        </div>
        <p className="text-[10px] text-slate-500">
          Last updated:{' '}
          <span className="text-slate-300 font-mono">
            {data?.lastUpdated
              ? new Date(data.lastUpdated).toLocaleString()
              : 'Never — click Update sitemap'}
          </span>
        </p>
        {data?.robotsUrl ? (
          <p className="text-[10px] text-slate-500">
            robots.txt also references this sitemap:{' '}
            <a
              href={data.robotsUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sky-400 font-mono hover:underline"
            >
              {data.robotsUrl}
            </a>
          </p>
        ) : null}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="rounded-2xl border border-slate-800 bg-slate-950/50 p-4 space-y-2">
          <h4 className="text-sm font-bold text-white">Included default paths</h4>
          <ul className="text-xs text-slate-300 font-mono space-y-1">
            {(data?.defaultPaths || DEFAULT_SITEMAP_PATHS).map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ul>
        </div>
        <div className="rounded-2xl border border-slate-800 bg-slate-950/50 p-4 space-y-2">
          <h4 className="text-sm font-bold text-white">Additional paths</h4>
          <p className="text-[10px] text-slate-500">
            One path per line (e.g. <code className="text-slate-400">/about</code>). Saved when you
            click Update sitemap.
          </p>
          <textarea
            value={extraPathsText}
            onChange={(e) => setExtraPathsText(e.target.value)}
            rows={6}
            spellCheck={false}
            placeholder={'/privacy\n/terms'}
            className="w-full rounded-xl bg-slate-950 border border-slate-700 px-3 py-2 text-xs text-white font-mono"
          />
        </div>
      </div>

      {data?.paths?.length ? (
        <div className="rounded-2xl border border-slate-800 bg-slate-950/40 p-4">
          <p className="text-[10px] uppercase text-slate-500 font-semibold mb-2">
            Current sitemap entries ({data.paths.length})
          </p>
          <div className="flex flex-wrap gap-2">
            {data.paths.map((p) => (
              <span
                key={p}
                className="rounded-lg border border-slate-700 bg-slate-900 px-2 py-1 text-[10px] text-slate-300 font-mono"
              >
                {p}
              </span>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
};
