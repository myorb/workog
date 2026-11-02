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

const PAGE_SIZE = 100;
/** the search endpoint refuses offsets past 10,000 */
const MAX_OFFSET = 10_000;

export const amazon: Fetcher<AmazonJob> = {
  name: "amazon",

  async fetch(company) {
    const limit = Math.min(company.maxJobs ?? MAX_OFFSET, MAX_OFFSET);
    const jobs: AmazonJob[] = [];
    for (let offset = 0; offset < limit; offset += PAGE_SIZE) {
      const data = await getJson<{ hits: number; jobs: AmazonJob[] }>(
        `https://www.amazon.jobs/en/search.json?sort=recent&result_limit=${PAGE_SIZE}&offset=${offset}`,
      );
      jobs.push(...data.jobs);
      if (data.jobs.length < PAGE_SIZE || offset + PAGE_SIZE >= data.hits) break;
    }
    return jobs.slice(0, limit);
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
