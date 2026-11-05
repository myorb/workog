/**
 * How a count changed over the last 30 days, for the dated summary line on
 * data pages and the monthly reports. Pure functions over daily snapshots.
 */
import { addDays } from "./analytics.ts";

const DAY_MS = 24 * 60 * 60 * 1000;

/** The span the summary line compares over */
export const TREND_WINDOW_DAYS = 30;
/** Shorter spans are mostly noise from the paginated boards, so the line leaves the change out */
export const TREND_MIN_DAYS = 7;
/**
 * A day-over-day change in a section's total this large means sources were
 * added or lost (on 2 Nov 2026 the tech total went from 6,449 to 52,402), not
 * that hiring changed; comparisons never reach back past such a jump.
 */
export const COVERAGE_JUMP = 0.25;

export interface Change {
  /** the count on `since` */
  from: number;
  /** the count now */
  to: number;
  /** the snapshot date compared with */
  since: string;
  days: number;
  /** percent change, unrounded */
  pct: number;
}

export const daysBetween = (from: string, to: string) => Math.round((Date.parse(to) - Date.parse(from)) / DAY_MS);

/**
 * The snapshots after the last coverage jump in the section total, which are
 * the only ones safe to compare with each other.
 */
export function comparable<S extends { date: string; open: number }>(snapshots: S[]): S[] {
  let start = 0;
  for (let i = 1; i < snapshots.length; i++) {
    const before = snapshots[i - 1]!.open;
    const after = snapshots[i]!.open;
    if (Math.abs(after - before) > COVERAGE_JUMP * Math.max(1, before)) start = i;
  }
  return snapshots.slice(start);
}

/**
 * How `to` compares with the value the snapshots held `window` days before
 * the last one, or at the oldest comparable snapshot if history is shorter.
 * Undefined when that is fewer than `minDays` back, or the value was unknown
 * or zero then (a key missing from an old snapshot may have had no page yet).
 */
export function changeOver<S extends { date: string; open: number }>(
  snapshots: S[],
  value: (s: S) => number | undefined,
  to: number,
  { window = TREND_WINDOW_DAYS, minDays = TREND_MIN_DAYS } = {},
): Change | undefined {
  const usable = comparable(snapshots);
  const latest = usable.at(-1);
  if (!latest) return undefined;
  const target = addDays(latest.date, -window);
  const base = usable.findLast((s) => s.date <= target) ?? usable[0]!;
  const days = daysBetween(base.date, latest.date);
  const from = value(base);
  if (days < minDays || !from) return undefined;
  return { from, to, since: base.date, days, pct: ((to - from) / from) * 100 };
}

/** Rounded percent for display: whole numbers, one decimal under 10%, so +0.4% doesn't read as "0%" */
export function roundPct(pct: number): number {
  const abs = Math.abs(pct);
  return abs >= 10 ? Math.round(pct) : Math.round(pct * 10) / 10;
}
