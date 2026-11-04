import type { Job } from "../../src/lib/schema.ts";
import { germanLocation, isDoctorTitle, levelOf, MEDICINE, specialtyOf, stateForName, stateForPostalCode } from "../../src/lib/medicine.ts";
import { getText, mapLimit, postJson } from "./http.ts";
import { type Posting, parsePosting, postingAddresses, postingHtml } from "./jobposting.ts";
import type { Fetcher } from "./types.ts";

/** A job in the search behind asklepios.com/karriere/jobs. */
interface Listing {
  id: string;
  title: string;
  /** the clinic, e.g. "Asklepios Neurologische Klinik Falkenstein" */
  company?: string;
  /** "Nidda, Lich" for a job at two sites */
  location?: string;
  /** postal codes in the same order: "63667, 35423" */
  plz?: string;
  fachgebiet?: string;
  /** "Fachärztin / Facharzt#Oberärztin / Oberarzt" */
  careerLevel?: string;
  /** "04.11.26, 00:00" */
  publicationDate?: string;
  /** the job's page on karriere.asklepios.com */
  jobLink: string;
}

type RawJob = Listing & { posting?: Posting; previous?: Job };

const SEARCH = "https://www.asklepios.com/api/search";
/** the job index the careers site searches; it is part of the site's configuration */
const ENDPOINT = "/.rest/search/job/de/4bc0fdbd-f9f5-4f83-a5be-8ca06c8b2d5f";
/** work area "Ärztlicher Dienst", the doctors */
const DOCTORS = "workareaIds_w4RyenRsaWNoZXIgRGllbnN0";
/** the search returns at most 60 per page whatever it is asked for */
const PAGE_SIZE = 60;

async function search(): Promise<Listing[]> {
  const jobs: Listing[] = [];
  for (let offset = 0; ; offset += PAGE_SIZE) {
    const page = await postJson<{ count: number; items: Listing[] }>(SEARCH, {
      searchEndpoint: ENDPOINT,
      q: "",
      o: offset,
      l: PAGE_SIZE,
      f: false,
      filter: { workareaIds: [DOCTORS] },
    });
    jobs.push(...page.items);
    if (!page.items.length || jobs.length >= page.count) return jobs;
  }
}

/** "04.11.26, 00:00" → ISO date */
const shortDate = (text: string | undefined) => {
  const m = text && /^(\d{2})\.(\d{2})\.(\d{2})/.exec(text);
  return m ? `20${m[3]}-${m[2]}-${m[1]}T00:00:00.000Z` : undefined;
};

/** Each site's "City, State, Germany", from the posting's address or else the listing's postal codes. */
export function asklepiosLocations(raw: Pick<Listing, "location" | "plz">, posting?: Posting): string[] {
  const address = postingAddresses(posting)[0];
  const cities = (raw.location ?? "").split(",").map((c) => c.trim()).filter(Boolean);
  const codes = (raw.plz ?? "").split(",").map((c) => c.trim());
  // a job for anywhere in the country
  if (cities.length === 1 && /^(bundesweit|deutschlandweit)$/i.test(cities[0]!)) return ["Germany"];
  const labels = cities.map((city, i) => {
    const state = (address?.addressLocality === city && stateForName(address.addressRegion)) || stateForPostalCode(codes[i]);
    return germanLocation(city, state);
  });
  if (!labels.length && address?.addressLocality) labels.push(germanLocation(address.addressLocality, stateForName(address.addressRegion)));
  return [...new Set(labels)];
}

/** Doctor jobs at Asklepios, Germany's second-largest hospital group. */
export const asklepios: Fetcher<RawJob> = {
  name: "asklepios",

  async fetch(_company, previous) {
    const known = new Map(previous.filter((j) => j.descriptionHtml).map((j) => [j.id, j]));
    const jobs: RawJob[] = (await search())
      // the work area also holds doctors' secretaries and assistants
      .filter((j) => isDoctorTitle(j.title))
      .map((j) => ({ ...j, previous: known.get(`asklepios:${j.id}`) }));
    await mapLimit(
      jobs.filter((j) => !j.previous),
      4,
      async (job) => {
        try {
          job.posting = parsePosting(await getText(job.jobLink));
        } catch (err) {
          console.warn(`[asklepios] no page for ${job.id}: ${err instanceof Error ? err.message : err}`);
        }
      },
    );
    return jobs;
  },

  normalize(raw, company) {
    const title = raw.title.trim();
    const p = raw.posting;
    const html = p ? postingHtml(p) : (raw.previous?.descriptionHtml ?? "");
    const locations = asklepiosLocations(raw, p);
    return {
      id: `asklepios:${raw.id}`,
      originalId: raw.id,
      company: company.key,
      employer: raw.company?.trim() || undefined,
      title,
      locations: p || !raw.previous ? locations : raw.previous.locations,
      remote: false,
      department: raw.fachgebiet,
      category: MEDICINE,
      specialty: specialtyOf(title, raw.fachgebiet),
      level: levelOf(title, raw.careerLevel),
      descriptionHtml: html,
      applyUrl: raw.jobLink,
      postedAt: shortDate(raw.publicationDate) ?? (p?.datePosted ? `${p.datePosted}T00:00:00.000Z` : raw.previous?.postedAt),
      source: "asklepios",
    };
  },
};
