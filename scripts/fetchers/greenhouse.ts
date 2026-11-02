import type { CompanyConfig } from "../../src/lib/schema.ts";
import {
  categorize,
  decodeEntities,
  isRemote,
  sanitizeDescription,
  splitLocations,
  toIso,
} from "../../src/lib/normalize.ts";
import { getJson } from "./http.ts";
import type { Fetcher } from "./types.ts";

/** Shape of a job from the public Greenhouse Job Board API (`?content=true`). */
interface GreenhouseJob {
  id: number;
  title: string;
  absolute_url: string;
  location: { name: string } | null;
  updated_at: string;
  first_published?: string | null;
  content: string;
  departments: { name: string }[];
  offices: { name: string }[];
}

export const greenhouse: Fetcher<GreenhouseJob> = {
  name: "greenhouse",

  async fetch(company) {
    const token = requireToken(company);
    // the board API returns every job in one response, no pagination
    const data = await getJson<{ jobs: GreenhouseJob[] }>(
      `https://boards-api.greenhouse.io/v1/boards/${encodeURIComponent(token)}/jobs?content=true`,
    );
    return data.jobs;
  },

  normalize(raw, company) {
    const locationText = raw.location?.name;
    const locations = splitLocations(locationText);
    const department = raw.departments[0]?.name;
    return {
      id: `greenhouse:${raw.id}`,
      originalId: String(raw.id),
      company: company.key,
      title: raw.title.trim(),
      locations: locations.length ? locations : raw.offices.map((o) => o.name),
      remote: isRemote(locationText, raw.title),
      department,
      category: categorize(raw.title, department),
      descriptionHtml: sanitizeDescription(decodeEntities(raw.content ?? "")),
      applyUrl: raw.absolute_url,
      postedAt: toIso(raw.first_published),
      source: "greenhouse",
    };
  },
};

function requireToken(company: CompanyConfig): string {
  if (!company.boardToken) throw new Error(`${company.key}: greenhouse source needs boardToken`);
  return company.boardToken;
}
