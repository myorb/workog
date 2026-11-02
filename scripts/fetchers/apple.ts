import { categorize, isRemote, sanitizeDescription, toIso } from "../../src/lib/normalize.ts";
import { getText } from "./http.ts";
import type { Fetcher } from "./types.ts";

/** Shape of a job in the search results jobs.apple.com embeds in its search page. */
interface AppleJob {
  positionId: string;
  postingTitle: string;
  transformedPostingTitle: string;
  /** plain text with blank lines between paragraphs */
  jobSummary: string;
  locations: { city: string; stateProvince: string; countryName: string; name: string }[];
  /** "Nov 02, 2026"; postDateInGMT looks like a date but is the time of the request */
  postingDate: string;
  homeOffice: boolean;
  team?: { teamName: string; teamCode: string };
}

interface SearchData {
  searchResults: AppleJob[];
  totalRecords: number;
}

/** results per page; the site does not let us ask for more */
const PAGE_SIZE = 20;

export const apple: Fetcher<AppleJob> = {
  name: "apple",

  async fetch(company) {
    const limit = company.maxJobs ?? Infinity;
    // a position shared by several teams is listed once per team
    const jobs = new Map<string, AppleJob>();
    // results come newest first by default
    for (let page = 1; jobs.size < limit; page++) {
      const data = parseSearchPage(await getText(`https://jobs.apple.com/en-us/search?page=${page}`));
      for (const job of data.searchResults) if (!jobs.has(job.positionId)) jobs.set(job.positionId, job);
      if (data.searchResults.length < PAGE_SIZE || page * PAGE_SIZE >= data.totalRecords) break;
    }
    return [...jobs.values()].slice(0, limit);
  },

  normalize(raw, company) {
    const locations = [...new Set(raw.locations.map(locationLabel))];
    const paragraphs = raw.jobSummary.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);
    const department = raw.team?.teamName;
    const teamQuery = raw.team ? `?team=${encodeURIComponent(raw.team.teamCode)}` : "";
    return {
      id: `apple:${raw.positionId}`,
      originalId: raw.positionId,
      company: company.key,
      title: raw.postingTitle.trim(),
      locations,
      remote: raw.homeOffice || isRemote(raw.postingTitle, ...locations),
      department,
      category: categorize(raw.postingTitle, department),
      descriptionHtml: sanitizeDescription(paragraphs.map((p) => `<p>${escapeHtml(p).replace(/\n/g, "<br>")}</p>`).join("")),
      applyUrl: `https://jobs.apple.com/en-us/details/${raw.positionId}/${raw.transformedPostingTitle}${teamQuery}`,
      postedAt: toIso(`${raw.postingDate} UTC`),
      source: "apple",
    };
  },
};

/** Pulls the search results out of the React Router hydration data in the page. */
export function parseSearchPage(html: string): SearchData {
  const match = html.match(/__staticRouterHydrationData = JSON\.parse\(("(?:[^"\\]|\\.)*")\)/);
  if (!match) throw new Error("apple: search page has no hydration data");
  const data = JSON.parse(JSON.parse(match[1]!));
  const search = data.loaderData?.search as SearchData | undefined;
  if (!Array.isArray(search?.searchResults)) throw new Error("apple: hydration data has no searchResults");
  return search;
}

/** "Cupertino, California, United States"; country-wide postings are just "Japan" */
function locationLabel(l: AppleJob["locations"][number]): string {
  return [l.city, l.stateProvince, l.countryName].filter(Boolean).join(", ") || l.name;
}

function escapeHtml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
