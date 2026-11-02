import type { Job } from "./schema.ts";

export const employmentTypes = ["full-time", "part-time", "contract", "internship"] as const;
export type EmploymentType = (typeof employmentTypes)[number];

// Career sites rarely state the type in a field, so it is read from the title, and from the
// description only for phrases that describe the role itself ("experience exclusive of internships",
// "manage contractor resources" and "not considering part-time" must not count)
const rules: [type: EmploymentType, title: RegExp, description?: RegExp][] = [
  ["internship", /\b(intern|internship|co-?op|apprentice(ship)?)\b/i],
  // "Contract" alone is also a subject ("Contract Success Specialist"), so it counts only leading or in parentheses
  ["contract", /\b(contractor|fixed[- ]term|FTC|temporary|temp)\b|^contract\b|\([^)]*\bcontract\b/i,/\bfixed[- ]term contract\b|\bthis is a (temporary|contract) (role|position)\b/i],
  ["part-time", /\bpart[- ]time\b/i, /\bthis is a part[- ]time (role|position)\b/i],
];

/** Full-time unless the posting says otherwise. */
export function employmentTypeOf(job: Pick<Job, "title" | "descriptionHtml">): EmploymentType {
  for (const [type, title] of rules) {
    if (title.test(job.title)) return type;
  }
  const text = job.descriptionHtml.replace(/<[^>]+>/g, " ");
  for (const [type, , description] of rules) {
    if (description?.test(text)) return type;
  }
  return "full-time";
}

export const isEmploymentType = (slug: string): slug is EmploymentType => (employmentTypes as readonly string[]).includes(slug);
