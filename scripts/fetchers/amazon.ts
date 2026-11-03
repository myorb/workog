import { categorize, isRemote, sanitizeDescription, toIso } from "../../src/lib/normalize.ts";
import { getJson } from "./http.ts";
import type { Fetcher } from "./types.ts";

/** Shape of a job from the amazon.jobs search endpoint. */
interface AmazonJob {
  id_icims: string;
  title: string;
  job_path: string;
  /** JSON strings, one per location */
  locations: string[];
  location: string;
  job_category?: string;
  description: string;
  basic_qualifications?: string;
  preferred_qualifications?: string;
  /** "November  2, 2026" */
  posted_date: string;
}

interface AmazonLocation {
  city?: string;
  region?: string;
  normalizedCountryName?: string;
  type?: string;
}

const SEARCH_URL = "https://www.amazon.jobs/en/search.json";
const PAGE_SIZE = 100;
/** the search endpoint refuses offsets past 10,000, so bigger result sets are fetched in slices */
const MAX_OFFSET = 10_000;

interface SearchResponse {
  hits: number;
  jobs: AmazonJob[];
  facets: Record<string, Record<string, number>[]>;
}

/** Counts per value of `facet` among the jobs matching `filter`. */
async function facetCounts(facet: string, filter: string): Promise<[string, number][]> {
  const data = await getJson<SearchResponse>(`${SEARCH_URL}?result_limit=1${filter}&facets[]=${facet}`);
  return (data.facets[`${facet}_facet`] ?? []).flatMap((entry) => Object.entries(entry));
}

/** Every job matching `filter`; throws if there are more than the endpoint can page through. */
async function searchAll(filter: string): Promise<AmazonJob[]> {
  const jobs: AmazonJob[] = [];
  for (let offset = 0; ; offset += PAGE_SIZE) {
    const data = await getJson<SearchResponse>(
      `${SEARCH_URL}?sort=recent&result_limit=${PAGE_SIZE}&offset=${offset}${filter}`,
    );
    if (data.hits >= MAX_OFFSET) throw new Error(`slice "${filter}" has ${data.hits}+ jobs, more than one search can return`);
    jobs.push(...data.jobs);
    if (data.jobs.length < PAGE_SIZE || offset + PAGE_SIZE >= data.hits) return jobs;
  }
}

export const amazon: Fetcher<AmazonJob> = {
  name: "amazon",

  /**
   * One search per country; a country with too many jobs for one search
   * (the US) is split further by business category.
   */
  async fetch() {
    const jobs = new Map<string, AmazonJob>();
    for (const [country, count] of await facetCounts("normalized_country_code", "")) {
      const filter = `&normalized_country_code[]=${encodeURIComponent(country)}`;
      const slices =
        count < MAX_OFFSET
          ? [filter]
          : (await facetCounts("business_category", filter)).map(
              ([category]) => `${filter}&business_category[]=${encodeURIComponent(category)}`,
            );
      for (const slice of slices) for (const job of await searchAll(slice)) jobs.set(job.id_icims, job);
    }
    return [...jobs.values()];
  },

  normalize(raw, company) {
    const places = raw.locations.map((l) => JSON.parse(l) as AmazonLocation);
    const locations = [...new Set(places.map(locationLabel).filter((l) => l.length > 1))];
    const sections = [
      `<p>${raw.description}</p>`,
      raw.basic_qualifications && `<h3>Basic qualifications</h3><p>${raw.basic_qualifications}</p>`,
      raw.preferred_qualifications && `<h3>Preferred qualifications</h3><p>${raw.preferred_qualifications}</p>`,
    ];
    return {
      id: `amazon:${raw.id_icims}`,
      originalId: raw.id_icims,
      company: company.key,
      title: raw.title.trim(),
      locations: locations.length ? locations : [raw.location],
      remote: places.some((p) => p.type === "VIRTUAL") || isRemote(raw.location, raw.title),
      department: raw.job_category,
      category: categorize(raw.title, raw.job_category),
      descriptionHtml: sanitizeDescription(sections.filter(Boolean).join("")),
      applyUrl: `https://www.amazon.jobs${raw.job_path}`,
      postedAt: toIso(`${raw.posted_date.replace(/\s+/g, " ")} UTC`),
      source: "amazon",
    };
  },
};

/** "Seattle, WA, United States", the "City, Region, Country" style other sources use. */
function locationLabel(place: AmazonLocation): string {
  return [place.city, place.region, place.normalizedCountryName].filter(Boolean).join(", ");
}
