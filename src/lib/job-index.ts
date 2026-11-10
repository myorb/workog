/**
 * The open-job index under /api/v1: every open job as one slim row, split into
 * files of SHARD_SIZE jobs, plus index.json naming the files and the slugs each
 * filter takes. The Workog MCP server (plugins/workog) downloads it once per
 * pipeline run and searches it locally, so the site stays static. Job texts are
 * not in it; they are on each job's page, in its JobPosting markup.
 *
 * The row and index types are the contract with that server: add fields freely,
 * but rename or remove one only under a new /api/v<n>.
 */
import { categoryName, t } from "./i18n.ts";
import { employmentTypeOf, employmentTypes } from "./employment.ts";
import { getAllCompanies, getCompanies, getLatestRun, getOpenJobs, getOpenMedicineJobs, tagsOf } from "./jobs.ts";
import { getState, levels, medicineCountries, medicinePlaceOf, specialties, states } from "./medicine.ts";
import { cities, countries } from "./places.ts";
import { technologies } from "./technologies.ts";
import type { Job, Salary } from "./schema.ts";

export const API_VERSION = 1;
export const API_PATH = `/api/v${API_VERSION}`;
/** Jobs per file: about 3 MB of JSON, under 1 MB compressed */
export const SHARD_SIZE = 10_000;

export type Section = "tech" | "medicine";

/** Fields every row has; empty ones are left out */
interface BaseRow {
  slug: string;
  title: string;
  /** company key; for a job board, the board */
  company: string;
  /** the hiring organization, when `company` is a job board */
  employer?: string;
  locations: string[];
  remote: boolean;
  /** YYYY-MM-DD the pipeline first saw the job */
  firstSeen: string;
  /** YYYY-MM-DD the posting gives, when it gives one */
  posted?: string;
  salary?: Salary;
}

export interface TechRow extends BaseRow {
  /** job function, a slug of vocab.categories */
  category?: string;
  countries?: string[];
  cities?: string[];
  technologies?: string[];
  employment: string;
}

export interface MedicineRow extends BaseRow {
  specialty?: string;
  level?: string;
  /** country slug of the first known location */
  country?: string;
  /** German state slug */
  state?: string;
  city?: string;
}

export interface Term {
  slug: string;
  name: string;
}

export interface ApiIndex {
  version: typeof API_VERSION;
  /** startedAt of the pipeline run the files were built from; changes once a day */
  run: string | null;
  /** a job's page is /jobs/<slug> on the same site */
  sections: Record<Section, { open: number; files: string[] }>;
  vocab: {
    companies: (Term & { section: Section; board?: boolean })[];
    categories: Term[];
    countries: Term[];
    cities: (Term & { country: string })[];
    technologies: Term[];
    employment: string[];
    specialties: Term[];
    levels: Term[];
    medicineCountries: Term[];
    states: Term[];
  };
}

const day = (iso: string | undefined) => iso?.slice(0, 10);
const nonEmpty = <T>(values: Set<T>) => (values.size ? [...values] : undefined);

function baseRow(job: Job): BaseRow {
  return {
    slug: job.slug,
    title: job.title,
    company: job.company,
    ...(job.employer && { employer: job.employer }),
    locations: job.locations,
    remote: job.remote,
    firstSeen: day(job.firstSeenAt)!,
    ...(job.postedAt && { posted: day(job.postedAt) }),
    ...(job.salary && { salary: job.salary }),
  };
}

export function techRow(job: Job): TechRow {
  const tags = tagsOf(job);
  return {
    ...baseRow(job),
    ...(job.category && { category: job.category }),
    countries: nonEmpty(tags.countries),
    cities: nonEmpty(tags.cities),
    technologies: nonEmpty(tags.technologies),
    employment: employmentTypeOf(job),
  };
}

export function medicineRow(job: Job): MedicineRow {
  const place = medicinePlaceOf(job);
  return {
    ...baseRow(job),
    ...(job.specialty && { specialty: job.specialty }),
    ...(job.level && { level: job.level }),
    ...(place.country && { country: place.country }),
    ...(place.state && { state: place.state }),
    ...(place.city && { city: place.city.name }),
  };
}

const shardName = (section: Section, n: number) => `${section}-${n}.json`;
const shardCount = (jobs: number) => Math.max(1, Math.ceil(jobs / SHARD_SIZE));

let filesCache: Promise<Map<string, unknown>> | undefined;

/** Every file under API_PATH, by name, with its JSON value; built once per build */
export const apiFiles = () => (filesCache ??= buildFiles());

async function buildFiles(): Promise<Map<string, unknown>> {
  const tech = await getOpenJobs();
  const medicine = await getOpenMedicineJobs();
  const files = new Map<string, unknown>();
  const shard = <R>(section: Section, jobs: Job[], row: (job: Job) => R) => {
    const names: string[] = [];
    for (let n = 0; n < shardCount(jobs.length); n++) {
      names.push(shardName(section, n));
      files.set(shardName(section, n), jobs.slice(n * SHARD_SIZE, (n + 1) * SHARD_SIZE).map(row));
    }
    return names;
  };
  const sections = {
    tech: { open: tech.length, files: shard("tech", tech, techRow) },
    medicine: { open: medicine.length, files: shard("medicine", medicine, medicineRow) },
  };
  files.set("index.json", await buildIndex(sections));
  return files;
}

async function buildIndex(sections: ApiIndex["sections"]): Promise<ApiIndex> {
  const en = t("en");
  const all = await getAllCompanies();
  const tech = new Set((await getCompanies()).map((c) => c.key));
  return {
    version: API_VERSION,
    run: (await getLatestRun())?.startedAt ?? null,
    sections,
    vocab: {
      companies: all.map((c) => ({
        slug: c.key,
        name: c.name,
        section: tech.has(c.key) ? "tech" : "medicine",
        ...(c.board && { board: true }),
      })),
      categories: Object.keys(en.categories)
        .filter((slug) => slug !== "medicine")
        .map((slug) => ({ slug, name: categoryName(slug, "en") })),
      countries: countries.map(({ slug, name }) => ({ slug, name })),
      cities: cities.map(({ slug, name, country }) => ({ slug, name, country })),
      technologies: technologies.map(({ slug, name }) => ({ slug, name })),
      employment: [...employmentTypes],
      specialties: specialties.map((slug) => ({ slug, name: en.medicine.specialties[slug] ?? slug })),
      levels: levels.map((slug) => ({ slug, name: en.medicine.levels[slug] ?? slug })),
      medicineCountries: medicineCountries.map(({ slug, name }) => ({ slug, name })),
      states: states.map((s) => ({ slug: s.slug, name: getState(s.slug)!.en })),
    },
  };
}
