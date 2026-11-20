/**
 * The "At a glance" paragraph on a job page: a few dated facts in Workog's own
 * words (how long the job has been open, the technologies it names, how much the
 * employer and the place are hiring). Job descriptions are copied from career
 * sites, so this is the part of each page that search engines can't find
 * anywhere else. In the page's language; the wording lives in the message catalogs.
 */
import { formatDate } from "./format.ts";
import { type Lang, t } from "./i18n.ts";
import { daysBetween, roundPct } from "./trend.ts";

export interface SummaryInput {
  employer: string;
  /** when the employer posted the job; undefined when the source gives no date */
  postedAt?: string;
  /** when Workog first saw the job */
  firstSeenAt: string;
  /** the build's data date, so the age is the same on every page of one build */
  asOf: string;
  technologies: string[];
  /** already formatted in the page's language */
  salary?: string;
  /** the employer's open jobs on Workog, with the change over about 30 days when known */
  employerJobs?: { name: string; open: number; pct?: number; days?: number; doctors?: boolean };
  /** the open jobs like this one nearby: all jobs, medical jobs, or one specialty's, in a city, state or country */
  nearby?: { open: number; where: string; medical: boolean; specialty?: string };
}

export function jobSummary(s: SummaryInput, lang: Lang = "en"): string[] {
  const g = t(lang).job.glance;
  const sentences: string[] = [];

  if (s.postedAt) {
    const days = daysBetween(s.postedAt, s.asOf);
    sentences.push(`${g.posted(s.employer, formatDate(s.postedAt, lang))} ${days < 1 ? g.openToday : g.openFor(days)}`);
  } else sentences.push(g.firstFound(formatDate(s.firstSeenAt, lang)));

  if (s.technologies.length) sentences.push(g.names(s.technologies.slice(0, 6)));

  sentences.push(s.salary ? g.pay(s.salary) : g.noPay);

  const e = s.employerJobs;
  if (e && e.open > 1) {
    const change = e.pct !== undefined && e.days ? { pct: roundPct(e.pct), days: e.days } : undefined;
    sentences.push(g.employerJobs(e.name, e.open, Boolean(e.doctors), change));
  }

  if (s.nearby && s.nearby.open > 1) sentences.push(g.nearby(s.nearby.open, { specialty: s.nearby.specialty, medical: s.nearby.medical }, s.nearby.where));

  return sentences;
}
