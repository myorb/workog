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
      ["p", "li", "strong", "b", "em", "h2", "h3", "h4"].includes(frame.tag) && !frame.text.trim() && !frame.mediaChildren.length,
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
  ["design", /\b(design(er)?|ux|ui|user experience|brand|creative|art direct|illustrat)/i],
  ["data", /\b(data|analytics|analyst|machine learning|ml|ai research|scientist|statistic)/i],
  ["engineering", /\b(engineer(ing)?|developer|software|sre|devops|architect|technical lead|firmware)/i],
  ["product", /\b(product manager|product management|product lead|program manager|tpm)\b/i],
  ["sales", /\b(sales|account executive|account manager|account director|business development|bdr|sdr|partnerships?|solutions consultant)/i],
  ["marketing", /\b(marketing|growth|seo|content|communications|pr\b|social media|community)/i],
  ["support", /\b(support|customer success|customer experience|onboarding|implementation)/i],
  ["finance", /\b(finance|accounting|accountant|tax|treasury|controller|fp&a|payroll)/i],
  ["legal", /\b(legal|counsel|attorney|compliance|privacy|regulatory)/i],
  ["people", /\b(recruit(er|ing)|talent|people|hr\b|human resources|benefits|workplace)/i],
  ["operations", /\b(operations|ops\b|logistics|supply chain|procurement|facilities|strategy)/i],
  // Team names, not roles: "Sales Manager, Platforms" is sales, so these only apply when no role matched
  ["engineering", /\b(platforms?|infrastructure|security)\b/i],
];

// Roles that only sit near a leader ("Chief of Staff", "Executive Assistant to the CEO",
// "Engineer, Office of the CTO", "Founder's Associate") or train under one
const notLeadership = /\b(chief of staff|office of|assistant|assistenz|intern(ship)?|praktik|stagiaire|werkstudent|trainee|graduate|individual contributor)\b|\bassociate\b(?! (director|vice president|vp)\b)/i;

/**
 * Leadership roles, read from the title only and checked before the functions:
 * "Head of Sales" is management and "Chief Financial Officer" is C-level, not
 * sales or finance. C-level titles must lead the title, so "Field CTO" and
 * "Data Center Chief Engineer" fall through to their function.
 */
const leadershipRules: [category: string, pattern: RegExp][] = [
  [
    "executive",
    // "CRO Manager" is conversion-rate work, so an acronym followed by a role noun isn't the officer
    /^(?:(?:interim|acting|fractional|group|global|technical|co-?)[\s-]*)*(?:chief\b[\w\s&,/-]{2,50}?\bofficer\b|(?:ceo|cto|cfo|coo|cio|cmo|cpo|cdo|cso|cro|chro|ciso|caio)\b(?!\s+(?:manager|analyst|specialist|engineer|lead|consultant))|president\b|managing director\b|geschäftsführ|vorstand|(?:co-?)?founder\b(?!'s))/i,
  ],
  [
    "management",
    /\b(head of|vice president|s?vp\b|evp\b|(?<!\b(?:account|art|creative|client|casting)\s)director|general manager|(?:engineering|software development|science|research) manager|(?<!\b(?:product|program|project|account|marketing)\s)manager\b(?:\s+[IV]+)?,?\s+(?:of\s+)?(?:software\s+|hardware\s+|data\s+)?(?:engineering|development|applied science|data science)(?!\s+program)|team ?lead\b|(?:team|abteilungs|bereichs|gruppen)leit|\bleiter(?:in)?\b|\bleitung\b)/i,
  ],
  // Tech managers named by what their team builds: "Software Dev Manager", "SRE Manager",
  // "IT Manager", "Tech Lead Manager". A word between the two ("Software Project Manager",
  // "IT Support Manager") makes it a manager of work or another function, so it doesn't count.
  [
    "management",
    /\b(?:software|firmware|hardware|silicon|asic|sre|devops|it)(?:\s+(?:dev|development|engineering|design|verification|validation))?\s+manager\b|\btech(?:nical)? lead manager\b/i,
  ],
  // A bare "Manager" leading the title, with the tech team after it: "Manager, Systems
  // Software", "Senior Manager, ASIC Chip Engineering", "Manager/Sr. Manager, AI Forward
  // Deployed Engineering". "Finance Manager, Design Engineering" names its function first,
  // so it keeps that function. Parentheses hold notes like "(m/w/d)", not the team.
  // Business work on a tech product ("Manager, Silicon Sourcing", "Manager, Strategic
  // Hardware Partnerships") isn't a tech team.
  [
    "management",
    /^(?!.*\b(?:sourcing|procurement|supply chain|commodity|partnerships?|monetization|pr|planning)\b)(?:(?:senior|sr\.?|snr|principal|group)\s+)*manager(?:\s*\/\s*(?:senior|sr\.?)\s+manager)?(?:\s+[IV]+)?\b[^(]*?\b(?:engineering|software|firmware|hardware|silicon|asic|sre|site reliability|devops|technical program management)\b/i,
  ],
];

export const LEADERSHIP_CATEGORIES = new Set(leadershipRules.map(([category]) => category));

/** Maps a job to our own taxonomy: leadership from the title, else its function. */
export function categorize(title: string, department?: string): string | undefined {
  if (!notLeadership.test(title)) {
    for (const [category, pattern] of leadershipRules) {
      if (pattern.test(title)) return category;
    }
  }
  return functionOf(title, department);
}

/** The function a job works in ("engineering", "sales"), checking the title first, then the department. */
export function functionOf(title: string, department?: string): string | undefined {
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
