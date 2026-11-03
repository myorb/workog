import { categorize, decodeEntities, sanitizeDescription, toIso } from "../../src/lib/normalize.ts";
import { getText } from "./http.ts";
import type { Fetcher } from "./types.ts";

/** One `<item>` of a We Work Remotely RSS feed, fields as text. */
export interface WwrItem {
  /** "Company: Job title" */
  title: string;
  /** "Anywhere in the World", "USA Only", ... */
  region: string;
  /** flag-prefixed country names, comma-separated, often empty */
  country: string;
  category: string;
  type: string;
  /** HTML, entity-escaped */
  description: string;
  pubDate: string;
  guid: string;
  link: string;
}

// The site-wide feed holds only the newest 100 jobs; the category feeds together hold all of them
const categories = [
  "remote-full-stack-programming-jobs",
  "remote-back-end-programming-jobs",
  "remote-front-end-programming-jobs",
  "remote-design-jobs",
  "remote-devops-sysadmin-jobs",
  "remote-customer-support-jobs",
  "remote-sales-and-marketing-jobs",
  "remote-management-and-finance-jobs",
  "remote-product-jobs",
  "all-other-remote-jobs",
];

/** a list of more countries than this is a region, shown by the region's name */
const MAX_COUNTRIES = 5;

/** Reads the items of an RSS document; the feeds are flat, so no XML parser is needed. */
export function parseRss(xml: string): WwrItem[] {
  return [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)].map(([, item]) => {
    const field = (name: string) => {
      const value = item!.match(new RegExp(`<${name}>([\\s\\S]*?)</${name}>`))?.[1] ?? "";
      return value.replace(/^<!\[CDATA\[([\s\S]*)\]\]>$/, "$1").trim();
    };
    return {
      title: decodeEntities(field("title")),
      region: decodeEntities(field("region")),
      country: decodeEntities(field("country")),
      category: decodeEntities(field("category")),
      type: field("type"),
      description: decodeEntities(field("description")),
      pubDate: field("pubDate"),
      guid: field("guid"),
      link: field("link"),
    };
  });
}

/** We Work Remotely, a board of remote jobs, read from its per-category RSS feeds. */
export const weworkremotely: Fetcher<WwrItem> = {
  name: "weworkremotely",

  async fetch() {
    const seen = new Set<string>();
    const items: WwrItem[] = [];
    for (const category of categories) {
      for (const item of parseRss(await getText(`https://weworkremotely.com/categories/${category}.rss`))) {
        if (seen.has(item.guid)) continue;
        seen.add(item.guid);
        items.push(item);
      }
    }
    return items;
  },

  normalize(raw, company) {
    const split = raw.title.indexOf(": ");
    const employer = split > 0 ? raw.title.slice(0, split).trim() : "";
    const title = split > 0 ? raw.title.slice(split + 2).trim() : raw.title.trim();
    const countries = raw.country
      // "and" between countries is followed by a flag: "Bosnia and Herzegovina" is one country
      .split(/,\s*(?:and\s+)?|\s+and\s+(?=\p{Regional_Indicator})/u)
      .map((c) => c.replace(/\p{Regional_Indicator}/gu, "").replace(/ of Great Britain and Northern Ireland$/, "").trim())
      .filter(Boolean);
    const locations =
      countries.length && countries.length <= MAX_COUNTRIES
        ? countries
        : raw.region && !/^anywhere/i.test(raw.region)
          ? [raw.region.replace(/\s+only$/i, "")]
          : [];
    const originalId = raw.guid.split("/").pop() || raw.guid;
    return {
      id: `weworkremotely:${originalId}`,
      originalId,
      company: company.key,
      employer: employer || undefined,
      title,
      locations,
      remote: true,
      department: raw.category || undefined,
      category: categorize(title, raw.category),
      descriptionHtml: sanitizeDescription(raw.description),
      applyUrl: raw.link,
      postedAt: toIso(raw.pubDate),
      source: "weworkremotely",
    };
  },
};
