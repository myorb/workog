import { cities, countries } from "./places.ts";
import { technologies } from "./technologies.ts";
import { employmentTypes } from "./employment.ts";
import { categoryName, countryName, defaultLang, type Lang, t } from "./i18n.ts";
import type { SnapshotDimension } from "./analytics.ts";
import type { Messages } from "./messages/en.ts";

export const countryUrl = (country: string) => `/locations/${country}`;
export const cityUrl = (country: string, city: string) => `/locations/${country}/${city}`;
export const technologyUrl = (tech: string, country?: string, city?: string) =>
  ["/technologies", tech, country, city].filter(Boolean).join("/");
export const employmentUrl = (type: string) => `/employment/${type}`;
export const remoteUrl = (country?: string) => ["/remote", country].filter(Boolean).join("/");

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
