import { sanitizeDescription } from "../../src/lib/normalize.ts";
import { isDoctorTitle, levelOf, MEDICINE, specialtyOf } from "../../src/lib/medicine.ts";
import { postJson } from "./http.ts";
import type { Fetcher } from "./types.ts";

/** A job ad from job-room.ch, the Swiss public employment service's job board. */
export interface Advert {
  id: string;
  jobContent: {
    externalUrl?: string | null;
    jobDescriptions: { languageIsoCode?: string; title: string; description?: string }[];
    company?: { name?: string };
    location?: { city?: string; countryIsoCode?: string };
    applyChannel?: { formUrl?: string | null };
  };
  publication?: { startDate?: string };
}

const API = "https://www.job-room.ch/jobadservice/api/jobAdvertisements/_search";
const PAGE_SIZE = 100;
/** AVAM occupation codes of medical staff; they hold nurses too, so titles are filtered after */
const HEALTH_CODES = ["101220", "101221", "101222", "101223", "101224"];
/** a few doctors are filed under other codes; these find them in German, French and Italian */
const KEYWORDS = ["Arzt", "Ärztin", "médecin", "medico", "Psychiater"];
/** the search highlights keyword matches with <em> */
const unhighlight = (text: string) => text.replace(/<\/?em>/g, "");

/** A doctor's post in any of Switzerland's languages, leaving out assistants, nurses and vets. */
export function isSwissDoctor(title: string): boolean {
  const t = unhighlight(title);
  const doctor = isDoctorTitle(t) || /m[ée]decin|chef(fe)?\W{0,3}(ou cheffe )?de clinique|\bmedic[oa]\b|psychiat(er|re|ra)\b|psychiater:in/i.test(t);
  return doctor && !/assistant\W*e? m[ée]dical|assistente medic|tierarzt|v[ée]t[ée]rinaire|veterinar|ärztebesuch|délégué|pharma|\bmpa\b|pflege|infirmi/i.test(t);
}

async function search(body: { keywords: string[]; professionCodes: { type: string; value: string }[] }): Promise<Advert[]> {
  const ads: Advert[] = [];
  for (let page = 0; ; page++) {
    const list = await postJson<{ jobAdvertisement: Advert }[]>(`${API}?page=${page}&size=${PAGE_SIZE}&sort=date_desc`, {
      ...body,
      communalCodes: [],
      cantonCodes: [],
      workloadPercentageMin: 0,
      workloadPercentageMax: 100,
      permanent: null,
      companyName: null,
      onlineSince: 60,
      displayRestricted: false,
    });
    ads.push(...list.map((x) => x.jobAdvertisement));
    // the total is only in a header, so stop at the first short page
    if (list.length < PAGE_SIZE || page > 100) return ads;
  }
}

const escapeHtml = (text: string) => text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** The ads' Markdown-ish text ("### Ihr Profil", "* item", "\-") as HTML. */
export function markdownToHtml(text: string): string {
  const out: string[] = [];
  let list: string[] = [];
  const flush = () => {
    if (list.length) out.push(`<ul>${list.map((l) => `<li>${l}</li>`).join("")}</ul>`);
    list = [];
  };
  const inline = (line: string) => escapeHtml(line.replace(/\\([\\`*_{}[\]()#+\-.!])/g, "$1")).replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
  for (const raw of unhighlight(text).replace(/\r\n?/g, "\n").split("\n")) {
    const line = raw.trim();
    if (!line) {
      flush();
      continue;
    }
    const heading = /^#{1,6}\s+(.*)$/.exec(line);
    const bullet = /^[-*•]\s+(.*)$/.exec(line);
    if (heading) {
      flush();
      out.push(`<h3>${inline(heading[1]!)}</h3>`);
    } else if (bullet) list.push(inline(bullet[1]!));
    else {
      flush();
      out.push(`<p>${inline(line)}</p>`);
    }
  }
  flush();
  return sanitizeDescription(out.join(""));
}

const withScheme = (url: string) => (/^https?:\/\//i.test(url) ? url : `https://${url}`);

/** Doctor jobs in Switzerland from job-room.ch, the public employment service's board. */
export const jobroom: Fetcher<Advert> = {
  name: "jobroom",

  async fetch() {
    const byCode = await search({ keywords: [], professionCodes: HEALTH_CODES.map((value) => ({ type: "AVAM", value })) });
    const byKeyword = [];
    for (const keyword of KEYWORDS) byKeyword.push(...(await search({ keywords: [keyword], professionCodes: [] })));
    const ads = new Map([...byCode, ...byKeyword].map((a) => [a.id, a]));
    return [...ads.values()].filter((a) => isSwissDoctor(a.jobContent.jobDescriptions[0]?.title ?? ""));
  },

  normalize(raw, company) {
    const c = raw.jobContent;
    const text = c.jobDescriptions[0]!;
    const title = unhighlight(text.title).trim();
    const city = c.location?.city?.trim();
    const link = c.externalUrl || c.applyChannel?.formUrl;
    return {
      id: `jobroom:${raw.id}`,
      originalId: raw.id,
      company: company.key,
      employer: c.company?.name?.trim() || undefined,
      title,
      locations: [city ? `${city}, Switzerland` : "Switzerland"],
      remote: false,
      category: MEDICINE,
      specialty: specialtyOf(title),
      level: levelOf(title),
      descriptionHtml: text.description ? markdownToHtml(text.description) : "",
      applyUrl: link ? withScheme(link) : `https://www.job-room.ch/job-search/${raw.id}`,
      postedAt: raw.publication?.startDate ? `${raw.publication.startDate}T00:00:00.000Z` : undefined,
      source: "jobroom",
    };
  },
};
