import { categorize, isRemote, sanitizeDescription, slugify } from "../../src/lib/normalize.ts";
import { getText } from "./http.ts";
import type { Fetcher } from "./types.ts";

/**
 * A job as Google's careers site embeds it in the `ds:1` data block of its
 * results page: a positional array, not an object. Only the indexes we read
 * are named here.
 */
type GoogleJobRow = unknown[];

interface GoogleJob {
  id: string;
  title: string;
  responsibilitiesHtml: string;
  qualificationsHtml: string;
  aboutHtml: string;
  locations: string[];
  /** seconds since the epoch the posting was last published; the site sorts by it */
  publishedAt?: number;
}

/** results per page; the site does not let us ask for more */
const PAGE_SIZE = 20;

export const google: Fetcher<GoogleJob> = {
  name: "google",

  async fetch(company) {
    const limit = company.maxJobs ?? Infinity;
    const jobs: GoogleJob[] = [];
    for (let page = 1; jobs.length < limit; page++) {
      const { rows, total } = parseResultsPage(
        await getText(`https://www.google.com/about/careers/applications/jobs/results?sort_by=date&page=${page}`),
      );
      jobs.push(...rows.map(toJob));
      if (rows.length < PAGE_SIZE || page * PAGE_SIZE >= total) break;
    }
    return jobs.slice(0, limit);
  },

  normalize(raw, company) {
    const sections = [
      raw.aboutHtml,
      raw.responsibilitiesHtml && `<h3>Responsibilities</h3>${raw.responsibilitiesHtml}`,
      raw.qualificationsHtml,
    ];
    return {
      id: `google:${raw.id}`,
      originalId: raw.id,
      company: company.key,
      title: raw.title.trim(),
      locations: raw.locations,
      remote: isRemote(raw.title, ...raw.locations),
      category: categorize(raw.title),
      descriptionHtml: sanitizeDescription(sections.filter(Boolean).join("")),
      applyUrl: `https://www.google.com/about/careers/applications/jobs/results/${raw.id}-${slugify(raw.title)}`,
      postedAt: raw.publishedAt ? new Date(raw.publishedAt * 1000).toISOString() : undefined,
      source: "google",
    };
  },
};

/** Pulls the job rows and the total count out of the page's `ds:1` AF_initDataCallback block. */
export function parseResultsPage(html: string): { rows: GoogleJobRow[]; total: number } {
  const match = html.match(/AF_initDataCallback\(\{key: 'ds:1', hash: '\d+', data:([\s\S]*?), sideChannel: \{\}\}\);<\/script>/);
  if (!match) throw new Error("google: results page has no ds:1 data block");
  const data = JSON.parse(match[1]!) as [GoogleJobRow[] | null, unknown, number];
  return { rows: data[0] ?? [], total: data[2] };
}

const html = (field: unknown) => (Array.isArray(field) && typeof field[1] === "string" ? field[1] : "");

function toJob(row: GoogleJobRow): GoogleJob {
  const locations = Array.isArray(row[9]) ? (row[9] as unknown[][]).map((l) => String(l[0])) : [];
  const published = row[14] as [number, number] | null;
  return {
    id: String(row[0]),
    title: String(row[1]),
    responsibilitiesHtml: html(row[3]),
    qualificationsHtml: html(row[4]),
    aboutHtml: html(row[10]),
    locations,
    publishedAt: published?.[0],
  };
}
