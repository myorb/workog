import { expect, test } from "bun:test";
import { jobSummary } from "./job-summary.ts";

test("a tech job's summary: age, technologies, pay, employer trend and nearby jobs", () => {
  expect(
    jobSummary({
      employer: "Stripe",
      postedAt: "2026-11-03T09:00:00.000Z",
      firstSeenAt: "2026-11-03T10:00:00.000Z",
      asOf: "2026-11-20T05:00:00.000Z",
      technologies: ["Ruby", "Go", "Kubernetes"],
      salary: "$180,000–$270,000 a year",
      employerJobs: { name: "Stripe", open: 799, pct: 6.04, days: 18 },
      nearby: { open: 1204, where: "Dublin", medical: false },
    }),
  ).toEqual([
    "Stripe posted this job on Nov 3, 2026. It has been open for 17 days.",
    "The posting names Ruby, Go, and Kubernetes.",
    "It states the pay: $180,000–$270,000 a year.",
    "Stripe has 799 open jobs on Workog, up 6% from 18 days earlier.",
    "Workog lists 1,204 open jobs in Dublin.",
  ]);
});

test("a medical job without a posting date or pay, at a hospital with one job", () => {
  expect(
    jobSummary({
      employer: "Klinikum Nord",
      firstSeenAt: "2026-11-19T10:00:00.000Z",
      asOf: "2026-11-20T05:00:00.000Z",
      technologies: [],
      employerJobs: { name: "Klinikum Nord", open: 1, doctors: true },
      nearby: { open: 309, where: "Bavaria", medical: true, specialty: "Cardiology" },
    }),
  ).toEqual([
    "Workog first found this job on Nov 19, 2026 and has checked every morning since that it is still open.",
    "It doesn't state the pay.",
    "Workog lists 309 open cardiology jobs in Bavaria.",
  ]);
});

test("country names that need it get an article", () => {
  const [, , last] = jobSummary({ employer: "X", firstSeenAt: "2026-11-01T00:00:00Z", asOf: "2026-11-20T00:00:00Z", technologies: [], nearby: { open: 205, where: "United Kingdom", medical: true, specialty: "Psychiatry" } });
  expect(last).toBe("Workog lists 205 open psychiatry jobs in the United Kingdom.");
});

test("a German page gets the summary in German", () => {
  expect(
    jobSummary(
      {
        employer: "Helios Klinikum Erfurt",
        postedAt: "2026-11-03T09:00:00.000Z",
        firstSeenAt: "2026-11-03T10:00:00.000Z",
        asOf: "2026-11-20T05:00:00.000Z",
        technologies: [],
        employerJobs: { name: "Helios Klinikum Erfurt", open: 42, doctors: true },
        nearby: { open: 1309, where: "Thüringen", medical: true, specialty: "Kardiologie" },
      },
      "de",
    ),
  ).toEqual([
    "Helios Klinikum Erfurt hat diese Stelle am 3. Nov. 2026 veröffentlicht. Sie ist seit 17 Tagen ausgeschrieben.",
    "Ein Gehalt ist nicht angegeben.",
    "Helios Klinikum Erfurt hat 42 offene Stellen für Ärztinnen und Ärzte auf Workog.",
    "Workog listet 1.309 offene Stellen im Fachgebiet Kardiologie in Thüringen.",
  ]);
  expect(jobSummary({ employer: "X", firstSeenAt: "2026-11-01T00:00:00Z", asOf: "2026-11-20T00:00:00Z", technologies: [], nearby: { open: 30, where: "Schweiz", medical: true } }, "de").at(-1)).toBe(
    "Workog listet 30 offene Medizin-Jobs in der Schweiz.",
  );
});
