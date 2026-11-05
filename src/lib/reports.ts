/**
 * Monthly market reports, one permanent page per section and month under
 * /reports. Pure functions over the daily snapshots: a month's numbers come
 * from its last snapshot, compared with the last one before the month began.
 */
import { comparable, daysBetween, TREND_MIN_DAYS } from "./trend.ts";

export type ReportSection = "tech" | "medicine";

export const reportsUrl = "/reports";
export const reportUrl = (section: ReportSection, month: string) => `${reportsUrl}/${section}/${month}`;

export interface ReportMonth<S> {
  /** "2026-11" */
  month: string;
  /** the month's last snapshot */
  end: S;
  /**
   * What `end` is compared with: the last snapshot before the month, or its
   * first one if there is none. Never before a coverage jump (see trend.ts),
   * and undefined when that leaves under TREND_MIN_DAYS before `end`, which
   * would show the boards' day-to-day noise as a trend.
   */
  base?: S;
  /** the month's first snapshot */
  first: S;
  /** true once a later month has begun, after which its numbers never change */
  complete: boolean;
  /** the base was moved later than the month's start because sources were added or lost */
  clipped: boolean;
}

/** One entry per month that has a snapshot, oldest first. `today` is an ISO date. */
export function reportMonths<S extends { date: string; open: number }>(snapshots: S[], today: string): ReportMonth<S>[] {
  const months = [...new Set(snapshots.map((s) => s.date.slice(0, 7)))].sort();
  return months.map((month) => {
    const upToEnd = snapshots.filter((s) => s.date.slice(0, 7) <= month);
    const inMonth = upToEnd.filter((s) => s.date.startsWith(month));
    const end = inMonth.at(-1)!;
    const usable = comparable(upToEnd);
    const natural = upToEnd.findLast((s) => s.date < `${month}-01`) ?? inMonth[0]!;
    const base = usable.findLast((s) => s.date < `${month}-01`) ?? usable.find((s) => s.date.startsWith(month));
    return {
      month,
      end,
      base: base && daysBetween(base.date, end.date) >= TREND_MIN_DAYS ? base : undefined,
      first: inMonth[0]!,
      complete: today.slice(0, 7) > month,
      clipped: !!base && base.date !== natural.date,
    };
  });
}

export interface ReportRow {
  key: string;
  label: string;
  href?: string;
  to: number;
  /** undefined without a base, or when the key had no count then */
  from?: number;
}

/**
 * The keys of one dimension, most open jobs at the end of the month first,
 * with their count at the base.
 */
export function reportRows(
  end: Record<string, number>,
  base: Record<string, number> | undefined,
  label: (key: string) => { label: string; href?: string },
  limit = Infinity,
): ReportRow[] {
  return Object.entries(end)
    .sort(([ka, a], [kb, b]) => b - a || ka.localeCompare(kb))
    .slice(0, limit)
    .map(([key, to]) => ({ key, to, from: base?.[key], ...label(key) }));
}

/** The rows that grew and shrank the most, in jobs, among those with a base count. */
export function biggestMoves(rows: ReportRow[]): { up?: ReportRow; down?: ReportRow } {
  const moved = rows.filter((r) => r.from !== undefined && r.to !== r.from);
  const by = (sign: number) =>
    moved.filter((r) => Math.sign(r.to - r.from!) === sign).sort((a, b) => sign * (b.to - b.from! - (a.to - a.from!)))[0];
  return { up: by(1), down: by(-1) };
}

/** Share of `total` as a whole percent, or one decimal under 10%. */
export function sharePct(part: number, total: number): number {
  const pct = (part / Math.max(1, total)) * 100;
  return pct >= 10 ? Math.round(pct) : Math.round(pct * 10) / 10;
}
