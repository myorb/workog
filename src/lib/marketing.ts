import type { Job } from "./schema.ts";

// Marketing and communications roles, read from the title only. The "marketing" category is
// broader ("content", "growth" and "community" alone count there), which is right for sorting
// jobs into functions but too loose for a page called Marketing jobs. Leaders ("Head of
// Marketing") are filed under management, so this checks the title whatever the category.
const marketingTitle = new RegExp(
  [
    "marketing\\w*", // also German compounds: Marketingmanager:in, Marketingkommunikation
    "marketer",
    "marcom",
    "brand (?:manager|strateg\\w*|lead|director|partnerships?|marketing)",
    "seo",
    "sem",
    "ppc",
    "paid (?:social|search|media)",
    "performance media",
    "media (?:relations|buyer|strateg\\w*|planner)",
    "demand gen(?:eration)?",
    "lead gen(?:eration)?",
    "growth (?:marketing|manager|lead|hacker)",
    "social media",
    "community (?:manag\\w*|specialist|lead)",
    "content (?:marketing|strateg\\w*|writer|creator|manager|lead|editor|spezialist\\w*)",
    "copywrit\\w*",
    "public relations",
    "pr (?:manager|lead|director|specialist)",
    "comms",
    "kommunikation\\w*",
    "communications? (?:manager|lead|director|specialist|strategist|associate|coordinator|assistant)",
    "(?:coordinator|assistant|manager|lead|director|head|responsable|stagiaire),? (?:of )?communications?",
    "head of (?:communications?|brand|growth|content|pr)",
    "go-to-market",
    "influencer",
    "events? (?:manager|marketing)",
    "(?:integrated )?campaigns?",
    "user acquisition",
    "abm",
  ].join("|"),
  "i",
);
const wrapped = new RegExp(`\\b(?:${marketingTitle.source})\\b`, "i");

// Titles that name marketing without being a marketing job: Salesforce's Marketing Cloud product,
// engineers or scientists who build marketing systems, and other functions that serve marketing
const notMarketing = /\bmarketing cloud\b|\b(?:engineer|scientist|developer|architect|recruiter|linguist|finance|business systems)\b/i;

/** Marketing and communications roles, leaders included. */
export function isMarketing(job: Pick<Job, "title">): boolean {
  return wrapped.test(job.title) && !notMarketing.test(job.title);
}
