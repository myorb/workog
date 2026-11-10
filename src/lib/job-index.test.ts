import { expect, test } from "bun:test";
import { medicineRow, techRow } from "./job-index.ts";
import type { Job } from "./schema.ts";

const job = (fields: Partial<Job>): Job => ({
  id: "test:1",
  slug: "engineer-1",
  company: "acme",
  title: "Engineer",
  locations: [],
  remote: false,
  descriptionHtml: "",
  applyUrl: "https://example.com",
  firstSeenAt: "2026-11-05T05:00:00.000Z",
  lastSeenAt: "2026-11-09T05:00:00.000Z",
  source: "test",
  ...fields,
});

test("a tech row carries its tags and dates, and leaves out empty fields", () => {
  const row = techRow(job({ id: "test:2", title: "Senior Rust Engineer", locations: ["Berlin, Germany"], postedAt: "2026-11-04T10:00:00.000Z", category: "engineering" }));
  expect(row).toMatchObject({ slug: "engineer-1", firstSeen: "2026-11-05", posted: "2026-11-04", category: "engineering", employment: "full-time", cities: ["berlin"], countries: ["germany"] });
  expect(row.technologies).toContain("rust");
  expect(row).not.toHaveProperty("employer");
  expect(techRow(job({ id: "test:3" }))).toMatchObject({ countries: undefined, cities: undefined, technologies: undefined });
});

test("a medicine row places the job by state", () => {
  const row = medicineRow(job({ id: "test:4", category: "medicine", specialty: "cardiology", level: "resident", employer: "Klinikum Nord", locations: ["Essen, Nordrhein-Westfalen, Germany"] }));
  expect(row).toMatchObject({ employer: "Klinikum Nord", specialty: "cardiology", level: "resident", country: "germany", state: "north-rhine-westphalia", city: "Essen" });
});

test("the rows never carry the description", () => {
  expect(JSON.stringify(techRow(job({ descriptionHtml: "<p>secret sauce</p>" })))).not.toContain("secret sauce");
});
