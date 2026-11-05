import { cities, countries } from "./places.ts";
import { technologies } from "./technologies.ts";
import { employmentTypes } from "./employment.ts";
import { categoryName, countryName, defaultLang, type Lang, t } from "./i18n.ts";
import type { SnapshotDimension } from "./analytics.ts";
import type { Messages } from "./messages/en.ts";
import { levels, levelUrl, medicineCountries, medicineLocationUrl, MIN_CITY_JOBS, specialties, specialtyUrl, stateName, states } from "./medicine.ts";
import { getMedicineCounts, getOpenMedicineJobs, medicinePlace, type MedicineCity, type MedicineCounts } from "./jobs.ts";

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

export const levelLinks = (counts: Map<string, number>, lang: Lang = defaultLang, href: (slug: string) => string = levelUrl) =>
  linksFor(levels.map((slug) => ({ slug, name: t(lang).medicine.levels[slug] ?? slug })), counts, (l) => href(l.slug));

export const stateLinks = (counts: Map<string, number>, lang: Lang = defaultLang, href: (slug: string) => string = medicineLocationUrl) =>
  linksFor(states, counts, (s) => href(s.slug), (s) => stateName(s, lang));

/** Countries of the medical jobs, Germany included */
export const medicineCountryLinks = (counts: Map<string, number>, lang: Lang = defaultLang, href: (slug: string) => string = medicineLocationUrl) =>
  linksFor(medicineCountries, counts, (c) => href(c.slug), (c) => countryName(c, lang));

/**
 * Cities with a page of their own: enough jobs, and not a city-state, whose
 * state (or country) page already is the city's page. `areas` keeps the cities
 * of those states or countries only.
 */
export function medicineCityLinks(cities: Map<string, MedicineCity>, areas?: string | ReadonlySet<string>) {
  const inArea = (area: string) => !areas || (typeof areas === "string" ? area === areas : areas.has(area));
  return [...cities.values()]
    .filter((c) => c.count >= MIN_CITY_JOBS && c.slug !== c.area && inArea(c.area))
    .map((c) => ({ href: medicineLocationUrl(c.area, c.slug), label: c.name, count: c.count, area: c.area, slug: c.slug }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
}

const cityKey = (c: { area: string; slug: string }) => `${c.area}/${c.slug}`;

/**
 * Keys ("specialty/area/city") of the specialty-in-city pages: a specialty's
 * jobs in a city with a page of its own. `med` counts all open medical jobs.
 */
export function specialtyCityKeys(med: MedicineCounts): string[] {
  const pages = new Set(medicineCityLinks(med.cities).map(cityKey));
  return [...med.specialtyCities.keys()].filter((key) => pages.has(key.slice(key.indexOf("/") + 1)));
}

/**
 * Cities among `cities` with a page of their own, each linking to `href`.
 * `cities` counts a narrower set of jobs (a specialty's, say); `all` counts
 * every medical job, since a city has narrower pages only when it has a page
 * of its own. `areas` as in medicineCityLinks.
 */
export function comboCityLinks(
  cities: Map<string, MedicineCity>,
  all: Map<string, MedicineCity>,
  areas: string | ReadonlySet<string> | undefined,
  href: (area: string, city: string) => string,
) {
  const pages = new Set(medicineCityLinks(all, areas).map(cityKey));
  return [...cities.values()]
    .filter((c) => pages.has(cityKey(c)))
    .map((c) => ({ href: href(c.area, c.slug), label: c.name, count: c.count }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
}

/** A specialty's cities, linking to its page in each; as comboCityLinks */
export const specialtyCityLinks = (specialty: string, cities: Map<string, MedicineCity>, all: Map<string, MedicineCity>, areas?: string | ReadonlySet<string>) =>
  comboCityLinks(cities, all, areas, (area, city) => specialtyUrl(specialty, area, city));

/** A filter combination of the medical jobs; a city needs its area (a German state or a country) */
export interface MedicineCombo {
  specialty?: string;
  level?: string;
  area?: string;
  city?: string;
}

/** "specialty/level/area/city", empty where a filter isn't set: how the filter form looks combinations up */
export const medicineComboKey = (c: MedicineCombo) => [c.specialty, c.level, c.area, c.city].map((v) => v ?? "").join("/");

let medicineCombosCache: Promise<Set<string>> | undefined;

/**
 * Keys (medicineComboKey) of every combination of specialty, level and place
 * with open jobs, the empty one aside. A city counts only where it has a page
 * of its own, and Germany counts as an area besides its states, as on the pages.
 */
export const getMedicineComboKeys = () =>
  (medicineCombosCache ??= Promise.all([getOpenMedicineJobs(), getMedicineCounts()]).then(([jobs, med]) => {
    const cityPages = new Set(medicineCityLinks(med.cities).map(cityKey));
    const keys = new Set<string>();
    for (const job of jobs) {
      const { country, state, area, city } = medicinePlace(job);
      const places: MedicineCombo[] = [{}];
      for (const a of new Set([country, state])) if (a) places.push({ area: a });
      if (area && city && cityPages.has(`${area}/${city.slug}`)) places.push({ area, city: city.slug });
      for (const specialty of [undefined, job.specialty])
        for (const level of [undefined, job.level]) for (const place of places) keys.add(medicineComboKey({ specialty, level, ...place }));
    }
    keys.delete(medicineComboKey({}));
    return keys;
  }));

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
