/**
 * Reads a Workog job page (/jobs/<slug>): its JobPosting markup has the full
 * posting, and the apply button the link to apply. Closed jobs keep their page
 * for 14 days without the markup.
 */

export interface JobPage {
  title: string;
  closed: boolean;
  /** "This position was closed on …" */
  closedNote?: string;
  employer?: string;
  datePosted?: string;
  validThrough?: string;
  employmentType?: string;
  salary?: string;
  remote?: boolean;
  applyUrl?: string;
  /** plain text */
  description?: string;
}

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", ndash: "–", mdash: "—", hellip: "…", rsquo: "’", lsquo: "‘", rdquo: "”", ldquo: "“", bull: "•", euro: "€", pound: "£" };

export const decodeEntities = (text: string) =>
  text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (whole, code: string) => {
    if (code[0] === "#") {
      const n = code[1] === "x" || code[1] === "X" ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10);
      return Number.isFinite(n) && n > 0 && n <= 0x10ffff ? String.fromCodePoint(n) : whole;
    }
    return ENTITIES[code.toLowerCase()] ?? whole;
  });

/** Job description HTML as readable plain text: paragraphs, headings and list items on their own lines */
export function htmlToText(html: string): string {
  return decodeEntities(
    html
      .replace(/<(script|style)[\s\S]*?<\/\1>/gi, "")
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<li[^>]*>/gi, "\n- ")
      .replace(/<\/(p|div|h[1-6]|ul|ol|tr|section|blockquote)>/gi, "\n")
      .replace(/<(p|div|h[1-6]|ul|ol|tr|section|blockquote)[^>]*>/gi, "\n")
      .replace(/<[^>]+>/g, ""),
  )
    .replace(/[ \t ]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

interface Posting {
  "@type"?: string;
  title?: string;
  description?: string;
  datePosted?: string;
  validThrough?: string;
  employmentType?: string | string[];
  hiringOrganization?: { name?: string };
  jobLocationType?: string;
  baseSalary?: { currency?: string; value?: { value?: number; minValue?: number; maxValue?: number; unitText?: string } };
}

function salaryText(s: Posting["baseSalary"]): string | undefined {
  const v = s?.value;
  if (!s?.currency || !v) return undefined;
  const n = (x: number) => x.toLocaleString("en-US");
  const amount = v.value !== undefined ? n(v.value) : v.minValue !== undefined && v.maxValue !== undefined ? `${n(v.minValue)}–${n(v.maxValue)}` : undefined;
  return amount && `${s.currency} ${amount}${v.unitText ? ` per ${v.unitText.toLowerCase()}` : ""}`;
}

export function parseJobPage(html: string): JobPage {
  let posting: Posting | undefined;
  for (const [, json] of html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)) {
    try {
      const things = [JSON.parse(json!)].flat() as Posting[];
      posting ??= things.find((t) => t["@type"] === "JobPosting");
    } catch {
      // not ours to fix; the page still has a title
    }
  }
  const h1 = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/)?.[1];
  const title = posting?.title ?? (h1 ? htmlToText(h1) : "Untitled job");
  const closedNote = html.match(/<p class="closed"[^>]*>([\s\S]*?)<\/p>/)?.[1];
  const apply = html.match(/<a class="apply" href="([^"]+)"/)?.[1];
  if (!posting) return { title, closed: true, ...(closedNote && { closedNote: htmlToText(closedNote) }) };
  return {
    title,
    closed: false,
    employer: posting.hiringOrganization?.name,
    datePosted: posting.datePosted?.slice(0, 10),
    validThrough: posting.validThrough?.slice(0, 10),
    employmentType: [posting.employmentType].flat().filter(Boolean).join(", ") || undefined,
    salary: salaryText(posting.baseSalary),
    remote: posting.jobLocationType === "TELECOMMUTE",
    applyUrl: apply && decodeEntities(apply),
    description: posting.description ? htmlToText(posting.description) : undefined,
  };
}

/** The slug in a job's slug or page URL */
export function slugFrom(input: string): string | undefined {
  const slug = input.trim().replace(/^https?:\/\/[^/]+/, "").replace(/^\/?jobs\//, "").replace(/[/?#].*$/, "");
  return /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) ? slug : undefined;
}
