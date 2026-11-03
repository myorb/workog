import { categorize, sanitizeDescription, toIso } from "../../src/lib/normalize.ts";
import { getJson } from "./http.ts";
import type { Fetcher } from "./types.ts";

/** Shape of a job from Working Nomads' public feed. */
interface WorkingNomadsJob {
  /** https://www.workingnomads.com/job/go/<id>/ */
  url: string;
  title: string;
  description: string;
  company_name: string;
  category_name?: string;
  /** a free-text region such as "Europe, LATAM, APAC" */
  location?: string;
  pub_date?: string;
}

/** Working Nomads, a board of remote jobs; the feed lists every open job in one response. */
export const workingnomads: Fetcher<WorkingNomadsJob> = {
  name: "workingnomads",

  async fetch() {
    return getJson<WorkingNomadsJob[]>("https://www.workingnomads.com/api/exposed_jobs/");
  },

  normalize(raw, company) {
    const originalId = raw.url.match(/\/job\/go\/(\d+)/)?.[1] ?? raw.url;
    const location = raw.location?.trim();
    return {
      id: `workingnomads:${originalId}`,
      originalId,
      company: company.key,
      employer: raw.company_name.trim(),
      title: raw.title.trim(),
      // the field also holds time zones ("CET (+/- 3 hours)"), which are no place
      locations: location && !/^(anywhere|global|worldwide)$|time ?zone|\b(CET|UTC|GMT|PST|EST)\b/i.test(location) ? [location] : [],
      remote: true,
      department: raw.category_name,
      category: categorize(raw.title, raw.category_name),
      descriptionHtml: sanitizeDescription(raw.description),
      applyUrl: raw.url,
      postedAt: toIso(raw.pub_date),
      source: "workingnomads",
    };
  },
};
