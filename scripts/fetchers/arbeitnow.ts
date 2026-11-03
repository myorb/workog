import { categorize, decodeEntities, isRemote, sanitizeDescription, splitLocations } from "../../src/lib/normalize.ts";
import { getJson } from "./http.ts";
import type { Fetcher } from "./types.ts";

/** Shape of a job from Arbeitnow's free public job board API. */
interface ArbeitnowJob {
  slug: string;
  company_name: string;
  title: string;
  /** HTML, entity-escaped */
  description: string;
  remote: boolean;
  url: string;
  tags: string[];
  job_types: string[];
  location: string;
  /** seconds since the epoch */
  created_at: number;
}

interface ArbeitnowPage {
  data: ArbeitnowJob[];
  links: { next: string | null };
}

/** a runaway `next` link must not page forever; the board holds about 20 pages of 300 */
const MAX_PAGES = 100;
/**
 * Many jobs share a `created_at` (they are imported in batches), and the API
 * orders ties differently from request to request, so one pass over the pages
 * repeats some jobs and skips as many. Passes repeat until one finds nothing new.
 */
const MAX_PASSES = 4;

async function fetchPass(): Promise<ArbeitnowJob[]> {
  const jobs: ArbeitnowJob[] = [];
  for (let page = 1; page <= MAX_PAGES; page++) {
    const data = await getJson<ArbeitnowPage>(`https://www.arbeitnow.com/api/job-board-api?page=${page}`);
    jobs.push(...data.data);
    if (!data.links.next || data.data.length === 0) return jobs;
  }
  throw new Error(`arbeitnow: still paging after ${MAX_PAGES} pages`);
}

/** Arbeitnow, a German job board; one feed of many employers, newest first, 300 per page. */
export const arbeitnow: Fetcher<ArbeitnowJob> = {
  name: "arbeitnow",

  async fetch() {
    const bySlug = new Map<string, ArbeitnowJob>();
    for (let pass = 1; pass <= MAX_PASSES; pass++) {
      const before = bySlug.size;
      for (const job of await fetchPass()) if (!bySlug.has(job.slug)) bySlug.set(job.slug, job);
      if (pass > 1 && bySlug.size === before) break;
    }
    return [...bySlug.values()];
  },

  normalize(raw, company) {
    const locations = splitLocations(raw.location).filter((l) => !/^remote$/i.test(l));
    const department = raw.tags[0];
    return {
      id: `arbeitnow:${raw.slug}`,
      originalId: raw.slug,
      company: company.key,
      employer: raw.company_name.trim(),
      title: raw.title.trim(),
      locations,
      remote: raw.remote || isRemote(raw.title, raw.location),
      department,
      category: categorize(raw.title, department),
      descriptionHtml: sanitizeDescription(decodeEntities(raw.description)),
      applyUrl: raw.url,
      postedAt: new Date(raw.created_at * 1000).toISOString(),
      source: "arbeitnow",
    };
  },
};
