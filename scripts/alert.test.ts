import { expect, test } from "bun:test";
import type { SourceRun } from "../src/lib/schema.ts";
import { formatRunAlert } from "./alert.ts";

const source = (company: string, extra: Partial<SourceRun> = {}): SourceRun => ({
  company,
  source: "greenhouse",
  status: "ok",
  fetched: 10,
  invalid: 0,
  open: 10,
  new: 0,
  closed: 0,
  fallbackStreak: 0,
  broken: false,
  ...extra,
});

test("no alert when every source is ok", () => {
  expect(formatRunAlert({ startedAt: "2026-11-02T05:00:00.000Z", sources: [source("a")] })).toBeUndefined();
});

test("lists fallbacks and escalates broken sources", () => {
  const text = formatRunAlert({
    startedAt: "2026-11-02T05:00:00.000Z",
    sources: [
      source("healthy"),
      source("b", { status: "fallback", reason: "fetch failed: HTTP 500", fallbackStreak: 1 }),
      source("c", { status: "fallback", reason: "source returned 0 valid jobs", fallbackStreak: 3, broken: true }),
    ],
  })!;
  expect(text).toContain("2 source(s) fell back");
  expect(text).toContain("⚠️ b (greenhouse): fetch failed: HTTP 500");
  expect(text).toContain("🚨 BROKEN c");
  expect(text).toContain("3 runs in a row");
  expect(text).not.toContain("healthy");
});
