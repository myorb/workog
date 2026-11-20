import { describe, expect, test } from "bun:test";
import {
  insightKinds,
  insightSentences,
  insightText,
  outpacedInsight,
  rankInsight,
  ranked,
  recordInsight,
  shareInsight,
  streakInsight,
  topInsight,
  variant,
  type Insight,
} from "./insights.ts";
import { locales } from "./locale.ts";
import { t } from "./i18n.ts";

const days = (values: number[], start = "2026-11-01") =>
  values.map((value, i) => ({ date: new Date(Date.parse(start) + i * 86_400_000).toISOString().slice(0, 10), value }));

describe("patterns", () => {
  test("a record needs two weeks of history and a strict new high or low", () => {
    expect(recordInsight(days([5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 30]))).toMatchObject({ kind: "record", high: true, days: 14 });
    expect(recordInsight(days([5, 6, 7, 30]))).toBeUndefined();
    expect(recordInsight(days([30, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 30]))).toBeUndefined();
    expect(recordInsight(days([30, 26, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36, 37, 38, 20]))).toMatchObject({ high: false });
  });

  test("a streak counts days in a row up to today, from five", () => {
    expect(streakInsight([10, 9, 10, 11, 12, 13, 14])).toMatchObject({ kind: "streak", up: true, days: 5 });
    expect(streakInsight([10, 11, 12, 13, 14])).toBeUndefined();
    expect(streakInsight([20, 19, 18, 17, 16, 15])).toMatchObject({ up: false, days: 5 });
    expect(streakInsight([10, 11, 12, 12, 13, 14, 15])).toBeUndefined();
  });

  test("rank among peers, top ten only", () => {
    const peers = { a: 50, b: 40, c: 30, d: 0 };
    expect(rankInsight(peers, "b", "companies")).toMatchObject({ rank: 2, of: 3 });
    expect(rankInsight(new Map(Array.from({ length: 20 }, (_, i) => [`k${i}`, 100 - i])), "k15", "companies")).toBeUndefined();
  });

  test("share, outpacing and the largest part", () => {
    expect(shareInsight(2, 100, "tech")).toBeUndefined();
    expect(shareInsight(23, 100, "medicine")).toMatchObject({ pct: 23 });
    const change = (pct: number) => ({ from: 100, to: 100 + pct, since: "2026-10-21", days: 30, pct });
    expect(outpacedInsight(change(12), change(3), "tech")).toMatchObject({ pct: 12, totalPct: 3 });
    expect(outpacedInsight(change(4), change(3), "tech")).toBeUndefined();
    expect(topInsight(new Map([["Berlin", 30], ["Munich", 10]]), 40, (k) => k)).toMatchObject({ label: "Berlin", pct: 75 });
  });

  test("ranked keeps the strongest first", () => {
    const all = ranked([shareInsight(5, 100, "tech"), undefined, rankInsight({ a: 3, b: 2, c: 1 }, "a", "companies")]);
    expect(all.map((i) => i.kind)).toEqual(["rank", "share"]);
  });
});

describe("wording", () => {
  const samples: Insight[] = [
    { kind: "record", high: true, days: 30, score: 1 },
    { kind: "streak", up: false, days: 6, score: 1 },
    { kind: "rank", rank: 2, of: 74, peers: "companies", score: 1 },
    { kind: "share", pct: 6, section: "tech", score: 1 },
    { kind: "outpaced", pct: 12, totalPct: 3, days: 30, section: "medicine", score: 1 },
    { kind: "top", label: "Berlin", count: 312, pct: 10, score: 1 },
  ];

  test("every pattern has a template in every language", () => {
    expect(samples.map((s) => s.kind).sort()).toEqual([...insightKinds].sort());
    for (const lang of locales) {
      for (const kind of insightKinds) expect(t(lang).insights[kind].length).toBeGreaterThan(0);
      for (const s of samples) expect(insightText(s, "Google", lang)).toMatch(/\S.*[.!]$/);
    }
  });

  test("reads naturally in English", () => {
    expect(insightText(samples[2]!, "Google", "en", "x")).toMatch(/^Google (ranks #2 of 74 tech companies by open jobs|is #2 by open jobs among 74 tech companies)\.$/);
    expect(insightText(samples[4]!, "Psychiatry", "en")).toBe("Psychiatry grew 12% in 30 days, ahead of doctor jobs overall (+3%).");
  });

  test("the wording is stable per subject", () => {
    expect(variant("google", 2)).toBe(variant("google", 2));
    expect(insightSentences(samples, "Google", "en", "google")).toEqual(insightSentences(samples, "Google", "en", "google"));
    expect(insightSentences(samples, "Google", "en", "google")).toHaveLength(3);
  });
});
