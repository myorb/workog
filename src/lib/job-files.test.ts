import { describe, expect, test } from "bun:test";
import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  clearStaged,
  JOBS_PER_FILE,
  partCountFor,
  partOf,
  readAllJobs,
  readCompanyJobs,
  readSeen,
  seenFile,
  seenJson,
  StagedWrites,
  writeCompanyJobs,
  writeSeen,
} from "./job-files.ts";
import type { Job } from "./schema.ts";

const day = (n: number) => new Date(Date.UTC(2026, 10, n)).toISOString();

function job(company: string, n: number, extra: Partial<Job> = {}): Job {
  return {
    id: `test:${n}`,
    slug: `${company}-engineer-${n}`,
    company,
    title: "Engineer",
    locations: ["Berlin, Germany"],
    remote: false,
    descriptionHtml: "<p>Hi</p>",
    applyUrl: `https://example.com/${n}`,
    firstSeenAt: day(1),
    lastSeenAt: day(3),
    source: "test",
    ...extra,
  };
}

async function withDir(fn: (dir: string) => Promise<void>) {
  const dir = await mkdtemp(join(tmpdir(), "job-files-"));
  try {
    await fn(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

const readRaw = async (path: string) => JSON.parse(await readFile(path, "utf8")) as Record<string, unknown>[];

describe("writeCompanyJobs and readCompanyJobs", () => {
  test("round-trip every field, leaving lastSeenAt out only where seen.json covers it", () =>
    withDir(async (dir) => {
      const seenJob = job("acme", 1);
      const closed = job("acme", 2, { lastSeenAt: day(2), closedAt: day(3) });
      const stale = job("acme", 3, { lastSeenAt: day(1) });
      await writeCompanyJobs(dir, { key: "acme" }, [stale, seenJob, closed], day(3));
      await writeSeen(dir, { acme: day(3) });

      const raw = await readRaw(join(dir, "jobs", "acme.json"));
      expect(raw.map((j) => j.lastSeenAt)).toEqual([undefined, day(2), day(1)]);

      const back = await readCompanyJobs(dir, { key: "acme" }, await readSeen(dir));
      expect(back).toEqual([seenJob, closed, stale]);
      expect(await readAllJobs(dir)).toEqual([seenJob, closed, stale]);
    }));

  test("fails loudly when a job has no lastSeenAt and seen.json has no entry", () =>
    withDir(async (dir) => {
      await writeCompanyJobs(dir, { key: "acme" }, [job("acme", 1)], day(3));
      await expect(readAllJobs(dir)).rejects.toThrow(/no lastSeenAt/);
    }));

  test("puts a sector's companies in its own folder and moves them when the sector changes", () =>
    withDir(async (dir) => {
      await writeSeen(dir, { acme: day(3), clinic: day(3) });
      await writeCompanyJobs(dir, { key: "acme" }, [job("acme", 1)], day(3));
      await writeCompanyJobs(dir, { key: "clinic" }, [job("clinic", 2)], day(3));
      expect((await readdir(join(dir, "jobs"))).sort()).toEqual(["acme.json", "clinic.json"]);

      await writeCompanyJobs(dir, { key: "clinic", sector: "medicine" }, [job("clinic", 2)], day(3));
      expect((await readdir(join(dir, "jobs"))).sort()).toEqual(["acme.json", "medicine"]);
      expect(await readdir(join(dir, "jobs", "medicine"))).toEqual(["clinic.json"]);
      expect((await readAllJobs(dir)).map((j) => j.id).sort()).toEqual(["test:1", "test:2"]);
      expect(await readCompanyJobs(dir, { key: "clinic", sector: "medicine" }, { clinic: day(3) })).toEqual([job("clinic", 2)]);
    }));

  test("splits a big company into hashed parts and back into one file when it shrinks", () =>
    withDir(async (dir) => {
      const many = Array.from({ length: JOBS_PER_FILE * 3 }, (_, i) => job("big", i));
      await writeCompanyJobs(dir, { key: "big" }, many, day(3));
      expect((await readdir(join(dir, "jobs"))).length).toBe(4);
      expect(await readCompanyJobs(dir, { key: "big" }, { big: day(3) })).toHaveLength(many.length);

      await writeCompanyJobs(dir, { key: "big" }, many.slice(0, 10), day(3));
      expect(await readdir(join(dir, "jobs"))).toEqual(["big.json"]);
    }));
});

describe("StagedWrites", () => {
  test("changes nothing readers see until commit, then applies writes and removals together", () =>
    withDir(async (dir) => {
      const old = job("acme", 1);
      await writeCompanyJobs(dir, { key: "acme" }, [old], day(3));
      await writeSeen(dir, { acme: day(3) });

      // the next run: acme grows into parts (so acme.json goes), a new company appears
      const staged = new StagedWrites();
      const many = Array.from({ length: JOBS_PER_FILE * 2 }, (_, i) => job("acme", i, { lastSeenAt: day(4) }));
      await writeCompanyJobs(dir, { key: "acme" }, many, day(4), staged);
      await writeCompanyJobs(dir, { key: "newco" }, [job("newco", 9, { lastSeenAt: day(4) })], day(4), staged);
      await staged.write(seenFile(dir), seenJson({ acme: day(4), newco: day(4) }));

      // a crash here leaves the last run whole: newco's jobs, which leave lastSeenAt out, aren't read without its seen.json entry
      expect(await readAllJobs(dir)).toEqual([old]);
      expect((await readdir(join(dir, "jobs"))).filter((f) => f.endsWith(".json"))).toEqual(["acme.json"]);

      await staged.commit();
      expect((await readdir(join(dir, "jobs"))).sort()).toEqual(["acme.1.json", "acme.2.json", "newco.json"]);
      expect(await readSeen(dir)).toEqual({ acme: day(4), newco: day(4) });
      expect(await readAllJobs(dir)).toHaveLength(many.length + 1);
    }));

  test("clearStaged removes what a crashed run left, in every folder", () =>
    withDir(async (dir) => {
      const staged = new StagedWrites();
      await writeCompanyJobs(dir, { key: "clinic", sector: "medicine" }, [job("clinic", 1)], day(3), staged);
      await staged.write(seenFile(dir), seenJson({ clinic: day(3) }));

      expect((await clearStaged(dir)).length).toBe(2);
      expect(await readdir(join(dir, "jobs", "medicine"))).toEqual([]);
      expect(await readdir(join(dir, "runs"))).toEqual([]);
      expect(await readAllJobs(dir)).toEqual([]);
    }));
});

describe("partCountFor", () => {
  test("is a power of two that fits the jobs", () => {
    expect(partCountFor(0, 1)).toBe(1);
    expect(partCountFor(JOBS_PER_FILE, 1)).toBe(1);
    expect(partCountFor(JOBS_PER_FILE + 1, 1)).toBe(2);
    expect(partCountFor(21_500, 1)).toBe(32);
  });

  test("doesn't flip back and forth around a boundary", () => {
    const grown = partCountFor(JOBS_PER_FILE + 1, 1);
    expect(partCountFor(JOBS_PER_FILE - 1, grown)).toBe(grown);
    expect(partCountFor(JOBS_PER_FILE / 2, grown)).toBe(grown);
    expect(partCountFor(JOBS_PER_FILE / 2 - 1, grown)).toBe(1);
  });

  test("starts older layouts that aren't a power of two from the smallest fit", () => {
    expect(partCountFor(21_500, 5)).toBe(32);
    expect(partCountFor(3_000, 3)).toBe(4);
  });

  test("doubling the parts moves about half the jobs", () => {
    const ids = Array.from({ length: 4000 }, (_, i) => `amazon:${3_000_000 + i}`);
    const moved = ids.filter((id) => partOf(id, 4) !== partOf(id, 8) % 4).length;
    expect(moved).toBe(0); // each part splits in two; no job crosses into another part's pair
    const stayed = ids.filter((id) => partOf(id, 4) === partOf(id, 8)).length;
    expect(stayed / ids.length).toBeGreaterThan(0.4);
    expect(stayed / ids.length).toBeLessThan(0.6);
  });
});

describe("dehydrate", () => {
  test("writes fields in schema order whatever order the job was built in", () =>
    withDir(async (dir) => {
      const { slug, firstSeenAt, ...rest } = job("acme", 1, { lastSeenAt: day(2), closedAt: day(3) });
      await writeCompanyJobs(dir, { key: "acme" }, [{ ...rest, slug, firstSeenAt } as Job], day(3));
      const [raw] = await readRaw(join(dir, "jobs", "acme.json"));
      expect(Object.keys(raw!)).toEqual(["id", "slug", "company", "title", "locations", "remote", "descriptionHtml", "applyUrl", "firstSeenAt", "lastSeenAt", "closedAt", "source"]);
    }));
});
