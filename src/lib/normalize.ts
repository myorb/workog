import sanitizeHtml from "sanitize-html";

export function slugify(text: string): string {
  return text
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80)
    .replace(/-+$/, "");
}

export function makeJobSlug(company: string, title: string, originalId: string): string {
  return [slugify(company), slugify(title), slugify(originalId)].filter(Boolean).join("-");
}

const allowedTags = [
  "p", "br", "hr", "h2", "h3", "h4", "h5", "h6", "strong", "b", "em", "i", "u",
  "ul", "ol", "li", "a", "blockquote", "table", "thead", "tbody", "tr", "th", "td",
];

export function sanitizeDescription(html: string): string {
  return sanitizeHtml(html, {
    allowedTags,
    allowedAttributes: { a: ["href"] },
    allowedSchemes: ["http", "https", "mailto"],
    // h1 belongs to the page title; demote any in the description
    transformTags: {
      h1: "h2",
      a: sanitizeHtml.simpleTransform("a", { rel: "nofollow noopener", target: "_blank" }),
    },
    exclusiveFilter: (frame) =>
      ["p", "li", "strong", "b", "em"].includes(frame.tag) && !frame.text.trim() && !frame.mediaChildren.length,
  }).trim();
}

/** Decodes the HTML entities Greenhouse uses to escape its `content` field. */
export function decodeEntities(text: string): string {
  return text
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&#x27;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&");
}

const remotePattern = /\b(remote|anywhere|distributed|work from home|wfh)\b/i;

export function isRemote(...texts: (string | undefined)[]): boolean {
  return texts.some((t) => t !== undefined && remotePattern.test(t));
}

/** Splits a free-text location field into individual, deduplicated labels. */
export function splitLocations(raw: string | undefined): string[] {
  if (!raw) return [];
  const parts = raw
    .split(/\s*(?:•|;|\||\/|\bor\b)\s*/)
    .map((p) => p.replace(/\s+/g, " ").replace(/^[-–,\s]+|[-–,\s]+$/g, "").trim())
    .filter((p) => p.length > 1 && !/^(hybrid|in[- ]office|onsite|on-site)$/i.test(p));
  return [...new Set(parts)];
}

const categoryRules: [category: string, pattern: RegExp][] = [
  ["design", /\b(design(er)?|ux|ui|user experience|brand|creative|illustrat)/i],
  ["data", /\b(data|analytics|analyst|machine learning|ml|ai research|scientist|statistic)/i],
  ["engineering", /\b(engineer(ing)?|developer|software|sre|devops|architect|technical lead|firmware)/i],
  ["product", /\b(product manager|product management|product lead|program manager|tpm)\b/i],
  ["sales", /\b(sales|account executive|account manager|business development|bdr|sdr|partnerships?|solutions consultant)/i],
  ["marketing", /\b(marketing|growth|seo|content|communications|pr\b|social media|community)/i],
  ["support", /\b(support|customer success|customer experience|onboarding|implementation)/i],
  ["finance", /\b(finance|accounting|accountant|tax|treasury|controller|fp&a|payroll)/i],
  ["legal", /\b(legal|counsel|attorney|compliance|privacy|regulatory)/i],
  ["people", /\b(recruit(er|ing)|talent|people|hr\b|human resources|benefits|workplace)/i],
  ["operations", /\b(operations|ops\b|logistics|supply chain|procurement|facilities|strategy)/i],
  // Team names, not roles: "Sales Manager, Platforms" is sales, so these only apply when no role matched
  ["engineering", /\b(platforms?|infrastructure|security)\b/i],
];

/** Maps a job to our own taxonomy, checking the title first, then the department. */
export function categorize(title: string, department?: string): string | undefined {
  for (const text of [title, department]) {
    if (!text) continue;
    for (const [category, pattern] of categoryRules) {
      if (pattern.test(text)) return category;
    }
  }
  return undefined;
}

export function toIso(date: string | null | undefined): string | undefined {
  if (!date) return undefined;
  const d = new Date(date);
  return Number.isNaN(d.getTime()) ? undefined : d.toISOString();
}
