import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  Loader2,
  RefreshCw,
  ShieldAlert,
  Trash2,
  Database,
} from 'lucide-react';
import { authFetch } from '../../utils/apiClient';
import { useApp } from '../../context/AppContext';

type InventoryModule = {
  id: string;
  label: string;
  group: string;
  financeRisk?: boolean;
  confirmPhrase: string;
  rowCount: number | null;
  detail?: string;
};

type CatalogItem = {
  id: string;
  label: string;
  description: string;
  group: string;
  confirmPhrase: string;
  financeRisk: boolean;
};

type GroupMeta = { id: string; label: string };

export const AdminModulePurgeDashboard: React.FC = () => {
  const { showToast } = useApp();
  const showToastRef = useRef(showToast);
  showToastRef.current = showToast;

  const [initialLoading, setInitialLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [purgingId, setPurgingId] = useState<string | null>(null);
  const [groups, setGroups] = useState<GroupMeta[]>([]);
  const [catalog, setCatalog] = useState<CatalogItem[]>([]);
  const [modules, setModules] = useState<InventoryModule[]>([]);
  const [factoryAllowed, setFactoryAllowed] = useState<boolean | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [confirmById, setConfirmById] = useState<Record<string, string>>({});
  const [activeGroup, setActiveGroup] = useState<string>('all');
  const [lastResult, setLastResult] = useState<string | null>(null);
  const loadInFlightRef = useRef(false);

  const load = useCallback(async (opts?: { silent?: boolean }) => {
    if (loadInFlightRef.current) return;
    loadInFlightRef.current = true;
    const silent = Boolean(opts?.silent);
    if (silent) setRefreshing(true);
    else setInitialLoading(true);
    setLoadError(null);
    try {
      const res = await authFetch('/api/admin/module-purge');
      const json = await res.json().catch(() => ({}));
      if (!res.ok || json?.success === false) {
        const code = typeof json?.error === 'object' ? json?.error?.code : undefined;
        const msg =
          (typeof json?.error === 'object' ? json?.error?.message : null) ||
          (typeof json?.error === 'string' ? json.error : null) ||
          `Failed to load inventory (${res.status})`;
        if (res.status === 403 && code === 'FACTORY_RESET_DISABLED') {
          throw new Error(
            'Destructive purge is locked. Set ALLOW_FACTORY_RESET=true in .env.local, then Refresh.'
          );
        }
        if (res.status === 403 || code === 'FORBIDDEN') {
          throw new Error(
            'Admin privileges required. Sign out and sign back in as an admin account, then reopen Module Purge.'
          );
        }
        if (res.status === 401) {
          throw new Error('Session expired. Sign in again as admin.');
        }
        throw new Error(msg);
      }
      const data = json.data || {};
      setGroups(Array.isArray(data.groups) ? data.groups : []);
      setCatalog(Array.isArray(data.catalog) ? data.catalog : []);
      setModules(Array.isArray(data.modules) ? data.modules : []);
      setFactoryAllowed(data.factoryResetAllowed === true);
    } catch (err: any) {
      const message = err?.message || 'Failed to load';
      setLoadError(message);
      // Avoid toast spam — heartbeat / parent re-renders must not re-fire this.
      if (!silent) {
        showToastRef.current?.('Module purge', message, 'error');
      }
    } finally {
      loadInFlightRef.current = false;
      setInitialLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const catalogById = useMemo(() => {
    const map = new Map<string, CatalogItem>();
    for (const c of catalog) map.set(c.id, c);
    return map;
  }, [catalog]);

  const visible = useMemo(() => {
    if (activeGroup === 'all') return modules;
    return modules.filter((m) => m.group === activeGroup);
  }, [modules, activeGroup]);

  const handlePurge = async (mod: InventoryModule) => {
    const phrase = (confirmById[mod.id] || '').trim();
    const required = mod.confirmPhrase;
    if (phrase.toUpperCase() !== required.toUpperCase()) {
      showToastRef.current?.(
        'Confirmation required',
        `Type ${required} in the confirm box for this row.`,
        'warning'
      );
      return;
    }
    if (factoryAllowed === false) {
      showToastRef.current?.(
        'Factory reset locked',
        'Set ALLOW_FACTORY_RESET=true in .env.local, then click Refresh.',
        'error'
      );
      return;
    }

    const cat = catalogById.get(mod.id);
    const financeWarn = mod.financeRisk
      ? '\n\nThis is a FINANCE / ACCOUNTS wipe. Settlement immutability triggers are bypassed only inside an atomic service-role RPC. Audit log will record your admin id.'
      : '';
    const okConfirm = window.confirm(
      `Purge module "${mod.label}"?\n\n${cat?.description || ''}${financeWarn}\n\nThis permanently deletes that module's rows from the database and cannot be undone.`
    );
    if (!okConfirm) return;

    setPurgingId(mod.id);
    setLastResult(null);
    try {
      const res = await authFetch('/api/admin/module-purge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ moduleId: mod.id, confirmPhrase: phrase }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || json?.success === false) {
        const code = typeof json?.error === 'object' ? json?.error?.code : undefined;
        if (res.status === 403 && code === 'FACTORY_RESET_DISABLED') {
          throw new Error(
            'Set ALLOW_FACTORY_RESET=true in .env.local, click Refresh, then purge again.'
          );
        }
        const msg =
          json?.error?.message ||
          json?.error ||
          `Purge failed (${res.status})`;
        throw new Error(typeof msg === 'string' ? msg : 'Purge failed');
      }
      const cleared = json?.data?.cleared || [];
      const r2 = json?.data?.r2DeletedCount ?? 0;
      const summary = `Cleared: ${cleared.join(', ') || 'ok'}${r2 ? ` · R2 objects: ${r2}` : ''}`;
      setLastResult(summary);
      showToastRef.current?.('Module purged', summary, 'success');
      setConfirmById((prev) => ({ ...prev, [mod.id]: '' }));
      await load({ silent: true });
    } catch (err: any) {
      showToastRef.current?.('Purge failed', err?.message || 'Unknown error', 'error');
    } finally {
      setPurgingId(null);
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold text-white flex items-center gap-2">
            <Database className="w-5 h-5 text-rose-300" />
            Module &amp; Component Purge
          </h2>
          <p className="text-sm text-slate-400 mt-1 max-w-2xl">
            Permanently deletes the selected module&apos;s data from Postgres (and R2 when chosen).
            Requires admin session +{' '}
            <code className="text-amber-200/90">ALLOW_FACTORY_RESET=true</code> in{' '}
            <code className="text-slate-300">.env.local</code>, then a typed confirm phrase. Finance
            actions write to <code className="text-slate-300">admin_data_purge_log</code>.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void load({ silent: true })}
          disabled={initialLoading || refreshing}
          className="inline-flex items-center gap-2 px-3 py-2 rounded border border-slate-700 bg-slate-900/60 text-xs font-mono text-slate-200 hover:bg-slate-800 disabled:opacity-50"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />
          Refresh counts
        </button>
      </div>

      {factoryAllowed === false && (
        <div className="rounded border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-100 flex gap-3">
          <ShieldAlert className="w-5 h-5 shrink-0 text-amber-300" />
          <div>
            Destructive purges are locked. Set <code className="font-mono">ALLOW_FACTORY_RESET=true</code>{' '}
            in <code className="font-mono">.env.local</code> (not only <code className="font-mono">.env</code>
            ), click Refresh, run the purge, then set it back to false.
          </div>
        </div>
      )}

      {loadError && (
        <div className="rounded border border-rose-500/40 bg-rose-500/10 px-4 py-3 text-sm text-rose-100">
          {loadError}
        </div>
      )}

      {lastResult && (
        <div className="rounded border border-emerald-500/30 bg-emerald-500/10 px-4 py-2 text-xs font-mono text-emerald-200">
          {lastResult}
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => setActiveGroup('all')}
          className={`px-2.5 py-1 rounded text-[11px] font-semibold border ${
            activeGroup === 'all'
              ? 'border-rose-400/50 bg-rose-500/15 text-rose-200'
              : 'border-slate-700 text-slate-400 hover:text-slate-200'
          }`}
        >
          All
        </button>
        {groups.map((g) => (
          <button
            key={g.id}
            type="button"
            onClick={() => setActiveGroup(g.id)}
            className={`px-2.5 py-1 rounded text-[11px] font-semibold border ${
              activeGroup === g.id
                ? 'border-rose-400/50 bg-rose-500/15 text-rose-200'
                : 'border-slate-700 text-slate-400 hover:text-slate-200'
            }`}
          >
            {g.label}
          </button>
        ))}
      </div>

      <div className="overflow-x-auto rounded border border-slate-800 bg-[#0B0D12]">
        <table className="min-w-full text-left text-sm">
          <thead className="bg-slate-900/80 text-[11px] uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-3 font-semibold">Module</th>
              <th className="px-4 py-3 font-semibold">Rows</th>
              <th className="px-4 py-3 font-semibold">Confirm</th>
              <th className="px-4 py-3 font-semibold text-right">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/80">
            {initialLoading && modules.length === 0 && (
              <tr>
                <td colSpan={4} className="px-4 py-10 text-center text-slate-500">
                  <Loader2 className="w-5 h-5 animate-spin inline mr-2" />
                  Loading inventory…
                </td>
              </tr>
            )}
            {!initialLoading && visible.length === 0 && !loadError && (
              <tr>
                <td colSpan={4} className="px-4 py-8 text-center text-slate-500">
                  No modules in this group.
                </td>
              </tr>
            )}
            {visible.map((mod) => {
              const cat = catalogById.get(mod.id);
              const busy = purgingId === mod.id;
              return (
                <tr key={mod.id} className="align-top hover:bg-slate-900/40">
                  <td className="px-4 py-3">
                    <div className="flex items-start gap-2">
                      {mod.financeRisk ? (
                        <AlertTriangle className="w-4 h-4 text-amber-400 mt-0.5 shrink-0" />
                      ) : (
                        <Trash2 className="w-4 h-4 text-slate-500 mt-0.5 shrink-0" />
                      )}
                      <div>
                        <div className="font-medium text-slate-100">{mod.label}</div>
                        <div className="text-xs text-slate-500 mt-0.5 max-w-md">
                          {cat?.description}
                        </div>
                        {mod.detail && (
                          <div className="text-[11px] font-mono text-slate-600 mt-1">{mod.detail}</div>
                        )}
                        {mod.financeRisk && (
                          <div className="text-[10px] uppercase tracking-wide text-amber-400/90 mt-1 font-semibold">
                            Finance · audit logged
                          </div>
                        )}
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3 font-mono text-slate-300 whitespace-nowrap">
                    {mod.rowCount === null ? '—' : mod.rowCount.toLocaleString()}
                  </td>
                  <td className="px-4 py-3">
                    <input
                      type="text"
                      value={confirmById[mod.id] || ''}
                      onChange={(e) =>
                        setConfirmById((prev) => ({ ...prev, [mod.id]: e.target.value }))
                      }
                      placeholder={mod.confirmPhrase}
                      disabled={busy || factoryAllowed === false}
                      className="w-40 sm:w-48 px-2 py-1.5 rounded border border-slate-700 bg-[#0F1115] text-xs font-mono text-white placeholder:text-slate-600 focus:outline-none focus:border-rose-500/60 disabled:opacity-40"
                      autoComplete="off"
                    />
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button
                      type="button"
                      disabled={busy || factoryAllowed === false}
                      onClick={() => void handlePurge(mod)}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded border border-rose-500/40 bg-rose-500/10 text-rose-200 text-xs font-semibold hover:bg-rose-500/20 disabled:opacity-40"
                    >
                      {busy ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <Trash2 className="w-3.5 h-3.5" />
                      )}
                      Purge
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};
