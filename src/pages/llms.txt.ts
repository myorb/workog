import type { APIRoute } from "astro";
import { countTags, getCompanies, getLatestRun, getOpenJobs } from "../lib/jobs.ts";
import { countryLinks, employmentLinks, remoteUrl, technologyLinks } from "../lib/links.ts";
import { plural } from "../lib/format.ts";

// https://llmstxt.org: a Markdown index of the site for language models
export const GET: APIRoute = async ({ site }) => {
  const url = (path: string) => new URL(path, site).href;
  const jobs = await getOpenJobs();
  const companies = await getCompanies();
  const run = await getLatestRun();
  const counts = new Map<string, number>();
  for (const job of jobs) counts.set(job.company, (counts.get(job.company) ?? 0) + 1);
  const tags = await countTags(jobs);

  const list = (links: { href: string; label: string; count: number }[]) =>
    links.map((l) => `- [${l.label}](${url(l.href)}): ${plural(l.count, "open job")}`).join("\n");

  const body = `# Static Job

> ${plural(jobs.length, "open job")} at ${plural(companies.length, "tech company")}, fetched daily from each company's official careers site.${run ? ` Last updated ${run.finishedAt}.` : ""}

Each job page (\`/jobs/<slug>\`) has the title, company, locations, team, posted date and full description, and links to the official posting to apply. Closed jobs stay online, marked as closed. Browse pages list up to 50 of the newest jobs.

## Main pages

- [Home](${url("/")}): latest jobs, top companies, technologies and locations
- [Companies](${url("/companies")}): every tracked company with its open job count
- [Technologies](${url("/technologies")}): jobs by programming language and tool, also narrowed by country and city (\`/technologies/<tech>/<country>/<city>\`)
- [Locations](${url("/locations")}): jobs by country and city
- [Remote jobs](${url(remoteUrl())}): remote jobs, also by country (\`/remote/<country>\`)
- [Employment types](${url("/employment")}): full time, part time, contract and internship jobs
- [Analytics](${url("/analytics")}): daily history of open jobs per company
- [Sitemap](${url("/sitemap.xml")}): every indexable page, including each open job

## Companies

${list(companies.map((c) => ({ href: `/companies/${c.key}`, label: c.name, count: counts.get(c.key) ?? 0 })).sort((a, b) => b.count - a.count || a.label.localeCompare(b.label)))}

## Technologies

${list(technologyLinks(tags.technologies))}

## Employment types

${list([{ href: remoteUrl(), label: "Remote", count: jobs.filter((j) => j.remote).length }, ...employmentLinks(tags.employment)])}

## Countries

${list(countryLinks(tags.countries))}
`;
  return new Response(body, { headers: { "Content-Type": "text/plain; charset=utf-8" } });
};
