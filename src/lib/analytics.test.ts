import { describe, expect, test } from "bun:test";
import { dailyTotals, medianAgeDays, postedByMonth, remoteShareBy, weeklyTotals } from "./analytics.ts";
import type { HistoryDay, Job } from "./schema.ts";

function job(overrides: Partial<Job>): Job {
  return {
    id: "test:1",
    slug: "acme-engineer-1",
    company: "acme",
    title: "Engineer",
    locations: [],
    remote: false,
    descriptionHtml: "<p>Hi</p>",
    applyUrl: "https://example.com/1",
    firstSeenAt: "2026-11-01T00:00:00Z",
    lastSeenAt: "2026-11-01T00:00:00Z",
    source: "test",
    ...overrides,
  };
}

const ref = new Date("2026-11-02T00:00:00Z");

describe("postedByMonth", () => {
  test("buckets the last months and counts older and undated jobs apart", () => {
    const jobs = [
      job({ postedAt: "2026-11-01T00:00:00Z" }),
      job({ postedAt: "2026-09-15T00:00:00Z" }),
      job({ postedAt: "2026-01-15T00:00:00Z" }),
      job({}),
    ];
    const { bars, earlier, undated } = postedByMonth(jobs, ref, 3);
    expect(bars).toEqual([
      { label: "Sep", month: "2026-09", count: 1 },
      { label: "Oct", month: "2026-10", count: 0 },
      { label: "Nov", month: "2026-11", count: 1 },
    ]);
    expect(earlier).toBe(1);
    expect(undated).toBe(1);
  });
});

test("medianAgeDays", () => {
  expect(medianAgeDays([], ref)).toBeUndefined();
  const jobs = ["2026-11-01", "2026-10-29", "2026-10-23", "2026-10-03"].map((d) => job({ postedAt: `${d}T00:00:00Z` }));
  expect(medianAgeDays(jobs, ref)).toBe(7);
});

test("remoteShareBy", () => {
  const jobs = [job({ remote: true, category: "data" }), job({ category: "data" }), job({ category: "sales" })];
  expect(remoteShareBy(jobs, (j) => j.category!)).toEqual([
    { label: "data", count: 2, share: 0.5 },
    { label: "sales", count: 1, share: 0 },
  ]);
});

describe("dailyTotals", () => {
  const line = (date: string, open: number, added = 0, closed = 0): HistoryDay => ({
    date,
    companies: { acme: { open, new: added, closed }, beta: { open: 1, new: 0, closed: 0 } },
  });

  test("sums companies and fills missing days from the day before", () => {
    expect(dailyTotals([line("2026-10-30", 10, 2), line("2026-11-02", 8, 0, 2)])).toEqual([
      { date: "2026-10-30", open: 11, new: 2, closed: 0 },
      { date: "2026-10-31", open: 11, new: 0, closed: 0 },
      { date: "2026-11-01", open: 11, new: 0, closed: 0 },
      { date: "2026-11-02", open: 9, new: 0, closed: 2 },
    ]);
  });

  test("weeks start on Monday", () => {
    const days = dailyTotals([line("2026-11-01", 10, 3), line("2026-11-02", 10, 1, 1)]);
    expect(weeklyTotals(days)).toEqual([
      { week: "2026-10-26", new: 3, closed: 0 },
      { week: "2026-11-02", new: 1, closed: 1 },
    ]);
  });
});
