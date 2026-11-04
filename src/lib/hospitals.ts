/**
 * Hospitals and practices for the /medicine/hospitals pages: each medical
 * job's employer, grouped under one name however the source spells its legal
 * form, plus the hospital groups whose own careers sites we fetch.
 */
import type { Job } from "./schema.ts";
import { slugify } from "./normalize.ts";

/** Employers get a page of their own from this many open jobs; smaller ones are only named on their jobs */
export const MIN_HOSPITAL_JOBS = 5;

export const hospitalsUrl = "/medicine/hospitals";
export const hospitalUrl = (slug: string) => `${hospitalsUrl}/${slug}`;

// Legal forms, which sources add or leave out for the same hospital ("Helios Klinikum Erfurt GmbH" / "Helios Klinikum Erfurt")
const LEGAL_FORMS =
  /\b(g?gmbh|mbh|gbr|ohg|ug|kgaa|kg|ag|se|b\.\s?v\.|e\.\s?v\.|kd[öo]r|a[öo]r|a\.\s?[öo]\.\s?r\.|stiftung bürgerlichen rechts)(?=\s|$|,)/gi;

/** The page slug for an employer name: its words without the legal form. */
export const hospitalKey = (name: string) => slugify(name.replace(/&\s*co\.?(?=\s|$)/gi, " ").replace(LEGAL_FORMS, " "));

/** Names as sources write them, with runs of spaces collapsed ("Johanniter  GmbH"). */
const tidy = (name: string) => name.replace(/\s+/g, " ").trim();

export interface Hospital {
  slug: string;
  /** the most common spelling among its jobs */
  name: string;
  count: number;
  /** the company key of the hospital group it belongs to, when its jobs come from the group's own site */
  group?: string;
}

export interface HospitalGroup {
  /** the company key, which is also its page slug */
  slug: string;
  name: string;
  count: number;
  /** its hospitals with a page of their own, most jobs first */
  hospitals: Hospital[];
}

export interface HospitalIndex {
  /** employers with at least MIN_HOSPITAL_JOBS open jobs, most jobs first; never a group's slug */
  hospitals: Hospital[];
  groups: HospitalGroup[];
  /** employer name → page slug, for the employers that have a page */
  slugByName: Map<string, string>;
}

/**
 * Counts open medical jobs per employer and per hospital group. `groups` are
 * the companies marked `group` in data/companies.json, by key.
 */
export function indexHospitals(jobs: Pick<Job, "employer" | "company">[], groups: Map<string, string>): HospitalIndex {
  const byKey = new Map<string, { count: number; names: Map<string, number>; companies: Map<string, number> }>();
  const groupCounts = new Map<string, number>();
  for (const job of jobs) {
    if (groups.has(job.company)) groupCounts.set(job.company, (groupCounts.get(job.company) ?? 0) + 1);
    if (!job.employer) continue;
    const name = tidy(job.employer);
    const key = hospitalKey(name);
    if (!key) continue;
    const entry = byKey.get(key) ?? { count: 0, names: new Map(), companies: new Map() };
    entry.count++;
    entry.names.set(name, (entry.names.get(name) ?? 0) + 1);
    entry.companies.set(job.company, (entry.companies.get(job.company) ?? 0) + 1);
    byKey.set(key, entry);
  }

  const mostCommon = (counts: Map<string, number>) => [...counts].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]![0];
  const hospitals: Hospital[] = [];
  const slugByName = new Map<string, string>();
  for (const [slug, entry] of byKey) {
    // a group's page owns its slug
    if (entry.count < MIN_HOSPITAL_JOBS || groups.has(slug)) continue;
    const company = mostCommon(entry.companies);
    hospitals.push({ slug, name: mostCommon(entry.names), count: entry.count, group: groups.has(company) ? company : undefined });
    for (const name of entry.names.keys()) slugByName.set(name, slug);
  }
  hospitals.sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));

  const hospitalGroups = [...groups]
    .map(([slug, name]) => ({ slug, name, count: groupCounts.get(slug) ?? 0, hospitals: hospitals.filter((h) => h.group === slug) }))
    .filter((g) => g.count > 0)
    .sort((a, b) => b.count - a.count);
  return { hospitals, groups: hospitalGroups, slugByName };
}

/** The page slug of a job's employer, if it has a page. */
export const hospitalSlugOf = (index: HospitalIndex, employer: string | undefined) =>
  employer ? index.slugByName.get(tidy(employer)) : undefined;
