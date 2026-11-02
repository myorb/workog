import { z } from "zod";

const isoDate = z.iso.datetime({ offset: true });

export const JobSchema = z.object({
  /** `${source}:${originalId}`, stable across runs */
  id: z.string().min(1),
  /** generated once on first sight, never changes */
  slug: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  company: z.string().min(1),
  title: z.string().min(1),
  /** normalized "City, Country" style labels */
  locations: z.array(z.string().min(1)),
  remote: z.boolean(),
  department: z.string().optional(),
  category: z.string().optional(),
  /** sanitized */
  descriptionHtml: z.string(),
  applyUrl: z.url(),
  postedAt: isoDate.optional(),
  firstSeenAt: isoDate,
  lastSeenAt: isoDate,
  closedAt: isoDate.optional(),
  source: z.string().min(1),
});

export type Job = z.infer<typeof JobSchema>;

export const CompanyConfigSchema = z.object({
  key: z.string().regex(/^[a-z0-9-]+$/),
  name: z.string().min(1),
  logo: z.string().optional(),
  source: z.string().min(1),
  /** Greenhouse board token; other sources add their own fields */
  boardToken: z.string().optional(),
  /**
   * Keep only this many of the newest jobs, for companies too big to list in
   * full. Older jobs that fall out of the window are dropped, not closed.
   */
  maxJobs: z.number().int().positive().optional(),
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
