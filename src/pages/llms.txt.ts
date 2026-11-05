import type { APIRoute } from "astro";
import { countTags, getCompanies, getHospitalIndex, getLatestRun, getMedicineCounts, getOpenJobs, getOpenMedicineJobs } from "../lib/jobs.ts";
import { countryLinks, employmentLinks, levelLinks, medicineCountryLinks, remoteUrl, specialtyLinks, stateLinks, technologyLinks } from "../lib/links.ts";
import { hospitalsUrl, hospitalUrl } from "../lib/hospitals.ts";
import { plural } from "../lib/format.ts";

/** Hospitals listed by name; the rest are on /medicine/hospitals */
const TOP_HOSPITALS = 30;

// https://llmstxt.org: a Markdown index of the site for language models
export const GET: APIRoute = async ({ site }) => {
  const url = (path: string) => new URL(path, site).href;
  const jobs = await getOpenJobs();
  const medicalJobs = await getOpenMedicineJobs();
  const companies = await getCompanies();
  const run = await getLatestRun();
  const counts = new Map<string, number>();
  for (const job of jobs) counts.set(job.company, (counts.get(job.company) ?? 0) + 1);
  const tags = await countTags(jobs);
  const med = await getMedicineCounts();
  const hospitals = await getHospitalIndex();
  const employers = new Set(medicalJobs.map((j) => j.employer ?? j.company)).size;

  const list = (links: { href: string; label: string; count: number }[]) =>
    links.map((l) => `- [${l.label}](${url(l.href)}): ${plural(l.count, "open job")}`).join("\n");
  const topHospitals = [...hospitals.groups, ...hospitals.hospitals]
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
    .slice(0, TOP_HOSPITALS)
    .map((h) => ({ href: hospitalUrl(h.slug), label: h.name, count: h.count }));

  const body = `# Workog

> Workog is a free job site with two sections: ${plural(jobs.length, "open job")} at ${plural(companies.length, "tech company")}, fetched daily from each company's official careers site, and ${plural(medicalJobs.length, "open job")} for doctors at ${plural(employers, "hospital or practice employer")} across Europe, from public job services (Bundesagentur für Arbeit in Germany, NHS Jobs in the UK, Arbetsförmedlingen in Sweden, job-room.ch in Switzerland, EURES for the rest of the EU and EEA) and hospital groups' own careers sites.${run ? ` Last updated ${run.finishedAt}.` : ""}

Each job page (\`/jobs/<slug>\`) has the title, employer, locations, posted date and full description, and links to the original posting to apply. A closed job's page stays online for 14 days, marked as closed. Browse pages list up to 50 of the newest jobs. Browse pages also exist in German (\`/de\`), Spanish (\`/es\`) and Ukrainian (\`/uk\`); job descriptions keep the original posting's language.

## Main pages

- [Home](${url("/")}): both sections at a glance
- [Tech jobs](${url("/tech")}): latest tech jobs, top companies, technologies and locations
- [Medical jobs](${url("/medicine")}): latest jobs for doctors, by specialty, career level, place and hospital
- [Analytics](${url("/analytics")}): daily history of open tech jobs per company, technology and country, with a permanent page per day (\`/analytics/history/<date>\`)
- [Sitemap](${url("/sitemap.xml")}): every indexable page, including each open job

## Medical jobs

- [By specialty](${url("/medicine/specialties")}): also narrowed by place (\`/medicine/specialties/<specialty>/<state-or-country>/<city>\`)
- [By career level](${url("/medicine/levels")}): resident (Assistenzarzt), specialist (Facharzt), senior physician (Oberarzt), head of department (Chefarzt); also narrowed by specialty and place (\`/medicine/levels/<level>/<specialty>/<state-or-country>/<city>\`)
- [By location](${url("/medicine/locations")}): German states, other countries and their cities
- [Hospitals](${url(hospitalsUrl)}): hospital groups and hospitals with at least 5 open jobs

### Specialties

${list(specialtyLinks(med.specialties))}

### Career levels

${list(levelLinks(med.levels))}

### Countries

${list(medicineCountryLinks(med.countries))}

### German states

${list(stateLinks(med.states))}

### Hospitals and hospital groups with the most open jobs

${list(topHospitals)}

## Tech jobs

- [Companies](${url("/companies")}): every tracked company with its open job count
- [Technologies](${url("/technologies")}): jobs by programming language and tool, also narrowed by country and city (\`/technologies/<tech>/<country>/<city>\`)
- [Locations](${url("/locations")}): jobs by country and city
- [Remote jobs](${url(remoteUrl())}): remote jobs, also by country (\`/remote/<country>\`)
- [Employment types](${url("/employment")}): full time, part time, contract and internship jobs

### Companies

${list(companies.map((c) => ({ href: `/companies/${c.key}`, label: c.name, count: counts.get(c.key) ?? 0 })).sort((a, b) => b.count - a.count || a.label.localeCompare(b.label)))}

### Technologies

${list(technologyLinks(tags.technologies))}

### Employment types

${list([{ href: remoteUrl(), label: "Remote", count: jobs.filter((j) => j.remote).length }, ...employmentLinks(tags.employment)])}

### Countries

${list(countryLinks(tags.countries))}
`;
  return new Response(body, { headers: { "Content-Type": "text/plain; charset=utf-8" } });
};
