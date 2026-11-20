import { employmentTypeOf, type EmploymentType } from "./employment.ts";
import { countryCode } from "./i18n.ts";
import { medicineCountries } from "./medicine.ts";
import { nutsNames } from "./nuts-names.ts";
import { getCity, placesOf } from "./places.ts";
import type { Job, Salary } from "./schema.ts";

type Thing = Record<string, unknown>;

const employmentTypes: Record<EmploymentType, string> = {
  "full-time": "FULL_TIME",
  "part-time": "PART_TIME",
  contract: "CONTRACTOR",
  internship: "INTERN",
};

export const website = (site: URL, description: string): Thing => ({
  "@type": "WebSite",
  name: "Workog",
  url: site.href,
  description,
  publisher: { "@type": "Organization", name: "Workog", url: site.href, logo: new URL("/icon-512.png", site).href },
});

/** A schema.org object as JSON-LD script text; "</" inside JSON would close the script tag early */
export const ldJson = (data: Thing): string => JSON.stringify({ "@context": "https://schema.org", ...data }).replace(/</g, "\\u003c");

export const breadcrumbs = (items: { name: string; url: URL }[]): Thing => ({
  "@type": "BreadcrumbList",
  itemListElement: items.map((item, i) => ({ "@type": "ListItem", position: i + 1, name: item.name, item: item.url.href })),
});

/** Days a posting stays valid after the pipeline last saw it open */
const VALID_DAYS = 30;

/**
 * When Google should drop the posting if no newer build says otherwise. Every
 * run that sees the job moves lastSeenAt, so open jobs keep pushing it forward;
 * if the pipeline stops, or a capped company's job is no longer checked, the
 * posting expires instead of staying in Google for Jobs indefinitely.
 */
export const validThrough = (job: Pick<Job, "lastSeenAt">): string =>
  new Date(Date.parse(job.lastSeenAt) + VALID_DAYS * 24 * 60 * 60 * 1000).toISOString();

/** A posting's stated pay as schema.org MonetaryAmount: a single value, or a range */
export const baseSalary = (s: Salary): Thing => ({
  "@type": "MonetaryAmount",
  currency: s.currency,
  value: { "@type": "QuantitativeValue", ...(s.min === s.max ? { value: s.min } : { minValue: s.min, maxValue: s.max }), unitText: s.unit },
});

export interface Address {
  locality?: string;
  region?: string;
  /** ISO 3166-1 alpha-2 */
  country: string;
}

const medicineCountryByName = new Map(medicineCountries.map((c) => [c.name.toLowerCase(), c.slug]));
/** EU region names, which EURES gives in place of a city when a posting names none ("Nord, France") */
const regionNames = new Set(Object.values(nutsNames).map((n) => n.toLowerCase()));
const notAPlace = /\b(remote|anywhere|multiple|various|hybrid)\b/i;

/**
 * A "City, Region, Country" or "City, Country" label as a postal address, when
 * its last part names exactly one known country ("Seattle, WA, United States",
 * "Bad Füssing, Bayern, Germany"). Other shapes ("London", "US-New York") give undefined.
 */
export function parseLocation(label: string): Address | undefined {
  const parts = label.split(",").map((p) => p.trim()).filter(Boolean);
  if (parts.length < 2) return undefined;
  const last = parts.at(-1)!;
  const found = placesOf([last]).countries;
  const slug = medicineCountryByName.get(last.toLowerCase()) ?? (found.size === 1 ? [...found][0]! : undefined);
  const country = slug && countryCode(slug);
  if (!country || notAPlace.test(parts[0]!)) return undefined;
  // labels repeat a place in different case ("SEATTLE, WA"); keep the first part's own case unless it is all caps
  const locality = parts[0] === parts[0]!.toUpperCase() ? parts[0]!.toLowerCase().replace(/(^|[\s-])\p{L}/gu, (c) => c.toUpperCase()) : parts[0]!;
  // "Nord, France" names a region; "London, United Kingdom" is a region too, but also a city we know
  if (parts.length === 2 && regionNames.has(locality.toLowerCase()) && placesOf([locality]).cities.size === 0) return { region: locality, country };
  return { locality, ...(parts.length > 2 && { region: parts.at(-2)! }), country };
}

/**
 * Every place a job names, as precise as its labels allow: the label's own
 * city and region when it parses, else a known city matched in it, else the
 * country alone. Duplicates (same city and country) are dropped.
 */
export function addressesOf(locations: string[]): Address[] {
  const parsed: Address[] = [];
  const rest: string[] = [];
  for (const label of locations) {
    const address = parseLocation(label);
    if (address) parsed.push(address);
    else rest.push(label);
  }
  const places = placesOf(rest);
  const cityPlaces = [...places.cities].map(getCity).filter((c) => c !== undefined);
  const code = (slug: string) => countryCode(slug) ?? slug;
  const covered = new Set([...parsed.map((a) => a.country), ...cityPlaces.map((c) => code(c.country))]);
  const all: Address[] = [
    ...parsed,
    ...cityPlaces.map((c) => ({ locality: c.name, country: code(c.country) })),
    ...[...places.countries].map(code).filter((c) => !covered.has(c)).map((country) => ({ country })),
  ];
  const seen = new Set<string>();
  return all.filter((a) => {
    const key = `${a.locality?.toLowerCase()}|${a.country}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/** Google for Jobs markup: https://developers.google.com/search/docs/appearance/structured-data/job-posting */
export function jobPosting(job: Job, employer: { name: string; website?: string }, url: URL): Thing {
  const places = placesOf(job.locations);
  const jobLocation = addressesOf(job.locations).map((a) => ({
    "@type": "Place",
    address: {
      "@type": "PostalAddress",
      ...(a.locality && { addressLocality: a.locality }),
      ...(a.region && { addressRegion: a.region }),
      addressCountry: a.country,
    },
  }));

  return {
    "@type": "JobPosting",
    title: job.title,
    description: job.descriptionHtml,
    datePosted: job.postedAt ?? job.firstSeenAt,
    validThrough: validThrough(job),
    employmentType: employmentTypes[employmentTypeOf(job)],
    hiringOrganization: { "@type": "Organization", name: employer.name, ...(employer.website && { sameAs: employer.website }) },
    identifier: { "@type": "PropertyValue", name: employer.name, value: job.id },
    url: url.href,
    directApply: false,
    ...(job.department && { occupationalCategory: job.department }),
    ...(job.salary && { baseSalary: baseSalary(job.salary) }),
    ...(jobLocation.length > 0 && { jobLocation }),
    ...(job.remote && {
      jobLocationType: "TELECOMMUTE",
      ...(places.countries.size > 0 && {
        applicantLocationRequirements: [...places.countries].map((c) => ({ "@type": "Country", name: countryCode(c) ?? c })),
      }),
    }),
  };
}

/** A monthly report as a schema.org Report, dated by the snapshots it covers. */
export const report = (r: { title: string; description: string; url: URL; site: URL; lang: string; published: string; modified: string; about: string }): Thing => ({
  "@type": "Report",
  headline: r.title,
  name: r.title,
  description: r.description,
  url: r.url.href,
  inLanguage: r.lang,
  datePublished: r.published,
  dateModified: r.modified,
  about: r.about,
  isAccessibleForFree: true,
  author: { "@type": "Organization", name: "Workog", url: r.site.href },
  publisher: { "@type": "Organization", name: "Workog", url: r.site.href, logo: new URL("/icon-512.png", r.site).href },
});
