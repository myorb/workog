import { employmentTypeOf, type EmploymentType } from "./employment.ts";
import { countryCode } from "./i18n.ts";
import { getCity, placesOf } from "./places.ts";
import type { Job } from "./schema.ts";

type Thing = Record<string, unknown>;

const employmentTypes: Record<EmploymentType, string> = {
  "full-time": "FULL_TIME",
  "part-time": "PART_TIME",
  contract: "CONTRACTOR",
  internship: "INTERN",
};

export const website = (site: URL, description: string): Thing => ({
  "@type": "WebSite",
  name: "Static Job",
  url: site.href,
  description,
  publisher: { "@type": "Organization", name: "Static Job", url: site.href, logo: new URL("/icon-512.png", site).href },
});

export const breadcrumbs = (items: { name: string; url: URL }[]): Thing => ({
  "@type": "BreadcrumbList",
  itemListElement: items.map((item, i) => ({ "@type": "ListItem", position: i + 1, name: item.name, item: item.url.href })),
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
    employmentType: employmentTypes[employmentTypeOf(job)],
    hiringOrganization: { "@type": "Organization", name: companyName },
    identifier: { "@type": "PropertyValue", name: companyName, value: job.id },
    url: url.href,
    directApply: false,
    ...(job.department && { occupationalCategory: job.department }),
    ...(jobLocation.length > 0 && { jobLocation }),
    ...(job.remote && {
      jobLocationType: "TELECOMMUTE",
      ...(places.countries.size > 0 && {
        applicantLocationRequirements: [...places.countries].map((c) => ({ "@type": "Country", name: countryCode(c) ?? c })),
      }),
    }),
  };
}
