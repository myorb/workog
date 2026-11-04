/**
 * Daily pipeline: fetch every company, normalize and validate, run sanity
 * checks, merge with the company's previous jobs in data/jobs (layout in
 * src/lib/job-files.ts), then write the job files, runs/seen.json,
 * runs/latest.json, runs/changes.json, the day's line in runs/history.json and
 * the day's snapshot in history/<date>.json.
 *
 *   bun scripts/fetch.ts            # all companies
 *   bun scripts/fetch.ts figma      # only the listed company keys
 *   bun scripts/fetch.ts --all      # ignore maxJobs and fetch every job
 *
 * A source that fails or fails a sanity check keeps yesterday's file and is
 * reported as "fallback"; that never fails the process. Every write is staged
 * and applied together at the end (StagedWrites), so a run that crashes leaves
 * data/ as the last run left it. In GitHub Actions the
 * script sets the step output `changed=true|false`, ignoring lastSeenAt, so the
 * workflow can stop before committing and deploying when nothing is new.
 * History and snapshots alone never count as a change: a day with no commit had no new or
 * closed jobs, so readers fill the gap from the day before.
 */
import { appendFile, readFile } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";
import {
  clearStaged,
  readAllJobs,
  readCompanyJobs,
  readSeen,
  type Seen,
  seenFile,
  seenJson,
  StagedWrites,
  writeCompanyJobs,
} from "../src/lib/job-files.ts";
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
import { arbeitnow } from "./fetchers/arbeitnow.ts";
import { arbeitsagentur } from "./fetchers/arbeitsagentur.ts";
import { ashby } from "./fetchers/ashby.ts";
import { asklepios } from "./fetchers/asklepios.ts";
import { eightfold } from "./fetchers/eightfold.ts";
import { eures } from "./fetchers/eures.ts";
import { google } from "./fetchers/google.ts";
import { greenhouse } from "./fetchers/greenhouse.ts";
import { helios } from "./fetchers/helios.ts";
import { jobroom } from "./fetchers/jobroom.ts";
import { jobtech } from "./fetchers/jobtech.ts";
import { lever } from "./fetchers/lever.ts";
import { nhs } from "./fetchers/nhs.ts";
import { oracle } from "./fetchers/oracle.ts";
import { rexx } from "./fetchers/rexx.ts";
import { smartrecruiters } from "./fetchers/smartrecruiters.ts";
import { weworkremotely } from "./fetchers/weworkremotely.ts";
import { workday } from "./fetchers/workday.ts";
import { workingnomads } from "./fetchers/workingnomads.ts";
import { mapLimit, requestStats } from "./fetchers/http.ts";
import { writeSnapshot } from "./snapshot.ts";
import type { Fetcher, NormalizedJob } from "./fetchers/types.ts";

const DATA_DIR = join(import.meta.dirname, "..", "data");
const CLOSED_RETENTION_DAYS = 14;
/** fall back if a source returns fewer than this share of its previous open jobs */
const MIN_KEEP_RATIO = 0.5;
/** fall back if more than this share of a source's jobs fail validation */
const MAX_INVALID_RATIO = 0.2;
/** a source that falls back this many runs in a row is marked broken */
const BROKEN_AFTER = 3;
/**
 * Most companies fetched at once. 37 of them share Greenhouse's API, and each
 * source also limits its own parallel requests (mapLimit), so this bounds both
 * the load on shared hosts and how many companies' jobs are in memory.
 */
const COMPANY_CONCURRENCY = 12;

const fetchers: Record<string, Fetcher<any>> = {
  [greenhouse.name]: greenhouse,
  [apple.name]: apple,
  [google.name]: google,
  [amazon.name]: amazon,
  [ashby.name]: ashby,
  [lever.name]: lever,
  [smartrecruiters.name]: smartrecruiters,
  [workday.name]: workday,
  [eightfold.name]: eightfold,
  [arbeitnow.name]: arbeitnow,
  [arbeitsagentur.name]: arbeitsagentur,
  [helios.name]: helios,
  [asklepios.name]: asklepios,
  [oracle.name]: oracle,
  [eures.name]: eures,
  [nhs.name]: nhs,
  [jobtech.name]: jobtech,
  [jobroom.name]: jobroom,
  [rexx.name]: rexx,
  [workingnomads.name]: workingnomads,
  [weworkremotely.name]: weworkremotely,
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

const json = (value: unknown) => JSON.stringify(value, null, 2) + "\n";

/** Fetches, normalizes and validates one company. Throws if the source fails. */
async function fetchCompany(company: CompanyConfig, previous: Job[]): Promise<FetchResult> {
  const fetcher = fetchers[company.source];
  if (!fetcher) throw new Error(`unknown source "${company.source}"`);

  const raws = await fetcher.fetch(company, previous);
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
    const slug = prev?.slug ?? makeJobSlug(job.employer ?? job.company, job.title, originalId);
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

/** how often to list the companies still fetching */
const PROGRESS_EVERY_MS = 10_000;

const seconds = (since: number) => `${((Date.now() - since) / 1000).toFixed(1)}s`;

/**
 * The order to start companies in: the most jobs last time first, so the
 * slowest sources aren't left to start at the end behind the concurrency limit.
 */
export function fetchOrder(companies: CompanyConfig[], prevSources: Map<string, SourceRun>): CompanyConfig[] {
  const size = (c: CompanyConfig) => prevSources.get(c.key)?.fetched ?? 0;
  return [...companies].sort((a, b) => size(b) - size(a) || a.key.localeCompare(b.key));
}

/**
 * Runs `processOne` for every company, at most COMPANY_CONCURRENCY at once,
 * logging each one as it finishes and, every few seconds, the ones still
 * running with how many requests they have made. Plain lines, so it reads the
 * same in CI logs.
 */
async function fetchAllWithProgress(
  companies: CompanyConfig[],
  processOne: (company: CompanyConfig) => Promise<SourceRun>,
): Promise<void> {
  const start = Date.now();
  const running = new Map<string, { requests: number }>();
  let done = 0;
  console.log(`Fetching ${companies.length} companies, ${COMPANY_CONCURRENCY} at a time…`);

  const timer = setInterval(() => {
    const waiting = [...running].map(([key, s]) => `${key} (${s.requests} req)`).join(", ");
    console.log(`… ${done}/${companies.length} done after ${seconds(start)}, running: ${waiting}`);
  }, PROGRESS_EVERY_MS);

  try {
    await mapLimit(companies, COMPANY_CONCURRENCY, async (company) => {
      const stats = { requests: 0 };
      running.set(company.key, stats);
      try {
        const source = await requestStats.run(stats, () => processOne(company));
        done++;
        const outcome = source.status === "ok" ? `${source.fetched} jobs` : "fell back";
        console.log(`  [${done}/${companies.length}] ${company.key}: ${outcome}, ${stats.requests} req, ${seconds(start)}`);
      } finally {
        running.delete(company.key);
      }
    });
  } finally {
    clearInterval(timer);
    console.log(`Fetched all in ${seconds(start)}`);
  }
}

const statusKey = (s: SourceRun | undefined) => (s ? `${s.status}|${s.fallbackStreak}|${s.broken}` : "");

async function main() {
  const startedAt = new Date().toISOString();
  const args = process.argv.slice(2);
  const all = args.includes("--all");
  const only = new Set(args.filter((a) => !a.startsWith("--")));
  const allCompanies = z.array(CompanyConfigSchema).parse(await readJson(join(DATA_DIR, "companies.json"), []));
  const companies = allCompanies.filter((c) => only.size === 0 || only.has(c.key));

  const leftovers = await clearStaged(DATA_DIR);
  if (leftovers.length) console.warn(`Removed ${leftovers.length} staged file(s) left by a run that didn't finish`);

  const runFile = join(DATA_DIR, "runs", "latest.json");
  const prevRun = RunSchema.safeParse(await readJson(runFile, null)).data;
  const prevSources = new Map(prevRun?.sources.map((s) => [s.company, s]));
  const seen = await readSeen(DATA_DIR);
  // companies that fall back or don't run keep their time, like their files
  const nextSeen: Seen = { ...seen };
  const staged = new StagedWrites();

  const sources: SourceRun[] = [];
  const changes: JobChanges = { opened: [], closed: [], dropped: [] };
  let changed = false;

  /** Fetches one company and stages its files, so its jobs can leave memory before the run ends. */
  async function processCompany(company: CompanyConfig): Promise<SourceRun> {
    const previous = await readCompanyJobs(DATA_DIR, company, seen);
    const previousOpen = previous.filter((j) => !j.closedAt).length;
    const prevSource = prevSources.get(company.key);

    let result: FetchResult | undefined;
    let reason: string | undefined;
    try {
      result = await fetchCompany(all ? { ...company, maxJobs: undefined } : company, previous);
      reason = sanityCheck(result, Math.min(previousOpen, result.cap ?? Infinity));
    } catch (err) {
      reason = `fetch failed: ${err instanceof Error ? err.message : String(err)}`;
    }

    let source: SourceRun;
    if (reason || !result) {
      // keep yesterday's files untouched
      const fallbackStreak = (prevSource?.fallbackStreak ?? 0) + 1;
      source = {
        company: company.key,
        source: company.source,
        status: "fallback",
        reason,
        fetched: result?.fetched ?? 0,
        invalid: result?.invalid ?? 0,
        open: previousOpen,
        new: 0,
        closed: 0,
        fallbackStreak,
        broken: fallbackStreak >= BROKEN_AFTER,
      };
      console.error(`[${company.key}] FALLBACK (${fallbackStreak} in a row): ${reason}`);
    } else {
      const merge = mergeJobs(previous, result.jobs, startedAt, result.cap !== undefined);
      const { jobs, added, closed } = merge;
      await writeCompanyJobs(DATA_DIR, company, jobs, startedAt, staged);
      nextSeen[company.key] = startedAt;
      for (const kind of ["opened", "closed", "dropped"] as const) changes[kind].push(...merge.changes[kind]);
      if (jobsChanged(previous, jobs)) changed = true;
      source = {
        company: company.key,
        source: company.source,
        status: "ok",
        fetched: result.fetched,
        invalid: result.invalid,
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
    return source;
  }

  await fetchAllWithProgress(fetchOrder(companies, prevSources), processCompany);

  // a partial run keeps the last known status of the companies it skipped
  for (const prev of prevRun?.sources ?? []) {
    const skipped = allCompanies.some((c) => c.key === prev.company) && !sources.some((s) => s.company === prev.company);
    if (skipped) sources.push(prev);
  }
  sources.sort((a, b) => a.company.localeCompare(b.company));
  // companies finish in any order; sorted, the file doesn't change with timing
  for (const kind of ["opened", "closed", "dropped"] as const) changes[kind].sort();

  const run: Run = { startedAt, finishedAt: new Date().toISOString(), sources };
  await staged.write(runFile, json(run));
  await staged.write(seenFile(DATA_DIR), seenJson(nextSeen));
  // read by scripts/ping.ts once this run is deployed
  await staged.write(join(DATA_DIR, "runs", "changes.json"), json({ startedAt, ...changes }));

  const historyFile = join(DATA_DIR, "runs", "history.json");
  const history = z.array(HistoryDaySchema).parse(await readJson(historyFile, []));
  const ran = new Set(companies.map((c) => c.key));
  await staged.write(historyFile, historyJson(recordHistory(history, startedAt.slice(0, 10), sources, ran)));
  await staged.commit();

  // derived from the committed jobs; a crash here loses only today's snapshot, which a rerun writes
  await writeSnapshot(await readAllJobs(DATA_DIR), startedAt.slice(0, 10), DATA_DIR);

  const fallbacks = sources.filter((s) => s.status === "fallback");
  if (fallbacks.length) console.error(`${fallbacks.length} source(s) fell back: ${fallbacks.map((s) => s.company).join(", ")}`);
  console.log(`Data changed: ${changed ? "yes" : "no"}`);
  if (process.env.GITHUB_OUTPUT) await appendFile(process.env.GITHUB_OUTPUT, `changed=${changed}\n`);
}

if (import.meta.main) await main();
