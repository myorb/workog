/**
 * Reading and writing data/jobs, shared by the pipeline (scripts/fetch.ts), the
 * snapshot script and the site (src/lib/jobs.ts).
 *
 * Layout, chosen so a daily commit touches only jobs that really changed:
 *
 * - `data/jobs/<company>.json`, or `<company>.<n>.json` parts once a company
 *   outgrows one file. Companies with a `sector` (the doctor-job sources) live
 *   in `data/jobs/<sector>/` instead, e.g. `data/jobs/medicine/`.
 * - `data/runs/seen.json` holds each company's last successful run time. A job
 *   that run saw leaves `lastSeenAt` out on disk and takes it from there, so
 *   that field, which moves on every run, no longer rewrites every job's line.
 *   Jobs the run didn't see (closed ones, and a capped company's older ones)
 *   keep their own `lastSeenAt`.
 */
import { mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";
import { type CompanyConfig, type Job, JobSchema, type StoredJob, StoredJobSchema } from "./schema.ts";

/** Most jobs per data file: about 7 MB for a big company's jobs, which run about 7 KB each. */
export const JOBS_PER_FILE = 1_000;

/** Company key → time of its last successful run */
export type Seen = Record<string, string>;

const SeenSchema = z.record(z.string(), z.iso.datetime({ offset: true }));

const jobsDir = (dataDir: string, sector?: string) => (sector ? join(dataDir, "jobs", sector) : join(dataDir, "jobs"));
const seenFile = (dataDir: string) => join(dataDir, "runs", "seen.json");
/** Keys are `[a-z0-9-]+`, so the key is everything before the first dot. */
const keyOf = (file: string) => file.slice(0, file.indexOf("."));

async function listJson(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true }).catch(() => []);
  return entries.filter((e) => e.isFile() && e.name.endsWith(".json")).map((e) => e.name).sort();
}

/** Subfolders of data/jobs, one per sector */
async function sectorDirs(dataDir: string): Promise<string[]> {
  const entries = await readdir(jobsDir(dataDir), { withFileTypes: true }).catch(() => []);
  return entries.filter((e) => e.isDirectory()).map((e) => e.name).sort();
}

export async function readSeen(dataDir: string): Promise<Seen> {
  try {
    return SeenSchema.parse(JSON.parse(await readFile(seenFile(dataDir), "utf8")));
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return {};
    throw err;
  }
}

/** Sorted, one company per line, so a daily commit changes only the companies that ran. */
export async function writeSeen(dataDir: string, seen: Seen): Promise<void> {
  const sorted = Object.fromEntries(Object.entries(seen).sort(([a], [b]) => a.localeCompare(b)));
  await mkdir(join(dataDir, "runs"), { recursive: true });
  await writeFile(seenFile(dataDir), JSON.stringify(sorted, null, 2) + "\n");
}

/** A stored job with its `lastSeenAt` filled in from the company's last run. */
export function hydrate(job: StoredJob, seenAt: string | undefined, file: string): Job {
  if (job.lastSeenAt) return job as Job;
  if (!seenAt) throw new Error(`${file}: job ${job.id} has no lastSeenAt and data/runs/seen.json has no entry for its company`);
  return { ...job, lastSeenAt: seenAt };
}

/** Field order on disk, so a job's lines don't move when code builds it in another order. */
const FIELD_ORDER = Object.keys(JobSchema.shape) as (keyof Job)[];

/** The job as written to disk: fields in schema order, without `lastSeenAt` when it is the company's run time. */
export function dehydrate(job: Job, seenAt: string | undefined): StoredJob {
  const out: Record<string, unknown> = {};
  for (const key of FIELD_ORDER) {
    if (job[key] === undefined || (key === "lastSeenAt" && job.lastSeenAt === seenAt)) continue;
    out[key] = job[key];
  }
  return out as StoredJob;
}

async function readFileJobs(path: string, seenAt: string | undefined): Promise<Job[]> {
  const stored = z.array(StoredJobSchema).parse(JSON.parse(await readFile(path, "utf8")));
  return stored.map((job) => hydrate(job, seenAt, path));
}

/** The company's data files: `<key>.json`, or `<key>.<n>.json` parts. */
function filesOf(files: string[], key: string): string[] {
  return files.filter((f) => f === `${key}.json` || (f.startsWith(`${key}.`) && /^\d+\.json$/.test(f.slice(key.length + 1))));
}

/** One company's jobs, sorted by id. */
export async function readCompanyJobs(dataDir: string, company: Pick<CompanyConfig, "key" | "sector">, seen: Seen): Promise<Job[]> {
  const dir = jobsDir(dataDir, company.sector);
  const files = filesOf(await listJson(dir), company.key);
  const lists = await Promise.all(files.map((f) => readFileJobs(join(dir, f), seen[company.key])));
  return lists.flat().sort((a, b) => a.id.localeCompare(b.id, "en", { numeric: true }));
}

/** Every job on file, open or closed, from data/jobs and its sector folders. */
export async function readAllJobs(dataDir: string): Promise<Job[]> {
  const seen = await readSeen(dataDir);
  const dirs = [jobsDir(dataDir), ...(await sectorDirs(dataDir)).map((s) => jobsDir(dataDir, s))];
  const lists = await Promise.all(
    dirs.map(async (dir) => (await Promise.all((await listJson(dir)).map((f) => readFileJobs(join(dir, f), seen[keyOf(f)])))).flat()),
  );
  return lists.flat();
}

/**
 * How many files a company's `count` jobs go in, given how many it has now: a
 * power of two, so growing splits each part in two and moves only half the
 * jobs. It doubles once parts would pass JOBS_PER_FILE and halves only below a
 * quarter of that, so a company hovering around a boundary keeps its files.
 */
export function partCountFor(count: number, current: number): number {
  const isPowerOfTwo = current >= 1 && (current & (current - 1)) === 0;
  let parts = isPowerOfTwo ? current : 1;
  while (count > parts * JOBS_PER_FILE) parts *= 2;
  if (!isPowerOfTwo) return parts; // older layouts start from the smallest fit
  while (parts > 1 && count < (parts * JOBS_PER_FILE) / 4) parts /= 2;
  return parts;
}

/** FNV-1a hash of the id, mod `count`. */
export function partOf(id: string, count: number): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < id.length; i++) hash = Math.imul(hash ^ id.charCodeAt(i), 0x01000193);
  return (hash >>> 0) % count;
}

/**
 * Writes the company's jobs as one file, or split into parts by a hash of the
 * job id so a job stays in the same part from day to day. `seenAt` is the
 * company's run time in seen.json; jobs with that `lastSeenAt` leave it out.
 * Files the company no longer uses, including any in another sector's folder,
 * are removed.
 */
export async function writeCompanyJobs(
  dataDir: string,
  company: Pick<CompanyConfig, "key" | "sector">,
  jobs: Job[],
  seenAt: string | undefined,
): Promise<void> {
  const dir = jobsDir(dataDir, company.sector);
  await mkdir(dir, { recursive: true });
  const current = filesOf(await listJson(dir), company.key);
  const partCount = partCountFor(jobs.length, Math.max(current.length, 1));

  const parts = new Map<string, StoredJob[]>();
  if (partCount === 1) parts.set(`${company.key}.json`, []);
  else for (let n = 1; n <= partCount; n++) parts.set(`${company.key}.${n}.json`, []);
  const sorted = [...jobs].sort((a, b) => a.id.localeCompare(b.id, "en", { numeric: true }));
  for (const job of sorted) {
    const file = partCount === 1 ? `${company.key}.json` : `${company.key}.${partOf(job.id, partCount) + 1}.json`;
    parts.get(file)!.push(dehydrate(job, seenAt));
  }

  for (const f of current) if (!parts.has(f)) await rm(join(dir, f));
  for (const other of [undefined, ...(await sectorDirs(dataDir))]) {
    if (other === company.sector) continue;
    const otherDir = jobsDir(dataDir, other);
    for (const f of filesOf(await listJson(otherDir), company.key)) await rm(join(otherDir, f));
  }
  for (const [f, list] of parts) await writeFile(join(dir, f), JSON.stringify(list, null, 2) + "\n");
}
