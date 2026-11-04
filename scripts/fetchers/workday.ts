import type { CompanyConfig, Job } from "../../src/lib/schema.ts";
import { categorize, isRemote, sanitizeDescription, toIso } from "../../src/lib/normalize.ts";
import { getJson, mapLimit, postJson } from "./http.ts";
import type { Fetcher } from "./types.ts";

/** A job in Workday's search results; the description needs a request of its own. */
interface Listing {
  title: string;
  /** "/job/India-Bengaluru/Senior-Manager_JR2029290" */
  externalPath: string;
}

/** Shape of `jobPostingInfo` from a Workday job page's JSON. */
interface WorkdayJob {
  jobReqId: string;
  title: string;
  jobDescription: string;
  location?: string;
  additionalLocations?: string[];
  /** "2026-11-03" */
  startDate?: string;
  remoteType?: string;
  externalUrl: string;
}

interface Facet {
  facetParameter: string;
  values: { id?: string; count?: number; facetParameter?: string; values?: Facet["values"] }[];
}

interface SearchResponse {
  /** only set on the first page, and never more than CAP */
  total: number;
  jobPostings: Listing[];
  facets: Facet[];
}

/** the most a search returns per page */
const PAGE_SIZE = 20;
/** Workday stops counting at 2,000 and wraps around to the first page past it */
const CAP = 2_000;

/** "https://nvidia.wd5.myworkdayjobs.com/NVIDIAExternalCareerSite" → the site's API base. */
export function apiBase(company: CompanyConfig): string {
  if (!company.careersUrl) throw new Error(`${company.key}: workday source needs careersUrl`);
  const url = new URL(company.careersUrl);
  const tenant = url.hostname.split(".")[0];
  // the path may start with a locale: /en-US/External
  const site = url.pathname.split("/").filter((p) => p && !/^[a-z]{2}-[A-Z]{2}$/.test(p))[0];
  if (!tenant || !site) throw new Error(`${company.key}: can't read tenant and site from ${company.careersUrl}`);
  return `${url.origin}/wday/cxs/${tenant}/${site}`;
}

/** A job seen on an earlier run, kept as stored and given the search result's current title. */
interface KnownJob {
  previous: Job;
  title: string;
}

type RawJob = WorkdayJob | KnownJob;

/** "https://…/NVIDIAExternalCareerSite/job/US-CA-Santa-Clara/Engineer_JR1" → "/job/US-CA-Santa-Clara/Engineer_JR1" */
const pathOf = (url: string) => {
  const i = url.indexOf("/job/");
  return i < 0 ? undefined : url.slice(i);
};

/**
 * Splits the search results into jobs stored on an earlier run, matched by
 * their posting's path, and the paths whose details still have to be fetched.
 */
export function splitKnown(listings: Listing[], previous: Job[]): { known: KnownJob[]; missing: string[] } {
  const byPath = new Map<string, Job>();
  for (const job of previous) {
    const path = pathOf(job.applyUrl);
    if (path && job.descriptionHtml) byPath.set(path, job);
  }
  const known: KnownJob[] = [];
  const missing: string[] = [];
  const seen = new Set<string>();
  for (const { title, externalPath } of listings) {
    // under load Workday now and then returns a listing without its path; the sanity check catches a big loss
    if (!externalPath || seen.has(externalPath)) continue;
    seen.add(externalPath);
    const previous = byPath.get(externalPath);
    if (previous) known.push({ previous, title });
    else missing.push(externalPath);
  }
  return { known, missing };
}

type Filter = Record<string, string[]>;

const search = (base: string, appliedFacets: Filter, offset: number) =>
  postJson<SearchResponse>(`${base}/jobs`, { appliedFacets, limit: PAGE_SIZE, offset, searchText: "" });

/** Every page of every search, in one queue so small searches don't run one at a time. */
async function searchAll(base: string, searches: { filter: Filter; total: number }[]): Promise<Listing[]> {
  const pages = searches.flatMap(({ filter, total }) =>
    Array.from({ length: Math.ceil(total / PAGE_SIZE) }, (_, i) => ({ filter, offset: i * PAGE_SIZE })),
  );
  const results = await mapLimit(pages, 6, async ({ filter, offset }) => (await search(base, filter, offset)).jobPostings);
  return results.flat();
}

/**
 * The facet whose values split the jobs into searches under the cap, covering
 * the most jobs. Location facets come nested one level down.
 */
export function pickSlices(facets: Facet[]): { parameter: string; values: { id: string; count: number }[] } | undefined {
  const flat = facets.flatMap((f) =>
    f.values.some((v) => v.facetParameter) ? f.values.filter((v) => v.facetParameter).map((v) => v as Facet) : [f],
  );
  let best: ReturnType<typeof pickSlices>;
  let bestSum = 0;
  for (const facet of flat) {
    const values = facet.values.filter((v): v is { id: string; count: number } => !!v.id && !!v.count);
    if (!values.length || values.some((v) => v.count >= CAP)) continue;
    const sum = values.reduce((n, v) => n + v.count, 0);
    if (sum > bestSum) [best, bestSum] = [{ parameter: facet.facetParameter, values }, sum];
  }
  return best;
}

export const workday: Fetcher<RawJob> = {
  name: "workday",

  /**
   * Every job in one search when the site has fewer than 2,000; otherwise one
   * search per value of the facet that splits them best. Then one request per
   * job not stored on an earlier run, for its description; a job's path, which
   * holds its requisition id, is the same across runs.
   */
  async fetch(company, previous) {
    const base = apiBase(company);
    const first = await search(base, {}, 0);
    let listings: Listing[];
    if (first.total < CAP) {
      listings = await searchAll(base, [{ filter: {}, total: first.total }]);
    } else {
      const slices = pickSlices(first.facets);
      if (!slices) throw new Error(`${company.key}: ${CAP}+ jobs and no facet splits them under the cap`);
      listings = await searchAll(base, slices.values.map(({ id, count }) => ({ filter: { [slices.parameter]: [id] }, total: count })));
    }
    const { known, missing } = splitKnown(listings, previous);
    const fetched = await mapLimit(missing, 6, async (path) => (await getJson<{ jobPostingInfo: WorkdayJob }>(`${base}${path}`)).jobPostingInfo);
    // one requisition can be posted more than once
    const jobs: RawJob[] = [...known, ...fetched];
    return [...new Map(jobs.map((j) => ["previous" in j ? j.previous.id.split(":").at(-1) : j.jobReqId, j])).values()];
  },

  normalize(raw, company) {
    if ("previous" in raw) {
      const { slug: _s, firstSeenAt: _f, lastSeenAt: _l, closedAt: _c, ...job } = raw.previous;
      const title = raw.title?.trim() || job.title;
      return { ...job, originalId: job.id.split(":").at(-1)!, title, category: categorize(title) };
    }
    const locations = [...new Set([raw.location, ...(raw.additionalLocations ?? [])].filter((l): l is string => !!l))];
    const tenant = new URL(company.careersUrl!).hostname.split(".")[0];
    return {
      id: `workday:${tenant}:${raw.jobReqId}`,
      originalId: raw.jobReqId,
      company: company.key,
      title: raw.title.trim(),
      locations,
      remote: /remote/i.test(raw.remoteType ?? "") || isRemote(raw.title, ...locations),
      category: categorize(raw.title),
      descriptionHtml: sanitizeDescription(raw.jobDescription ?? ""),
      applyUrl: raw.externalUrl,
      postedAt: toIso(raw.startDate),
      source: "workday",
    };
  },
};
