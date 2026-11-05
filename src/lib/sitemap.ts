import { getCompanies, getHospitalIndex, getMedicineCounts, getMedicineSnapshots, getOpenJobs, getOpenMedicineJobs, getSnapshots, tagsOf } from "./jobs.ts";
import { reportMonths, reportsUrl, reportUrl } from "./reports.ts";
import { hospitalsUrl, hospitalUrl } from "./hospitals.ts";
import { levelUrl, medicineLocationUrl, specialtyUrl } from "./medicine.ts";
import { getMedicineComboCounts, medicineCityLinks, specialtyCityKeys } from "./links.ts";
import { cityUrl, countryUrl, employmentUrl, remoteTechnologyUrl, remoteUrl, technologyUrl } from "./links.ts";
import { getCity } from "./places.ts";
import { locales, localizePath } from "./i18n.ts";
import { isThin } from "./constants.ts";

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
 * (closed jobs, browse pages with fewer than MIN_INDEX_JOBS jobs, 404) are left out.
 */
export async function getSitemapEntries(): Promise<SitemapEntry[]> {
  const jobs = await getOpenJobs();
  const paths = new Set(["/", "/tech", "/companies", "/locations", "/technologies", "/employment", "/analytics"]);

  for (const company of await getCompanies()) paths.add(`/companies/${company.key}`);

  // Browse pages count their jobs, each job once per page, and only pages that aren't thin are listed
  const hubs = new Map<string, number>();
  for (const job of jobs) {
    const tags = tagsOf(job);
    const own = new Set<string>();
    for (const type of tags.employment) own.add(employmentUrl(type));
    if (job.remote) {
      paths.add(remoteUrl());
      for (const country of tags.countries) own.add(remoteUrl(country));
    }
    for (const country of tags.countries) own.add(countryUrl(country));
    for (const slug of tags.cities) {
      const city = getCity(slug);
      if (city) own.add(cityUrl(city.country, slug));
    }
    for (const tech of tags.technologies) {
      own.add(technologyUrl(tech));
      if (job.remote) own.add(remoteTechnologyUrl(tech));
      for (const country of tags.countries) own.add(technologyUrl(tech, country));
      for (const slug of tags.cities) {
        const city = getCity(slug);
        if (city) own.add(technologyUrl(tech, city.country, slug));
      }
    }
    for (const path of own) hubs.set(path, (hubs.get(path) ?? 0) + 1);
  }
  for (const [path, count] of hubs) if (!isThin(count)) paths.add(path);

  // Medical jobs: section pages always, browse pages only when they are not thin
  const medicalJobs = await getOpenMedicineJobs();
  if (medicalJobs.length) {
    const med = await getMedicineCounts();
    for (const path of ["/medicine", "/medicine/specialties", "/medicine/levels", "/medicine/locations"]) paths.add(path);
    const listed = (counts: Map<string, number>) => [...counts].filter(([, count]) => !isThin(count)).map(([key]) => key);
    for (const specialty of listed(med.specialties)) paths.add(specialtyUrl(specialty));
    for (const key of listed(med.specialtyAreas)) paths.add(`/medicine/specialties/${key}`);
    for (const key of specialtyCityKeys(med)) if (!isThin(med.specialtyCities.get(key)!)) paths.add(`/medicine/specialties/${key}`);
    for (const level of listed(med.levels)) paths.add(levelUrl(level));
    for (const key of listed(await getMedicineComboCounts())) {
      const [specialty, level, area, city] = key.split("/");
      if (level && (specialty || area)) paths.add(levelUrl(level, specialty, area, city));
    }
    for (const area of [...listed(med.countries), ...listed(med.states)]) paths.add(medicineLocationUrl(area));
    for (const city of medicineCityLinks(med.cities)) paths.add(city.href);
    const hospitals = await getHospitalIndex();
    paths.add(hospitalsUrl);
    for (const h of [...hospitals.groups, ...hospitals.hospitals]) paths.add(hospitalUrl(h.slug));
  }

  const snapshots = await getSnapshots();
  if (snapshots.length) paths.add("/analytics/history");

  const today = new Date().toISOString().slice(0, 10);
  const reports = [
    ...reportMonths(snapshots, today).map((r) => ({ path: reportUrl("tech", r.month), lastmod: r.end.date })),
    ...reportMonths(await getMedicineSnapshots(), today).map((r) => ({ path: reportUrl("medicine", r.month), lastmod: r.end.date })),
  ];
  if (reports.length) paths.add(reportsUrl);

  return [
    ...[...paths].sort().map((path) => ({ path })),
    ...snapshots.map((s) => ({ path: `/analytics/history/${s.date}`, lastmod: s.date })),
    ...reports,
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
