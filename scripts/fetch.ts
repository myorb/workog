/**
 * Daily pipeline: fetch every company, normalize and validate, run sanity
 * checks, merge with the previous data/jobs/<company>.json (or <company>.<n>.json
 * parts for big companies), then write the files, runs/latest.json, runs/changes.json, the day's line in runs/history.json
 * and the day's snapshot in history/<date>.json.
 *
 *   bun scripts/fetch.ts            # all companies
 *   bun scripts/fetch.ts figma      # only the listed company keys
 *   bun scripts/fetch.ts --all      # ignore maxJobs and fetch every job
 *
 * A source that fails or fails a sanity check keeps yesterday's file and is
 * reported as "fallback"; that never fails the process. In GitHub Actions the
 * script sets the step output `changed=true|false`, ignoring lastSeenAt, so the
 * workflow can stop before committing and deploying when nothing is new.
 * History and snapshots alone never count as a change: a day with no commit had no new or
 * closed jobs, so readers fill the gap from the day before.
 */
import { appendFile, mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";
import { makeJobSlug } from "../src/lib/normalize.ts";
import {
  CompanyConfigSchema,
  type CompanyConfig,
  type HistoryDay,
  HistoryDaySchema,
  type Job,
  JobSchema,
  type Run,
  RunSchema,
  type SourceRun,
} from "../src/lib/schema.ts";
import { amazon } from "./fetchers/amazon.ts";
import { apple } from "./fetchers/apple.ts";
import { google } from "./fetchers/google.ts";
import { greenhouse } from "./fetchers/greenhouse.ts";
import { readAllJobs, writeSnapshot } from "./snapshot.ts";
import type { Fetcher, NormalizedJob } from "./fetchers/types.ts";

const DATA_DIR = join(import.meta.dirname, "..", "data");
const CLOSED_RETENTION_DAYS = 14;
/** fall back if a source returns fewer than this share of its previous open jobs */
const MIN_KEEP_RATIO = 0.5;
/** fall back if more than this share of a source's jobs fail validation */
const MAX_INVALID_RATIO = 0.2;
/** a source that falls back this many runs in a row is marked broken */
const BROKEN_AFTER = 3;
/** jobs per data file; GitHub rejects files over 100 MB and an Amazon job is about 7 KB */
const JOBS_PER_FILE = 5_000;

const fetchers: Record<string, Fetcher<any>> = {
  [greenhouse.name]: greenhouse,
  [apple.name]: apple,
  [google.name]: google,
  [amazon.name]: amazon,
};

const NormalizedJobSchema = JobSchema.omit({
  slug: true,
  firstSeenAt: true,
  lastSeenAt: true,
  closedAt: true,
}).extend({ originalId: z.string().min(1) });

interface FetchResult {
  fetched: number;
  invalid: number;
  jobs: NormalizedJob[];
  /**
   * Set to the company's maxJobs when it cut the list short. A missing job may
   * then only have fallen outside the cap (sources don't sort strictly by
   * posting date), so it can't be called closed.
   */
  cap?: number;
}

async function readJson<T>(path: string, fallback: T): Promise<T> {
  try {
    return JSON.parse(await readFile(path, "utf8")) as T;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return fallback;
    throw err;
  }
}

async function writeJson(path: string, value: unknown): Promise<void> {
  await writeFile(path, JSON.stringify(value, null, 2) + "\n");
}

/** The company's data files: `<key>.json`, or `<key>.<n>.json` parts once it outgrows one file. */
async function jobFiles(key: string): Promise<string[]> {
  const files = await readdir(join(DATA_DIR, "jobs")).catch(() => []);
  return files.filter((f) => f === `${key}.json` || (f.startsWith(`${key}.`) && /^\d+\.json$/.test(f.slice(key.length + 1))));
}

async function readJobs(key: string): Promise<Job[]> {
  const lists = await Promise.all((await jobFiles(key)).map((f) => readJson<Job[]>(join(DATA_DIR, "jobs", f), [])));
  return lists.flat().sort((a, b) => a.id.localeCompare(b.id, "en", { numeric: true }));
}

/**
 * Writes the jobs as one file, or split into parts by a hash of the job id so a
 * job stays in the same part from day to day and daily diffs stay small.
 */
async function writeJobs(key: string, jobs: Job[]): Promise<void> {
  const partCount = Math.ceil(jobs.length / JOBS_PER_FILE);
  const parts = new Map<string, Job[]>();
  if (partCount <= 1) parts.set(`${key}.json`, jobs);
  else for (let n = 1; n <= partCount; n++) parts.set(`${key}.${n}.json`, []);
  if (partCount > 1) for (const job of jobs) parts.get(`${key}.${partOf(job.id, partCount) + 1}.json`)!.push(job);

  for (const f of await jobFiles(key)) if (!parts.has(f)) await rm(join(DATA_DIR, "jobs", f));
  for (const [f, list] of parts) await writeJson(join(DATA_DIR, "jobs", f), list);
}

/** FNV-1a hash of the id, mod `count`. */
export function partOf(id: string, count: number): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < id.length; i++) hash = Math.imul(hash ^ id.charCodeAt(i), 0x01000193);
  return (hash >>> 0) % count;
}

/** Fetches, normalizes and validates one company. Throws if the source fails. */
async function fetchCompany(company: CompanyConfig): Promise<FetchResult> {
  const fetcher = fetchers[company.source];
  if (!fetcher) throw new Error(`unknown source "${company.source}"`);

  const raws = await fetcher.fetch(company);
  const jobs: NormalizedJob[] = [];
  let invalid = 0;
  for (const raw of raws) {
    try {
      jobs.push(NormalizedJobSchema.parse(fetcher.normalize(raw, company)) as NormalizedJob);
    } catch (err) {
      invalid++;
      const issues = err instanceof z.ZodError ? z.prettifyError(err) : String(err);
      console.warn(`[${company.key}] skipping invalid job:\n${issues}`);
    }
  }
  if (company.maxJobs && raws.length >= company.maxJobs) {
    jobs.sort((a, b) => (b.postedAt ?? "").localeCompare(a.postedAt ?? ""));
    jobs.length = Math.min(jobs.length, company.maxJobs);
    return { fetched: raws.length, invalid, jobs, cap: company.maxJobs };
  }
  return { fetched: raws.length, invalid, jobs };
}

/** Returns why a fetch result should not replace yesterday's data, or undefined if it is fine. */
export function sanityCheck(result: FetchResult, previousOpen: number): string | undefined {
  if (result.fetched > 0 && result.invalid / result.fetched > MAX_INVALID_RATIO) {
    return `${result.invalid} of ${result.fetched} jobs failed validation`;
  }
  if (result.jobs.length === 0) return "source returned 0 valid jobs";
  if (result.jobs.length < previousOpen * MIN_KEEP_RATIO) {
    return `only ${result.jobs.length} valid jobs, down from ${previousOpen} open`;
  }
  return undefined;
}

/**
 * Applies today's fetch to yesterday's jobs: new ids get firstSeenAt, missing
 * ids get closedAt, reappearing ids are reopened, and jobs closed for longer
 * than the retention window are dropped. After a `capped` fetch, missing open
 * jobs are kept as they were until a full (`--all`) run checks them.
 * `changes` lists the slugs whose pages changed state, for search-engine pings.
 */
export function mergeJobs(previous: Job[], fetched: NormalizedJob[], now: string, capped = false) {
  const prevById = new Map(previous.map((j) => [j.id, j]));
  const seen = new Set<string>();
  const merged: Job[] = [];
  let added = 0;
  let closed = 0;
  const changes: JobChanges = { opened: [], closed: [], dropped: [] };

  for (const { originalId, ...job } of fetched) {
    if (seen.has(job.id)) continue;
    seen.add(job.id);
    const prev = prevById.get(job.id);
    const slug = prev?.slug ?? makeJobSlug(job.company, job.title, originalId);
    if (!prev) added++;
    if (!prev || prev.closedAt) changes.opened.push(slug);
    merged.push({
      ...job,
      slug,
      firstSeenAt: prev?.firstSeenAt ?? now,
      lastSeenAt: now,
    });
  }

  const cutoff = Date.parse(now) - CLOSED_RETENTION_DAYS * 24 * 60 * 60 * 1000;
  for (const prev of previous) {
    if (seen.has(prev.id)) continue;
    if (!prev.closedAt && capped) {
      merged.push(prev);
    } else if (!prev.closedAt) {
      closed++;
      changes.closed.push(prev.slug);
      merged.push({ ...prev, closedAt: now });
    } else if (Date.parse(prev.closedAt) > cutoff) {
      merged.push(prev);
    } else {
      changes.dropped.push(prev.slug);
    }
  }

  merged.sort((a, b) => a.id.localeCompare(b.id, "en", { numeric: true }));
  return { jobs: merged, added, closed, changes };
}

/** Job pages whose state changed in a run: newly open (or reopened), closed (now noindex), dropped (now 404) */
export const JobChangesSchema = z.object({
  startedAt: z.string(),
  opened: z.array(z.string()),
  closed: z.array(z.string()),
  dropped: z.array(z.string()),
});
export type JobChanges = Omit<z.infer<typeof JobChangesSchema>, "startedAt">;

/** True if the jobs differ in anything other than lastSeenAt, which moves every run. */
export function jobsChanged(before: Job[], after: Job[]): boolean {
  const key = (jobs: Job[]) =>
    JSON.stringify(
      jobs.map(({ lastSeenAt: _, ...job }) =>
        Object.entries(job)
          // undefined fields vanish once written to JSON, so they must not count as a change
          .filter(([, value]) => value !== undefined)
          .sort(([a], [b]) => a.localeCompare(b)),
      ),
    );
  return key(before) !== key(after);
}

/**
 * Puts this run's counts into the history line for `date`. A rerun on the same
 * day adds its new and closed counts to the earlier run's; companies this run
 * skipped keep what the day already had.
 */
export function recordHistory(history: HistoryDay[], date: string, sources: SourceRun[], ran: Set<string>): HistoryDay[] {
  const today = history.find((d) => d.date === date)?.companies ?? {};
  const companies: HistoryDay["companies"] = {};
  for (const s of sources) {
    const prev = today[s.company];
    companies[s.company] = ran.has(s.company)
      ? { open: s.open, new: (prev?.new ?? 0) + s.new, closed: (prev?.closed ?? 0) + s.closed }
      : (prev ?? { open: s.open, new: 0, closed: 0 });
  }
  return [...history.filter((d) => d.date !== date), { date, companies }].sort((a, b) => a.date.localeCompare(b.date));
}

/** One day per line, so each daily commit is a one-line diff. */
const historyJson = (history: HistoryDay[]) => `[\n${history.map((d) => JSON.stringify(d)).join(",\n")}\n]\n`;

const statusKey = (s: SourceRun | undefined) => (s ? `${s.status}|${s.fallbackStreak}|${s.broken}` : "");

async function main() {
  const startedAt = new Date().toISOString();
  const args = process.argv.slice(2);
  const all = args.includes("--all");
  const only = new Set(args.filter((a) => !a.startsWith("--")));
  const allCompanies = z.array(CompanyConfigSchema).parse(await readJson(join(DATA_DIR, "companies.json"), []));
  const companies = allCompanies.filter((c) => only.size === 0 || only.has(c.key));

  await mkdir(join(DATA_DIR, "jobs"), { recursive: true });
  await mkdir(join(DATA_DIR, "runs"), { recursive: true });

  const runFile = join(DATA_DIR, "runs", "latest.json");
  const prevRun = RunSchema.safeParse(await readJson(runFile, null)).data;
  const prevSources = new Map(prevRun?.sources.map((s) => [s.company, s]));

  const results = await Promise.allSettled(
    companies.map((c) => fetchCompany(all ? { ...c, maxJobs: undefined } : c)),
  );
  const sources: SourceRun[] = [];
  const changes: JobChanges = { opened: [], closed: [], dropped: [] };
  let changed = false;

  for (const [i, result] of results.entries()) {
    const company = companies[i]!;
    const previous = await readJobs(company.key);
    const previousOpen = previous.filter((j) => !j.closedAt).length;
    const prevSource = prevSources.get(company.key);
    const counts: FetchResult = result.status === "fulfilled" ? result.value : { fetched: 0, invalid: 0, jobs: [] };

    const reason =
      result.status === "rejected"
        ? `fetch failed: ${result.reason instanceof Error ? result.reason.message : String(result.reason)}`
        : sanityCheck(result.value, Math.min(previousOpen, result.value.cap ?? Infinity));

    let source: SourceRun;
    if (reason) {
      // keep yesterday's files untouched
      const fallbackStreak = (prevSource?.fallbackStreak ?? 0) + 1;
      source = {
        company: company.key,
        source: company.source,
        status: "fallback",
        reason,
        fetched: counts.fetched,
        invalid: counts.invalid,
        open: previousOpen,
        new: 0,
        closed: 0,
        fallbackStreak,
        broken: fallbackStreak >= BROKEN_AFTER,
      };
      console.error(`[${company.key}] FALLBACK (${fallbackStreak} in a row): ${reason}`);
    } else {
      const merge = mergeJobs(previous, counts.jobs, startedAt, counts.cap !== undefined);
      const { jobs, added, closed } = merge;
      await writeJobs(company.key, jobs);
      for (const kind of ["opened", "closed", "dropped"] as const) changes[kind].push(...merge.changes[kind]);
      if (jobsChanged(previous, jobs)) changed = true;
      source = {
        company: company.key,
        source: company.source,
        status: "ok",
        fetched: counts.fetched,
        invalid: counts.invalid,
        open: jobs.filter((j) => !j.closedAt).length,
        new: added,
        closed,
        fallbackStreak: 0,
        broken: false,
      };
      console.log(
        `[${company.key}] ${source.fetched} fetched, ${source.invalid} invalid, ` +
          `${source.open} open, +${added} new, -${closed} closed`,
      );
    }

    // a status change must be committed so fallback streaks survive to the next run
    if (statusKey(source) !== statusKey(prevSource)) changed = true;
    sources.push(source);
  }

  // a partial run keeps the last known status of the companies it skipped
  for (const prev of prevRun?.sources ?? []) {
    const skipped = allCompanies.some((c) => c.key === prev.company) && !sources.some((s) => s.company === prev.company);
    if (skipped) sources.push(prev);
  }
  sources.sort((a, b) => a.company.localeCompare(b.company));

  const run: Run = { startedAt, finishedAt: new Date().toISOString(), sources };
  await writeJson(runFile, run);
  // read by scripts/ping.ts once this run is deployed
  await writeJson(join(DATA_DIR, "runs", "changes.json"), { startedAt, ...changes });

  const historyFile = join(DATA_DIR, "runs", "history.json");
  const history = z.array(HistoryDaySchema).parse(await readJson(historyFile, []));
  const ran = new Set(companies.map((c) => c.key));
  await writeFile(historyFile, historyJson(recordHistory(history, startedAt.slice(0, 10), sources, ran)));
  await writeSnapshot(await readAllJobs(DATA_DIR), startedAt.slice(0, 10), DATA_DIR);

  const fallbacks = sources.filter((s) => s.status === "fallback");
  if (fallbacks.length) console.error(`${fallbacks.length} source(s) fell back: ${fallbacks.map((s) => s.company).join(", ")}`);
  console.log(`Data changed: ${changed ? "yes" : "no"}`);
  if (process.env.GITHUB_OUTPUT) await appendFile(process.env.GITHUB_OUTPUT, `changed=${changed}\n`);
}

if (import.meta.main) await main();
