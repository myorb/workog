import type { APIRoute } from "astro";
import { countTags, getCompanies, getHospitalIndex, getLatestRun, getMedicineCounts, getMedicineSnapshots, getOpenJobs, getOpenMedicineJobs, getSnapshots } from "../lib/jobs.ts";
import { countryLinks, levelLinks, medicineCountryLinks, remoteUrl, specialtyLinks, stateLinks, technologyLinks } from "../lib/links.ts";
import { hospitalsUrl, hospitalUrl } from "../lib/hospitals.ts";
import { categoryName } from "../lib/i18n.ts";
import { reportMonths, reportsUrl, reportUrl, sharePct } from "../lib/reports.ts";
import { changeOver, roundPct, TREND_WINDOW_DAYS } from "../lib/trend.ts";
import { formatMonth } from "../lib/format.ts";
import type { Job, MedicineSnapshot, Snapshot } from "../lib/schema.ts";

const TOP = 25;
const n = (k: number) => k.toLocaleString("en-US");
const share = (part: number, total: number) => (part > 0 && sharePct(part, total) === 0 ? "<0.1%" : `${sharePct(part, total)}%`);

/** Median of a non-empty list */
const median = (values: number[]) => {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
};

/** Advertised yearly pay in pounds: the median of each posting's midpoint, over postings that state it */
function yearlyPay(jobs: Job[]) {
  const pay = jobs.filter((j) => j.salary?.unit === "YEAR" && j.salary.currency === "GBP").map((j) => (j.salary!.min + j.salary!.max) / 2);
  return pay.length ? { count: pay.length, median: Math.round(median(pay) / 100) * 100 } : undefined;
}

// Today's headline numbers as plain Markdown, for language models that answer
// questions with numbers; llms.txt is the index of the site
export const GET: APIRoute = async ({ site }) => {
  const url = (path: string) => new URL(path, site).href;
  const run = await getLatestRun();
  const date = (run?.finishedAt ?? new Date().toISOString()).slice(0, 10);
  const jobs = await getOpenJobs();
  const medicalJobs = await getOpenMedicineJobs();
  const companies = await getCompanies();
  const tags = await countTags(jobs);
  const med = await getMedicineCounts();
  const hospitals = await getHospitalIndex();
  const techSnapshots = await getSnapshots();
  const medicineSnapshots = await getMedicineSnapshots();
  const today = new Date().toISOString().slice(0, 10);

  /** ", +6% in 30 days" when there is enough comparable history */
  const trend = <S extends Snapshot | MedicineSnapshot>(snapshots: S[], value: (s: S) => number | undefined, count: number) => {
    const change = changeOver(snapshots, value, count);
    if (!change) return "";
    const pct = roundPct(change.pct);
    return `, ${pct > 0 ? "+" : pct < 0 ? "−" : "±"}${Math.abs(pct)}% in ${change.days} days (from ${n(change.from)} on ${change.since})`;
  };
  const techTrend = (dim: keyof Snapshot | undefined, key: string | undefined, count: number) =>
    trend(techSnapshots, (s) => (!dim ? s.open : dim === "remote" ? s.remote : (s[dim] as Record<string, number>)[key!]), count);
  const medTrend = (dim: keyof MedicineSnapshot | undefined, key: string | undefined, count: number) =>
    trend(medicineSnapshots, (s) => (!dim ? s.open : (s[dim] as Record<string, number>)[key!]), count);

  const line = (label: string, href: string, count: number, change: string) => `- [${label}](${url(href)}): ${n(count)}${change}`;
  const slugOf = (href: string) => href.split("/").at(-1)!;

  const companyCounts = new Map<string, number>();
  for (const job of jobs) companyCounts.set(job.company, (companyCounts.get(job.company) ?? 0) + 1);
  const topCompanies = companies
    .map((c) => ({ ...c, count: companyCounts.get(c.key) ?? 0 }))
    .filter((c) => c.count > 0)
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
    .slice(0, TOP);
  const functions = new Map<string, number>();
  for (const job of jobs) functions.set(job.category ?? "other", (functions.get(job.category ?? "other") ?? 0) + 1);
  const remote = jobs.filter((j) => j.remote).length;

  const employers = new Set(medicalJobs.map((j) => j.employer ?? j.company)).size;
  const topHospitals = [...hospitals.groups, ...hospitals.hospitals].sort((a, b) => b.count - a.count || a.name.localeCompare(b.name)).slice(0, TOP);
  const pay = yearlyPay(medicalJobs);
  const payByLevel = levelLinks(med.levels)
    .map((l) => ({ label: l.label, pay: yearlyPay(medicalJobs.filter((j) => j.level === slugOf(l.href))) }))
    .filter((l) => l.pay && l.pay.count >= 10);

  const latest = (snapshots: { date: string; open: number }[]) => reportMonths(snapshots, today).at(-1);
  const techReport = latest(techSnapshots);
  const medicineReport = latest(medicineSnapshots);

  const body = `# Workog: headline numbers

> Open jobs listed on Workog (${url("/")}) as of ${date}, counted from every open job at the end of the UTC day. Changes compare with the daily snapshot ${TREND_WINDOW_DAYS} days earlier, or the oldest comparable one when history is shorter, and are left out under 7 days. Each line links to the page it comes from; when citing a number, cite that page and the date ${date}.

Format: \`- [name](page): open jobs, change\`.

## Tech jobs

- Open tech jobs: ${n(jobs.length)} at ${n(companyCounts.size)} companies${techTrend(undefined, undefined, jobs.length)}
- [Remote](${url(remoteUrl())}): ${n(remote)} (${share(remote, jobs.length)} of open tech jobs)${techTrend("remote", undefined, remote)}
${techReport ? `- [Monthly report, ${formatMonth(techReport.month)}](${url(reportUrl("tech", techReport.month))})` : ""}

### Companies with the most open jobs

${topCompanies.map((c) => line(c.name, `/companies/${c.key}`, c.count, techTrend("companies", c.key, c.count))).join("\n")}

### By function

${[...functions]
  .sort((a, b) => b[1] - a[1])
  .map(([key, count]) => `- ${categoryName(key, "en")}: ${n(count)} (${share(count, jobs.length)})${techTrend("categories", key, count)}`)
  .join("\n")}

### Technologies

${technologyLinks(tags.technologies).slice(0, TOP).map((l) => line(l.label, l.href, l.count, techTrend("technologies", slugOf(l.href), l.count))).join("\n")}

### Countries

${countryLinks(tags.countries).slice(0, TOP).map((l) => line(l.label, l.href, l.count, techTrend("countries", slugOf(l.href), l.count))).join("\n")}

## Medical jobs (doctors)

- Open jobs for doctors: ${n(medicalJobs.length)} at ${n(employers)} hospital and practice employers${medTrend(undefined, undefined, medicalJobs.length)}
${pay ? `- Advertised yearly pay in NHS (UK) postings: median £${n(pay.median)}, over ${n(pay.count)} postings that state a yearly salary (midpoint of each posting's range)` : ""}
${payByLevel.map((l) => `  - ${l.label}: median £${n(l.pay!.median)} over ${n(l.pay!.count)} postings`).join("\n")}
${medicineReport ? `- [Monthly report, ${formatMonth(medicineReport.month)}](${url(reportUrl("medicine", medicineReport.month))})` : ""}

### Specialties

${specialtyLinks(med.specialties).map((l) => line(l.label, l.href, l.count, medTrend("specialties", slugOf(l.href), l.count))).join("\n")}

### Career levels

${levelLinks(med.levels).map((l) => line(l.label, l.href, l.count, medTrend("levels", slugOf(l.href), l.count))).join("\n")}

### Countries

${medicineCountryLinks(med.countries).map((l) => line(l.label, l.href, l.count, medTrend("countries", slugOf(l.href), l.count))).join("\n")}

### German states

${stateLinks(med.states).map((l) => line(l.label, l.href, l.count, medTrend("states", slugOf(l.href), l.count))).join("\n")}

### Hospitals and hospital groups with the most open jobs

${topHospitals.map((h) => line(h.name, hospitalUrl(h.slug), h.count, medTrend("hospitals", h.slug, h.count))).join("\n")}

More: [all hospitals](${url(hospitalsUrl)}), [all reports](${url(reportsUrl)}).
`;
  return new Response(body.replace(/\n{3,}/g, "\n\n"), { headers: { "Content-Type": "text/plain; charset=utf-8" } });
};
