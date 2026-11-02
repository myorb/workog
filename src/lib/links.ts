import { cities, countries } from "./places.ts";
import { technologies } from "./technologies.ts";
import { employmentTypes } from "./employment.ts";
import { countryName, defaultLang, type Lang, t } from "./i18n.ts";

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
