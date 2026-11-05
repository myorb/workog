/**
 * The archive of closed jobs, data/archive/<company>/<YYYY-MM>.jsonl: jobs
 * closed for longer than the retention window leave data/jobs (and lose their
 * page) but are kept here for good, so analytics can rebuild any past day and a
 * job that comes back keeps its slug and firstSeenAt.
 *
 * - One file per company and month of `closedAt`, so a daily commit appends to
 *   the current month's files and leaves the rest alone.
 * - One job per line, sorted by id, fields in schema order, so a file's diff
 *   shows only the jobs that moved.
 * - Records are slim (ArchivedJobSchema): no description, with the
 *   technologies and employment type it gave worked out on the way in.
 *
 * The site never reads the archive; only the pipeline and the snapshot script do.
 */
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { employmentTypeOf } from "./employment.ts";
import type { StagedWrites } from "./job-files.ts";
import { type ArchivedJob, ArchivedJobSchema, type Job } from "./schema.ts";
import { technologiesOf } from "./technologies.ts";

const archiveRoot = (dataDir: string) => join(dataDir, "archive");
const companyDir = (dataDir: string, key: string) => join(archiveRoot(dataDir), key);
const monthFile = (closedAt: string) => `${closedAt.slice(0, 7)}.jsonl`;

const FIELD_ORDER = Object.keys(ArchivedJobSchema.shape) as (keyof ArchivedJob)[];
const byId = (a: { id: string }, b: { id: string }) => a.id.localeCompare(b.id, "en", { numeric: true });

/** The archive record of a closed job. */
export function toArchived(job: Job, archivedAt: string): ArchivedJob {
  if (!job.closedAt) throw new Error(`job ${job.id} is open and can't be archived`);
  const { descriptionHtml: _, missedRuns: __, ...rest } = job;
  return {
    ...rest,
    closedAt: job.closedAt,
    archivedAt,
    technologies: [...technologiesOf(job)].sort(),
    employment: employmentTypeOf(job),
  };
}

/** One line of a month file: fields in schema order, undefined ones left out. */
export function archivedLine(job: ArchivedJob): string {
  const out: Record<string, unknown> = {};
  for (const key of FIELD_ORDER) if (job[key] !== undefined) out[key] = job[key];
  return JSON.stringify(out);
}

export function parseArchive(text: string, file: string): ArchivedJob[] {
  return text
    .split("\n")
    .filter((line) => line.trim())
    .map((line, i) => {
      try {
        return ArchivedJobSchema.parse(JSON.parse(line));
      } catch (err) {
        throw new Error(`${file}:${i + 1}: ${err instanceof Error ? err.message : err}`);
      }
    });
}

async function listDir(dir: string, dirs: boolean): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true }).catch(() => []);
  return entries
    .filter((e) => (dirs ? e.isDirectory() : e.isFile() && e.name.endsWith(".jsonl")))
    .map((e) => e.name)
    .sort();
}

/** The company's month files and their jobs, keyed by file name. */
async function readMonths(dataDir: string, key: string): Promise<Map<string, ArchivedJob[]>> {
  const dir = companyDir(dataDir, key);
  const months = new Map<string, ArchivedJob[]>();
  for (const file of await listDir(dir, false)) {
    const path = join(dir, file);
    months.set(file, parseArchive(await readFile(path, "utf8"), path));
  }
  return months;
}

/** One company's archived jobs. */
export async function readCompanyArchive(dataDir: string, key: string): Promise<ArchivedJob[]> {
  return [...(await readMonths(dataDir, key)).values()].flat();
}

/** Every archived job, of every company. */
export async function readAllArchived(dataDir: string): Promise<ArchivedJob[]> {
  const keys = await listDir(archiveRoot(dataDir), true);
  return (await Promise.all(keys.map((key) => readCompanyArchive(dataDir, key)))).flat();
}

/**
 * Adds `add` to the company's archive and takes out the ids in `remove` (jobs
 * that came back and are open in data/jobs again). A job already archived under
 * another month moves to the month of its new closedAt. Only files that change
 * are written; a file left empty is removed. Nothing changes until
 * `staged.commit()`.
 */
export async function updateArchive(
  dataDir: string,
  key: string,
  add: ArchivedJob[],
  remove: Iterable<string>,
  staged: StagedWrites,
): Promise<void> {
  const gone = new Set([...remove, ...add.map((j) => j.id)]);
  if (!gone.size) return;
  const months = await readMonths(dataDir, key);
  const changed = new Set<string>();
  for (const [file, jobs] of months) {
    const kept = jobs.filter((j) => !gone.has(j.id));
    if (kept.length !== jobs.length) {
      months.set(file, kept);
      changed.add(file);
    }
  }
  for (const job of add) {
    const file = monthFile(job.closedAt);
    months.set(file, [...(months.get(file) ?? []), job]);
    changed.add(file);
  }
  const dir = companyDir(dataDir, key);
  for (const file of changed) {
    const jobs = months.get(file)!.sort(byId);
    if (jobs.length) await staged.write(join(dir, file), jobs.map(archivedLine).join("\n") + "\n");
    else staged.remove(join(dir, file));
  }
}
