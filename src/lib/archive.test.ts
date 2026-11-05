import { describe, expect, test } from "bun:test";
import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readAllArchived, readCompanyArchive, toArchived, updateArchive } from "./archive.ts";
import { StagedWrites } from "./job-files.ts";
import type { Job } from "./schema.ts";

const day = (n: number) => new Date(Date.UTC(2026, 10, n)).toISOString();

function job(n: number, extra: Partial<Job> = {}): Job {
  return {
    id: `test:${n}`,
    slug: `acme-engineer-${n}`,
    company: "acme",
    title: "TypeScript Engineer",
    locations: ["Berlin, Germany"],
    remote: false,
    descriptionHtml: "<p>This is a contract role.</p>",
    applyUrl: `https://example.com/${n}`,
    firstSeenAt: day(1),
    lastSeenAt: day(2),
    closedAt: day(3),
    source: "test",
    ...extra,
  };
}

async function withDir(fn: (dir: string) => Promise<void>) {
  const dir = await mkdtemp(join(tmpdir(), "archive-"));
  try {
    await fn(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

async function update(dir: string, add: Job[], remove: string[] = []) {
  const staged = new StagedWrites();
  await updateArchive(dir, "acme", add.map((j) => toArchived(j, day(20))), remove, staged);
  await staged.commit();
}

describe("toArchived", () => {
  test("drops the description and keeps the tags it gave", () => {
    const a = toArchived(job(1, { missedRuns: undefined }), day(20));
    expect("descriptionHtml" in a).toBe(false);
    expect(a).toMatchObject({ slug: "acme-engineer-1", closedAt: day(3), archivedAt: day(20), technologies: ["typescript"] });
    expect(a.employment).toBe("contract");
  });

  test("refuses an open job", () => {
    expect(() => toArchived(job(1, { closedAt: undefined }), day(20))).toThrow();
  });
});

describe("updateArchive", () => {
  test("writes one sorted line per job into the month of its closedAt", () =>
    withDir(async (dir) => {
      await update(dir, [job(10), job(2), job(3, { closedAt: "2026-12-01T00:00:00.000Z" })]);
      expect(await readdir(join(dir, "archive", "acme"))).toEqual(["2026-11.jsonl", "2026-12.jsonl"]);
      const lines = (await readFile(join(dir, "archive", "acme", "2026-11.jsonl"), "utf8")).trim().split("\n");
      expect(lines.map((l) => JSON.parse(l).id)).toEqual(["test:2", "test:10"]);
      expect((await readAllArchived(dir)).map((j) => j.id).sort()).toEqual(["test:10", "test:2", "test:3"]);
    }));

  test("appends to an existing month without rewriting other months", () =>
    withDir(async (dir) => {
      await update(dir, [job(1), job(2, { closedAt: "2026-12-01T00:00:00.000Z" })]);
      const staged = new StagedWrites();
      await updateArchive(dir, "acme", [toArchived(job(3), day(21))], [], staged);
      const writes = await readdir(join(dir, "archive", "acme"));
      expect(writes.filter((f) => f.endsWith(".staged"))).toEqual(["2026-11.jsonl.staged"]);
      await staged.commit();
      expect((await readCompanyArchive(dir, "acme")).map((j) => j.id)).toEqual(["test:1", "test:3", "test:2"]);
    }));

  test("removes restored jobs and the files they leave empty", () =>
    withDir(async (dir) => {
      await update(dir, [job(1), job(2, { closedAt: "2026-12-01T00:00:00.000Z" })]);
      await update(dir, [], ["test:2"]);
      expect(await readdir(join(dir, "archive", "acme"))).toEqual(["2026-11.jsonl"]);
      expect((await readCompanyArchive(dir, "acme")).map((j) => j.id)).toEqual(["test:1"]);
    }));

  test("a job archived again moves to its new month", () =>
    withDir(async (dir) => {
      await update(dir, [job(1)]);
      await update(dir, [job(1, { closedAt: "2026-12-05T00:00:00.000Z" })]);
      expect(await readdir(join(dir, "archive", "acme"))).toEqual(["2026-12.jsonl"]);
    }));
});
