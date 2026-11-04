import { describe, expect, test } from "bun:test";
import type { Job, SourceRun } from "../src/lib/schema.ts";
import type { NormalizedJob } from "./fetchers/types.ts";
import { partOf } from "../src/lib/job-files.ts";
import { jobsChanged, mergeJobs, recordHistory, sanityCheck } from "./fetch.ts";

const day = (n: number) => new Date(Date.UTC(2026, 10, n)).toISOString();

function fetched(originalId: string, title = "Engineer"): NormalizedJob {
  return {
    id: `test:${originalId}`,
    originalId,
    company: "acme",
    title,
    locations: ["Berlin, Germany"],
    remote: false,
    descriptionHtml: "<p>Hi</p>",
    applyUrl: `https://example.com/${originalId}`,
    source: "test",
  };
}

function stored(originalId: string, extra: Partial<Job> = {}): Job {
  const { originalId: _, ...job } = fetched(originalId);
  return { ...job, slug: `acme-engineer-${originalId}`, firstSeenAt: day(1), lastSeenAt: day(1), ...extra };
}

describe("mergeJobs", () => {
  test("new jobs get firstSeenAt and a slug", () => {
    const { jobs, added } = mergeJobs([], [fetched("1", "Senior Engineer")], day(2));
    expect(added).toBe(1);
    expect(jobs[0]).toMatchObject({ slug: "acme-senior-engineer-1", firstSeenAt: day(2), lastSeenAt: day(2) });
  });

  test("existing jobs keep slug and firstSeenAt even if the title changes", () => {
    const { jobs, added } = mergeJobs([stored("1")], [fetched("1", "Renamed")], day(2));
    expect(added).toBe(0);
    expect(jobs[0]).toMatchObject({ title: "Renamed", slug: "acme-engineer-1", firstSeenAt: day(1), lastSeenAt: day(2) });
  });

  test("missing jobs are closed, reappearing jobs are reopened", () => {
    const closedRun = mergeJobs([stored("1")], [], day(2));
    expect(closedRun.closed).toBe(1);
    expect(closedRun.jobs[0]!.closedAt).toBe(day(2));

    const reopened = mergeJobs(closedRun.jobs, [fetched("1")], day(3));
    expect(reopened.jobs[0]!.closedAt).toBeUndefined();
    expect(reopened.added).toBe(0);
  });

  test("after a capped fetch, missing open jobs are kept as they were", () => {
    const prev = [stored("old"), stored("closed", { closedAt: day(5) })];
    const { jobs, closed } = mergeJobs(prev, [fetched("new")], day(6), true);
    expect(closed).toBe(0);
    expect(jobs.map((j) => [j.id, j.closedAt, j.lastSeenAt])).toEqual([
      ["test:closed", day(5), day(1)],
      ["test:new", undefined, day(6)],
      ["test:old", undefined, day(1)],
    ]);
  });

  test("closed jobs are kept for 14 days, then dropped", () => {
    const prev = [stored("1", { closedAt: day(2) })];
    expect(mergeJobs(prev, [], day(15)).jobs).toHaveLength(1);
    expect(mergeJobs(prev, [], day(17)).jobs).toHaveLength(0);
  });
});

describe("mergeJobs changes", () => {
  test("lists opened, reopened, closed and dropped slugs", () => {
    const prev = [
      stored("kept"),
      stored("gone"),
      stored("back", { closedAt: day(2) }),
      stored("old", { closedAt: day(1) }),
    ];
    const { changes } = mergeJobs(prev, [fetched("kept"), fetched("back"), fetched("new")], day(16));
    expect(changes.opened.sort()).toEqual(["acme-engineer-back", "acme-engineer-new"]);
    expect(changes.closed).toEqual(["acme-engineer-gone"]);
    expect(changes.dropped).toEqual(["acme-engineer-old"]);
  });

  test("a capped fetch closes nothing", () => {
    const { changes } = mergeJobs([stored("1")], [fetched("2")], day(2), true);
    expect(changes.closed).toEqual([]);
  });
});

describe("sanityCheck", () => {
  const result = (valid: number, invalid = 0) => ({
    fetched: valid + invalid,
    invalid,
    jobs: Array.from({ length: valid }, (_, i) => fetched(String(i))),
  });

  test("accepts a normal result", () => {
    expect(sanityCheck(result(90, 5), 100)).toBeUndefined();
  });

  test("rejects zero jobs, even for a new source", () => {
    expect(sanityCheck(result(0), 0)).toMatch(/0 valid jobs/);
  });

  test("rejects a drop below 50% of the previous open count", () => {
    expect(sanityCheck(result(49), 100)).toMatch(/down from 100/);
    expect(sanityCheck(result(50), 100)).toBeUndefined();
  });

  test("rejects more than 20% invalid jobs", () => {
    expect(sanityCheck(result(79, 21), 0)).toMatch(/21 of 100/);
    expect(sanityCheck(result(80, 20), 0)).toBeUndefined();
  });
});

describe("jobsChanged", () => {
  test("ignores lastSeenAt and key order", () => {
    const before = [stored("1")];
    const { lastSeenAt: _, ...rest } = stored("1");
    const after = [{ lastSeenAt: day(9), ...rest }];
    expect(jobsChanged(before, after)).toBe(false);
  });

  test("detects other changes", () => {
    expect(jobsChanged([stored("1")], [stored("1", { title: "New title" })])).toBe(true);
    expect(jobsChanged([stored("1")], [stored("1"), stored("2")])).toBe(true);
  });
});

test("jobsChanged ignores undefined fields that JSON drops", () => {
  const fresh = [stored("1", { department: undefined })];
  const fromDisk = JSON.parse(JSON.stringify(fresh)) as Job[];
  expect(jobsChanged(fromDisk, fresh)).toBe(false);
});

describe("recordHistory", () => {
  const run = (company: string, open: number, added = 0, closed = 0): SourceRun => ({
    company,
    source: "test",
    status: "ok",
    fetched: open,
    invalid: 0,
    open,
    new: added,
    closed,
    fallbackStreak: 0,
    broken: false,
  });

  test("adds a sorted line per day", () => {
    const first = recordHistory([], "2026-11-03", [run("acme", 10, 2)], new Set(["acme"]));
    const history = recordHistory(first, "2026-11-02", [run("acme", 8)], new Set(["acme"]));
    expect(history.map((d) => d.date)).toEqual(["2026-11-02", "2026-11-03"]);
    expect(history[1]!.companies.acme).toEqual({ open: 10, new: 2, closed: 0 });
  });

  test("a rerun on the same day adds to the earlier counts", () => {
    const first = recordHistory([], "2026-11-02", [run("acme", 10, 2, 1)], new Set(["acme"]));
    const history = recordHistory(first, "2026-11-02", [run("acme", 11, 1)], new Set(["acme"]));
    expect(history).toHaveLength(1);
    expect(history[0]!.companies.acme).toEqual({ open: 11, new: 3, closed: 1 });
  });

  test("skipped companies keep the day's counts, not the carried-over run status", () => {
    const first = recordHistory([], "2026-11-02", [run("acme", 10, 2), run("beta", 5, 5)], new Set(["acme", "beta"]));
    // a partial run copies beta's previous status, including its new count, into latest.json
    const history = recordHistory(first, "2026-11-02", [run("acme", 10), run("beta", 5, 5)], new Set(["acme"]));
    expect(history[0]!.companies.beta).toEqual({ open: 5, new: 5, closed: 0 });
    const nextDay = recordHistory(history, "2026-11-03", [run("acme", 10), run("beta", 5, 5)], new Set(["acme"]));
    expect(nextDay[1]!.companies.beta).toEqual({ open: 5, new: 0, closed: 0 });
  });
});

describe("partOf", () => {
  test("puts a job in the same part every time, spread across all parts", () => {
    const ids = Array.from({ length: 1000 }, (_, i) => `amazon:${3_000_000 + i}`);
    const parts = ids.map((id) => partOf(id, 4));
    expect(ids.map((id) => partOf(id, 4))).toEqual(parts);
    for (let n = 0; n < 4; n++) expect(parts.filter((p) => p === n).length).toBeGreaterThan(150);
  });
});
