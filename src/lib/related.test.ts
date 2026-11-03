import { expect, test } from "bun:test";
import { buildRings, neighbours } from "./related.ts";
import type { Job } from "./schema.ts";

const job = (id: string, day: number, company = "acme"): Job => ({
  id,
  slug: id,
  company,
  title: "Engineer",
  locations: [],
  remote: false,
  descriptionHtml: "",
  applyUrl: "https://example.com",
  firstSeenAt: new Date(Date.UTC(2026, 10, day)).toISOString(),
  lastSeenAt: new Date(Date.UTC(2026, 10, day)).toISOString(),
  source: "test",
});

const jobs = [job("a", 5), job("b", 4), job("c", 3), job("d", 2), job("other", 1, "globex")];
const ring = buildRings(jobs, (j) => j.company).get("acme");

test("neighbours are the next jobs in the group, newest first, wrapping around", () => {
  expect(neighbours(ring, jobs[0]!, new Set(), 2).map((j) => j.id)).toEqual(["b", "c"]);
  expect(neighbours(ring, jobs[3]!, new Set(), 2).map((j) => j.id)).toEqual(["a", "b"]);
});

test("every job in a group is linked from another job", () => {
  const linked = new Set(jobs.slice(0, 4).flatMap((j) => neighbours(ring, j, new Set(), 1).map((n) => n.id)));
  expect([...linked].sort()).toEqual(["a", "b", "c", "d"]);
});

test("skips excluded jobs and never returns the job itself", () => {
  expect(neighbours(ring, jobs[0]!, new Set(["b"]), 5).map((j) => j.id)).toEqual(["c", "d"]);
});
