/** Aggregations for the analytics pages. Pure functions over jobs, history and snapshots. */
import { tagsOf } from "./jobs.ts";
import { placesOf } from "./places.ts";
import { indexHospitals } from "./hospitals.ts";
import { medicinePlaceOf } from "./medicine.ts";
import type { ArchivedJob, HistoryDay, Job, MedicineSnapshot, Snapshot } from "./schema.ts";

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

/** The dimensions a snapshot counts open jobs by. */
export const SNAPSHOT_DIMENSIONS = ["companies", "categories", "countries", "cities", "technologies", "employment"] as const;
export type SnapshotDimension = (typeof SNAPSHOT_DIMENSIONS)[number];

/** The ISO date `days` after `date` (or before, if negative). */
export function addDays(date: string, days: number): string {
  return new Date(Date.parse(date) + days * DAY_MS).toISOString().slice(0, 10);
}

/** Whether a job was open at the end of UTC day `date`, judged by when it was first seen and closed. */
export function openOn(job: Pick<Job, "firstSeenAt" | "closedAt">, date: string): boolean {
  const end = Date.parse(addDays(date, 1));
  return Date.parse(job.firstSeenAt) < end && (!job.closedAt || Date.parse(job.closedAt) >= end);
}

/** The tags of an archived job, which carries the ones its description gave. */
const archivedTags = (job: ArchivedJob) => ({
  ...placesOf(job.locations),
  technologies: job.technologies,
  employment: [job.employment],
});

/**
 * Open-job counts at the end of `date`, from every job the store still holds:
 * data/jobs, plus the archive (src/lib/archive.ts) for days past the retention
 * window.
 */
export function snapshotOf(jobs: Job[], date: string, archived: ArchivedJob[] = []): Snapshot {
  const snapshot: Snapshot = { date, open: 0, remote: 0, companies: {}, categories: {}, countries: {}, cities: {}, technologies: {}, employment: {} };
  const add = (counts: Record<string, number>, key: string) => (counts[key] = (counts[key] ?? 0) + 1);
  const count = (job: Job | ArchivedJob, tags: Record<"countries" | "cities" | "technologies" | "employment", Iterable<string>>) => {
    snapshot.open++;
    if (job.remote) snapshot.remote++;
    add(snapshot.companies, job.company);
    add(snapshot.categories, job.category ?? "other");
    for (const key of ["countries", "cities", "technologies", "employment"] as const) {
      for (const slug of tags[key]) add(snapshot[key], slug);
    }
  };
  for (const job of jobs) if (openOn(job, date)) count(job, tagsOf(job));
  for (const job of archived) if (openOn(job, date)) count(job, archivedTags(job));
  for (const key of SNAPSHOT_DIMENSIONS) {
    snapshot[key] = Object.fromEntries(Object.entries(snapshot[key]).sort(([a], [b]) => a.localeCompare(b)));
  }
  return snapshot;
}

/** The dimensions a medical snapshot counts open jobs by. */
export const MEDICINE_SNAPSHOT_DIMENSIONS = ["specialties", "levels", "countries", "states", "hospitals"] as const;
export type MedicineSnapshotDimension = (typeof MEDICINE_SNAPSHOT_DIMENSIONS)[number];

/**
 * Open medical-job counts at the end of `date`, like snapshotOf. `groups` maps
 * the company keys of hospital groups to their names (see indexHospitals).
 */
export function medicineSnapshotOf(
  jobs: (Job | ArchivedJob)[],
  date: string,
  groups: Map<string, string> = new Map(),
): MedicineSnapshot {
  const open = jobs.filter((j) => openOn(j, date));
  const snapshot: MedicineSnapshot = { date, open: open.length, specialties: {}, levels: {}, countries: {}, states: {}, hospitals: {} };
  const add = (counts: Record<string, number>, key: string | undefined) => key && (counts[key] = (counts[key] ?? 0) + 1);
  for (const job of open) {
    add(snapshot.specialties, job.specialty);
    add(snapshot.levels, job.level);
    const { country, state } = medicinePlaceOf(job);
    add(snapshot.countries, country);
    add(snapshot.states, state);
  }
  const hospitals = indexHospitals(open, groups);
  for (const h of [...hospitals.groups, ...hospitals.hospitals]) snapshot.hospitals[h.slug] = h.count;
  for (const key of MEDICINE_SNAPSHOT_DIMENSIONS) {
    snapshot[key] = Object.fromEntries(Object.entries(snapshot[key]).sort(([a], [b]) => a.localeCompare(b)));
  }
  return snapshot;
}

/**
 * One snapshot per day from the first to the last. A day without one had no
 * committed change, so it repeats the day before under its own date.
 */
export function dailySnapshots(snapshots: Snapshot[]): Snapshot[] {
  if (!snapshots.length) return [];
  const byDate = new Map(snapshots.map((s) => [s.date, s]));
  const days: Snapshot[] = [];
  for (let date = snapshots[0]!.date; date <= snapshots.at(-1)!.date; date = addDays(date, 1)) {
    days.push(byDate.get(date) ?? { ...days.at(-1)!, date });
  }
  return days;
}

/** The snapshot in force at the end of `date`: that day's, or the last one before it. */
export function snapshotOn(snapshots: Snapshot[], date: string): Snapshot | undefined {
  return snapshots.findLast((s) => s.date <= date);
}

export interface Mover {
  key: string;
  from: number;
  to: number;
  delta: number;
}

/**
 * Keys whose open count changed the most between two snapshots, biggest change
 * first: `up` grew and `down` shrank. Keys that appear or vanish count from 0.
 */
export function movers(from: Record<string, number>, to: Record<string, number>, limit: number): { up: Mover[]; down: Mover[] } {
  const all = [...new Set([...Object.keys(from), ...Object.keys(to)])].map((key) => {
    const a = from[key] ?? 0;
    const b = to[key] ?? 0;
    return { key, from: a, to: b, delta: b - a };
  });
  const order = (x: Mover, y: Mover) => Math.abs(y.delta) - Math.abs(x.delta) || y.to - x.to || x.key.localeCompare(y.key);
  return {
    up: all.filter((m) => m.delta > 0).sort(order).slice(0, limit),
    down: all.filter((m) => m.delta < 0).sort(order).slice(0, limit),
  };
}
