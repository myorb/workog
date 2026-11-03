import { categorize, isRemote, sanitizeDescription, toIso } from "../../src/lib/normalize.ts";
import { getJson } from "./http.ts";
import { requireToken } from "./greenhouse.ts";
import type { Fetcher } from "./types.ts";

/** Shape of a job from the public Ashby Job Posting API. */
interface AshbyJob {
  id: string;
  title: string;
  department?: string | null;
  team?: string | null;
  location: string;
  secondaryLocations?: { location: string }[];
  publishedAt?: string | null;
  isListed: boolean;
  isRemote?: boolean | null;
  workplaceType?: string | null;
  jobUrl: string;
  descriptionHtml: string;
}

export const ashby: Fetcher<AshbyJob> = {
  name: "ashby",

  async fetch(company) {
    const token = requireToken(company);
    // one response with every job, no pagination
    const data = await getJson<{ jobs: AshbyJob[] }>(
      `https://api.ashbyhq.com/posting-api/job-board/${encodeURIComponent(token)}`,
    );
    return data.jobs.filter((j) => j.isListed);
  },

  normalize(raw, company) {
    const locations = [...new Set([raw.location, ...(raw.secondaryLocations ?? []).map((l) => l.location)])].filter(Boolean);
    const department = raw.department ?? raw.team ?? undefined;
    return {
      id: `ashby:${raw.id}`,
      originalId: raw.id,
      company: company.key,
      title: raw.title.trim(),
      locations,
      remote: raw.workplaceType === "Remote" || isRemote(raw.title, ...locations),
      department,
      category: categorize(raw.title, department),
      descriptionHtml: sanitizeDescription(raw.descriptionHtml ?? ""),
      applyUrl: raw.jobUrl,
      postedAt: toIso(raw.publishedAt),
      source: "ashby",
    };
  },
};
