import { formatNumber, pluralizer } from "../locale.ts";
import type { Messages } from "./en.ts";

const p = pluralizer("es");
const n = (x: number) => formatNumber(x, "es");

const openJobs = { one: "empleo abierto", other: "empleos abiertos" };
const openPositions = { one: "puesto abierto", other: "puestos abiertos" };
const openTechJobs = { one: "empleo tecnológico abierto", other: "empleos tecnológicos abiertos" };
const positions = { one: "puesto", other: "puestos" };
const techCompanies = { one: "empresa tecnológica", other: "empresas tecnológicas" };
const companies = { one: "empresa", other: "empresas" };
const countries = { one: "país", other: "países" };
const cities = { one: "ciudad", other: "ciudades" };
const days = { one: "día", other: "días" };
const techJobs = (tech: string) => ({ one: `empleo de ${tech} abierto`, other: `empleos de ${tech} abiertos` });

export const es = {
  nav: { locations: "Ubicaciones", technologies: "Tecnologías", companies: "Empresas", analytics: "Analítica" },
  language: "Idioma",
  lastUpdated: "Última actualización",
  footerNote: "Los anuncios enlazan a la oferta oficial de cada empresa. Postúlate en el sitio de la empresa.",
  remote: "Remoto",
  seen: (date: string) => `Visto el ${date}`,
  moreLocations: (k: number) => `+${n(k)} más`,
  locationNotListed: "Ubicación no indicada",
  openJobs: (k: number) => p(k, openJobs),
  openPositions: (k: number) => p(k, openPositions),
  showingNewest: (k: number) => `, se muestran los ${n(k)} más recientes`,
  latestJobs: "Últimos empleos",
  allCompanies: "Todas las empresas →",
  allTechnologies: "Todas las tecnologías →",
  allLocations: "Todas las ubicaciones →",
  categories: {
    data: "Datos",
    design: "Diseño",
    engineering: "Ingeniería",
    finance: "Finanzas",
    legal: "Legal",
    marketing: "Marketing",
    operations: "Operaciones",
    people: "Personas",
    product: "Producto",
    sales: "Ventas",
    support: "Soporte",
    other: "Otros",
  },
  chartRange: (unit: string, from: string, to: string) => `${unit} del ${from} al ${to}`,
  shareOf: (label: string, pct: string, total: number) => `${label}: ${pct} de ${n(total)}`,

  home: {
    description: (j: number, c: number) =>
      `${p(j, openJobs)} en ${p(c, techCompanies)}, actualizados a diario desde sus sitios oficiales de empleo.`,
    heading: "Empleos abiertos en las principales empresas tecnológicas",
    summary: (j: number, c: number) => `${p(j, openPositions)} en ${p(c, companies)}, actualizados a diario.`,
    topCompanies: "Principales empresas",
    technologies: "Tecnologías",
    locations: "Ubicaciones",
  },
  companies: {
    title: "Empresas",
    description: (k: number) => `Empleos abiertos en ${p(k, techCompanies)}, con recuentos actualizados.`,
  },
  company: {
    title: (name: string) => `Empleos en ${name}`,
    description: (k: number, name: string, cats: string[]) =>
      `${p(k, openJobs)} en ${name}${cats.length ? `: ${cats.join(", ")} y más` : ""}. Actualizado a diario.`,
    none: "No hay puestos abiertos en este momento.",
  },
  locations: {
    title: "Empleos por ubicación",
    description: (co: number, ci: number) => `Empleos tecnológicos abiertos en ${p(co, countries)} y ${p(ci, cities)}, actualizados a diario.`,
    countries: "Países",
    topCities: "Ciudades principales",
  },
  place: {
    title: (place: string) => `Empleos en ${place}`,
    countryDescription: (k: number, country: string) =>
      `${p(k, openTechJobs)} en ${country}, incluidos puestos remotos. Actualizado a diario.`,
    cityDescription: (k: number, place: string) => `${p(k, openTechJobs)} en ${place}. Actualizado a diario.`,
    cities: "Ciudades",
    technologies: "Tecnologías",
  },
  technologies: {
    title: "Empleos por tecnología",
    description: (names: string[]) => `Empleos abiertos para desarrolladores en ${names.join(", ")} y más, actualizados a diario.`,
  },
  tech: {
    title: (tech: string) => `Empleos de ${tech}`,
    titleIn: (tech: string, place: string) => `Empleos de ${tech} en ${place}`,
    description: (k: number, tech: string, co: number) =>
      `${p(k, techJobs(tech))} en las principales empresas tecnológicas, en ${p(co, countries)}. Actualizado a diario.`,
    countryDescription: (k: number, tech: string, country: string) =>
      `${p(k, techJobs(tech))} en ${country}, incluidos puestos remotos. Actualizado a diario.`,
    cityDescription: (k: number, tech: string, place: string) => `${p(k, techJobs(tech))} en ${place}. Actualizado a diario.`,
    byCountry: "Por país",
    topCities: "Ciudades principales",
    none: (tech: string) => `No hay puestos de ${tech} abiertos en este momento.`,
    noneIn: (tech: string, place: string) => ({
      before: `No hay puestos de ${tech} en ${place} en este momento. Los anuncios se actualizan a diario; mientras tanto, consulta `,
      link: `todos los empleos en ${place}`,
      after: ".",
    }),
    worldwide: (tech: string) => `Últimos empleos de ${tech} en todo el mundo`,
    elsewhere: (tech: string, country: string) => `Empleos de ${tech} en otras partes de ${country}`,
  },
  analytics: {
    title: "Analítica",
    description: (k: number) =>
      `La contratación de un vistazo: ${p(k, openJobs)} por área, empresa, tecnología y ubicación, actualizado a diario.`,
    snapshot: (k: number) => `Resumen de ${p(k, openPositions)}`,
    updated: "actualizado",
    openJobs: "Empleos abiertos",
    companiesHiring: "Empresas contratando",
    remote: "Remoto",
    latestRun: "Última ejecución",
    trends: "Tendencias",
    openOverTime: "Empleos abiertos en el tiempo",
    openJobsUnit: "empleos abiertos",
    newVsClosed: "Nuevos vs. cerrados por semana",
    new: "Nuevos",
    closed: "Cerrados",
    weekTitle: (week: string, nw: number, cl: number) => `Semana del ${week}: ${n(nw)} nuevos, ${n(cl)} cerrados`,
    trendsPending: (min: number, k: number, since?: string) =>
      `Los gráficos de tendencias aparecen cuando hay ${p(min, days)} de historial (${p(k, days)} hasta ahora${since ? `, desde el ${since}` : ""}).`,
    byFunction: "Empleos por área",
    byCompany: "Empleos por empresa",
    topTechnologies: "Tecnologías principales",
    topCountries: "Países principales",
    topCities: "Ciudades principales",
    postedHeading: "Cuándo se publicaron los puestos abiertos",
    medianAge: (d: number) => `Antigüedad mediana: ${p(d, days)}.`,
    postedEarlier: (k: number) => `${p(k, positions)} publicados antes.`,
    undated: (k: number) => `${p(k, positions)} sin fecha de publicación.`,
    postedTitle: (label: string, k: number) => `${label}: ${p(k, openPositions)} publicados`,
    remoteByFunction: "Proporción de remoto por área",
  },
} satisfies Messages;
