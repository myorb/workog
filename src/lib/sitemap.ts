import { getCompanies, getHospitalIndex, getMedicineCounts, getOpenJobs, getOpenMedicineJobs, getSnapshots, tagsOf } from "./jobs.ts";
import { hospitalsUrl, hospitalUrl } from "./hospitals.ts";
import { levelUrl, medicineLocationUrl, specialtyUrl } from "./medicine.ts";
import { medicineCityLinks } from "./links.ts";
import { cityUrl, countryUrl, employmentUrl, remoteTechnologyUrl, remoteUrl, technologyUrl } from "./links.ts";
import { getCity } from "./places.ts";
import { locales, localizePath } from "./i18n.ts";

export interface SitemapEntry {
  path: string;
  lastmod?: string;
  /** hreflang → path of every language version, the entry's own included */
  alternates?: { lang: string; path: string }[];
}

export interface Sitemap {
  /** published at /sitemap-<name>.xml */
  name: string;
  entries: SitemapEntry[];
}

/** URLs per sitemap file; the protocol allows 50,000, smaller files keep the build and recrawls light */
const URLS_PER_SITEMAP = 10_000;

/**
 * Every page search engines should index. Pages rendered with `noindex`
 * (closed jobs, empty technology combinations, 404) are left out.
 */
export async function getSitemapEntries(): Promise<SitemapEntry[]> {
  const jobs = await getOpenJobs();
  const paths = new Set(["/", "/tech", "/companies", "/locations", "/technologies", "/employment", "/analytics"]);

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
      if (job.remote) paths.add(remoteTechnologyUrl(tech));
      for (const country of tags.countries) paths.add(technologyUrl(tech, country));
      for (const slug of tags.cities) {
        const city = getCity(slug);
        if (city) paths.add(technologyUrl(tech, city.country, slug));
      }
    }
  }

  // Medical jobs: only pages with jobs, like the generated combination pages themselves
  const medicalJobs = await getOpenMedicineJobs();
  if (medicalJobs.length) {
    const med = await getMedicineCounts();
    for (const path of ["/medicine", "/medicine/specialties", "/medicine/levels", "/medicine/locations"]) paths.add(path);
    for (const specialty of med.specialties.keys()) paths.add(specialtyUrl(specialty));
    for (const key of med.specialtyStates.keys()) paths.add(`/medicine/specialties/${key}`);
    for (const level of med.levels.keys()) paths.add(levelUrl(level));
    for (const state of med.states.keys()) paths.add(medicineLocationUrl(state));
    for (const city of medicineCityLinks(med.cities)) paths.add(city.href);
    const hospitals = await getHospitalIndex();
    paths.add(hospitalsUrl);
    for (const h of [...hospitals.groups, ...hospitals.hospitals]) paths.add(hospitalUrl(h.slug));
  }

  const snapshots = await getSnapshots();
  if (snapshots.length) paths.add("/analytics/history");

  return [
    ...[...paths].sort().map((path) => ({ path })),
    ...snapshots.map((s) => ({ path: `/analytics/history/${s.date}`, lastmod: s.date })),
    ...[...jobs, ...medicalJobs].map((job) => ({ path: `/jobs/${job.slug}`, lastmod: job.firstSeenAt })),
  ];
}

/**
 * The sitemap files behind /sitemap.xml: browse pages in every language, each
 * listing its translations as hreflang alternates, then the English-only job pages.
 */
export async function getSitemaps(): Promise<Sitemap[]> {
  const entries = await getSitemapEntries();
  const pages = entries
    .filter((e) => !e.path.startsWith("/jobs/"))
    .flatMap((e) => {
      const alternates = locales.map((lang) => ({ lang, path: localizePath(e.path, lang) }));
      return alternates.map(({ path }) => ({ ...e, path, alternates }));
    });
  const jobs = entries.filter((e) => e.path.startsWith("/jobs/"));
  return [...chunk("pages", pages), ...chunk("jobs", jobs)];
}

function chunk(name: string, entries: SitemapEntry[]): Sitemap[] {
  const sitemaps: Sitemap[] = [];
  for (let i = 0; i < entries.length; i += URLS_PER_SITEMAP) {
    sitemaps.push({ name: `${name}-${sitemaps.length + 1}`, entries: entries.slice(i, i + URLS_PER_SITEMAP) });
  }
  return sitemaps;
}
