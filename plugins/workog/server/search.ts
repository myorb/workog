/**
 * Filtering, ranking and counting over the rows of Workog's job index
 * (src/lib/job-index.ts). Pure functions: data.ts loads the rows.
 */
import type { ApiIndex, MedicineRow, Section, TechRow, Term } from "../../../src/lib/job-index.ts";

export type Row = (TechRow & { section: "tech" }) | (MedicineRow & { section: "medicine" });
export type Vocab = ApiIndex["vocab"];

export interface Filters {
  section?: Section;
  query?: string;
  company?: string;
  employer?: string;
  country?: string;
  city?: string;
  state?: string;
  location?: string;
  remote?: boolean;
  technology?: string;
  category?: string;
  employment?: string;
  specialty?: string;
  level?: string;
  posted_within_days?: number;
}

export const groupings = ["company", "employer", "country", "city", "state", "technology", "category", "employment", "remote", "specialty", "level"] as const;
export type Grouping = (typeof groupings)[number];

/** A filter value that names nothing Workog knows; the message lists close matches */
export class FilterError extends Error {}

/** Lower case, no accents, single spaces: "Zürich " → "zurich" */
export const fold = (text: string) =>
  text
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();

const slugOf = (text: string) => fold(text).replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

/** The term a value names, by slug or by name */
export function resolve<T extends Term>(kind: string, value: string, terms: T[], hint = ""): T {
  const slug = slugOf(value);
  const found = terms.find((t) => t.slug === slug || slugOf(t.name) === slug);
  if (found) return found;
  const close = terms.filter((t) => slug && (t.slug.includes(slug) || slug.includes(t.slug) || slugOf(t.name).includes(slug))).slice(0, 10);
  const list = close.length ? close : terms.slice(0, 40);
  throw new FilterError(
    `No ${kind} "${value}" on Workog. ${close.length ? "Did you mean" : "Known values include"}: ${list.map((t) => `${t.slug} (${t.name})`).join(", ")}.${hint}`,
  );
}

const MEDICINE_ONLY = ["specialty", "level", "state"] as const;
const TECH_ONLY = ["technology", "category", "employment"] as const;

/** The sections a search covers: as asked, else the one its filters belong to, else both */
export function sectionsFor(filters: Filters, vocab: Vocab): Section[] {
  const medicine = MEDICINE_ONLY.filter((k) => filters[k] !== undefined);
  const tech = TECH_ONLY.filter((k) => filters[k] !== undefined);
  if (medicine.length && tech.length) throw new FilterError(`${medicine.join(", ")} apply to medical jobs and ${tech.join(", ")} to tech jobs; search one section at a time.`);
  const company = filters.company ? resolve("company", filters.company, vocab.companies).section : undefined;
  const implied = company ?? (medicine.length ? "medicine" : tech.length ? "tech" : undefined);
  if (filters.section && implied && filters.section !== implied) {
    throw new FilterError(`The filters given (${[...medicine, ...tech, ...(company ? ["company"] : [])].join(", ")}) only match ${implied} jobs, but section is "${filters.section}".`);
  }
  const section = filters.section ?? implied;
  return section ? [section] : ["tech", "medicine"];
}

interface Compiled {
  sections: Section[];
  tokens: string[];
  phrase: string;
  test(row: Row): boolean;
}

const LOCATION_HINT = ' To match any place by name, use "location" instead.';

/** Turns filter values into slugs once, and a test for each row */
export function compile(filters: Filters, vocab: Vocab, now = Date.now()): Compiled {
  const sections = sectionsFor(filters, vocab);
  const tests: ((row: Row) => boolean)[] = [];
  const add = (test: (row: Row) => boolean) => tests.push(test);
  const { query, employer, location } = filters;

  if (filters.company) {
    const company = resolve("company", filters.company, vocab.companies).slug;
    add((r) => r.company === company);
  }
  if (employer) {
    const name = fold(employer);
    add((r) => fold(r.employer ?? companyName(vocab, r.company)).includes(name));
  }
  if (filters.country) {
    const all = [...vocab.countries, ...vocab.medicineCountries.filter((m) => !vocab.countries.some((c) => c.slug === m.slug))];
    const country = resolve("country", filters.country, all, LOCATION_HINT).slug;
    add((r) => (r.section === "tech" ? (r.countries?.includes(country) ?? false) : r.country === country));
  }
  if (filters.city) {
    // tech rows carry city slugs from a fixed list; medicine rows the first location's city name
    // (only tech cities are listed, so an unknown city is an error only when medical jobs are left out)
    const slug = slugOf(filters.city);
    const known = vocab.cities.find((c) => c.slug === slug || slugOf(c.name) === slug);
    if (!known && !sections.includes("medicine")) resolve("city", filters.city, vocab.cities, LOCATION_HINT);
    const names = new Set([slug, ...(known ? [slugOf(known.name)] : [])]);
    add((r) => (r.section === "tech" ? known !== undefined && (r.cities?.includes(known.slug) ?? false) : r.city !== undefined && names.has(slugOf(r.city))));
  }
  if (filters.state) {
    const state = resolve("German state", filters.state, vocab.states, LOCATION_HINT).slug;
    add((r) => r.section === "medicine" && r.state === state);
  }
  if (location) {
    const place = fold(location);
    add((r) => r.locations.some((l) => fold(l).includes(place)));
  }
  if (filters.remote !== undefined) add((r) => r.remote === filters.remote);
  if (filters.technology) {
    const tech = resolve("technology", filters.technology, vocab.technologies).slug;
    add((r) => r.section === "tech" && (r.technologies?.includes(tech) ?? false));
  }
  if (filters.category) {
    const category = resolve("category", filters.category, vocab.categories).slug;
    add((r) => r.section === "tech" && (r.category ?? "other") === category);
  }
  if (filters.employment) {
    const employment = resolve("employment type", filters.employment, vocab.employment.map((slug) => ({ slug, name: slug }))).slug;
    add((r) => r.section === "tech" && r.employment === employment);
  }
  if (filters.specialty) {
    const specialty = resolve("specialty", filters.specialty, vocab.specialties).slug;
    add((r) => r.section === "medicine" && r.specialty === specialty);
  }
  if (filters.level) {
    const level = resolve("career level", filters.level, vocab.levels).slug;
    add((r) => r.section === "medicine" && r.level === level);
  }
  if (filters.posted_within_days !== undefined) {
    const since = new Date(now - filters.posted_within_days * 86_400_000).toISOString().slice(0, 10);
    add((r) => r.firstSeen >= since);
  }

  const phrase = query ? fold(query) : "";
  const tokens = phrase.split(/[\s,/]+/).filter(Boolean);
  if (tokens.length) add((r) => tokens.every((t) => haystack(r, vocab).includes(t)));
  return { sections, tokens, phrase, test: (row) => tests.every((t) => t(row)) };
}

const haystacks = new WeakMap<Row, string>();

/** What a text query searches: title, employer, company and locations */
function haystack(row: Row, vocab: Vocab): string {
  let text = haystacks.get(row);
  if (text === undefined) {
    text = fold([row.title, row.employer ?? "", companyName(vocab, row.company), ...row.locations].join(" | "));
    haystacks.set(row, text);
  }
  return text;
}

const names = new WeakMap<Vocab, Map<string, string>>();

export function companyName(vocab: Vocab, key: string): string {
  let map = names.get(vocab);
  if (!map) names.set(vocab, (map = new Map(vocab.companies.map((c) => [c.slug, c.name]))));
  return map.get(key) ?? key;
}

/** Newest first: by the day Workog first saw the job, then the posting's own date */
const byNewest = (a: Row, b: Row) => b.firstSeen.localeCompare(a.firstSeen) || (b.posted ?? "").localeCompare(a.posted ?? "");

/** Matching rows, best first: with a text query, title matches lead; otherwise newest first */
export function search(rows: Row[], compiled: Compiled): Row[] {
  const found = rows.filter(compiled.test);
  if (!compiled.tokens.length) return found.sort(byNewest);
  const score = (r: Row) => {
    const title = fold(r.title);
    return (title.includes(compiled.phrase) ? compiled.tokens.length + 1 : 0) + compiled.tokens.filter((t) => title.includes(t)).length;
  };
  const scores = new Map(found.map((r) => [r, score(r)]));
  return found.sort((a, b) => scores.get(b)! - scores.get(a)! || byNewest(a, b));
}

/** The values a row has for a grouping; a job in two cities counts in both */
export function valuesOf(row: Row, by: Grouping, vocab: Vocab): string[] {
  const one = (v: string | undefined) => (v ? [v] : []);
  switch (by) {
    case "company":
      return [row.company];
    case "employer":
      return [row.employer ?? companyName(vocab, row.company)];
    case "remote":
      return [row.remote ? "remote" : "not remote"];
    case "country":
      return row.section === "tech" ? (row.countries ?? []) : one(row.country);
    case "city":
      return row.section === "tech" ? (row.cities ?? []) : one(row.city);
    case "state":
      return row.section === "medicine" ? one(row.state) : [];
    case "technology":
      return row.section === "tech" ? (row.technologies ?? []) : [];
    case "category":
      return row.section === "tech" ? [row.category ?? "other"] : [];
    case "employment":
      return row.section === "tech" ? [row.employment] : [];
    case "specialty":
      return row.section === "medicine" ? one(row.specialty) : [];
    case "level":
      return row.section === "medicine" ? one(row.level) : [];
  }
}

/** The display name for a grouping's value */
export function labelOf(value: string, by: Grouping, vocab: Vocab): string {
  const lists: Partial<Record<Grouping, Term[]>> = {
    company: vocab.companies,
    country: [...vocab.countries, ...vocab.medicineCountries],
    city: vocab.cities,
    state: vocab.states,
    technology: vocab.technologies,
    category: vocab.categories,
    specialty: vocab.specialties,
    level: vocab.levels,
  };
  return lists[by]?.find((t) => t.slug === value)?.name ?? value;
}

/** Jobs per value of a grouping, most first, and how many jobs have no value */
export function count(rows: Row[], by: Grouping, vocab: Vocab): { counts: [string, number][]; unset: number } {
  const counts = new Map<string, number>();
  let unset = 0;
  for (const row of rows) {
    const values = valuesOf(row, by, vocab);
    if (!values.length) unset++;
    for (const v of values) counts.set(v, (counts.get(v) ?? 0) + 1);
  }
  return { counts: [...counts].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])), unset };
}
