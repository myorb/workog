import { employmentTypeOf, type EmploymentType } from "./employment.ts";
import { countryCode } from "./i18n.ts";
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

/** Google for Jobs markup: https://developers.google.com/search/docs/appearance/structured-data/job-posting */
export function jobPosting(job: Job, companyName: string, url: URL): Thing {
  const places = placesOf(job.locations);
  const address = (country: string, locality?: string) => ({
    "@type": "Place",
    address: { "@type": "PostalAddress", ...(locality && { addressLocality: locality }), addressCountry: countryCode(country) ?? country },
  });
  // A city covers its country; countries without a matched city get a country-only address
  const cityPlaces = [...places.cities].map(getCity).filter((c) => c !== undefined);
  const coveredCountries = new Set(cityPlaces.map((c) => c.country));
  const jobLocation = [
    ...cityPlaces.map((c) => address(c.country, c.name)),
    ...[...places.countries].filter((c) => !coveredCountries.has(c)).map((c) => address(c)),
  ];

  return {
    "@type": "JobPosting",
    title: job.title,
    description: job.descriptionHtml,
    datePosted: job.postedAt ?? job.firstSeenAt,
    validThrough: validThrough(job),
    employmentType: employmentTypes[employmentTypeOf(job)],
    hiringOrganization: { "@type": "Organization", name: companyName },
    identifier: { "@type": "PropertyValue", name: companyName, value: job.id },
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
