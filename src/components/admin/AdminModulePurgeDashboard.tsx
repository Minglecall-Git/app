import React, { useCallback, useEffect, useMemo, useState } from 'react';
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
  const [loading, setLoading] = useState(true);
  const [purgingId, setPurgingId] = useState<string | null>(null);
  const [groups, setGroups] = useState<GroupMeta[]>([]);
  const [catalog, setCatalog] = useState<CatalogItem[]>([]);
  const [modules, setModules] = useState<InventoryModule[]>([]);
  const [factoryAllowed, setFactoryAllowed] = useState<boolean | null>(null);
  const [confirmById, setConfirmById] = useState<Record<string, string>>({});
  const [activeGroup, setActiveGroup] = useState<string>('all');
  const [lastResult, setLastResult] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await authFetch('/api/admin/module-purge');
      const json = await res.json().catch(() => ({}));
      if (!res.ok || json?.success === false) {
        throw new Error(json?.error?.message || `Failed to load inventory (${res.status})`);
      }
      const data = json.data || {};
      setGroups(Array.isArray(data.groups) ? data.groups : []);
      setCatalog(Array.isArray(data.catalog) ? data.catalog : []);
      setModules(Array.isArray(data.modules) ? data.modules : []);
      setFactoryAllowed(data.factoryResetAllowed === true);
    } catch (err: any) {
      showToast('Module purge', err?.message || 'Failed to load', 'error');
    } finally {
      setLoading(false);
    }
  }, [showToast]);

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
      showToast('Confirmation required', `Type ${required} in the confirm box for this row.`, 'warning');
      return;
    }
    if (factoryAllowed === false) {
      showToast(
        'Factory reset locked',
        'Set ALLOW_FACTORY_RESET=true in server .env, then refresh.',
        'error'
      );
      return;
    }

    const cat = catalogById.get(mod.id);
    const financeWarn = mod.financeRisk
      ? '\n\nThis is a FINANCE / ACCOUNTS wipe. Settlement immutability triggers are bypassed only inside an atomic service-role RPC. Audit log will record your admin id.'
      : '';
    const ok = window.confirm(
      `Purge module "${mod.label}"?\n\n${cat?.description || ''}${financeWarn}\n\nThis cannot be undone.`
    );
    if (!ok) return;

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
      showToast('Module purged', summary, 'success');
      setConfirmById((prev) => ({ ...prev, [mod.id]: '' }));
      await load();
    } catch (err: any) {
      showToast('Purge failed', err?.message || 'Unknown error', 'error');
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
            Targeted deletion for individual data domains. Requires{' '}
            <code className="text-amber-200/90">ALLOW_FACTORY_RESET=true</code>, admin session, and a
            typed confirm phrase. Finance actions use an atomic RPC and write to{' '}
            <code className="text-slate-300">admin_data_purge_log</code>.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          disabled={loading}
          className="inline-flex items-center gap-2 px-3 py-2 rounded border border-slate-700 bg-slate-900/60 text-xs font-mono text-slate-200 hover:bg-slate-800 disabled:opacity-50"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          Refresh counts
        </button>
      </div>

      {factoryAllowed === false && (
        <div className="rounded border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-100 flex gap-3">
          <ShieldAlert className="w-5 h-5 shrink-0 text-amber-300" />
          <div>
            Destructive purges are locked. Set <code className="font-mono">ALLOW_FACTORY_RESET=true</code>{' '}
            in the server <code className="font-mono">.env</code>, click Refresh, run the purge, then set
            it back to false.
          </div>
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
            {loading && (
              <tr>
                <td colSpan={4} className="px-4 py-10 text-center text-slate-500">
                  <Loader2 className="w-5 h-5 animate-spin inline mr-2" />
                  Loading inventory…
                </td>
              </tr>
            )}
            {!loading && visible.length === 0 && (
              <tr>
                <td colSpan={4} className="px-4 py-8 text-center text-slate-500">
                  No modules in this group.
                </td>
              </tr>
            )}
            {!loading &&
              visible.map((mod) => {
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
