import { sanitizeDescription } from "../../src/lib/normalize.ts";
import { germanLocation, levelOf, MEDICINE, specialtyOf, stateForCode } from "../../src/lib/medicine.ts";
import { getJson, mapLimit } from "./http.ts";
import type { Fetcher } from "./types.ts";

/** Shape of a job in the Bundesagentur für Arbeit's Jobsuche search results. */
interface BaJob {
  referenznummer: string;
  /** cut to about 60 characters, ending in " ..."; a few postings have none */
  stellenangebotsTitel?: string;
  /** the occupation, e.g. "Facharzt/-ärztin - Innere Medizin" */
  hauptberuf: string;
  /** missing on anonymous ("Chiffre") postings */
  firma?: string;
  stellenlokationen?: { adresse?: { ort?: string; region?: string; land?: string } }[];
  homeofficemoeglich?: boolean;
  datumErsteVeroeffentlichung?: string;
  /** the employer's own posting, when the job came in through a partner */
  externeURL?: string;
}

/** A search result plus its description: plain text from the details call, or HTML kept from the last run. */
type RawJob = BaJob & { stellenangebotsBeschreibung?: string; descriptionHtml?: string };

interface BaPage {
  maxErgebnisse: number;
  ergebnisliste?: BaJob[];
}

const API = "https://rest.arbeitsagentur.de/jobboerse/jobsuche-service";
/** the public client id the Jobsuche web app itself sends */
const HEADERS = { "X-API-Key": "jobboerse-jobsuche" };
const PAGE_SIZE = 100;
/** the search returns at most 10,000 results per query */
const MAX_PAGES = 100;
/**
 * Search results carry no description, so each new job costs a details call.
 * The first run would need thousands; spreading them over a few runs keeps the
 * daily workflow inside its timeout, and jobs wait a day or two for their text.
 */
const MAX_DETAILS_PER_RUN = 1500;

// Doctors only: the occupation field also holds dentists, and some medical assistants slip in
const isDoctor = (job: BaJob) =>
  /arzt|ärzt/i.test(job.hauptberuf) && !/zahn|helfer|sekret|fachangestellt|physician assistant|arztassistent/i.test(job.hauptberuf);

async function search(): Promise<BaJob[]> {
  const jobs: BaJob[] = [];
  for (let page = 1; page <= MAX_PAGES; page++) {
    // pav=false: employers only, no private recruitment agencies
    const params = new URLSearchParams({ berufsfeld: "Human- und Zahnmedizin", pav: "false", size: String(PAGE_SIZE), page: String(page) });
    const data = await getJson<BaPage>(`${API}/pc/v6/jobs?${params}`, HEADERS);
    const list = data.ergebnisliste ?? [];
    jobs.push(...list);
    if (list.length < PAGE_SIZE || jobs.length >= data.maxErgebnisse) return jobs;
  }
  throw new Error(`arbeitsagentur: still paging after ${MAX_PAGES} pages`);
}

/** The details call takes the reference number in base64. */
const detailsUrl = (ref: string) => `${API}/pc/v4/jobdetails/${Buffer.from(ref).toString("base64")}`;

/** Partner links sometimes come without a scheme ("www.example.de/job/1") */
const withScheme = (url: string) => (/^https?:\/\//i.test(url) ? url : `https://${url}`);

const escapeHtml = (text: string) => text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** The plain-text description as paragraphs and lists; dash-only separator lines are dropped. */
export function textToHtml(text: string): string {
  const blocks = text
    .replace(/\r\n?/g, "\n")
    .split(/\n\s*\n/)
    .map((block) => block.split("\n").map((l) => l.trim()).filter((l) => l && !/^[-–_=*\s]{3,}$/.test(l)))
    .filter((lines) => lines.length);
  const html = blocks.map((lines) => {
    const bullet = /^[-–•*·]\s+/;
    if (lines.every((l) => bullet.test(l))) return `<ul>${lines.map((l) => `<li>${escapeHtml(l.replace(bullet, ""))}</li>`).join("")}</ul>`;
    return `<p>${lines.map(escapeHtml).join("<br>")}</p>`;
  });
  return sanitizeDescription(html.join(""));
}

/** Doctor jobs from the Bundesagentur für Arbeit's job board, employers only; one feed of many hospitals and practices. */
export const arbeitsagentur: Fetcher<RawJob> = {
  name: "arbeitsagentur",

  async fetch(_company, previous) {
    const known = new Map(previous.filter((j) => j.descriptionHtml).map((j) => [j.id, j.descriptionHtml]));
    const jobs: RawJob[] = (await search()).filter(isDoctor).map((job) => ({ ...job, descriptionHtml: known.get(`arbeitsagentur:${job.referenznummer}`) }));
    const missing = jobs.filter((j) => !j.descriptionHtml).slice(0, MAX_DETAILS_PER_RUN);
    await mapLimit(missing, 4, async (job) => {
      try {
        const details = await getJson<{ stellenangebotsBeschreibung?: string }>(detailsUrl(job.referenznummer), HEADERS);
        job.stellenangebotsBeschreibung = details.stellenangebotsBeschreibung;
      } catch (err) {
        // a missing description is not worth failing the source over; the next run tries again
        console.warn(`[arbeitsagentur] no details for ${job.referenznummer}: ${err instanceof Error ? err.message : err}`);
      }
    });
    return jobs;
  },

  normalize(raw, company) {
    const ref = raw.referenznummer;
    // a posting without a title still names its occupation, which reads fine as one
    const title = raw.stellenangebotsTitel?.trim().replace(/\s*\.\.\.$/, "…") || raw.hauptberuf.trim();
    const locations = [
      ...new Set(
        (raw.stellenlokationen ?? [])
          .map((l) => l.adresse)
          .filter((a) => a?.ort && (!a.land || a.land === "DEUTSCHLAND"))
          .map((a) => germanLocation(a!.ort!.trim(), stateForCode(a!.region))),
      ),
    ];
    return {
      id: `arbeitsagentur:${ref}`,
      originalId: ref,
      company: company.key,
      employer: raw.firma?.trim() || undefined,
      title,
      locations,
      remote: Boolean(raw.homeofficemoeglich),
      department: raw.hauptberuf,
      category: MEDICINE,
      specialty: specialtyOf(title, raw.hauptberuf),
      level: levelOf(title, raw.hauptberuf),
      descriptionHtml: raw.descriptionHtml ?? (raw.stellenangebotsBeschreibung ? textToHtml(raw.stellenangebotsBeschreibung) : ""),
      applyUrl: raw.externeURL ? withScheme(raw.externeURL) : `https://www.arbeitsagentur.de/jobsuche/jobdetail/${encodeURIComponent(ref)}`,
      postedAt: raw.datumErsteVeroeffentlichung ? new Date(`${raw.datumErsteVeroeffentlichung}T00:00:00Z`).toISOString() : undefined,
      source: "arbeitsagentur",
    };
  },
};
