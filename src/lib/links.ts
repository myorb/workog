import { cities, countries } from "./places.ts";
import { technologies } from "./technologies.ts";
import { employmentTypes } from "./employment.ts";
import { categoryName, countryName, defaultLang, type Lang, t } from "./i18n.ts";
import type { SnapshotDimension } from "./analytics.ts";
import type { Messages } from "./messages/en.ts";
import { levels, levelUrl, medicineLocationUrl, MIN_CITY_JOBS, specialties, specialtyUrl, stateName, states } from "./medicine.ts";

export const countryUrl = (country: string) => `/locations/${country}`;
export const cityUrl = (country: string, city: string) => `/locations/${country}/${city}`;
export const technologyUrl = (tech: string, country?: string, city?: string) =>
  ["/technologies", tech, country, city].filter(Boolean).join("/");
export const employmentUrl = (type: string) => `/employment/${type}`;
export const remoteUrl = (country?: string) => ["/remote", country].filter(Boolean).join("/");
export const remoteTechnologyUrl = (tech: string) => `/technologies/${tech}/remote`;

type Link = { href: string; label: string; count: number };

/** Links for every entry with jobs, most jobs first. Pages with no jobs are never linked. */
function linksFor<T extends { slug: string; name: string }>(
  items: T[],
  counts: Map<string, number>,
  href: (item: T) => string,
  label: (item: T) => string = (item) => item.name,
): Link[] {
  return items
    .map((item) => ({ href: href(item), label: label(item), count: counts.get(item.slug) ?? 0 }))
    .filter((l) => l.count > 0)
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
}

export const countryLinks = (counts: Map<string, number>, href: (slug: string) => string = countryUrl, lang: Lang = defaultLang) =>
  linksFor(countries, counts, (c) => href(c.slug), (c) => countryName(c, lang));

export const cityLinks = (counts: Map<string, number>, href: (country: string, slug: string) => string = cityUrl, country?: string) =>
  linksFor(country ? cities.filter((c) => c.country === country) : cities, counts, (c) => href(c.country, c.slug));

export const technologyLinks = (counts: Map<string, number>, href: (slug: string) => string = technologyUrl) =>
  linksFor(technologies, counts, (t) => href(t.slug));

export const employmentLinks = (counts: Map<string, number>, lang: Lang = defaultLang) =>
  linksFor(employmentTypes.map((slug) => ({ slug, name: t(lang).employment.types[slug] })), counts, (e) => employmentUrl(e.slug));

export const companyLinks = (counts: Map<string, number>, companies: { key: string; name: string }[]) =>
  linksFor(companies.map((c) => ({ slug: c.key, name: c.name })), counts, (c) => `/companies/${c.slug}`);

export const specialtyLinks = (counts: Map<string, number>, lang: Lang = defaultLang, href: (slug: string) => string = specialtyUrl) =>
  linksFor(specialties.map((slug) => ({ slug, name: t(lang).medicine.specialties[slug] ?? slug })), counts, (s) => href(s.slug));

export const levelLinks = (counts: Map<string, number>, lang: Lang = defaultLang) =>
  linksFor(levels.map((slug) => ({ slug, name: t(lang).medicine.levels[slug] ?? slug })), counts, (l) => levelUrl(l.slug));

export const stateLinks = (counts: Map<string, number>, lang: Lang = defaultLang, href: (slug: string) => string = medicineLocationUrl) =>
  linksFor(states, counts, (s) => href(s.slug), (s) => stateName(s, lang));

/**
 * Cities with a page of their own: enough jobs, and not a city-state, whose
 * state page already is the city's page.
 */
export function medicineCityLinks(cities: Map<string, { state: string; slug: string; name: string; count: number }>, state?: string) {
  return [...cities.values()]
    .filter((c) => c.count >= MIN_CITY_JOBS && c.slug !== c.state && (!state || c.state === state))
    .map((c) => ({ href: medicineLocationUrl(c.state, c.slug), label: c.name, count: c.count, state: c.state, slug: c.slug }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
}

/** Open jobs per company among `jobs` */
export function companyCounts(jobs: { company: string }[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const job of jobs) counts.set(job.company, (counts.get(job.company) ?? 0) + 1);
  return counts;
}

const countryBySlug = new Map(countries.map((c) => [c.slug, c]));
const cityBySlug = new Map(cities.map((c) => [c.slug, c]));
const technologyBySlug = new Map(technologies.map((t) => [t.slug, t]));

/**
 * Label and link for a key of each snapshot dimension. Keys no longer known
 * (a renamed technology, a removed company) fall back to the raw key, unlinked,
 * so old snapshots still render.
 */
export function snapshotLabels(lang: Lang, companyNames: Map<string, string>) {
  const known = (label: string | undefined, href: string, key: string) => (label ? { label, href } : { label: key });
  return {
    companies: (key: string) => known(companyNames.get(key), `/companies/${key}`, key),
    categories: (key: string) => ({ label: categoryName(key, lang) }),
    countries: (key: string) => {
      const c = countryBySlug.get(key);
      return known(c && countryName(c, lang), countryUrl(key), key);
    },
    cities: (key: string) => {
      const c = cityBySlug.get(key);
      return known(c?.name, c ? cityUrl(c.country, key) : "", key);
    },
    technologies: (key: string) => known(technologyBySlug.get(key)?.name, technologyUrl(key), key),
    employment: (key: string) => known(t(lang).employment.types[key as keyof Messages["employment"]["types"]], employmentUrl(key), key),
  } satisfies Record<SnapshotDimension, (key: string) => { label: string; href?: string }>;
}
