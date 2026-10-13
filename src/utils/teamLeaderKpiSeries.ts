import { CallLogItem } from '../types';
import { coinsToUsd } from '../../shared/finance/fx';

export interface TlKpiDayPoint {
  /** YYYY-MM-DD (UTC) */
  day: string;
  /** Short label e.g. Mon */
  label: string;
  calls: number;
  minutes: number;
  hostCoins: number;
  hostUsd: number;
  tlCoins: number;
  tlUsd: number;
}

function toUtcDayKey(ts: string | undefined): string | null {
  if (!ts) return null;
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}

function dayLabel(dayKey: string): string {
  const d = new Date(`${dayKey}T12:00:00.000Z`);
  return d.toLocaleDateString(undefined, { weekday: 'short', timeZone: 'UTC' });
}

/**
 * Build a dense last-N-days series from agency call logs for KPI sparklines.
 * Uses log.teamLeaderEarnedCoins / coinsEarned when present; zeros for empty days.
 */
export function buildTlKpiSeries(
  callLogs: CallLogItem[],
  peg: number,
  rangeDays = 7
): TlKpiDayPoint[] {
  const today = new Date();
  const days: string[] = [];
  for (let i = rangeDays - 1; i >= 0; i--) {
    const d = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));
    d.setUTCDate(d.getUTCDate() - i);
    days.push(d.toISOString().slice(0, 10));
  }

  const byDay = new Map<string, TlKpiDayPoint>();
  for (const day of days) {
    byDay.set(day, {
      day,
      label: dayLabel(day),
      calls: 0,
      minutes: 0,
      hostCoins: 0,
      hostUsd: 0,
      tlCoins: 0,
      tlUsd: 0,
    });
  }

  for (const log of callLogs) {
    const key = toUtcDayKey(log.timestamp) || toUtcDayKey((log as { createdAt?: string }).createdAt);
    if (!key || !byDay.has(key)) continue;
    const row = byDay.get(key)!;
    const hostCoins = Number(log.coinsEarned) || 0;
    const tlCoins = Number(log.teamLeaderEarnedCoins) || 0;
    row.calls += 1;
    row.minutes += Math.round((Number(log.durationSeconds) || 0) / 60);
    row.hostCoins += hostCoins;
    row.hostUsd += coinsToUsd(hostCoins, peg);
    row.tlCoins += tlCoins;
    row.tlUsd += coinsToUsd(tlCoins, peg);
  }

  return days.map((d) => byDay.get(d)!);
}
