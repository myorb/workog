import { describe, expect, test } from "bun:test";
import { dailySnapshots, dailyTotals, medianAgeDays, movers, openOn, postedByMonth, remoteShareBy, snapshotOf, snapshotOn, weeklyTotals } from "./analytics.ts";
import type { HistoryDay, Job, Snapshot } from "./schema.ts";

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

describe("snapshots", () => {
  test("openOn counts a job from the day it was first seen until the day it closed", () => {
    const j = job({ firstSeenAt: "2026-11-02T05:00:00Z", closedAt: "2026-11-04T05:00:00Z" });
    expect(["2026-11-01", "2026-11-02", "2026-11-03", "2026-11-04"].map((d) => openOn(j, d))).toEqual([false, true, true, false]);
  });

  test("snapshotOf counts open jobs by company, category, remote and tags", () => {
    const s = snapshotOf(
      [
        job({ id: "t:1", company: "acme", category: "engineering", remote: true, locations: ["Berlin, Germany"] }),
        job({ id: "t:2", company: "acme", locations: ["Berlin, Germany"] }),
        job({ id: "t:3", company: "zeta", closedAt: "2026-11-01T12:00:00Z" }),
      ],
      "2026-11-02",
    );
    expect(s.open).toBe(2);
    expect(s.remote).toBe(1);
    expect(s.companies).toEqual({ acme: 2 });
    expect(s.categories).toEqual({ engineering: 1, other: 1 });
    expect(s.countries.germany).toBe(2);
  });

  test("snapshotOf counts archived jobs on the days they were open, with their stored tags", () => {
    const { descriptionHtml: _, ...rest } = job({ id: "t:9", company: "old", locations: ["Berlin, Germany"] });
    const archived = {
      ...rest,
      firstSeenAt: "2026-10-01T00:00:00Z",
      closedAt: "2026-10-10T00:00:00Z",
      archivedAt: "2026-10-25T00:00:00Z",
      technologies: ["typescript"],
      employment: "contract",
    };
    const open = snapshotOf([], "2026-10-05", [archived]);
    expect(open).toMatchObject({ open: 1, companies: { old: 1 }, technologies: { typescript: 1 }, employment: { contract: 1 } });
    expect(open.countries.germany).toBe(1);
    expect(snapshotOf([], "2026-10-10", [archived]).open).toBe(0);
  });

  const snap = (date: string, open: number): Snapshot => ({
    date, open, remote: 0, companies: {}, categories: {}, countries: {}, cities: {}, technologies: {}, employment: {},
  });

  test("dailySnapshots fills missing days with the day before", () => {
    const days = dailySnapshots([snap("2026-11-01", 5), snap("2026-11-03", 7)]);
    expect(days.map((d) => [d.date, d.open])).toEqual([["2026-11-01", 5], ["2026-11-02", 5], ["2026-11-03", 7]]);
  });

  test("snapshotOn picks the latest snapshot on or before a date", () => {
    const all = [snap("2026-11-01", 5), snap("2026-11-03", 7)];
    expect(snapshotOn(all, "2026-11-02")?.date).toBe("2026-11-01");
    expect(snapshotOn(all, "2026-10-31")).toBeUndefined();
  });

  test("movers ranks growth and decline, counting new and vanished keys from 0", () => {
    const { up, down } = movers({ a: 10, b: 5, c: 3 }, { a: 12, b: 1, d: 4 }, 5);
    expect(up.map((m) => [m.key, m.delta])).toEqual([["d", 4], ["a", 2]]);
    expect(down.map((m) => [m.key, m.delta])).toEqual([["b", -4], ["c", -3]]);
  });
});
