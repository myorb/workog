/**
 * The share image of each hub page, in English whatever the page's language:
 * what the endpoints under src/pages/og/ render and what the pages put in
 * og:image and its alt text. One function per kind of page, so the image and
 * the page can't drift apart.
 */
import { getCompanies, getJobsByCompany, getJobsWhere, getMedicineCounts, getMedicineJobsWhere, getMedicineSnapshots, getOpenJobs, getSnapshots } from "./jobs.ts";
import { reportMonths, reportUrl, type ReportSection } from "./reports.ts";
import { formatMonth } from "./format.ts";
import { daysBetween } from "./trend.ts";
import { areaFilter, areaName, getArea, type Area } from "./medicine.ts";
import { countryName, t } from "./i18n.ts";
import { isThin } from "./constants.ts";
import { insightText } from "./insights.ts";
import { hubInsights } from "./page-insights.ts";
import { seriesChange, type Series } from "./series.ts";
import { shareAlt, shareImagePath, type ShareImage } from "./share-image.ts";
import type { LogoVariant } from "./logo.ts";

const en = t("en");

export interface ShareSubject {
  /** the page's path without a language prefix; the image is at shareImagePath(path) */
  path: string;
  image: ShareImage;
}

async function hub(path: string, variant: LogoVariant, title: string, name: string, series: Series & { key: string }, count: number): Promise<ShareSubject> {
  const { change } = await seriesChange(series, count);
  // the strongest insight that isn't the trend already on the image
  const note = (await hubInsights({ series, count })).find((i) => i.kind !== "outpaced");
  return {
    path,
    image: { variant, title, count, trend: change && { pct: change.pct, days: change.days }, note: note && insightText(note, name, "en", series.key) },
  };
}

export async function companyShare(key: string): Promise<ShareSubject | undefined> {
  const company = (await getCompanies()).find((c) => c.key === key);
  if (!company) return undefined;
  const count = (await getJobsByCompany(key)).length;
  return hub(`/companies/${key}`, "tech", en.company.title(company.name), company.name, { section: "tech", dim: "companies", key }, count);
}

export async function countryShare(country: { slug: string; name: string }): Promise<ShareSubject | undefined> {
  const count = (await getJobsWhere({ country: country.slug })).length;
  if (isThin(count)) return undefined;
  const name = countryName(country, "en");
  return hub(`/locations/${country.slug}`, "tech", en.place.title(name), name, { section: "tech", dim: "countries", key: country.slug }, count);
}

export async function medicineAreaShare(area: Area): Promise<ShareSubject | undefined> {
  const count = (await getMedicineJobsWhere(areaFilter(area))).length;
  if (isThin(count)) return undefined;
  const name = areaName(area, "en");
  const dim = area.kind === "state" ? "states" : "countries";
  return hub(`/medicine/locations/${area.slug}`, "medicine", en.medicine.placeTitle(name), name, { section: "medicine", dim, key: area.slug }, count);
}

export async function specialtyShare(specialty: string): Promise<ShareSubject | undefined> {
  const count = (await getMedicineJobsWhere({ specialty })).length;
  if (isThin(count)) return undefined;
  const name = en.medicine.specialties[specialty] ?? specialty;
  return hub(`/medicine/specialties/${specialty}`, "medicine", en.medicine.specialtyTitle(name), name, { section: "medicine", dim: "specialties", key: specialty }, count);
}

/** Specialty in a country ("Psychiatry jobs in Germany"); states get no image of their own */
export async function specialtyAreaShare(specialty: string, areaSlug: string): Promise<ShareSubject | undefined> {
  const area = getArea(areaSlug);
  const count = (await getMedicineCounts()).specialtyAreas.get(`${specialty}/${areaSlug}`) ?? 0;
  if (!area || area.kind !== "country" || isThin(count)) return undefined;
  const name = en.medicine.specialties[specialty] ?? specialty;
  return {
    path: `/medicine/specialties/${specialty}/${areaSlug}`,
    image: { variant: "medicine", title: en.medicine.specialtyTitleIn(name, areaName(area, "en")), count },
  };
}

/**
 * The image a medical job shares: the closest page that has one. The
 * specialty in the job's country (a state's jobs count toward Germany), then
 * the specialty, then the state or country.
 */
export async function medicineJobShare(specialty: string | undefined, area: Area | undefined): Promise<ShareSubject | undefined> {
  const country = area && (area.kind === "state" ? "germany" : area.slug);
  return (
    (specialty && country ? await memo(`sa:${specialty}/${country}`, () => specialtyAreaShare(specialty, country)) : undefined) ??
    (specialty ? await memo(`s:${specialty}`, () => specialtyShare(specialty)) : undefined) ??
    (area ? await memo(`a:${area.slug}`, () => medicineAreaShare(area)) : undefined)
  );
}

const cache = new Map<string, Promise<ShareSubject | undefined>>();
/** One computation per subject per build, however many pages ask */
const memo = (key: string, make: () => Promise<ShareSubject | undefined>) => {
  let hit = cache.get(key);
  if (!hit) cache.set(key, (hit = make()));
  return hit;
};

/** What a page puts in og:image and its alt text */
export const pageImage = (subject: ShareSubject | undefined) =>
  subject && { path: shareImagePath(subject.path), alt: shareAlt(subject.image) };

/** One image per monthly report: the month-end count and its change over the month */
export async function reportShares(section: ReportSection): Promise<ShareSubject[]> {
  const snapshots: { date: string; open: number }[] = section === "tech" ? await getSnapshots() : await getMedicineSnapshots();
  return reportMonths(snapshots, new Date().toISOString().slice(0, 10)).map(({ month, end, base }) => {
    const label = formatMonth(month, "en");
    return {
      path: reportUrl(section, month),
      image: {
        variant: section,
        title: section === "tech" ? en.reports.techTitle(label) : en.reports.medicineTitle(label),
        count: end.open,
        trend: base && { pct: ((end.open - base.open) / base.open) * 100, days: daysBetween(base.date, end.date) },
      },
    };
  });
}

/** The tech analytics page: today's total and its 30-day change */
export async function analyticsShare(): Promise<ShareSubject> {
  const count = (await getOpenJobs()).length;
  const { change } = await seriesChange({ section: "tech" }, count);
  return {
    path: "/analytics",
    image: { variant: "tech", title: "Tech hiring today", count, trend: change && { pct: change.pct, days: change.days } },
  };
}
