import type { CompanyConfig, Job } from "../../src/lib/schema.ts";
import { categorize, sanitizeDescription, toIso } from "../../src/lib/normalize.ts";
import { germanLocation, isDoctorTitle, levelOf, MEDICINE, specialtyOf, stateForName } from "../../src/lib/medicine.ts";
import { getJson, mapLimit } from "./http.ts";
import type { Fetcher } from "./types.ts";

/** A requisition in Oracle Recruiting Cloud's search results. */
interface Requisition {
  Id: string;
  Title: string;
  /** "2026-11-04" */
  PostedDate?: string;
  /** "Köln, Nordrhein-Westfalen, Deutschland" */
  PrimaryLocation?: string;
  PrimaryLocationCountry?: string;
  secondaryLocations?: { Name?: string; CountryCode?: string }[];
  JobFamily?: string;
  LegalEmployer?: string;
  WorkplaceTypeCode?: string;
}

interface SearchResponse {
  items: { TotalJobsCount: number; requisitionList: Requisition[] }[];
}

/** The text fields of a requisition's details; the search leaves them out. */
interface Details {
  ExternalDescriptionStr?: string;
  ExternalResponsibilitiesStr?: string;
  ExternalQualificationsStr?: string;
  ContentLocale?: string;
}

type RawJob = Requisition & { details?: Details; previous?: Job };

/** the most the search returns per page */
const PAGE_SIZE = 200;

/** "https://x.fa.ocs.oraclecloud.com/hcmUI/CandidateExperience/de/sites/CX_4025" → API base, site number and site URL. */
export function oracleSite(company: CompanyConfig) {
  if (!company.careersUrl) throw new Error(`${company.key}: oracle source needs careersUrl`);
  const url = new URL(company.careersUrl);
  const site = /\/sites\/([^/]+)/.exec(url.pathname)?.[1];
  if (!site) throw new Error(`${company.key}: no site number in ${company.careersUrl}`);
  return { api: `${url.origin}/hcmRestApi/resources/latest`, site, siteUrl: company.careersUrl.replace(/\/+$/, "") };
}

/** Oracle's finder syntax takes its own separators raw, and everything else encoded. */
const finder = (name: string, params: Record<string, string | number>) =>
  `${name};${Object.entries(params)
    .map(([k, v]) => `${k}=${encodeURIComponent(String(v))}`)
    .join(",")}`;

async function search(api: string, site: string): Promise<Requisition[]> {
  const jobs: Requisition[] = [];
  for (let offset = 0; ; offset += PAGE_SIZE) {
    const f = finder("findReqs", { siteNumber: site, limit: PAGE_SIZE, offset, sortBy: "POSTING_DATES_DESC" });
    const data = await getJson<SearchResponse>(
      `${api}/recruitingCEJobRequisitions?onlyData=true&expand=requisitionList.secondaryLocations&finder=${f}`,
    );
    const page = data.items[0];
    const list = page?.requisitionList ?? [];
    jobs.push(...list);
    // a full page sometimes comes back one short, so page by the total, not by page length
    if (!list.length || offset + PAGE_SIZE >= (page?.TotalJobsCount ?? 0)) return jobs;
  }
}

/** "Lichtenberg (Berlin), Berlin, Deutschland" → "Berlin, Berlin, Germany"; other countries stay as written. */
export function oracleLocation(label: string, country: string | undefined, medicine: boolean): string {
  const parts = label.split(",").map((p) => p.trim()).filter(Boolean);
  if (!medicine || country !== "DE") return parts.join(", ");
  if (parts.at(-1) === "Deutschland") parts.pop();
  // a job for anywhere in the country names only the country
  if (!parts.length) return "Germany";
  // a district names its city in brackets
  const city = parts[0]!.replace(/^.+\((.+)\)$/, "$1").trim();
  // Berlin, Hamburg and Bremen are their own states
  return germanLocation(city, stateForName(parts[1]) ?? stateForName(city));
}

const headings: Record<string, [string, string]> = {
  de: ["Ihre Aufgaben", "Ihr Profil"],
  en: ["Responsibilities", "Qualifications"],
};

/** Jobs from an Oracle Recruiting Cloud careers site; for a medicine company, its doctor jobs only. */
export const oracle: Fetcher<RawJob> = {
  name: "oracle",

  async fetch(company, previous) {
    const { api, site } = oracleSite(company);
    const medicine = company.sector === "medicine";
    const known = new Map(previous.filter((j) => j.descriptionHtml).map((j) => [j.id, j]));
    const jobs: RawJob[] = (await search(api, site))
      // hospitals file doctors under "Ärztlicher Dienst", but secretaries and assistants too
      .filter((r) => !medicine || isDoctorTitle(r.Title))
      .map((r) => ({ ...r, previous: known.get(`oracle:${company.key}:${r.Id}`) }));
    await mapLimit(
      jobs.filter((j) => !j.previous),
      4,
      async (job) => {
        try {
          const f = finder("ById", { Id: `"${job.Id}"`, siteNumber: site });
          const data = await getJson<{ items: Details[] }>(`${api}/recruitingCEJobRequisitionDetails?onlyData=true&finder=${f}`);
          job.details = data.items[0];
        } catch (err) {
          console.warn(`[${company.key}] no details for ${job.Id}: ${err instanceof Error ? err.message : err}`);
        }
      },
    );
    return jobs;
  },

  normalize(raw, company) {
    const { siteUrl } = oracleSite(company);
    const medicine = company.sector === "medicine";
    const title = raw.Title.trim();
    const locations = [
      raw.PrimaryLocation && oracleLocation(raw.PrimaryLocation, raw.PrimaryLocationCountry, medicine),
      ...(raw.secondaryLocations ?? []).map((l) => l.Name && oracleLocation(l.Name, l.CountryCode, medicine)),
    ].filter((l): l is string => Boolean(l));
    const d = raw.details;
    const [tasks, profile] = headings[d?.ContentLocale ?? ""] ?? headings.en!;
    const html = d
      ? sanitizeDescription(
          [
            d.ExternalDescriptionStr,
            d.ExternalResponsibilitiesStr && `<h3>${tasks}</h3>${d.ExternalResponsibilitiesStr}`,
            d.ExternalQualificationsStr && `<h3>${profile}</h3>${d.ExternalQualificationsStr}`,
          ]
            .filter(Boolean)
            .join(""),
        )
      : (raw.previous?.descriptionHtml ?? "");
    return {
      id: `oracle:${company.key}:${raw.Id}`,
      originalId: raw.Id,
      company: company.key,
      employer: raw.LegalEmployer?.trim() || undefined,
      title,
      locations: [...new Set(locations)],
      remote: raw.WorkplaceTypeCode === "ORA_REMOTE",
      department: raw.JobFamily,
      category: medicine ? MEDICINE : categorize(title, raw.JobFamily),
      ...(medicine ? { specialty: specialtyOf(title), level: levelOf(title) } : {}),
      descriptionHtml: html,
      applyUrl: `${siteUrl}/job/${encodeURIComponent(raw.Id)}`,
      postedAt: toIso(raw.PostedDate),
      source: "oracle",
    };
  },
};
