import type { Job } from "../../src/lib/schema.ts";
import { sanitizeDescription } from "../../src/lib/normalize.ts";
import { levelOf, MEDICINE, specialtyOf } from "../../src/lib/medicine.ts";
import { nutsNames } from "../../src/lib/nuts-names.ts";
import { textToHtml } from "./arbeitsagentur.ts";
import { getJson, mapLimit, postJson } from "./http.ts";
import type { Fetcher } from "./types.ts";

/** A vacancy in the EURES search results. */
interface Listing {
  id: string;
  title: string;
  /** milliseconds since 1970 */
  creationDate?: number;
  /** country code → NUTS codes, e.g. { FR: ["FRI22"] } */
  locationMap?: Record<string, (string | null)[]>;
  employer?: { name?: string };
}

interface SearchPage {
  numberRecords: number;
  jvs: Listing[];
}

/** One language version of a vacancy, from the details call. */
interface Profile {
  title?: string;
  description?: string;
  locations?: { countryCode?: string; region?: string | null; cityName?: string | null }[];
  employer?: { name?: string };
  applicationInstructions?: string[];
}

interface Details {
  /** the national job service the vacancy came from: "Pole_Emploi", "DE001" (the Arbeitsagentur), … */
  source?: string;
  preferredLanguage: string;
  jvProfiles: Record<string, Profile>;
}

type RawJob = Listing & { country: string; details?: Details; previous?: Job };

const API = "https://europa.eu/eures/api/jv-searchengine/public";
const PORTAL = "https://europa.eu/eures/portal/jv-se/jv-details";
/** ISCO 221, medical doctors: generalists and specialists */
const DOCTORS = "http://data.europa.eu/esco/isco/C221";
/** the most the search returns per page */
const PAGE_SIZE = 50;
/** the search stops at 200 pages per query, so each country is queried on its own */
const MAX_PAGES = 200;
/**
 * The search leaves out the text, city and apply link, so each new vacancy
 * costs a details call. The first run would need ~15,000; spreading them over
 * runs keeps the daily workflow inside its timeout. EURES_MAX_DETAILS raises
 * the cap for a one-off backfill.
 */
const MAX_DETAILS_PER_RUN = Number(process.env.EURES_MAX_DETAILS) || 2000;

/** English names of the countries EURES covers, by its lower-case codes */
const COUNTRY_NAMES: Record<string, string> = {
  at: "Austria", be: "Belgium", bg: "Bulgaria", ch: "Switzerland", cy: "Cyprus", cz: "Czechia", de: "Germany", dk: "Denmark",
  ee: "Estonia", el: "Greece", es: "Spain", fi: "Finland", fr: "France", hr: "Croatia", hu: "Hungary", ie: "Ireland",
  is: "Iceland", it: "Italy", li: "Liechtenstein", lt: "Lithuania", lu: "Luxembourg", lv: "Latvia", mt: "Malta",
  nl: "Netherlands", no: "Norway", pl: "Poland", pt: "Portugal", ro: "Romania", se: "Sweden", si: "Slovenia", sk: "Slovakia",
};

/**
 * The countries this source lists. Germany comes from the arbeitsagentur
 * source, Sweden and Switzerland from their national ones (jobtech, jobroom),
 * so EURES would list them twice.
 */
export const EURES_COUNTRIES = Object.keys(COUNTRY_NAMES).filter((c) => !["de", "se", "ch"].includes(c));

const countryName = (code: string) => COUNTRY_NAMES[code.toLowerCase()] ?? code.toUpperCase();

/**
 * The search orders vacancies that share a creation time differently on each
 * page request, so paging through one order returns some vacancies twice and
 * never returns others, the same ones run after run. A second pass in another
 * order finds nearly all of those.
 */
const SORTS = ["MOST_RECENT", "BEST_MATCH"] as const;
type Sort = (typeof SORTS)[number];
export type Search = (country: string, page: number, sort: Sort) => Promise<SearchPage>;

const searchPage: Search = (country, page, sort) =>
  postJson<SearchPage>(`${API}/jv-search/search`, {
    resultsPerPage: PAGE_SIZE,
    page,
    sortSearch: sort,
    keywords: [],
    publicationPeriod: null,
    occupationUris: [DOCTORS],
    skillUris: [],
    requiredExperienceCodes: [],
    positionScheduleCodes: [],
    sectorCodes: [],
    educationAndQualificationLevelCodes: [],
    positionOfferingCodes: [],
    locationCodes: [country],
    euresFlagCodes: [],
    otherBenefitsCodes: [],
    requiredLanguages: [],
    minNumberPost: null,
    sessionId: "workog",
  });

/** Every page of one sort order, and the number of vacancies the search reported. */
async function allPages(country: string, sort: Sort, search: Search): Promise<{ listings: Listing[]; total: number }> {
  const listings: Listing[] = [];
  for (let page = 1; page <= MAX_PAGES; page++) {
    const data = await search(country, page, sort);
    listings.push(...data.jvs);
    if (!data.jvs.length || page * PAGE_SIZE >= data.numberRecords) return { listings, total: data.numberRecords };
  }
  throw new Error(`eures: ${country} has more than ${MAX_PAGES * PAGE_SIZE} vacancies; split the query`);
}

/** A country's vacancies, each once, newest first; the second sort order runs only when the first missed some. */
export async function searchCountry(country: string, search: Search = searchPage): Promise<RawJob[]> {
  const byId = new Map<string, RawJob>();
  for (const sort of SORTS) {
    const { listings, total } = await allPages(country, sort, search);
    for (const j of listings) if (!byId.has(j.id)) byId.set(j.id, { ...j, country });
    if (byId.size >= total) break;
  }
  return [...byId.values()];
}

/** "ARVIKA" → "Arvika"; names already in mixed case stay as they are */
const titleCase = (name: string) =>
  name === name.toUpperCase() ? name.toLowerCase().replace(/(^|[\s\-'(])(\p{L})/gu, (_, sep, c) => sep + c.toUpperCase()) : name;

/** "City, Country" for each place: the city when there is one, else the most specific region. */
export function euresLocations(raw: Pick<RawJob, "country" | "locationMap">, profile?: Profile): string[] {
  const country = countryName(raw.country);
  const labels = (profile?.locations ?? [])
    .map((l) => {
      const name = l.countryCode ? countryName(l.countryCode) : country;
      if (l.cityName?.trim()) return `${titleCase(l.cityName.trim())}, ${name}`;
      const region = l.region && nutsNames[l.region.toLowerCase()];
      return region && region !== name ? `${region}, ${name}` : name;
    })
    .filter(Boolean);
  if (!labels.length) {
    // the search's NUTS codes, the longest being the most specific
    const codes = Object.values(raw.locationMap ?? {})
      .flat()
      .filter((c): c is string => typeof c === "string")
      .sort((a, b) => b.length - a.length);
    const region = codes.map((c) => nutsNames[c.toLowerCase()]).find(Boolean);
    labels.push(region && region !== country ? `${region}, ${country}` : country);
  }
  return [...new Set(labels)];
}

/** The first link in the application instructions: usually the posting on the national job board. */
export function applyLinkOf(instructions: string[] | undefined): string | undefined {
  const text = (instructions ?? []).join(" ");
  const url = /https?:\/\/[^\s"'<>]+/.exec(text)?.[0]?.replace(/[.,;)]+$/, "");
  if (!url) return undefined;
  try {
    return new URL(url).toString();
  } catch {
    return undefined;
  }
}

const describe = (text: string | undefined) => {
  if (!text?.trim()) return "";
  return /<(p|ul|li|br|div|strong|h\d)\b/i.test(text) ? sanitizeDescription(text) : textToHtml(text);
};

/** Doctor jobs across Europe from EURES, the EU's job mobility portal, Germany, Sweden and Switzerland excepted. */
export const eures: Fetcher<RawJob> = {
  name: "eures",

  async fetch(_company, previous) {
    // a job stored without its details (past the cap) still points at the portal, so it gets them on a later run
    const known = new Map(previous.filter((j) => j.descriptionHtml || !j.applyUrl.startsWith(PORTAL)).map((j) => [j.id, j]));
    const jobs: RawJob[] = [];
    for (const country of EURES_COUNTRIES) jobs.push(...(await searchCountry(country)));
    for (const job of jobs) job.previous = known.get(`eures:${job.id}`);
    const missing = jobs.filter((j) => !j.previous).slice(0, MAX_DETAILS_PER_RUN);
    await mapLimit(missing, 4, async (job) => {
      try {
        job.details = await getJson<Details>(`${API}/jv/id/${encodeURIComponent(job.id)}?requestLang=en`);
      } catch (err) {
        console.warn(`[eures] no details for ${job.id}: ${err instanceof Error ? err.message : err}`);
      }
    });
    // copies of Arbeitsagentur postings, which that source already lists
    return jobs.filter((j) => !/^DE/i.test(j.details?.source ?? ""));
  },

  normalize(raw, company) {
    const profile = raw.details && (raw.details.jvProfiles[raw.details.preferredLanguage] ?? Object.values(raw.details.jvProfiles)[0]);
    const prev = raw.previous;
    const title = (profile?.title ?? raw.title).trim();
    const employer = (profile?.employer?.name ?? raw.employer?.name)?.trim();
    return {
      id: `eures:${raw.id}`,
      originalId: raw.id,
      company: company.key,
      employer: employer ? titleCase(employer) : undefined,
      title,
      locations: profile || !prev ? euresLocations(raw, profile) : prev.locations,
      remote: false,
      category: MEDICINE,
      specialty: specialtyOf(title),
      level: levelOf(title),
      descriptionHtml: profile ? describe(profile.description) : (prev?.descriptionHtml ?? ""),
      applyUrl: (profile && applyLinkOf(profile.applicationInstructions)) ?? prev?.applyUrl ?? `${PORTAL}/${encodeURIComponent(raw.id)}?lang=en`,
      postedAt: raw.creationDate ? new Date(raw.creationDate).toISOString() : undefined,
      source: "eures",
    };
  },
};
