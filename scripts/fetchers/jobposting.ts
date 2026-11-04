import { sanitizeDescription } from "../../src/lib/normalize.ts";

/** The schema.org JobPosting many careers sites embed in each job page as JSON-LD. */
export interface Posting {
  title?: string;
  description?: string;
  responsibilities?: string;
  qualifications?: string;
  jobBenefits?: string;
  /** "2026-11-04" */
  datePosted?: string;
  hiringOrganization?: { name?: string };
  jobLocation?: PostingPlace | PostingPlace[];
}

interface PostingPlace {
  address?: { addressLocality?: string; addressRegion?: string; postalCode?: string };
}

/** The JobPosting from a page's JSON-LD blocks. */
export function parsePosting(html: string): Posting | undefined {
  for (const [, json] of html.matchAll(/<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g)) {
    try {
      const data = JSON.parse(json!);
      for (const item of Array.isArray(data) ? data : [data]) if (item?.["@type"] === "JobPosting") return item as Posting;
    } catch {
      // another script block, or broken JSON; keep looking
    }
  }
  return undefined;
}

/** The addresses of a posting's workplaces. */
export const postingAddresses = (p: Posting | undefined) =>
  (Array.isArray(p?.jobLocation) ? p.jobLocation : p?.jobLocation ? [p.jobLocation] : []).map((l) => l.address).filter((a) => a !== undefined);

/** The posting's text: the description, then its German-labelled parts as rexx portals show them. */
export const postingHtml = (p: Posting) =>
  sanitizeDescription(
    [
      p.description,
      p.responsibilities && `<h3>Ihre Aufgaben</h3>${p.responsibilities}`,
      p.qualifications && `<h3>Ihr Profil</h3>${p.qualifications}`,
      p.jobBenefits && `<h3>Wir bieten</h3>${p.jobBenefits}`,
    ]
      .filter(Boolean)
      .join(""),
  );
