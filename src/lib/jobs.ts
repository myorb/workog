/**
 * The only module that knows where job data lives. Pages read through these
 * functions, so moving from JSON files to a database changes only this file.
 */
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";
import { slugify } from "./normalize.ts";
import { placesOf } from "./places.ts";
import { technologiesOf } from "./technologies.ts";
import { type CompanyConfig, CompanyConfigSchema, type HistoryDay, HistoryDaySchema, type Job, JobSchema, type Run, RunSchema } from "./schema.ts";

const DATA_DIR = join(process.cwd(), "data");
const DAY_MS = 24 * 60 * 60 * 1000;

let jobsCache: Promise<Job[]> | undefined;
let companiesCache: Promise<CompanyConfig[]> | undefined;
let runCache: Promise<Run | undefined> | undefined;
let historyCache: Promise<HistoryDay[]> | undefined;

async function loadJobs(): Promise<Job[]> {
  const dir = join(DATA_DIR, "jobs");
  const files = (await readdir(dir).catch(() => [])).filter((f) => f.endsWith(".json")).sort();
  const lists = await Promise.all(
    files.map(async (f) => z.array(JobSchema).parse(JSON.parse(await readFile(join(dir, f), "utf8")))),
  );
  return lists.flat().sort(byNewest);
}

/** Newest first by first-seen date, then by posted date, then title. */
function byNewest(a: Job, b: Job): number {
  return (
    b.firstSeenAt.localeCompare(a.firstSeenAt) ||
    (b.postedAt ?? "").localeCompare(a.postedAt ?? "") ||
    a.title.localeCompare(b.title)
  );
}

export function getAllJobs(): Promise<Job[]> {
  return (jobsCache ??= loadJobs());
}

export async function getOpenJobs(): Promise<Job[]> {
  return (await getAllJobs()).filter((j) => !j.closedAt);
}

export async function getJobBySlug(slug: string): Promise<Job | undefined> {
  return (await getAllJobs()).find((j) => j.slug === slug);
}

export async function getJobsByCompany(company: string): Promise<Job[]> {
  return (await getOpenJobs()).filter((j) => j.company === company);
}

export async function getJobsByLocation(location: string): Promise<Job[]> {
  return (await getOpenJobs()).filter((j) => j.locations.some((l) => slugify(l) === location));
}

export interface JobFilter {
  country?: string;
  city?: string;
  technology?: string;
}

interface JobTags {
  countries: Set<string>;
  cities: Set<string>;
  technologies: Set<string>;
}

const tagsCache = new Map<string, JobTags>();

/** Countries, cities and technologies a job matches, computed once per build. */
export function tagsOf(job: Job): JobTags {
  let tags = tagsCache.get(job.id);
  if (!tags) {
    tags = { ...placesOf(job.locations), technologies: technologiesOf(job) };
    tagsCache.set(job.id, tags);
  }
  return tags;
}

export function matches(job: Job, filter: JobFilter): boolean {
  const tags = tagsOf(job);
  return (
    (!filter.country || tags.countries.has(filter.country)) &&
    (!filter.city || tags.cities.has(filter.city)) &&
    (!filter.technology || tags.technologies.has(filter.technology))
  );
}

export async function getJobsWhere(filter: JobFilter): Promise<Job[]> {
  return (await getOpenJobs()).filter((j) => matches(j, filter));
}

/** Open-job counts per country, city and technology, for linking only to pages that have jobs. */
export async function countTags(jobs?: Job[]): Promise<Record<keyof JobTags, Map<string, number>>> {
  const counts = { countries: new Map<string, number>(), cities: new Map<string, number>(), technologies: new Map<string, number>() };
  for (const job of jobs ?? (await getOpenJobs())) {
    const tags = tagsOf(job);
    for (const key of ["countries", "cities", "technologies"] as const) {
      for (const slug of tags[key]) counts[key].set(slug, (counts[key].get(slug) ?? 0) + 1);
    }
  }
  return counts;
}

export async function getJobsByCategory(category: string): Promise<Job[]> {
  return (await getOpenJobs()).filter((j) => j.category === category);
}

/** Open jobs first seen within 24 hours of the latest run. */
export async function getNewJobs(): Promise<Job[]> {
  const run = await getLatestRun();
  const ref = run ? Date.parse(run.startedAt) : Date.now();
  return (await getOpenJobs()).filter((j) => ref - Date.parse(j.firstSeenAt) < DAY_MS);
}

export function getCompanies(): Promise<CompanyConfig[]> {
  return (companiesCache ??= readFile(join(DATA_DIR, "companies.json"), "utf8").then((s) =>
    z.array(CompanyConfigSchema).parse(JSON.parse(s)),
  ));
}

export async function getCompany(key: string): Promise<CompanyConfig | undefined> {
  return (await getCompanies()).find((c) => c.key === key);
}

export function getLatestRun(): Promise<Run | undefined> {
  return (runCache ??= readFile(join(DATA_DIR, "runs", "latest.json"), "utf8")
    .then((s) => RunSchema.parse(JSON.parse(s)))
    .catch(() => undefined));
}

/** Per-company counts by day, oldest first; days without a commit are missing. */
export function getHistory(): Promise<HistoryDay[]> {
  return (historyCache ??= readFile(join(DATA_DIR, "runs", "history.json"), "utf8")
    .then((s) => z.array(HistoryDaySchema).parse(JSON.parse(s)))
    .catch(() => []));
}
