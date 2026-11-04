/**
 * Rewrites data/jobs in the current layout (src/lib/job-files.ts) without
 * fetching anything: file size, part counts, sector folders, and lastSeenAt left
 * out where data/runs/seen.json covers it. Run it after changing that layout.
 *
 *   bun scripts/repack.ts
 *
 * A company missing from seen.json gets the newest lastSeenAt among its open
 * jobs, which is the time of its last successful run.
 */
import { join } from "node:path";
import { z } from "zod";
import { readAllJobs, readSeen, type Seen, writeCompanyJobs, writeSeen } from "../src/lib/job-files.ts";
import { CompanyConfigSchema, type Job } from "../src/lib/schema.ts";

const DATA_DIR = join(import.meta.dirname, "..", "data");

/** The time to record for a company: its seen.json entry, else its newest open job's lastSeenAt. */
export function seenAtOf(jobs: Job[], current: string | undefined): string | undefined {
  if (current) return current;
  const open = jobs.filter((j) => !j.closedAt);
  return (open.length ? open : jobs).map((j) => j.lastSeenAt).sort().at(-1);
}

async function main() {
  const companies = z.array(CompanyConfigSchema).parse(await Bun.file(join(DATA_DIR, "companies.json")).json());
  const sectorOf = new Map(companies.map((c) => [c.key, c.sector]));
  const seen = await readSeen(DATA_DIR);

  const byCompany = new Map<string, Job[]>();
  // a job's company is its company's key, the same as its file name
  for (const job of await readAllJobs(DATA_DIR)) {
    const list = byCompany.get(job.company) ?? [];
    list.push(job);
    byCompany.set(job.company, list);
  }

  const nextSeen: Seen = { ...seen };
  for (const [key, jobs] of [...byCompany].sort(([a], [b]) => a.localeCompare(b))) {
    const seenAt = seenAtOf(jobs, seen[key]);
    if (seenAt) nextSeen[key] = seenAt;
    await writeCompanyJobs(DATA_DIR, { key, sector: sectorOf.get(key) }, jobs, seenAt);
    console.log(`${key}: ${jobs.length} jobs`);
  }
  await writeSeen(DATA_DIR, nextSeen);
}

if (import.meta.main) await main();
