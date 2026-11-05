import { describe, expect, test } from "bun:test";
import { changeOver, comparable, roundPct } from "./trend.ts";
import { biggestMoves, reportMonths, reportRows } from "./reports.ts";

const snap = (date: string, open: number, extra: Record<string, number> = {}) => ({ date, open, counts: extra });

describe("trend", () => {
  test("comparable starts after the last coverage jump", () => {
    const days = [snap("2026-11-02", 6449), snap("2026-11-03", 52402), snap("2026-11-04", 53088)];
    expect(comparable(days).map((d) => d.date)).toEqual(["2026-11-03", "2026-11-04"]);
  });

  test("changeOver compares with the snapshot 30 days back", () => {
    const days = [snap("2026-10-01", 100), snap("2026-10-06", 102), snap("2026-11-05", 110)];
    expect(changeOver(days, (s) => s.open, 110)).toMatchObject({ from: 102, since: "2026-10-06", days: 30 });
  });

  test("changeOver falls back to the oldest comparable snapshot, but not under 7 days", () => {
    const short = [snap("2026-11-01", 100), snap("2026-11-05", 104)];
    expect(changeOver(short, (s) => s.open, 104)).toBeUndefined();
    const week = [snap("2026-10-28", 100), snap("2026-11-05", 110)];
    expect(changeOver(week, (s) => s.open, 110)).toMatchObject({ from: 100, days: 8, pct: 10 });
  });

  test("changeOver never reaches past a coverage jump", () => {
    const days = [snap("2026-10-01", 10), snap("2026-10-02", 100), snap("2026-10-05", 100)];
    expect(changeOver(days, (s) => s.open, 100)).toBeUndefined();
  });

  test("changeOver leaves out keys unknown or zero at the base", () => {
    const days = [snap("2026-10-01", 100, { a: 0 }), snap("2026-11-05", 100, { a: 5 })];
    expect(changeOver(days, (s) => s.counts.a, 5)).toBeUndefined();
    expect(changeOver(days, (s) => s.counts.b, 5)).toBeUndefined();
  });

  test("roundPct keeps one decimal under 10%", () => {
    expect([roundPct(0.44), roundPct(-6.36), roundPct(12.6)]).toEqual([0.4, -6.4, 13]);
  });
});

describe("reports", () => {
  test("a month is compared with the last snapshot before it", () => {
    const days = [snap("2026-10-30", 100), snap("2026-11-01", 101), snap("2026-11-20", 110)];
    const [oct, nov] = reportMonths(days, "2026-11-21");
    expect(oct).toMatchObject({ month: "2026-10", complete: true, base: undefined });
    expect(nov).toMatchObject({ month: "2026-11", complete: false, clipped: false });
    expect(nov!.base!.date).toBe("2026-10-30");
    expect(nov!.end.date).toBe("2026-11-20");
  });

  test("the base moves past a coverage jump inside the month", () => {
    const days = [snap("2026-11-02", 6449), snap("2026-11-03", 52402), snap("2026-11-12", 53250)];
    const [nov] = reportMonths(days, "2026-11-12");
    expect(nov).toMatchObject({ clipped: true, first: { date: "2026-11-02" } });
    expect(nov!.base!.date).toBe("2026-11-03");
  });

  test("a base under 7 days before the month's end is left out", () => {
    const [nov] = reportMonths([snap("2026-11-03", 100), snap("2026-11-05", 98)], "2026-11-05");
    expect(nov!.base).toBeUndefined();
  });

  test("rows sort by the month's end and biggestMoves picks the largest changes", () => {
    const rows = reportRows({ a: 10, b: 30, c: 20 }, { a: 15, b: 20 }, (key) => ({ label: key.toUpperCase() }));
    expect(rows.map((r) => [r.key, r.from])).toEqual([["b", 20], ["c", undefined], ["a", 15]]);
    const { up, down } = biggestMoves(rows);
    expect([up?.key, down?.key]).toEqual(["b", "a"]);
  });
});
