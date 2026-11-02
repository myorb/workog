/**
 * Daily pipeline: fetch every company, normalize and validate, run sanity
 * checks, merge with the previous data/jobs/<company>.json, then write the
 * files, runs/latest.json and the day's line in runs/history.json.
 *
 *   bun scripts/fetch.ts            # all companies
 *   bun scripts/fetch.ts figma      # only the listed company keys
 *
 * A source that fails or fails a sanity check keeps yesterday's file and is
 * reported as "fallback"; that never fails the process. In GitHub Actions the
 * script sets the step output `changed=true|false`, ignoring lastSeenAt, so the
 * workflow can stop before committing and deploying when nothing is new.
 * History alone never counts as a change: a day with no commit had no new or
 * closed jobs, so readers fill the gap from the day before.
 */
import { appendFile, mkdir, readFile, writeFile } from "node:fs/promises";
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
import { greenhouse } from "./fetchers/greenhouse.ts";
import type { Fetcher, NormalizedJob } from "./fetchers/types.ts";

const DATA_DIR = join(import.meta.dirname, "..", "data");
const CLOSED_RETENTION_DAYS = 14;
/** fall back if a source returns fewer than this share of its previous open jobs */
const MIN_KEEP_RATIO = 0.5;
/** fall back if more than this share of a source's jobs fail validation */
const MAX_INVALID_RATIO = 0.2;
/** a source that falls back this many runs in a row is marked broken */
const BROKEN_AFTER = 3;

const fetchers: Record<string, Fetcher<any>> = {
  [greenhouse.name]: greenhouse,
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
 * than the retention window are dropped.
 */
export function mergeJobs(previous: Job[], fetched: NormalizedJob[], now: string) {
  const prevById = new Map(previous.map((j) => [j.id, j]));
  const seen = new Set<string>();
  const merged: Job[] = [];
  let added = 0;
  let closed = 0;

  for (const { originalId, ...job } of fetched) {
    if (seen.has(job.id)) continue;
    seen.add(job.id);
    const prev = prevById.get(job.id);
    if (!prev) added++;
    merged.push({
      ...job,
      slug: prev?.slug ?? makeJobSlug(job.company, job.title, originalId),
      firstSeenAt: prev?.firstSeenAt ?? now,
      lastSeenAt: now,
    });
  }

  const cutoff = Date.parse(now) - CLOSED_RETENTION_DAYS * 24 * 60 * 60 * 1000;
  for (const prev of previous) {
    if (seen.has(prev.id)) continue;
    if (!prev.closedAt) {
      closed++;
      merged.push({ ...prev, closedAt: now });
    } else if (Date.parse(prev.closedAt) > cutoff) {
      merged.push(prev);
    }
  }

  merged.sort((a, b) => a.id.localeCompare(b.id, "en", { numeric: true }));
  return { jobs: merged, added, closed };
}

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
  const only = new Set(process.argv.slice(2));
  const allCompanies = z.array(CompanyConfigSchema).parse(await readJson(join(DATA_DIR, "companies.json"), []));
  const companies = allCompanies.filter((c) => only.size === 0 || only.has(c.key));

  await mkdir(join(DATA_DIR, "jobs"), { recursive: true });
  await mkdir(join(DATA_DIR, "runs"), { recursive: true });

  const runFile = join(DATA_DIR, "runs", "latest.json");
  const prevRun = RunSchema.safeParse(await readJson(runFile, null)).data;
  const prevSources = new Map(prevRun?.sources.map((s) => [s.company, s]));

  const results = await Promise.allSettled(companies.map(fetchCompany));
  const sources: SourceRun[] = [];
  let changed = false;

  for (const [i, result] of results.entries()) {
    const company = companies[i]!;
    const file = join(DATA_DIR, "jobs", `${company.key}.json`);
    const previous = await readJson<Job[]>(file, []);
    const previousOpen = previous.filter((j) => !j.closedAt).length;
    const prevSource = prevSources.get(company.key);
    const counts = result.status === "fulfilled" ? result.value : { fetched: 0, invalid: 0, jobs: [] };

    const reason =
      result.status === "rejected"
        ? `fetch failed: ${result.reason instanceof Error ? result.reason.message : String(result.reason)}`
        : sanityCheck(result.value, previousOpen);

    let source: SourceRun;
    if (reason) {
      // keep yesterday's file untouched
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
      const { jobs, added, closed } = mergeJobs(previous, counts.jobs, startedAt);
      await writeJson(file, jobs);
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

  const historyFile = join(DATA_DIR, "runs", "history.json");
  const history = z.array(HistoryDaySchema).parse(await readJson(historyFile, []));
  const ran = new Set(companies.map((c) => c.key));
  await writeFile(historyFile, historyJson(recordHistory(history, startedAt.slice(0, 10), sources, ran)));

  const fallbacks = sources.filter((s) => s.status === "fallback");
  if (fallbacks.length) console.error(`${fallbacks.length} source(s) fell back: ${fallbacks.map((s) => s.company).join(", ")}`);
  console.log(`Data changed: ${changed ? "yes" : "no"}`);
  if (process.env.GITHUB_OUTPUT) await appendFile(process.env.GITHUB_OUTPUT, `changed=${changed}\n`);
}

if (import.meta.main) await main();
