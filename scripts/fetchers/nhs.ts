import type { Job } from "../../src/lib/schema.ts";
import { decodeEntities, sanitizeDescription } from "../../src/lib/normalize.ts";
import { levelOf, MEDICINE, specialtyOf } from "../../src/lib/medicine.ts";
import { getText, mapLimit } from "./http.ts";
import type { Fetcher } from "./types.ts";

/** A vacancy from the NHS Jobs XML search feed. */
export interface Vacancy {
  id: string;
  reference: string;
  title: string;
  employer?: string;
  /** "2026-10-26T16:06:40.232254853" */
  postDate?: string;
  /** the job's page on NHS Jobs */
  url: string;
  /** "Sheffield, S5 7JT" */
  locations: string[];
}

type RawJob = Vacancy & { descriptionHtml?: string; previous?: Job };

const FEED = "https://www.jobs.nhs.uk/api/v1/search_xml";
/** the staff group of doctors and dentists */
const STAFF_GROUP = "MEDICAL_AND_DENTAL";
/** the feed pages 10 at a time; this many pages is far more than the group has */
const MAX_PAGES = 600;
/** dentists share the doctors' staff group */
const DENTAL = /\bdent(al|ist)|orthodont|endodont|periodont|prosthodont|oral surgeon/i;
/** the sections of a job page that make up its text */
const SECTIONS = ["job_overview", "job_description", "about_organisation"];

const tag = (xml: string, name: string) => {
  const m = new RegExp(`<${name}>([\\s\\S]*?)</${name}>`).exec(xml);
  return m ? decodeEntities(m[1]!).trim() : undefined;
};

/** The vacancies in one page of the feed, and how many pages it has. */
export function parseFeed(xml: string): { vacancies: Vacancy[]; totalPages: number } {
  const vacancies = [...xml.matchAll(/<vacancyDetails>([\s\S]*?)<\/vacancyDetails>/g)].map(([, v]) => ({
    id: tag(v!, "id")!,
    reference: tag(v!, "reference") ?? "",
    title: tag(v!, "title") ?? "",
    employer: tag(v!, "employer"),
    postDate: tag(v!, "postDate"),
    url: tag(v!, "url") ?? "",
    locations: [...v!.matchAll(/<location>([\s\S]*?)<\/location>/g)].map(([, l]) => decodeEntities(l!).trim()),
  }));
  return { vacancies: vacancies.filter((v) => v.id), totalPages: Number(tag(xml, "totalPages") ?? 0) };
}

/** The inner HTML of the element with this id, following nested elements of the same tag. */
export function innerHtmlById(html: string, id: string): string | undefined {
  const open = new RegExp(`<([a-z0-9]+)[^>]*\\sid="${id}"[^>]*>`, "i").exec(html);
  if (!open) return undefined;
  const name = open[1]!.toLowerCase();
  const pattern = new RegExp(`<(/?)${name}\\b[^>]*>`, "gi");
  pattern.lastIndex = open.index + open[0].length;
  let depth = 1;
  for (let m; (m = pattern.exec(html)); ) {
    depth += m[1] ? -1 : 1;
    if (depth === 0) return html.slice(open.index + open[0].length, m.index);
  }
  return undefined;
}

/** "Barrow-in-Furness, LA14 4LF" → "Barrow-in-Furness, United Kingdom" */
export function nhsLocation(label: string): string {
  const parts = label.split(",").map((p) => p.trim()).filter(Boolean);
  // drop a trailing UK postcode
  if (parts.length > 1 && /^[A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2}$/i.test(parts.at(-1)!)) parts.pop();
  return parts.length ? `${parts[0]}, United Kingdom` : "United Kingdom";
}

/** Doctor jobs across the UK from NHS Jobs, the NHS's own job board. */
export const nhs: Fetcher<RawJob> = {
  name: "nhs",

  async fetch(_company, previous) {
    const known = new Map(previous.filter((j) => j.descriptionHtml).map((j) => [j.id, j]));
    const vacancies: Vacancy[] = [];
    for (let page = 1; page <= MAX_PAGES; page++) {
      const { vacancies: list, totalPages } = parseFeed(await getText(`${FEED}?staffGroup=${STAFF_GROUP}&page=${page}`, "application/xml"));
      vacancies.push(...list);
      if (!list.length || page >= totalPages) break;
    }
    const jobs: RawJob[] = [...new Map(vacancies.map((v) => [v.id, v])).values()]
      .filter((v) => !DENTAL.test(v.title))
      .map((v) => ({ ...v, previous: known.get(`nhs:${v.id}`) }));
    await mapLimit(
      jobs.filter((j) => !j.previous),
      4,
      async (job) => {
        try {
          const html = await getText(job.url);
          job.descriptionHtml = sanitizeDescription(
            SECTIONS.map((id) => innerHtmlById(html, id))
              .filter(Boolean)
              .join(""),
          );
        } catch (err) {
          console.warn(`[nhs] no page for ${job.reference}: ${err instanceof Error ? err.message : err}`);
        }
      },
    );
    return jobs;
  },

  normalize(raw, company) {
    const title = raw.title.trim();
    return {
      id: `nhs:${raw.id}`,
      originalId: raw.reference || raw.id,
      company: company.key,
      employer: raw.employer || undefined,
      title,
      locations: [...new Set(raw.locations.map(nhsLocation))],
      remote: false,
      category: MEDICINE,
      specialty: specialtyOf(title),
      level: levelOf(title),
      descriptionHtml: raw.descriptionHtml ?? raw.previous?.descriptionHtml ?? "",
      applyUrl: raw.url,
      postedAt: raw.postDate ? new Date(`${raw.postDate.slice(0, 19)}Z`).toISOString() : undefined,
      source: "nhs",
    };
  },
};
