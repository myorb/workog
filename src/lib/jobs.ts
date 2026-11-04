/**
 * The only module pages read job data through, so moving from JSON files to a
 * database changes only this file and ./job-files.ts, which reads data/jobs.
 */
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";
import { type EmploymentType, employmentTypeOf } from "./employment.ts";
import { readAllJobs } from "./job-files.ts";
import { slugify } from "./normalize.ts";
import { placesOf } from "./places.ts";
import { isMedicine, type MedicinePlace, medicinePlaceOf } from "./medicine.ts";
import { technologiesOf } from "./technologies.ts";
import { type CompanyConfig, CompanyConfigSchema, type HistoryDay, HistoryDaySchema, type Job, type Run, RunSchema, type Snapshot, SnapshotSchema } from "./schema.ts";

const DATA_DIR = join(process.cwd(), "data");
const DAY_MS = 24 * 60 * 60 * 1000;

let jobsCache: Promise<Job[]> | undefined;
let companiesCache: Promise<CompanyConfig[]> | undefined;
let runCache: Promise<Run | undefined> | undefined;
let historyCache: Promise<HistoryDay[]> | undefined;
let snapshotsCache: Promise<Snapshot[]> | undefined;

async function loadJobs(): Promise<Job[]> {
  return (await readAllJobs(DATA_DIR)).sort(byNewest);
}

/** Newest first by first-seen date, then by posted date, then title, then id so the order never depends on how files are split. */
function byNewest(a: Job, b: Job): number {
  return (
    b.firstSeenAt.localeCompare(a.firstSeenAt) ||
    (b.postedAt ?? "").localeCompare(a.postedAt ?? "") ||
    a.title.localeCompare(b.title) ||
    a.id.localeCompare(b.id, "en", { numeric: true })
  );
}

export function getAllJobs(): Promise<Job[]> {
  return (jobsCache ??= loadJobs());
}

/** Open tech jobs: every browse page outside /medicine reads these, so doctor jobs never show up there. */
export async function getOpenJobs(): Promise<Job[]> {
  return (await getAllJobs()).filter((j) => !j.closedAt && !isMedicine(j));
}

/** Open doctor jobs, for the /medicine pages */
export async function getOpenMedicineJobs(): Promise<Job[]> {
  return (await getAllJobs()).filter((j) => !j.closedAt && isMedicine(j));
}

export interface MedicineFilter {
  specialty?: string;
  level?: string;
  state?: string;
  city?: string;
}

const medicinePlaces = new Map<string, MedicinePlace>();

/** State and city of a doctor job, computed once per build. */
export function medicinePlace(job: Job): MedicinePlace {
  let place = medicinePlaces.get(job.id);
  if (!place) medicinePlaces.set(job.id, (place = medicinePlaceOf(job)));
  return place;
}

export function matchesMedicine(job: Job, filter: MedicineFilter): boolean {
  const place = medicinePlace(job);
  return (
    (!filter.specialty || job.specialty === filter.specialty) &&
    (!filter.level || job.level === filter.level) &&
    (!filter.state || place.state === filter.state) &&
    (!filter.city || place.city?.slug === filter.city)
  );
}

export async function getMedicineJobsWhere(filter: MedicineFilter): Promise<Job[]> {
  return (await getOpenMedicineJobs()).filter((j) => matchesMedicine(j, filter));
}

export interface MedicineCounts {
  specialties: Map<string, number>;
  levels: Map<string, number>;
  states: Map<string, number>;
  /** keyed by "state/city", with the city's display name */
  cities: Map<string, { state: string; slug: string; name: string; count: number }>;
  /** keyed by "specialty/state", for the specialty-in-state pages */
  specialtyStates: Map<string, number>;
}

/** Open doctor jobs per specialty, level, state and city, for linking only to pages that have jobs. */
export function countMedicine(jobs: Job[]): MedicineCounts {
  const counts: MedicineCounts = { specialties: new Map(), levels: new Map(), states: new Map(), cities: new Map(), specialtyStates: new Map() };
  const add = (map: Map<string, number>, key: string | undefined) => key && map.set(key, (map.get(key) ?? 0) + 1);
  for (const job of jobs) {
    add(counts.specialties, job.specialty);
    add(counts.levels, job.level);
    const { state, city } = medicinePlace(job);
    add(counts.states, state);
    if (job.specialty && state) add(counts.specialtyStates, `${job.specialty}/${state}`);
    if (state && city) {
      const key = `${state}/${city.slug}`;
      const entry = counts.cities.get(key) ?? { state, slug: city.slug, name: city.name, count: 0 };
      entry.count++;
      counts.cities.set(key, entry);
    }
  }
  return counts;
}

let medicineCountsCache: Promise<MedicineCounts> | undefined;

/** countMedicine() over all open doctor jobs, once per build */
export const getMedicineCounts = () => (medicineCountsCache ??= getOpenMedicineJobs().then(countMedicine));

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
  employment?: EmploymentType;
  remote?: boolean;
}

interface JobTags {
  countries: Set<string>;
  cities: Set<string>;
  technologies: Set<string>;
  /** always exactly one type */
  employment: Set<EmploymentType>;
}

const tagsCache = new Map<string, JobTags>();

/** Countries, cities, technologies and employment type a job matches, computed once per build. */
export function tagsOf(job: Job): JobTags {
  let tags = tagsCache.get(job.id);
  if (!tags) {
    tags = { ...placesOf(job.locations), technologies: technologiesOf(job), employment: new Set([employmentTypeOf(job)]) };
    tagsCache.set(job.id, tags);
  }
  return tags;
}

export function matches(job: Job, filter: JobFilter): boolean {
  const tags = tagsOf(job);
  return (
    (!filter.country || tags.countries.has(filter.country)) &&
    (!filter.city || tags.cities.has(filter.city)) &&
    (!filter.technology || tags.technologies.has(filter.technology)) &&
    (!filter.employment || tags.employment.has(filter.employment)) &&
    (filter.remote === undefined || job.remote === filter.remote)
  );
}

export async function getJobsWhere(filter: JobFilter): Promise<Job[]> {
  return (await getOpenJobs()).filter((j) => matches(j, filter));
}

/** Open-job counts per tag, for linking only to pages that have jobs. */
export async function countTags(jobs?: Job[]): Promise<Record<keyof JobTags, Map<string, number>>> {
  const counts = { countries: new Map<string, number>(), cities: new Map<string, number>(), technologies: new Map<string, number>(), employment: new Map<string, number>() };
  for (const job of jobs ?? (await getOpenJobs())) {
    const tags = tagsOf(job);
    for (const key of ["countries", "cities", "technologies", "employment"] as const) {
      for (const slug of tags[key]) counts[key].set(slug, (counts[key].get(slug) ?? 0) + 1);
    }
  }
  return counts;
}

let tagCountsCache: ReturnType<typeof countTags> | undefined;

/** countTags() over all open jobs, computed once per build for pages that link by count */
export const getTagCounts = () => (tagCountsCache ??= countTags());

let companyCountsCache: Promise<Map<string, number>> | undefined;

/** Open jobs per company key */
export const getCompanyCounts = () =>
  (companyCountsCache ??= getOpenJobs().then((jobs) => {
    const counts = new Map<string, number>();
    for (const job of jobs) counts.set(job.company, (counts.get(job.company) ?? 0) + 1);
    return counts;
  }));

let remoteCountCache: Promise<number> | undefined;

export const getRemoteCount = () => (remoteCountCache ??= getOpenJobs().then((jobs) => jobs.filter((j) => j.remote).length));

export async function getJobsByCategory(category: string): Promise<Job[]> {
  return (await getOpenJobs()).filter((j) => j.category === category);
}

/** Open jobs first seen within 24 hours of the latest run. */
export async function getNewJobs(): Promise<Job[]> {
  const run = await getLatestRun();
  const ref = run ? Date.parse(run.startedAt) : Date.now();
  return (await getOpenJobs()).filter((j) => ref - Date.parse(j.firstSeenAt) < DAY_MS);
}

function getAllCompanies(): Promise<CompanyConfig[]> {
  return (companiesCache ??= readFile(join(DATA_DIR, "companies.json"), "utf8").then((s) =>
    z.array(CompanyConfigSchema).parse(JSON.parse(s)),
  ));
}

/** Tech companies and boards; doctor-job sources have no company pages */
export async function getCompanies(): Promise<CompanyConfig[]> {
  return (await getAllCompanies()).filter((c) => !c.sector);
}

export async function getCompany(key: string): Promise<CompanyConfig | undefined> {
  return (await getAllCompanies()).find((c) => c.key === key);
}

/** Keys of the doctor-job sources, which the tech analytics leave out */
const medicineCompanyKeys = async () => new Set((await getAllCompanies()).filter((c) => c.sector === "medicine").map((c) => c.key));

export function getLatestRun(): Promise<Run | undefined> {
  return (runCache ??= readFile(join(DATA_DIR, "runs", "latest.json"), "utf8")
    .then((s) => RunSchema.parse(JSON.parse(s)))
    .catch(() => undefined));
}

/** Per-company counts by day, oldest first; days without a commit are missing. */
export function getHistory(): Promise<HistoryDay[]> {
  return (historyCache ??= readFile(join(DATA_DIR, "runs", "history.json"), "utf8")
    .then((s) => z.array(HistoryDaySchema).parse(JSON.parse(s)))
    .catch(() => [] as HistoryDay[])
    .then(async (days) => {
      const medicine = await medicineCompanyKeys();
      return days.map((d) => ({ ...d, companies: Object.fromEntries(Object.entries(d.companies).filter(([key]) => !medicine.has(key))) }));
    }));
}

async function loadSnapshots(): Promise<Snapshot[]> {
  const dir = join(DATA_DIR, "history");
  const files = (await readdir(dir).catch(() => [])).filter((f) => /^\d{4}-\d{2}-\d{2}\.json$/.test(f)).sort();
  return Promise.all(files.map(async (f) => SnapshotSchema.parse(JSON.parse(await readFile(join(dir, f), "utf8")))));
}

/** Daily snapshots of open jobs, oldest first; days without a commit are missing. */
export function getSnapshots(): Promise<Snapshot[]> {
  return (snapshotsCache ??= loadSnapshots());
}
