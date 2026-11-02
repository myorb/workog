import { formatNumber, pluralizer } from "../locale.ts";

const p = pluralizer("en");
const n = (x: number) => formatNumber(x, "en");

const openJobs = { one: "open job", other: "open jobs" };
const openPositions = { one: "open position", other: "open positions" };
const openTechJobs = { one: "open tech job", other: "open tech jobs" };
const openRoles = { one: "open role", other: "open roles" };
const roles = { one: "role", other: "roles" };
const techCompanies = { one: "tech company", other: "tech companies" };
const companies = { one: "company", other: "companies" };
const countries = { one: "country", other: "countries" };
const cities = { one: "city", other: "cities" };
const days = { one: "day", other: "days" };

export const en = {
  nav: { locations: "Locations", technologies: "Technologies", companies: "Companies", analytics: "Analytics" },
  language: "Language",
  lastUpdated: "Last updated",
  footerNote: "Listings link to each company's official posting. Apply on the company's site.",
  remote: "Remote",
  seen: (date: string) => `Seen ${date}`,
  moreLocations: (k: number) => `+${n(k)} more`,
  locationNotListed: "Location not listed",
  openJobs: (k: number) => p(k, openJobs),
  openPositions: (k: number) => p(k, openPositions),
  showingNewest: (k: number) => `, showing the ${n(k)} newest`,
  latestJobs: "Latest jobs",
  allCompanies: "All companies →",
  allTechnologies: "All technologies →",
  allLocations: "All locations →",
  categories: {
    data: "Data",
    design: "Design",
    engineering: "Engineering",
    finance: "Finance",
    legal: "Legal",
    marketing: "Marketing",
    operations: "Operations",
    people: "People",
    product: "Product",
    sales: "Sales",
    support: "Support",
    other: "Other",
  } as Record<string, string>,
  chartRange: (unit: string, from: string, to: string) => `${unit} from ${from} to ${to}`,
  shareOf: (label: string, pct: string, total: number) => `${label}: ${pct} of ${n(total)}`,

  home: {
    description: (j: number, c: number) => `${p(j, openJobs)} at ${p(c, techCompanies)}, refreshed daily from official career sites.`,
    heading: "Open jobs at top tech companies",
    summary: (j: number, c: number) => `${p(j, openPositions)} across ${p(c, companies)}, refreshed daily.`,
    topCompanies: "Top companies",
    technologies: "Technologies",
    locations: "Locations",
  },
  companies: {
    title: "Companies",
    description: (k: number) => `Open jobs at ${p(k, techCompanies)}, with live job counts.`,
  },
  company: {
    title: (name: string) => `${name} jobs`,
    description: (k: number, name: string, cats: string[]) =>
      `${p(k, openJobs)} at ${name}${cats.length ? ` in ${cats.join(", ")}` : ""} and more. Updated daily.`,
    none: "No open positions right now.",
  },
  locations: {
    title: "Jobs by location",
    description: (co: number, ci: number) => `Open tech jobs in ${p(co, countries)} and ${p(ci, cities)}, refreshed daily.`,
    countries: "Countries",
    topCities: "Top cities",
  },
  place: {
    title: (place: string) => `Jobs in ${place}`,
    countryDescription: (k: number, country: string) => `${p(k, openTechJobs)} in ${country}, including remote roles. Updated daily.`,
    cityDescription: (k: number, place: string) => `${p(k, openTechJobs)} in ${place}. Updated daily.`,
    cities: "Cities",
    technologies: "Technologies",
  },
  technologies: {
    title: "Jobs by technology",
    description: (names: string[]) => `Open developer jobs for ${names.join(", ")} and more, refreshed daily.`,
  },
  tech: {
    title: (tech: string) => `${tech} jobs`,
    titleIn: (tech: string, place: string) => `${tech} jobs in ${place}`,
    description: (k: number, tech: string, co: number) =>
      `${p(k, { one: `open ${tech} job`, other: `open ${tech} jobs` })} at top tech companies, in ${p(co, countries)}. Updated daily.`,
    countryDescription: (k: number, tech: string, country: string) =>
      `${p(k, { one: `open ${tech} job`, other: `open ${tech} jobs` })} in ${country}, including remote roles. Updated daily.`,
    cityDescription: (k: number, tech: string, place: string) =>
      `${p(k, { one: `open ${tech} job`, other: `open ${tech} jobs` })} in ${place}. Updated daily.`,
    byCountry: "By country",
    topCities: "Top cities",
    none: (tech: string) => `No open ${tech} positions right now.`,
    noneIn: (tech: string, place: string) => ({
      before: `No ${tech} roles in ${place} right now. Listings refresh daily; meanwhile see `,
      link: `all jobs in ${place}`,
      after: ".",
    }),
    worldwide: (tech: string) => `Latest ${tech} jobs worldwide`,
    elsewhere: (tech: string, country: string) => `${tech} jobs elsewhere in ${country}`,
  },
  analytics: {
    title: "Analytics",
    description: (k: number) => `Hiring at a glance: ${p(k, openJobs)} by function, company, technology and location, refreshed daily.`,
    snapshot: (k: number) => `Snapshot of ${p(k, openRoles)}`,
    updated: "updated",
    openJobs: "Open jobs",
    companiesHiring: "Companies hiring",
    remote: "Remote",
    latestRun: "Latest run",
    trends: "Trends",
    openOverTime: "Open jobs over time",
    openJobsUnit: "open jobs",
    newVsClosed: "New vs closed per week",
    new: "New",
    closed: "Closed",
    weekTitle: (week: string, nw: number, cl: number) => `Week of ${week}: ${n(nw)} new, ${n(cl)} closed`,
    trendsPending: (min: number, k: number, since?: string) =>
      `Trend charts appear once there are ${p(min, days)} of history (${p(k, days)} so far${since ? `, since ${since}` : ""}).`,
    byFunction: "Jobs by function",
    byCompany: "Jobs by company",
    topTechnologies: "Top technologies",
    topCountries: "Top countries",
    topCities: "Top cities",
    postedHeading: "When open roles were posted",
    medianAge: (d: number) => `Median age ${p(d, days)}.`,
    postedEarlier: (k: number) => `${p(k, roles)} posted earlier.`,
    undated: (k: number) => `${p(k, roles)} without a posted date.`,
    postedTitle: (label: string, k: number) => `${label}: ${p(k, openRoles)} posted`,
    remoteByFunction: "Remote share by function",
  },
};

export type Messages = typeof en;
