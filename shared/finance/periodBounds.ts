/**
 * Pure period-bound helpers for the Financial Module.
 * No React / Node / DB — safe for shared import and unit tests.
 *
 * Locked rules:
 * - Weekly: Monday 00:00:00.000 UTC → next Monday 00:00:00.000 UTC
 * - Monthly: calendar month 1st 00:00:00.000 UTC → next month 1st 00:00:00.000 UTC
 * - Accrual window: [periodStart, periodEnd)  (end exclusive)
 * - closeScheduledAt: UTC calendar date of periodEnd, at period_close_utc_time (HH:mm).
 *   When close time is 00:00, closeScheduledAt === periodEnd.
 */

import type { SettlementCycleType } from './types';

export interface PeriodBounds {
  cycleType: SettlementCycleType;
  /** Inclusive start (UTC). */
  periodStart: Date;
  /** Exclusive end (UTC). */
  periodEnd: Date;
}

const HH_MM_RE = /^(?:[01]\d|2[0-3]):[0-5]\d$/;

/** Normalize cycle string; unknown → weekly. */
export function normalizeCycleType(raw: unknown): SettlementCycleType {
  const v = String(raw || 'weekly').trim().toLowerCase();
  return v === 'monthly' ? 'monthly' : 'weekly';
}

/** Parse UTC HH:mm; invalid → 00:00. */
export function parseUtcCloseTime(raw: unknown): { hours: number; minutes: number; hhmm: string } {
  const s = String(raw ?? '00:00').trim();
  if (!HH_MM_RE.test(s)) {
    return { hours: 0, minutes: 0, hhmm: '00:00' };
  }
  const [h, m] = s.split(':').map((x) => Number(x));
  return { hours: h, minutes: m, hhmm: s };
}

/** Start of UTC day for a date. */
export function startOfUtcDay(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 0, 0, 0, 0));
}

/**
 * Monday 00:00 UTC of the ISO-style week containing `at`
 * (week runs Mon 00:00 → next Mon 00:00).
 */
export function startOfUtcWeekMonday(at: Date): Date {
  const day = at.getUTCDay(); // 0 Sun … 1 Mon
  const daysSinceMonday = (day + 6) % 7;
  const start = startOfUtcDay(at);
  start.setUTCDate(start.getUTCDate() - daysSinceMonday);
  return start;
}

/** First of month 00:00 UTC containing `at`. */
export function startOfUtcMonth(at: Date): Date {
  return new Date(Date.UTC(at.getUTCFullYear(), at.getUTCMonth(), 1, 0, 0, 0, 0));
}

/** Add N UTC months to a 1st-of-month (or any) date, preserving day clamp via Date.UTC. */
export function addUtcMonths(at: Date, months: number): Date {
  return new Date(Date.UTC(at.getUTCFullYear(), at.getUTCMonth() + months, at.getUTCDate(), at.getUTCHours(), at.getUTCMinutes(), at.getUTCSeconds(), at.getUTCMilliseconds()));
}

/**
 * Accrual bounds for the period that contains `at` (or the open period starting at/before at).
 */
export function getCurrentPeriodBounds(
  cycleType: SettlementCycleType | string,
  at: Date = new Date()
): PeriodBounds {
  const cycle = normalizeCycleType(cycleType);
  if (cycle === 'monthly') {
    const periodStart = startOfUtcMonth(at);
    const periodEnd = addUtcMonths(periodStart, 1);
    return { cycleType: 'monthly', periodStart, periodEnd };
  }
  const periodStart = startOfUtcWeekMonday(at);
  const periodEnd = new Date(periodStart);
  periodEnd.setUTCDate(periodEnd.getUTCDate() + 7);
  return { cycleType: 'weekly', periodStart, periodEnd };
}

/**
 * close_scheduled_at = UTC calendar date of period_end at period_close_utc_time.
 * Accrual remains [period_start, period_end); close may run later the same UTC day
 * when HH:mm > 00:00.
 */
export function computeCloseScheduledAt(periodEnd: Date, periodCloseUtcTime: unknown): Date {
  const { hours, minutes } = parseUtcCloseTime(periodCloseUtcTime);
  return new Date(
    Date.UTC(
      periodEnd.getUTCFullYear(),
      periodEnd.getUTCMonth(),
      periodEnd.getUTCDate(),
      hours,
      minutes,
      0,
      0
    )
  );
}

/** Next close instant for the period containing `at` (using configured close clock). */
export function getNextCloseAt(
  cycleType: SettlementCycleType | string,
  periodCloseUtcTime: unknown,
  at: Date = new Date()
): Date {
  const { periodEnd } = getCurrentPeriodBounds(cycleType, at);
  const closeAt = computeCloseScheduledAt(periodEnd, periodCloseUtcTime);
  // If somehow already past close in this period (clock skew / late), return this period's close;
  // callers that need the following period should advance `at` to periodEnd.
  return closeAt;
}

/** True if `t` is inside [start, end). */
export function isTimestampInPeriod(t: Date, periodStart: Date, periodEnd: Date): boolean {
  const ms = t.getTime();
  return ms >= periodStart.getTime() && ms < periodEnd.getTime();
}

export function toIso(d: Date): string {
  return d.toISOString();
}
