/**
 * Writes data/history/<date>.json, the day's open tech-job counts by company,
 * function, place, technology and employment type, and
 * data/history/medicine/<date>.json, its open medical jobs by specialty,
 * career level, place and hospital. The daily pipeline writes
 * today's; run it by hand to rebuild past days from the jobs still on file.
 *
 *   bun scripts/snapshot.ts                         # today (UTC)
 *   bun scripts/snapshot.ts 2026-11-02 2026-11-03   # the listed days
 *
 * A past day is rebuilt from each job's firstSeenAt and closedAt, from
 * data/jobs and data/archive, where jobs closed for more than 14 days go. It
 * is only as complete as the store: jobs dropped before the archive existed
 * are gone, and a big company's jobs outside its newest maxJobs never had a
 * firstSeenAt at all.
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";
import { MEDICINE_SNAPSHOT_DIMENSIONS, medicineSnapshotOf, SNAPSHOT_DIMENSIONS, snapshotOf } from "../src/lib/analytics.ts";
import { readAllArchived } from "../src/lib/archive.ts";
import { readAllJobs } from "../src/lib/job-files.ts";
import { isMedicine } from "../src/lib/medicine.ts";
import { type ArchivedJob, CompanyConfigSchema, type Job, type MedicineSnapshot, type Snapshot } from "../src/lib/schema.ts";

const DATA_DIR = join(import.meta.dirname, "..", "data");

/** One dimension per line, so a day's file reads and diffs easily. */
export function snapshotJson(snapshot: Snapshot): string {
  const { date, open, remote } = snapshot;
  const lines = [
    `"date":${JSON.stringify(date)},"open":${open},"remote":${remote}`,
    ...SNAPSHOT_DIMENSIONS.map((key) => `${JSON.stringify(key)}:${JSON.stringify(snapshot[key])}`),
  ];
  return `{\n${lines.join(",\n")}\n}\n`;
}

export function medicineSnapshotJson(snapshot: MedicineSnapshot): string {
  const { date, open } = snapshot;
  const lines = [
    `"date":${JSON.stringify(date)},"open":${open}`,
    ...MEDICINE_SNAPSHOT_DIMENSIONS.map((key) => `${JSON.stringify(key)}:${JSON.stringify(snapshot[key])}`),
  ];
  return `{\n${lines.join(",\n")}\n}\n`;
}

/** Hospital groups by company key, for the hospital counts of the medical snapshot. */
async function hospitalGroups(dataDir: string): Promise<Map<string, string>> {
  const raw = await readFile(join(dataDir, "companies.json"), "utf8").catch(() => "[]");
  const companies = z.array(CompanyConfigSchema).parse(JSON.parse(raw));
  return new Map(companies.filter((c) => c.group).map((c) => [c.key, c.name]));
}

/**
 * Writes the day's tech snapshot, which the /analytics pages read, and its
 * medical snapshot, which the /medicine pages and reports read.
 */
export async function writeSnapshot(jobs: Job[], date: string, dataDir = DATA_DIR, archived: ArchivedJob[] = []): Promise<Snapshot> {
  const snapshot = snapshotOf(jobs.filter((j) => !isMedicine(j)), date, archived.filter((j) => !isMedicine(j)));
  await mkdir(join(dataDir, "history"), { recursive: true });
  await writeFile(join(dataDir, "history", `${date}.json`), snapshotJson(snapshot));
  const medical = [...jobs, ...archived].filter(isMedicine);
  if (medical.length) {
    const medicine = medicineSnapshotOf(medical, date, await hospitalGroups(dataDir));
    // no file for days before the first medical job, which would read as a drop to zero
    if (medicine.open > 0) {
      await mkdir(join(dataDir, "history", "medicine"), { recursive: true });
      await writeFile(join(dataDir, "history", "medicine", `${date}.json`), medicineSnapshotJson(medicine));
    }
  }
  return snapshot;
}

async function main() {
  const dates = process.argv.slice(2);
  const [jobs, archived] = await Promise.all([readAllJobs(DATA_DIR), readAllArchived(DATA_DIR)]);
  for (const date of dates.length ? dates : [new Date().toISOString().slice(0, 10)]) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error(`Not a date: ${date}`);
    const s = await writeSnapshot(jobs, date, DATA_DIR, archived);
    console.log(`${date}: ${s.open} open, ${s.remote} remote`);
  }
}

if (import.meta.main) await main();
