import { z } from "zod";

const isoDate = z.iso.datetime({ offset: true });

export const JobSchema = z.object({
  /** `${source}:${originalId}`, stable across runs */
  id: z.string().min(1),
  /** generated once on first sight, never changes */
  slug: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  company: z.string().min(1),
  /** the hiring organization's name, for jobs from a job board, where `company` is the board */
  employer: z.string().min(1).optional(),
  title: z.string().min(1),
  /** normalized "City, Country" style labels */
  locations: z.array(z.string().min(1)),
  remote: z.boolean(),
  department: z.string().optional(),
  category: z.string().optional(),
  /** medicine jobs only: a slug from src/lib/medicine.ts */
  specialty: z.string().optional(),
  /** medicine jobs only: career level, a slug from src/lib/medicine.ts */
  level: z.string().optional(),
  /** sanitized */
  descriptionHtml: z.string(),
  applyUrl: z.url(),
  postedAt: isoDate.optional(),
  firstSeenAt: isoDate,
  lastSeenAt: isoDate,
  closedAt: isoDate.optional(),
  /**
   * Successful runs in a row that didn't list this open job. Paginated boards
   * skip some jobs at random, so a job closes only after CLOSE_AFTER_MISSES
   * misses (scripts/fetch.ts); until then it stays open with its old lastSeenAt.
   */
  missedRuns: z.number().int().positive().optional(),
  source: z.string().min(1),
});

export type Job = z.infer<typeof JobSchema>;

/**
 * A job closed for longer than the retention window, moved out of data/jobs
 * into data/archive (src/lib/archive.ts). It has no page any more, so it drops
 * the description and keeps what analytics need, with the tags the description
 * gave already worked out.
 */
export const ArchivedJobSchema = JobSchema.omit({ descriptionHtml: true, missedRuns: true }).extend({
  closedAt: isoDate,
  archivedAt: isoDate,
  /** technology slugs, from src/lib/technologies.ts */
  technologies: z.array(z.string()),
  /** employment type, from src/lib/employment.ts */
  employment: z.string(),
});

export type ArchivedJob = z.infer<typeof ArchivedJobSchema>;

/** A job as written to data/jobs: `lastSeenAt` is left out when it is the company's time in data/runs/seen.json */
export const StoredJobSchema = JobSchema.extend({ lastSeenAt: isoDate.optional() });

export type StoredJob = z.infer<typeof StoredJobSchema>;

export const CompanyConfigSchema = z.object({
  key: z.string().regex(/^[a-z0-9-]+$/),
  name: z.string().min(1),
  logo: z.string().optional(),
  source: z.string().min(1),
  /** Board name for Greenhouse, Ashby and Lever, company identifier for SmartRecruiters */
  boardToken: z.string().optional(),
  /** Public careers site for Workday, Eightfold and Oracle Recruiting, which the API URL is derived from */
  careersUrl: z.url().optional(),
  /**
   * Keep only this many of the newest jobs, for companies too big to list in
   * full. Older jobs that fall out of the window are dropped, not closed.
   */
  maxJobs: z.number().int().positive().optional(),
  /** A job board listing many employers rather than one company's careers site; its jobs set `employer` */
  board: z.boolean().optional(),
  /** "medicine" for medical-job sources, whose jobs live in the /medicine section instead of the tech pages */
  sector: z.enum(["medicine"]).optional(),
  /** A hospital group's own careers site; /medicine/hospitals lists it as a group of the hospitals it names as employers */
  group: z.boolean().optional(),
});

export type CompanyConfig = z.infer<typeof CompanyConfigSchema>;

export const SourceRunSchema = z.object({
  company: z.string(),
  source: z.string(),
  /** "fallback": the fetch failed or failed a sanity check, so yesterday's file was kept */
  status: z.enum(["ok", "fallback"]),
  reason: z.string().optional(),
  fetched: z.number().int(),
  invalid: z.number().int(),
  open: z.number().int(),
  new: z.number().int(),
  closed: z.number().int(),
  /** consecutive runs that fell back, 0 when ok */
  fallbackStreak: z.number().int(),
  /** fell back 3 runs in a row */
  broken: z.boolean(),
});

export const RunSchema = z.object({
  startedAt: isoDate,
  finishedAt: isoDate,
  sources: z.array(SourceRunSchema),
});

export type SourceRun = z.infer<typeof SourceRunSchema>;
export type Run = z.infer<typeof RunSchema>;

const DayCountsSchema = z.object({
  open: z.number().int(),
  new: z.number().int(),
  closed: z.number().int(),
});

/** One line of runs/history.json: per-company counts for one UTC day */
export const HistoryDaySchema = z.object({
  date: z.iso.date(),
  companies: z.record(z.string(), DayCountsSchema),
});

export type HistoryDay = z.infer<typeof HistoryDaySchema>;

const CountsSchema = z.record(z.string(), z.number().int());

/**
 * One data/history/<date>.json file: open jobs at the end of one UTC day,
 * broken down by every dimension the site browses. Unlike runs/history.json it
 * keeps the whole picture, so the day's analytics page can be rebuilt from it
 * long after its jobs have closed and been dropped.
 */
export const SnapshotSchema = z.object({
  date: z.iso.date(),
  open: z.number().int(),
  remote: z.number().int(),
  companies: CountsSchema,
  /** keyed by category, "other" for uncategorized jobs */
  categories: CountsSchema,
  countries: CountsSchema,
  cities: CountsSchema,
  technologies: CountsSchema,
  employment: CountsSchema,
});

export type Snapshot = z.infer<typeof SnapshotSchema>;
