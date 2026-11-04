import type { CompanyConfig, Job } from "../../src/lib/schema.ts";
import { germanLocation, isDoctorTitle, levelOf, MEDICINE, specialtyOf, stateForName, stateForPostalCode } from "../../src/lib/medicine.ts";
import { decodeEntities } from "../../src/lib/normalize.ts";
import { getText, mapLimit } from "./http.ts";
import { type Posting, parsePosting, postingAddresses, postingHtml } from "./jobposting.ts";
import type { Fetcher } from "./types.ts";

/** A job linked from a rexx portal's list page. */
export interface Listing {
  /** the number in "…-de-j7067.html" */
  id: string;
  title: string;
  url: string;
}

type RawJob = Listing & { posting?: Posting; previous?: Job };

/** rexx list pages hold at most this many pages of results; more means the pattern broke */
const MAX_PAGES = 50;

/** Every job link on a list page, and the "?start=N" offsets of the other pages. */
export function parseList(html: string, pageUrl: string): { jobs: Listing[]; starts: number[] } {
  const jobs = new Map<string, Listing>();
  for (const m of html.matchAll(/<a\b[^>]*href="([^"]*-[a-z]{2}-j(\d+)\.html[^"]*)"[^>]*>([\s\S]*?)<\/a>/gi)) {
    const title = decodeEntities(m[3]!.replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();
    if (title && !jobs.has(m[2]!)) jobs.set(m[2]!, { id: m[2]!, title, url: new URL(decodeEntities(m[1]!), pageUrl).toString() });
  }
  const starts = [...html.matchAll(/[?&](?:amp;)?start=(\d+)/g)].map((m) => Number(m[1]));
  return { jobs: [...jobs.values()], starts: [...new Set(starts)].sort((a, b) => a - b) };
}

function listUrl(company: CompanyConfig): string {
  if (!company.careersUrl) throw new Error(`${company.key}: rexx source needs careersUrl, the portal's job list page`);
  return company.careersUrl;
}

async function listAll(url: string): Promise<Listing[]> {
  const first = parseList(await getText(url), url);
  const jobs = new Map(first.jobs.map((j) => [j.id, j]));
  const pending = first.starts.filter((s) => s > 0);
  const done = new Set<number>([0]);
  while (pending.length && done.size < MAX_PAGES) {
    const start = pending.shift()!;
    if (done.has(start)) continue;
    done.add(start);
    const page = new URL(url);
    page.searchParams.set("start", String(start));
    const { jobs: more, starts } = parseList(await getText(page.toString()), url);
    for (const j of more) if (!jobs.has(j.id)) jobs.set(j.id, j);
    for (const s of starts) if (!done.has(s) && !pending.includes(s)) pending.push(s);
  }
  return [...jobs.values()];
}

/** "Schön Klinik Karriere Jobportal" names the portal, not the hospital */
const isPortalName = (name: string) => /karriere|jobportal|job portal|stellenportal|bewerberportal/i.test(name);

/** Doctor jobs from a hospital's rexx careers portal (jobs.example.de/stellenangebote.html). */
export const rexx: Fetcher<RawJob> = {
  name: "rexx",

  async fetch(company, previous) {
    const known = new Map(previous.filter((j) => j.descriptionHtml).map((j) => [j.id, j]));
    const jobs: RawJob[] = (await listAll(listUrl(company)))
      .filter((j) => isDoctorTitle(j.title))
      .map((j) => ({ ...j, previous: known.get(`rexx:${company.key}:${j.id}`) }));
    await mapLimit(
      jobs.filter((j) => !j.previous),
      4,
      async (job) => {
        try {
          job.posting = parsePosting(await getText(job.url));
        } catch (err) {
          console.warn(`[${company.key}] no page for ${job.id}: ${err instanceof Error ? err.message : err}`);
        }
      },
    );
    return jobs;
  },

  normalize(raw, company) {
    const p = raw.posting;
    const prev = raw.previous;
    const title = (p?.title ?? raw.title).trim();
    const addresses = postingAddresses(p);
    const locations = addresses
      .filter((a) => a.addressLocality)
      .map((a) => germanLocation(a.addressLocality!.trim(), stateForName(a.addressRegion) ?? stateForPostalCode(a.postalCode)));
    const organization = p?.hiringOrganization?.name?.trim();
    const town = addresses[0]?.addressLocality?.trim();
    const employer = organization && !isPortalName(organization) ? organization : town ? `${company.name} ${town}` : company.name;
    return {
      id: `rexx:${company.key}:${raw.id}`,
      originalId: raw.id,
      company: company.key,
      employer: p ? employer : (prev?.employer ?? company.name),
      title,
      locations: p ? [...new Set(locations)] : (prev?.locations ?? []),
      remote: false,
      category: MEDICINE,
      specialty: specialtyOf(title),
      level: levelOf(title),
      descriptionHtml: p ? postingHtml(p) : (prev?.descriptionHtml ?? ""),
      applyUrl: raw.url,
      postedAt: p?.datePosted ? `${p.datePosted.slice(0, 10)}T00:00:00.000Z` : prev?.postedAt,
      source: "rexx",
    };
  },
};
