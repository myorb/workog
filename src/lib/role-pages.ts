/**
 * Everything the /management and /marketing pages show, so their route files only pick a
 * builder. Each builder returns the props of RoleHub: title, description, jobs, the trail
 * above the page, and link groups to the narrower pages under it.
 */
import { countTags, getJobsWhere, getOpenJobs, isExecutive, isManagement, type JobFilter, tagsOf } from "./jobs.ts";
import { isMarketing } from "./marketing.ts";
import { cities, countries, getCity, getCountry, type City, type Country } from "./places.ts";
import { cityLinks, cityUrl, countryLinks, countryUrl, executiveUrl, type RoleSlug, roleRemoteUrl, roleUrl } from "./links.ts";
import { countryName, type Lang, t } from "./i18n.ts";
import type { Job } from "./schema.ts";

type Link = { href: string; label: string; count: number };

export interface HubProps {
  title: string;
  description: string;
  jobs: Job[];
  trail?: { name: string; href: string }[];
  sections?: { heading: string; links: Link[] }[];
  see?: { href: string; label: string };
}

const filters: Record<RoleSlug, JobFilter> = { management: { management: true }, marketing: { marketing: true } };
const texts = (role: RoleSlug, lang: Lang) => (role === "management" ? t(lang).managementJobs : t(lang).marketingJobs);
// only management has C-level pages
const hasExecutive = (role: RoleSlug) => role === "management";

const jobsOf = (role: RoleSlug, filter: JobFilter = {}) => getJobsWhere({ ...filters[role], ...filter });
const nonEmpty = (links: Link[]) => links.filter((l) => l.count > 0);

/** Links to the remote and (for management) C-level pages of a place, from the place's jobs. */
function moreLinks(role: RoleSlug, lang: Lang, jobs: Job[], country?: string, place?: string): Link[] {
  const tx = texts(role, lang);
  const mj = t(lang).managementJobs;
  return nonEmpty([
    { href: roleRemoteUrl(role, country), label: place ? tx.remoteTitleIn(place) : tx.remoteTitle, count: jobs.filter((j) => j.remote).length },
    ...(hasExecutive(role) ? [{ href: executiveUrl(country), label: place ? mj.executiveTitleIn(place) : mj.executiveTitle, count: jobs.filter(isExecutive).length }] : []),
  ]);
}

// ---- which pages exist

const roleOf: Record<RoleSlug, (job: Job) => boolean> = { management: isManagement, marketing: isMarketing };

/** The role pages a job lists on, each once. */
function pagesOf(job: Job): Set<string> {
  const tags = tagsOf(job);
  const pages = new Set<string>();
  for (const role of Object.keys(roleOf) as RoleSlug[]) {
    if (!roleOf[role](job)) continue;
    pages.add(roleUrl(role));
    if (job.remote) pages.add(roleRemoteUrl(role));
    if (hasExecutive(role) && isExecutive(job)) pages.add(executiveUrl());
    for (const country of tags.countries) {
      pages.add(roleUrl(role, country));
      if (job.remote) pages.add(roleRemoteUrl(role, country));
      if (hasExecutive(role) && isExecutive(job)) pages.add(executiveUrl(country));
    }
    for (const slug of tags.cities) {
      const city = getCity(slug);
      if (city) pages.add(roleUrl(role, city.country, slug));
    }
  }
  return pages;
}

let pageCountsCache: Promise<Map<string, number>> | undefined;

/**
 * Every /management and /marketing page with its open-job count ("/marketing/germany/munich" → 52),
 * computed once per build. The filter form routes only to these, and the sitemap and other pages
 * link only to the ones that aren't thin.
 */
export const getRolePageCounts = () =>
  (pageCountsCache ??= getOpenJobs().then((jobs) => {
    const counts = new Map<string, number>();
    for (const job of jobs) for (const page of pagesOf(job)) counts.set(page, (counts.get(page) ?? 0) + 1);
    return counts;
  }));

// ---- static paths: a page for every place with at least one job

export async function countryPaths(role: RoleSlug, filter: JobFilter = {}) {
  const counts = await countTags(await jobsOf(role, filter));
  return countries.filter((c) => counts.countries.has(c.slug)).map((country) => ({ params: { country: country.slug }, props: { country } }));
}

export async function cityPaths(role: RoleSlug) {
  const counts = await countTags(await jobsOf(role));
  return cities.filter((c) => counts.cities.has(c.slug)).map((city) => ({ params: { country: city.country, city: city.slug }, props: { city } }));
}

// ---- pages

export async function indexPage(role: RoleSlug, lang: Lang): Promise<HubProps> {
  const tx = texts(role, lang);
  const jobs = await jobsOf(role);
  const counts = await countTags(jobs);
  return {
    title: tx.title,
    description: tx.description(jobs.length, new Set(jobs.map((j) => j.company)).size),
    jobs,
    sections: [
      { heading: tx.more, links: moreLinks(role, lang, jobs) },
      { heading: tx.byCountry, links: countryLinks(counts.countries, (c) => roleUrl(role, c), lang) },
    ],
  };
}

export async function countryPage(role: RoleSlug, country: Country, lang: Lang): Promise<HubProps> {
  const tx = texts(role, lang);
  const name = countryName(country, lang);
  const jobs = await jobsOf(role, { country: country.slug });
  const counts = await countTags(jobs);
  return {
    title: tx.titleIn(name),
    description: tx.countryDescription(jobs.length, name),
    jobs,
    trail: [{ name: tx.title, href: roleUrl(role) }],
    see: { href: countryUrl(country.slug), label: t(lang).place.title(name) },
    sections: [
      { heading: tx.more, links: moreLinks(role, lang, jobs, country.slug, name) },
      { heading: tx.byCity, links: cityLinks(counts.cities, (c, city) => roleUrl(role, c, city), country.slug) },
    ],
  };
}

export async function cityPage(role: RoleSlug, city: City, lang: Lang): Promise<HubProps> {
  const tx = texts(role, lang);
  const countryLabel = countryName(getCountry(city.country)!, lang);
  const jobs = await jobsOf(role, { city: city.slug });
  // remote and C-level pages go down to the country only, so a city links up to its country's
  const inCountry = await jobsOf(role, { country: city.country });
  return {
    title: tx.titleIn(city.name),
    description: tx.countryDescription(jobs.length, city.name),
    jobs,
    trail: [
      { name: tx.title, href: roleUrl(role) },
      { name: tx.titleIn(countryLabel), href: roleUrl(role, city.country) },
    ],
    see: { href: cityUrl(city.country, city.slug), label: t(lang).place.title(city.name) },
    sections: [{ heading: tx.more, links: moreLinks(role, lang, inCountry, city.country, countryLabel) }],
  };
}

export async function remotePage(role: RoleSlug, lang: Lang): Promise<HubProps> {
  const tx = texts(role, lang);
  const jobs = await jobsOf(role, { remote: true });
  const counts = await countTags(jobs);
  return {
    title: tx.remoteTitle,
    description: tx.remoteDescription(jobs.length),
    jobs,
    trail: [{ name: tx.title, href: roleUrl(role) }],
    sections: [{ heading: tx.byCountry, links: countryLinks(counts.countries, (c) => roleRemoteUrl(role, c), lang) }],
  };
}

export async function remoteCountryPage(role: RoleSlug, country: Country, lang: Lang): Promise<HubProps> {
  const tx = texts(role, lang);
  const name = countryName(country, lang);
  const jobs = await jobsOf(role, { remote: true, country: country.slug });
  return {
    title: tx.remoteTitleIn(name),
    description: tx.remoteDescription(jobs.length, name),
    jobs,
    trail: [
      { name: tx.title, href: roleUrl(role) },
      { name: tx.remoteTitle, href: roleRemoteUrl(role) },
    ],
    see: { href: roleUrl(role, country.slug), label: tx.titleIn(name) },
  };
}

export async function executivePage(lang: Lang): Promise<HubProps> {
  const mj = t(lang).managementJobs;
  const jobs = await jobsOf("management", { executive: true });
  const counts = await countTags(jobs);
  return {
    title: mj.executiveTitle,
    description: mj.executiveDescription(jobs.length),
    jobs,
    trail: [{ name: mj.title, href: roleUrl("management") }],
    sections: [{ heading: mj.byCountry, links: countryLinks(counts.countries, (c) => executiveUrl(c), lang) }],
  };
}

export async function executiveCountryPage(country: Country, lang: Lang): Promise<HubProps> {
  const mj = t(lang).managementJobs;
  const name = countryName(country, lang);
  const jobs = await jobsOf("management", { executive: true, country: country.slug });
  return {
    title: mj.executiveTitleIn(name),
    description: mj.executiveDescription(jobs.length, name),
    jobs,
    trail: [
      { name: mj.title, href: roleUrl("management") },
      { name: mj.executiveTitle, href: executiveUrl() },
    ],
    see: { href: roleUrl("management", country.slug), label: mj.titleIn(name) },
  };
}
