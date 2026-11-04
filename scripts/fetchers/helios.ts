import type { Job } from "../../src/lib/schema.ts";
import { sanitizeDescription } from "../../src/lib/normalize.ts";
import { germanLocation, isDoctorTitle, levelOf, MEDICINE, specialtyOf, stateForPostalCode } from "../../src/lib/medicine.ts";
import { getJson, mapLimit } from "./http.ts";
import type { Fetcher } from "./types.ts";

/** A job in the Fresenius careers search; Helios is one of its business segments. */
interface Listing {
  id: string;
  title: string;
  /** "/job-detail/<uuid>/<slug>", relative to the careers site */
  url: string;
  businessSegment: string;
  /** the town only, e.g. "Gifhorn" */
  location?: string;
}

interface SearchPage {
  status: string;
  data: { count: number; jobAds: Listing[] };
}

/** `jobAd` from the details call: the text in sections, the facts as label/value pairs. */
interface JobAd {
  title: string;
  description: { title?: string; value: string }[];
  /** e.g. { title: "Veröffentlicht am", value: [["29.10.2026"]] } */
  attributes: { title: string; value: string[][] }[];
}

/** A search result plus its details, or the job as stored last run when it had them already. */
type RawJob = Listing & { ad?: JobAd; previous?: Job };

const API = "https://api.careers.fresenius.com";
const SITE = "https://karriere.fresenius.de";
/** the API answers 400 without a full locale, and the locale picks the German site */
const HEADERS = { "Accept-Language": "de-DE" };
const PAGE_SIZE = 100;
const HELIOS = "FRESENIUS_HELIOS_HOSPITALS";
/** the section holding the workplace's name and address */
const ADDRESS = "Adresse Arbeitsstelle";

async function search(): Promise<Listing[]> {
  const jobs: Listing[] = [];
  for (let offset = 0; ; offset += PAGE_SIZE) {
    const page = await getJson<SearchPage>(`${API}/job-search?limit=${PAGE_SIZE}&offset=${offset}`, HEADERS);
    jobs.push(...page.data.jobAds);
    if (!page.data.jobAds.length || offset + PAGE_SIZE >= page.data.count) return jobs;
  }
}

const attribute = (ad: JobAd, title: string) => ad.attributes.find((a) => a.title === title)?.value.flat()[0]?.trim();

/** "Helios Klinikum Gifhorn GmbH<br />Campus 6<br />38518 Gifhorn" → employer, postal code and town. */
export function parseAddress(html: string | undefined): { employer?: string; postalCode?: string; city?: string } {
  if (!html) return {};
  const lines = html
    .split(/<br\s*\/?>|<\/p>/i)
    .map((l) => l.replace(/<[^>]+>/g, "").replace(/&nbsp;/g, " ").trim())
    .filter(Boolean);
  // "38518 Gifhorn", or now and then "Berlin 13125"
  for (const line of lines.slice(1)) {
    const m = /^(\d{5})\s+(\D.*)$/.exec(line) ?? /^(\D.*?)\s+(\d{5})$/.exec(line);
    if (m) {
      const [postalCode, city] = /^\d/.test(m[1]!) ? [m[1]!, m[2]!] : [m[2]!, m[1]!];
      return { employer: lines[0], postalCode, city: city.trim() };
    }
  }
  return { employer: lines[0] };
}

/** "29.10.2026" → ISO date */
const germanDate = (text: string | undefined) => {
  const m = text && /^(\d{2})\.(\d{2})\.(\d{4})$/.exec(text);
  return m ? `${m[3]}-${m[2]}-${m[1]}T00:00:00.000Z` : undefined;
};

/** Doctor jobs at Helios, Germany's largest hospital group, from the Fresenius careers site. */
export const helios: Fetcher<RawJob> = {
  name: "helios",

  async fetch(_company, previous) {
    const known = new Map(previous.filter((j) => j.descriptionHtml).map((j) => [j.id, j]));
    const jobs: RawJob[] = (await search())
      .filter((j) => j.businessSegment === HELIOS && isDoctorTitle(j.title))
      .map((j) => ({ ...j, previous: known.get(`helios:${j.id}`) }));
    await mapLimit(
      jobs.filter((j) => !j.previous),
      4,
      async (job) => {
        try {
          job.ad = (await getJson<{ data: { jobAd: JobAd } }>(`${API}/job-ads/${job.id}`, HEADERS)).data.jobAd;
        } catch (err) {
          // listed without its text today; the next run tries again
          console.warn(`[helios] no details for ${job.id}: ${err instanceof Error ? err.message : err}`);
        }
      },
    );
    return jobs;
  },

  normalize(raw, company) {
    const title = raw.title.trim();
    const base = {
      id: `helios:${raw.id}`,
      originalId: raw.id,
      company: company.key,
      title,
      remote: false,
      category: MEDICINE,
      specialty: specialtyOf(title),
      level: levelOf(title),
      applyUrl: new URL(raw.url, SITE).toString(),
      source: "helios",
    };
    if (!raw.ad) {
      const prev = raw.previous;
      return {
        ...base,
        employer: prev?.employer,
        locations: prev?.locations ?? (raw.location ? [germanLocation(raw.location.trim(), undefined)] : []),
        department: prev?.department,
        descriptionHtml: prev?.descriptionHtml ?? "",
        postedAt: prev?.postedAt,
      };
    }
    const address = parseAddress(raw.ad.description.find((s) => s.title === ADDRESS)?.value);
    const city = address.city ?? attribute(raw.ad, "Standort") ?? raw.location?.trim();
    const department = attribute(raw.ad, "Einsatzbereich");
    const html = raw.ad.description
      .filter((s) => s.title !== ADDRESS)
      .map((s) => `${s.title ? `<h3>${s.title}</h3>` : ""}${s.value}`)
      .join("");
    return {
      ...base,
      employer: address.employer,
      locations: city ? [germanLocation(city, stateForPostalCode(address.postalCode))] : [],
      department,
      descriptionHtml: sanitizeDescription(html),
      postedAt: germanDate(attribute(raw.ad, "Veröffentlicht am")),
    };
  },
};
