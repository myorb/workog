import { describe, expect, test } from "bun:test";
import type { Job } from "../src/lib/schema.ts";
import type { NormalizedJob } from "./fetchers/types.ts";
import { jobsChanged, mergeJobs, sanityCheck } from "./fetch.ts";

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

  test("closed jobs are kept for 14 days, then dropped", () => {
    const prev = [stored("1", { closedAt: day(2) })];
    expect(mergeJobs(prev, [], day(15)).jobs).toHaveLength(1);
    expect(mergeJobs(prev, [], day(17)).jobs).toHaveLength(0);
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
