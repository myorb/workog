import { sanitizeDescription } from "../../src/lib/normalize.ts";
import { levelOf, MEDICINE, specialtyOf } from "../../src/lib/medicine.ts";
import { textToHtml } from "./arbeitsagentur.ts";
import { getJson } from "./http.ts";
import type { Fetcher } from "./types.ts";

/** A job ad from JobTech's JobSearch API: Arbetsförmedlingen's Platsbanken, with its text. */
export interface Ad {
  id: string;
  headline: string;
  webpage_url: string;
  publication_date?: string;
  description?: { text?: string; text_formatted?: string };
  employer?: { name?: string; workplace?: string };
  workplace_addresses?: { municipality?: string | null; city?: string | null; region?: string | null; country?: string | null }[];
  workplace_address?: { municipality?: string | null; city?: string | null; region?: string | null };
  occupation?: { label?: string };
  application_details?: { url?: string | null };
}

const API = "https://jobsearch.api.jobtechdev.se/search";
/** SSYK 2211–2219, the doctors: specialists, ST and AT doctors, other doctors */
const DOCTOR_GROUPS = ["nu7c_QuB_KVQ", "seu9_VoQ_VNo", "ek9W_qqp_XpF", "gXqW_s5Q_ZjN"];
const PAGE_SIZE = 100;
/** the API refuses offsets past 2,000 */
const MAX_OFFSET = 2000;

/** "Arvika, Sweden" per workplace, by municipality, the town the ad names. */
export function jobtechLocations(ad: Pick<Ad, "workplace_addresses" | "workplace_address">): string[] {
  const addresses = ad.workplace_addresses?.length ? ad.workplace_addresses : ad.workplace_address ? [ad.workplace_address] : [];
  const labels = addresses.map((a) => a.municipality?.trim()).filter(Boolean).map((town) => `${town}, Sweden`);
  return labels.length ? [...new Set(labels)] : ["Sweden"];
}

/** Doctor jobs in Sweden from Arbetsförmedlingen, through JobTech's open JobSearch API. */
export const jobtech: Fetcher<Ad> = {
  name: "jobtech",

  async fetch() {
    const groups = DOCTOR_GROUPS.map((g) => `occupation-group=${g}`).join("&");
    const ads: Ad[] = [];
    for (let offset = 0; offset < MAX_OFFSET; offset += PAGE_SIZE) {
      const page = await getJson<{ total: { value: number }; hits: Ad[] }>(`${API}?${groups}&limit=${PAGE_SIZE}&offset=${offset}&sort=pubdate-desc`);
      ads.push(...page.hits);
      if (!page.hits.length || offset + PAGE_SIZE >= page.total.value) return ads;
    }
    throw new Error(`jobtech: more than ${MAX_OFFSET} doctor ads; split the query`);
  },

  normalize(raw, company) {
    const title = raw.headline.trim();
    const d = raw.description;
    const html = d?.text_formatted ? sanitizeDescription(d.text_formatted) : d?.text ? textToHtml(d.text) : "";
    return {
      id: `jobtech:${raw.id}`,
      originalId: raw.id,
      company: company.key,
      employer: (raw.employer?.workplace || raw.employer?.name)?.trim() || undefined,
      title,
      locations: jobtechLocations(raw),
      remote: false,
      department: raw.occupation?.label,
      category: MEDICINE,
      specialty: specialtyOf(title, raw.occupation?.label),
      level: levelOf(title, raw.occupation?.label),
      descriptionHtml: html,
      applyUrl: raw.webpage_url,
      postedAt: raw.publication_date ? new Date(`${raw.publication_date}Z`).toISOString() : undefined,
      source: "jobtech",
    };
  },
};
