import { formatNumber, pluralizer } from "../locale.ts";
import type { Messages } from "./en.ts";

const p = pluralizer("de");
const n = (x: number) => formatNumber(x, "de");

const openJobs = { one: "offene Stelle", other: "offene Stellen" };
const openTechJobs = { one: "offener Tech-Job", other: "offene Tech-Jobs" };
const positions = { one: "Stelle", other: "Stellen" };
const techCompanies = { one: "Tech-Unternehmen", other: "Tech-Unternehmen" };
const companies = { one: "Unternehmen", other: "Unternehmen" };
// dative, as they always follow "in"
const countries = { one: "Land", other: "Ländern" };
const cities = { one: "Stadt", other: "Städten" };
const days = { one: "Tag", other: "Tage" };
const techJobs = (tech: string) => ({ one: `offener ${tech}-Job`, other: `offene ${tech}-Jobs` });

export const de = {
  nav: { locations: "Standorte", technologies: "Technologien", companies: "Unternehmen", analytics: "Analysen" },
  language: "Sprache",
  lastUpdated: "Zuletzt aktualisiert",
  footerNote: "Die Einträge verlinken auf die offizielle Ausschreibung des Unternehmens. Bewirb dich auf der Website des Unternehmens.",
  remote: "Remote",
  seen: (date: string) => `Gesehen am ${date}`,
  moreLocations: (k: number) => `+${n(k)} weitere`,
  locationNotListed: "Kein Standort angegeben",
  openJobs: (k: number) => p(k, openJobs),
  openPositions: (k: number) => p(k, openJobs),
  showingNewest: (k: number) => `, die ${n(k)} neuesten werden angezeigt`,
  latestJobs: "Neueste Stellen",
  allCompanies: "Alle Unternehmen →",
  allTechnologies: "Alle Technologien →",
  allLocations: "Alle Standorte →",
  categories: {
    data: "Daten",
    design: "Design",
    engineering: "Engineering",
    finance: "Finanzen",
    legal: "Recht",
    marketing: "Marketing",
    operations: "Operations",
    people: "Personal",
    product: "Produkt",
    sales: "Vertrieb",
    support: "Support",
    other: "Sonstiges",
  },
  chartRange: (unit: string, from: string, to: string) => `${unit} vom ${from} bis ${to}`,
  shareOf: (label: string, pct: string, total: number) => `${label}: ${pct} von ${n(total)}`,

  home: {
    description: (j: number, c: number) =>
      `${p(j, openJobs)} bei ${p(c, techCompanies)}, täglich aktualisiert von den offiziellen Karriereseiten.`,
    heading: "Offene Stellen bei führenden Tech-Unternehmen",
    summary: (j: number, c: number) => `${p(j, openJobs)} bei ${p(c, companies)}, täglich aktualisiert.`,
    topCompanies: "Top-Unternehmen",
    technologies: "Technologien",
    locations: "Standorte",
  },
  companies: {
    title: "Unternehmen",
    description: (k: number) => `Offene Stellen bei ${p(k, techCompanies)}, mit aktuellen Stellenzahlen.`,
  },
  company: {
    title: (name: string) => `Jobs bei ${name}`,
    description: (k: number, name: string, cats: string[]) =>
      `${p(k, openJobs)} bei ${name}${cats.length ? ` in ${cats.join(", ")} und mehr` : ""}. Täglich aktualisiert.`,
    none: "Derzeit keine offenen Stellen.",
  },
  locations: {
    title: "Jobs nach Standort",
    description: (co: number, ci: number) => `Offene Tech-Jobs in ${p(co, countries)} und ${p(ci, cities)}, täglich aktualisiert.`,
    countries: "Länder",
    topCities: "Top-Städte",
  },
  place: {
    title: (place: string) => `Jobs in ${place}`,
    countryDescription: (k: number, country: string) =>
      `${p(k, openTechJobs)} in ${country}, inklusive Remote-Stellen. Täglich aktualisiert.`,
    cityDescription: (k: number, place: string) => `${p(k, openTechJobs)} in ${place}. Täglich aktualisiert.`,
    cities: "Städte",
    technologies: "Technologien",
  },
  technologies: {
    title: "Jobs nach Technologie",
    description: (names: string[]) => `Offene Entwicklerjobs für ${names.join(", ")} und mehr, täglich aktualisiert.`,
  },
  tech: {
    title: (tech: string) => `${tech}-Jobs`,
    titleIn: (tech: string, place: string) => `${tech}-Jobs in ${place}`,
    description: (k: number, tech: string, co: number) =>
      `${p(k, techJobs(tech))} bei führenden Tech-Unternehmen, in ${p(co, countries)}. Täglich aktualisiert.`,
    countryDescription: (k: number, tech: string, country: string) =>
      `${p(k, techJobs(tech))} in ${country}, inklusive Remote-Stellen. Täglich aktualisiert.`,
    cityDescription: (k: number, tech: string, place: string) => `${p(k, techJobs(tech))} in ${place}. Täglich aktualisiert.`,
    byCountry: "Nach Land",
    topCities: "Top-Städte",
    none: (tech: string) => `Derzeit keine offenen ${tech}-Stellen.`,
    noneIn: (tech: string, place: string) => ({
      before: `Derzeit keine ${tech}-Stellen in ${place}. Die Einträge werden täglich aktualisiert; bis dahin findest du hier `,
      link: `alle Jobs in ${place}`,
      after: ".",
    }),
    worldwide: (tech: string) => `Neueste ${tech}-Jobs weltweit`,
    elsewhere: (tech: string, country: string) => `${tech}-Jobs anderswo in ${country}`,
  },
  analytics: {
    title: "Analysen",
    description: (k: number) =>
      `Recruiting auf einen Blick: ${p(k, openJobs)} nach Bereich, Unternehmen, Technologie und Standort, täglich aktualisiert.`,
    snapshot: (k: number) => `Momentaufnahme: ${p(k, openJobs)}`,
    updated: "aktualisiert",
    openJobs: "Offene Stellen",
    companiesHiring: "Einstellende Unternehmen",
    remote: "Remote",
    latestRun: "Letzter Lauf",
    trends: "Trends",
    openOverTime: "Offene Stellen im Zeitverlauf",
    openJobsUnit: "offene Stellen",
    newVsClosed: "Neu vs. geschlossen pro Woche",
    new: "Neu",
    closed: "Geschlossen",
    weekTitle: (week: string, nw: number, cl: number) => `Woche ab ${week}: ${n(nw)} neu, ${n(cl)} geschlossen`,
    trendsPending: (min: number, k: number, since?: string) =>
      `Trenddiagramme erscheinen, sobald ${p(min, days)} Verlauf vorliegen (bisher ${p(k, days)}${since ? `, seit ${since}` : ""}).`,
    byFunction: "Stellen nach Bereich",
    byCompany: "Stellen nach Unternehmen",
    topTechnologies: "Top-Technologien",
    topCountries: "Top-Länder",
    topCities: "Top-Städte",
    postedHeading: "Wann offene Stellen ausgeschrieben wurden",
    medianAge: (d: number) => `Medianes Alter: ${p(d, days)}.`,
    postedEarlier: (k: number) => `${p(k, positions)} früher ausgeschrieben.`,
    undated: (k: number) => `${p(k, positions)} ohne Ausschreibungsdatum.`,
    postedTitle: (label: string, k: number) => `${label}: ${p(k, openJobs)} ausgeschrieben`,
    remoteByFunction: "Remote-Anteil nach Bereich",
  },
} satisfies Messages;
