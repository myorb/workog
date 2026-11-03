import { categorize, isRemote, sanitizeDescription } from "../../src/lib/normalize.ts";
import { requireToken } from "./greenhouse.ts";
import { getJson } from "./http.ts";
import type { Fetcher } from "./types.ts";

/** Shape of a posting from the public Lever Postings API. */
interface LeverJob {
  id: string;
  text: string;
  categories: { location?: string; team?: string; department?: string; allLocations?: string[] };
  /** milliseconds since the epoch */
  createdAt?: number;
  description: string;
  lists?: { text: string; content: string }[];
  additional?: string;
  workplaceType?: string;
  hostedUrl: string;
}

/** postings per request; a full board in one response can run past the timeout */
const PAGE_SIZE = 100;

export const lever: Fetcher<LeverJob> = {
  name: "lever",

  async fetch(company) {
    const token = encodeURIComponent(requireToken(company));
    const jobs: LeverJob[] = [];
    for (let skip = 0; ; skip += PAGE_SIZE) {
      const page = await getJson<LeverJob[]>(
        `https://api.lever.co/v0/postings/${token}?mode=json&skip=${skip}&limit=${PAGE_SIZE}`,
      );
      jobs.push(...page);
      if (page.length < PAGE_SIZE) return jobs;
    }
  },

  normalize(raw, company) {
    const { categories } = raw;
    const locations = categories.allLocations?.length
      ? categories.allLocations
      : categories.location
        ? [categories.location]
        : [];
    const department = categories.team ?? categories.department;
    const lists = (raw.lists ?? []).map((l) => `<h3>${l.text}</h3><ul>${l.content}</ul>`);
    return {
      id: `lever:${raw.id}`,
      originalId: raw.id,
      company: company.key,
      title: raw.text.trim(),
      locations,
      remote: raw.workplaceType === "remote" || isRemote(raw.text, ...locations),
      department,
      category: categorize(raw.text, department),
      descriptionHtml: sanitizeDescription([raw.description, ...lists, raw.additional ?? ""].join("")),
      applyUrl: raw.hostedUrl,
      postedAt: raw.createdAt ? new Date(raw.createdAt).toISOString() : undefined,
      source: "lever",
    };
  },
};
