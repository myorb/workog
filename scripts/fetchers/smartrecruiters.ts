import { categorize, isRemote, sanitizeDescription, toIso } from "../../src/lib/normalize.ts";
import { requireToken } from "./greenhouse.ts";
import { getJson, mapLimit } from "./http.ts";
import type { Fetcher } from "./types.ts";

interface Posting {
  id: string;
  name: string;
  releasedDate?: string;
  location: { fullLocation?: string; city?: string; country?: string; remote?: boolean };
  department?: { label?: string };
  function?: { label?: string };
}

/** A posting with its job ad, from the details endpoint; the list leaves the description out. */
interface SmartRecruitersJob extends Posting {
  postingUrl: string;
  jobAd: { sections: Record<string, { title?: string; text?: string } | undefined> };
}

const API = "https://api.smartrecruiters.com/v1/companies";
/** the most the list endpoint returns per request */
const PAGE_SIZE = 100;
const SECTIONS = ["companyDescription", "jobDescription", "qualifications", "additionalInformation"];

export const smartrecruiters: Fetcher<SmartRecruitersJob> = {
  name: "smartrecruiters",

  async fetch(company) {
    const base = `${API}/${encodeURIComponent(requireToken(company))}/postings`;
    const postings: Posting[] = [];
    for (let offset = 0; ; offset += PAGE_SIZE) {
      const data = await getJson<{ totalFound: number; content: Posting[] }>(`${base}?limit=${PAGE_SIZE}&offset=${offset}`);
      postings.push(...data.content);
      if (data.content.length < PAGE_SIZE || offset + PAGE_SIZE >= data.totalFound) break;
    }
    return mapLimit(postings, 6, (p) => getJson<SmartRecruitersJob>(`${base}/${encodeURIComponent(p.id)}`));
  },

  normalize(raw, company) {
    const location = raw.location.fullLocation ?? [raw.location.city, raw.location.country].filter(Boolean).join(", ");
    const department = raw.department?.label ?? raw.function?.label;
    const sections = SECTIONS.map((key) => raw.jobAd.sections[key])
      .filter((s) => s?.text)
      .map((s) => `${s!.title ? `<h3>${s!.title}</h3>` : ""}${s!.text}`);
    return {
      id: `smartrecruiters:${raw.id}`,
      originalId: raw.id,
      company: company.key,
      title: raw.name.trim(),
      locations: location ? [location] : [],
      remote: raw.location.remote === true || isRemote(raw.name, location),
      department,
      category: categorize(raw.name, department),
      descriptionHtml: sanitizeDescription(sections.join("")),
      applyUrl: raw.postingUrl,
      postedAt: toIso(raw.releasedDate),
      source: "smartrecruiters",
    };
  },
};
