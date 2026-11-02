import { getCompanies, getOpenJobs, tagsOf } from "./jobs.ts";
import { cityUrl, countryUrl, employmentUrl, remoteUrl, technologyUrl } from "./links.ts";
import { getCity } from "./places.ts";

export interface SitemapEntry {
  path: string;
  lastmod?: string;
}

/**
 * Every page search engines should index. Pages rendered with `noindex`
 * (closed jobs, empty technology combinations, 404) are left out.
 */
export async function getSitemapEntries(): Promise<SitemapEntry[]> {
  const jobs = await getOpenJobs();
  const paths = new Set(["/", "/companies", "/locations", "/technologies", "/employment", "/analytics"]);

  for (const company of await getCompanies()) paths.add(`/companies/${company.key}`);

  for (const job of jobs) {
    const tags = tagsOf(job);
    for (const type of tags.employment) paths.add(employmentUrl(type));
    if (job.remote) {
      paths.add(remoteUrl());
      for (const country of tags.countries) paths.add(remoteUrl(country));
    }
    for (const country of tags.countries) paths.add(countryUrl(country));
    for (const slug of tags.cities) {
      const city = getCity(slug);
      if (city) paths.add(cityUrl(city.country, slug));
    }
    for (const tech of tags.technologies) {
      paths.add(technologyUrl(tech));
      for (const country of tags.countries) paths.add(technologyUrl(tech, country));
      for (const slug of tags.cities) {
        const city = getCity(slug);
        if (city) paths.add(technologyUrl(tech, city.country, slug));
      }
    }
  }

  return [
    ...[...paths].sort().map((path) => ({ path })),
    ...jobs.map((job) => ({ path: `/jobs/${job.slug}`, lastmod: job.firstSeenAt })),
  ];
}
