import type { CompanyConfig } from "../../src/lib/schema.ts";
import { categorize, isRemote, sanitizeDescription } from "../../src/lib/normalize.ts";
import { getJson, mapLimit } from "./http.ts";
import type { Fetcher } from "./types.ts";

/** Shape of a position from an Eightfold careers site's public API (Netflix). */
interface EightfoldJob {
  id: number;
  name: string;
  /** "Berlin,Germany" */
  locations: string[];
  department?: string;
  /** seconds since the epoch */
  t_create?: number;
  /** "onsite", "remote" or "hybrid" */
  work_location_option?: string;
  /** empty in search results, filled in by the position endpoint */
  job_description: string;
  canonicalPositionUrl: string;
}

/** the API ignores bigger page sizes */
const PAGE_SIZE = 10;

/** "https://explore.jobs.netflix.net/careers?domain=netflix.com" → its origin and domain. */
function site(company: CompanyConfig): { origin: string; domain: string } {
  if (!company.careersUrl) throw new Error(`${company.key}: eightfold source needs careersUrl`);
  const url = new URL(company.careersUrl);
  const domain = url.searchParams.get("domain");
  if (!domain) throw new Error(`${company.key}: careersUrl needs a ?domain= parameter`);
  return { origin: url.origin, domain };
}

export const eightfold: Fetcher<EightfoldJob> = {
  name: "eightfold",

  async fetch(company) {
    const { origin, domain } = site(company);
    const api = `${origin}/api/apply/v2/jobs`;
    const list = (start: number) =>
      getJson<{ count: number; positions: EightfoldJob[] }>(`${api}?domain=${domain}&start=${start}&num=${PAGE_SIZE}`);
    const first = await list(0);
    const starts = Array.from({ length: Math.ceil(first.count / PAGE_SIZE) - 1 }, (_, i) => (i + 1) * PAGE_SIZE);
    const rest = await mapLimit(starts, 2, async (start) => (await list(start)).positions);
    const ids = [...new Set([first.positions, ...rest].flat().map((p) => p.id))];
    return mapLimit(ids, 2, (id) => getJson<EightfoldJob>(`${api}/${id}?domain=${domain}`));
  },

  normalize(raw, company) {
    const locations = [...new Set(raw.locations.map((l) => l.replace(/\s*,\s*/g, ", ")))];
    return {
      id: `eightfold:${raw.id}`,
      originalId: String(raw.id),
      company: company.key,
      title: raw.name.trim(),
      locations,
      remote: raw.work_location_option === "remote" || isRemote(raw.name, ...locations),
      department: raw.department || undefined,
      category: categorize(raw.name, raw.department),
      descriptionHtml: sanitizeDescription(raw.job_description ?? ""),
      applyUrl: raw.canonicalPositionUrl,
      postedAt: raw.t_create ? new Date(raw.t_create * 1000).toISOString() : undefined,
      source: "eightfold",
    };
  },
};
