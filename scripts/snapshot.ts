/**
 * Writes data/history/<date>.json, the day's open-job counts by company,
 * function, place, technology and employment type. The daily pipeline writes
 * today's; run it by hand to rebuild past days from the jobs still on file.
 *
 *   bun scripts/snapshot.ts                         # today (UTC)
 *   bun scripts/snapshot.ts 2026-11-02 2026-11-03   # the listed days
 *
 * A past day is rebuilt from each job's firstSeenAt and closedAt, so it is only
 * as complete as the store: closed jobs are dropped after 14 days, and a big
 * company's jobs outside its newest maxJobs never had a firstSeenAt at all.
 */
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";
import { SNAPSHOT_DIMENSIONS, snapshotOf } from "../src/lib/analytics.ts";
import { isMedicine } from "../src/lib/medicine.ts";
import { type Job, JobSchema, type Snapshot } from "../src/lib/schema.ts";

const DATA_DIR = join(import.meta.dirname, "..", "data");

/** Every job in data/jobs, open or closed. */
export async function readAllJobs(dataDir = DATA_DIR): Promise<Job[]> {
  const dir = join(dataDir, "jobs");
  const files = (await readdir(dir).catch(() => [])).filter((f) => f.endsWith(".json"));
  const lists = await Promise.all(files.map(async (f) => z.array(JobSchema).parse(JSON.parse(await readFile(join(dir, f), "utf8")))));
  return lists.flat();
}

/** One dimension per line, so a day's file reads and diffs easily. */
export function snapshotJson(snapshot: Snapshot): string {
  const { date, open, remote } = snapshot;
  const lines = [
    `"date":${JSON.stringify(date)},"open":${open},"remote":${remote}`,
    ...SNAPSHOT_DIMENSIONS.map((key) => `${JSON.stringify(key)}:${JSON.stringify(snapshot[key])}`),
  ];
  return `{\n${lines.join(",\n")}\n}\n`;
}

/** The snapshot covers tech jobs only, like the analytics pages that read it. */
export async function writeSnapshot(jobs: Job[], date: string, dataDir = DATA_DIR): Promise<Snapshot> {
  const snapshot = snapshotOf(jobs.filter((j) => !isMedicine(j)), date);
  await mkdir(join(dataDir, "history"), { recursive: true });
  await writeFile(join(dataDir, "history", `${date}.json`), snapshotJson(snapshot));
  return snapshot;
}

async function main() {
  const dates = process.argv.slice(2);
  const jobs = await readAllJobs();
  for (const date of dates.length ? dates : [new Date().toISOString().slice(0, 10)]) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error(`Not a date: ${date}`);
    const s = await writeSnapshot(jobs, date);
    console.log(`${date}: ${s.open} open, ${s.remote} remote`);
  }
}

if (import.meta.main) await main();
