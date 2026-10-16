'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { Copy, Link2, Loader2, RefreshCw, UserPlus, Crown } from 'lucide-react';
import { authFetch } from '../../utils/apiClient';
import { useApp } from '../../context/AppContext';

type TlInviteRow = {
  id: string;
  token: string;
  inviteUrl: string;
  targetRole?: string;
  status: 'active' | 'used' | 'expired' | 'inactive';
  signupStatus: 'pending' | 'registered';
  isUsed: boolean;
  usedByUserId: string | null;
  usedByName: string | null;
  usedByEmail: string | null;
  createdByName: string | null;
  createdByEmail: string | null;
  expiresAt: string | null;
  createdAt: string | null;
};

export const AdminTlInvitesPanel: React.FC = () => {
  const { showToast } = useApp();
  const [rows, setRows] = useState<TlInviteRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [generating, setGenerating] = useState(false);

  const loadInvites = useCallback(async () => {
    setLoading(true);
    try {
      const res = await authFetch('/api/admin/tl-invites');
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.success) {
        showToast(
          'TL Invites',
          data?.error?.message || data?.error || 'Could not load Team Leader invites.',
          'error'
        );
        return;
      }
      const list = Array.isArray(data?.data?.invites) ? data.data.invites : [];
      setRows(list as TlInviteRow[]);
    } catch (e) {
      console.warn('[AdminTlInvites] load:', e);
      showToast('TL Invites', 'Could not load Team Leader invites.', 'error');
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  const generateInvite = useCallback(async () => {
    setGenerating(true);
    try {
      const res = await authFetch('/api/admin/tl-invites', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.success || !data?.data?.inviteUrl) {
        showToast(
          'TL Invite Failed',
          data?.error?.message || data?.error || 'Could not generate Team Leader invite.',
          'error'
        );
        return;
      }
      showToast('Invite Created', 'Single-use Team Leader invite link ready to share.', 'success');
      await loadInvites();
      try {
        await navigator.clipboard.writeText(String(data.data.inviteUrl));
        showToast('Copied', 'New TL invite link copied to clipboard.', 'success');
      } catch {
        /* clipboard may be blocked */
      }
    } catch (e) {
      console.warn('[AdminTlInvites] generate:', e);
      showToast('TL Invite Failed', 'Could not generate Team Leader invite.', 'error');
    } finally {
      setGenerating(false);
    }
  }, [loadInvites, showToast]);

  const copyInviteUrl = useCallback(
    async (url: string) => {
      try {
        await navigator.clipboard.writeText(url);
        showToast('Copied', 'Invite link copied to clipboard.', 'success');
      } catch {
        showToast('Copy Failed', 'Could not copy to clipboard.', 'error');
      }
    },
    [showToast]
  );

  useEffect(() => {
    void loadInvites();
  }, [loadInvites]);

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-xl space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-4 border-b border-slate-800">
        <div>
          <h3 className="text-lg font-extrabold text-white flex items-center gap-2">
            <Crown className="w-5 h-5 text-indigo-400" />
            <span>TL Invitations</span>
          </h3>
          <p className="text-xs text-slate-400 mt-1 max-w-2xl">
            Generate single-use invite links for new Team Leaders / Agencies. When someone registers
            with a link, it is marked Used and cannot be reused.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => void loadInvites()}
            disabled={loading || generating}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 disabled:opacity-50 text-slate-200 text-xs font-bold border border-slate-700 cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
          <button
            type="button"
            id="admin-generate-tl-invite-btn"
            onClick={() => void generateInvite()}
            disabled={generating}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-gradient-to-r from-indigo-500 to-violet-500 hover:from-indigo-400 hover:to-violet-400 disabled:opacity-50 text-white text-xs font-bold cursor-pointer shadow-lg shadow-indigo-500/20"
          >
            {generating ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <UserPlus className="w-4 h-4" />
            )}
            Generate TL Invite Link
          </button>
        </div>
      </div>

      <div className="bg-slate-950 border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
        {loading && rows.length === 0 ? (
          <div className="p-12 text-center text-xs text-slate-400 flex items-center justify-center gap-2">
            <Loader2 className="w-4 h-4 animate-spin" />
            Loading TL invite links…
          </div>
        ) : rows.length === 0 ? (
          <div className="p-12 text-center">
            <Link2 className="w-10 h-10 text-slate-600 mx-auto mb-3" />
            <h4 className="text-sm font-bold text-slate-300">No Team Leader invites yet</h4>
            <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
              Generate a single-use link and share it with a new agency / Team Leader.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-slate-800 bg-slate-950/60 text-[10px] uppercase tracking-wider text-slate-400 font-bold">
                  <th className="px-4 py-3">Invite URL / Token</th>
                  <th className="px-4 py-3 whitespace-nowrap">Status</th>
                  <th className="px-4 py-3">Usage</th>
                  <th className="px-4 py-3 whitespace-nowrap">Created</th>
                  <th className="px-4 py-3 whitespace-nowrap">Expires</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => {
                  const statusBadge =
                    row.status === 'active'
                      ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                      : row.status === 'used'
                        ? 'bg-indigo-500/20 text-indigo-300 border-indigo-500/40'
                        : row.status === 'expired'
                          ? 'bg-rose-500/20 text-rose-300 border-rose-500/40'
                          : 'bg-slate-700/40 text-slate-300 border-slate-600/40';
                  return (
                    <tr
                      key={row.id}
                      className="border-b border-slate-800/80 hover:bg-slate-900/40 align-top"
                    >
                      <td className="px-4 py-3 max-w-[300px]">
                        <div className="font-mono text-[10px] text-slate-300 break-all">
                          {row.inviteUrl}
                        </div>
                        <div className="font-mono text-[9px] text-slate-500 mt-1 truncate">
                          token: {row.token.slice(0, 14)}…
                        </div>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <span
                          className={`inline-flex px-2 py-0.5 rounded-full border text-[10px] font-bold capitalize ${statusBadge}`}
                        >
                          {row.status}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        {row.signupStatus === 'registered' ? (
                          <div>
                            <div className="font-semibold text-slate-100">
                              {row.usedByName || 'Team Leader registered'}
                            </div>
                            {row.usedByEmail && (
                              <div className="text-[10px] text-slate-400">{row.usedByEmail}</div>
                            )}
                          </div>
                        ) : (
                          <span className="text-amber-300/90 font-semibold">Pending</span>
                        )}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-slate-400">
                        <div>{row.createdAt ? new Date(row.createdAt).toLocaleString() : '—'}</div>
                        {row.createdByName && (
                          <div className="text-[10px] text-slate-500 mt-0.5">
                            by {row.createdByName}
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-slate-400">
                        {row.expiresAt ? new Date(row.expiresAt).toLocaleString() : '—'}
                      </td>
                      <td className="px-4 py-3 text-right whitespace-nowrap">
                        {row.status === 'active' && (
                          <button
                            type="button"
                            onClick={() => void copyInviteUrl(row.inviteUrl)}
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-indigo-200 text-[10px] font-bold border border-slate-700 cursor-pointer"
                          >
                            <Copy className="w-3 h-3" />
                            Copy
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
