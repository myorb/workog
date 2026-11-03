import { getOpenJobs, tagsOf } from "./jobs.ts";
import type { Job } from "./schema.ts";

/** Jobs per related-jobs list on a job page */
export const RELATED_LIMIT = 5;

interface Ring {
  jobs: Job[];
  index: Map<string, number>;
}

type Rings = Map<string, Ring>;

let ringsCache: Promise<{ team: Rings; place: Rings }> | undefined;

/** Same company and category, or the whole company for jobs without one */
const teamKey = (job: Job) => `${job.company}|${job.category ?? ""}`;

/** The job's first matched city, else its first country, else remote */
function placeKey(job: Job): string | undefined {
  const { cities, countries } = tagsOf(job);
  const [city] = cities;
  if (city) return `city:${city}`;
  const [country] = countries;
  if (country) return `country:${country}`;
  return job.remote ? "remote" : undefined;
}

export function buildRings(jobs: Job[], key: (job: Job) => string | undefined): Rings {
  const groups = new Map<string, Job[]>();
  for (const job of jobs) {
    const k = key(job);
    if (!k) continue;
    const group = groups.get(k);
    if (group) group.push(job);
    else groups.set(k, [job]);
  }
  const rings: Rings = new Map();
  for (const [k, group] of groups) {
    group.sort((a, b) => b.firstSeenAt.localeCompare(a.firstSeenAt) || a.id.localeCompare(b.id));
    rings.set(k, { jobs: group, index: new Map(group.map((j, i) => [j.id, i])) });
  }
  return rings;
}

const getRings = () =>
  (ringsCache ??= getOpenJobs().then((jobs) => ({ team: buildRings(jobs, teamKey), place: buildRings(jobs, placeKey) })));

/**
 * The open jobs after this one in its group, wrapping around. Hub pages list
 * only the newest jobs, so this is what links every older job from a page
 * other than the sitemap: each job is linked from the `limit` jobs before it.
 * A closed job isn't in any group and gets the group's newest jobs.
 */
export function neighbours(ring: Ring | undefined, job: Job, skip: Set<string>, limit: number): Job[] {
  if (!ring) return [];
  const start = ring.index.get(job.id) ?? -1;
  const result: Job[] = [];
  for (let i = 1; i <= ring.jobs.length && result.length < limit; i++) {
    const next = ring.jobs[(start + i) % ring.jobs.length]!;
    if (next.id !== job.id && !skip.has(next.id)) result.push(next);
  }
  return result;
}

/** Related open jobs for a job page: same team at the company, then same place at any company */
export async function relatedJobs(job: Job, limit = RELATED_LIMIT): Promise<{ team: Job[]; place: Job[] }> {
  const rings = await getRings();
  const team = neighbours(rings.team.get(teamKey(job)), job, new Set(), limit);
  const k = placeKey(job);
  const place = k ? neighbours(rings.place.get(k), job, new Set(team.map((j) => j.id)), limit) : [];
  return { team, place };
}
