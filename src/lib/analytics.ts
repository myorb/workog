/** Aggregations for the analytics page. Pure functions over jobs and history. */
import type { HistoryDay, Job } from "./schema.ts";

const DAY_MS = 24 * 60 * 60 * 1000;

export interface Bar {
  label: string;
  count: number;
  href?: string;
}

export interface DayTotals {
  date: string;
  open: number;
  new: number;
  closed: number;
}

/** Jobs per value of `key`, most first. */
export function countBy(jobs: Job[], key: (job: Job) => string): Bar[] {
  const counts = new Map<string, number>();
  for (const job of jobs) counts.set(key(job), (counts.get(key(job)) ?? 0) + 1);
  return [...counts]
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
}

/** Share of remote jobs per value of `key`, as 0..1, in the order of `countBy`. */
export function remoteShareBy(jobs: Job[], key: (job: Job) => string): (Bar & { share: number })[] {
  const remote = new Map<string, number>();
  for (const job of jobs) if (job.remote) remote.set(key(job), (remote.get(key(job)) ?? 0) + 1);
  return countBy(jobs, key).map((bar) => ({ ...bar, share: (remote.get(bar.label) ?? 0) / bar.count }));
}

/**
 * Open jobs by month posted, for the `months` months up to `ref`. Older and
 * undated jobs are counted in `earlier` and `undated`.
 */
export function postedByMonth(jobs: Job[], ref: Date, months: number, locale = "en-US") {
  const keys = Array.from({ length: months }, (_, i) =>
    new Date(Date.UTC(ref.getUTCFullYear(), ref.getUTCMonth() - (months - 1 - i), 1)).toISOString().slice(0, 7),
  );
  const counts = new Map(keys.map((k) => [k, 0]));
  let earlier = 0;
  let undated = 0;
  for (const job of jobs) {
    const key = job.postedAt?.slice(0, 7);
    if (!key) undated++;
    else if (counts.has(key)) counts.set(key, counts.get(key)! + 1);
    else if (key < keys[0]!) earlier++;
  }
  const bars = keys.map((k) => ({
    label: new Date(`${k}-01T00:00:00Z`).toLocaleDateString(locale, { month: "short", timeZone: "UTC" }),
    month: k,
    count: counts.get(k)!,
  }));
  return { bars, earlier, undated };
}

/** Median days since posting, or undefined if no job has a posted date. */
export function medianAgeDays(jobs: Job[], ref: Date): number | undefined {
  const ages = jobs
    .filter((j) => j.postedAt)
    .map((j) => (ref.getTime() - Date.parse(j.postedAt!)) / DAY_MS)
    .sort((a, b) => a - b);
  if (!ages.length) return undefined;
  const mid = Math.floor(ages.length / 2);
  return Math.round(ages.length % 2 ? ages[mid]! : (ages[mid - 1]! + ages[mid]!) / 2);
}

/**
 * Totals for every day from the first to the last history line. A day with no
 * line had no committed change, so it keeps the open count of the day before
 * with nothing new or closed.
 */
export function dailyTotals(history: HistoryDay[]): DayTotals[] {
  if (!history.length) return [];
  const byDate = new Map(history.map((d) => [d.date, d]));
  const days: DayTotals[] = [];
  const end = Date.parse(history.at(-1)!.date);
  for (let t = Date.parse(history[0]!.date); t <= end; t += DAY_MS) {
    const date = new Date(t).toISOString().slice(0, 10);
    const line = byDate.get(date);
    if (!line) {
      days.push({ date, open: days.at(-1)!.open, new: 0, closed: 0 });
      continue;
    }
    const total = { date, open: 0, new: 0, closed: 0 };
    for (const c of Object.values(line.companies)) {
      total.open += c.open;
      total.new += c.new;
      total.closed += c.closed;
    }
    days.push(total);
  }
  return days;
}

/** New and closed jobs per week, keyed by the week's Monday. */
export function weeklyTotals(days: DayTotals[]): { week: string; new: number; closed: number }[] {
  const weeks = new Map<string, { week: string; new: number; closed: number }>();
  for (const day of days) {
    const t = Date.parse(day.date);
    const monday = new Date(t - ((new Date(t).getUTCDay() + 6) % 7) * DAY_MS).toISOString().slice(0, 10);
    const week = weeks.get(monday) ?? { week: monday, new: 0, closed: 0 };
    week.new += day.new;
    week.closed += day.closed;
    weeks.set(monday, week);
  }
  return [...weeks.values()];
}
