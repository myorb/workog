import { formatNumber, pluralizer } from "../locale.ts";
import type { Messages } from "./en.ts";

const p = pluralizer("uk");
const n = (x: number) => formatNumber(x, "uk");

// Phrasing leans on colons and dashes so place and company names can stay in the nominative case
const openJobs = { one: "відкрита вакансія", few: "відкриті вакансії", many: "відкритих вакансій", other: "відкритої вакансії" };
const techJobs = { one: "ІТ-вакансія", few: "ІТ-вакансії", many: "ІТ-вакансій", other: "ІТ-вакансії" };
const vacancies = { one: "вакансія", few: "вакансії", many: "вакансій", other: "вакансії" };
const techCompanies = { one: "технологічна компанія", few: "технологічні компанії", many: "технологічних компаній", other: "технологічної компанії" };
const companies = { one: "компанія", few: "компанії", many: "компаній", other: "компанії" };
const countries = { one: "країна", few: "країни", many: "країн", other: "країни" };
const cities = { one: "місто", few: "міста", many: "міст", other: "міста" };
const days = { one: "день", few: "дні", many: "днів", other: "дня" };

export const uk = {
  nav: { locations: "Локації", technologies: "Технології", companies: "Компанії", analytics: "Аналітика", remote: "Віддалено" },
  language: "Мова",
  lastUpdated: "Оновлено",
  footerNote: "Оголошення ведуть на офіційні сторінки вакансій компаній. Подавайте заявку на сайті компанії.",
  remote: "Віддалено",
  seen: (date: string) => `Знайдено ${date}`,
  moreLocations: (k: number) => `ще +${n(k)}`,
  locationNotListed: "Локацію не вказано",
  openJobs: (k: number) => p(k, openJobs),
  openPositions: (k: number) => p(k, openJobs),
  showingNewest: (k: number) => `, показано ${n(k)} найновіших`,
  latestJobs: "Останні вакансії",
  companiesHiring: "Компанії, що наймають",
  relatedTechnologies: "Схожі технології",
  allCompanies: "Усі компанії →",
  allTechnologies: "Усі технології →",
  allLocations: "Усі локації →",
  allRemote: "Усі віддалені вакансії →",
  categories: {
    data: "Дані",
    design: "Дизайн",
    engineering: "Розробка",
    finance: "Фінанси",
    legal: "Право",
    marketing: "Маркетинг",
    operations: "Операції",
    people: "HR",
    product: "Продукт",
    sales: "Продажі",
    support: "Підтримка",
    other: "Інше",
  },
  chartRange: (unit: string, from: string, to: string) => `${unit}: ${from} – ${to}`,
  shareOf: (label: string, pct: string, total: number) => `${label}: ${pct} з ${n(total)}`,

  home: {
    description: (j: number, c: number) => `${p(j, openJobs)} · ${p(c, techCompanies)}. Щоденне оновлення з офіційних кар'єрних сайтів.`,
    heading: "Відкриті вакансії в провідних технологічних компаніях",
    summary: (j: number, c: number) => `${p(j, openJobs)} · ${p(c, companies)}, щоденне оновлення.`,
    topCompanies: "Провідні компанії",
    technologies: "Технології",
    locations: "Локації",
    employment: "Тип зайнятості",
    remote: "Віддалена робота",
  },
  companies: {
    title: "Компанії",
    description: (k: number) => `Відкриті вакансії: ${p(k, techCompanies)}, актуальна кількість вакансій.`,
  },
  company: {
    title: (name: string) => `Вакансії ${name}`,
    description: (k: number, name: string, cats: string[]) =>
      `${name}: ${p(k, openJobs)}${cats.length ? ` (${cats.join(", ")} та інше)` : ""}. Щоденне оновлення.`,
    none: "Наразі відкритих вакансій немає.",
  },
  locations: {
    title: "Вакансії за локацією",
    description: (co: number, ci: number) => `Відкриті ІТ-вакансії: ${p(co, countries)}, ${p(ci, cities)}. Щоденне оновлення.`,
    countries: "Країни",
    topCities: "Популярні міста",
  },
  place: {
    title: (place: string) => `Вакансії: ${place}`,
    countryDescription: (k: number, country: string) => `${country}: ${p(k, techJobs)}, зокрема віддалені. Щоденне оновлення.`,
    cityDescription: (k: number, place: string) => `${place}: ${p(k, techJobs)}. Щоденне оновлення.`,
    cities: "Міста",
    technologies: "Технології",
  },
  employment: {
    label: "Тип зайнятості",
    types: { "full-time": "Повна зайнятість", "part-time": "Часткова зайнятість", contract: "Контракт", internship: "Стажування" },
    title: "Вакансії за типом зайнятості",
    description: (names: string[]) => `Відкриті ІТ-вакансії за типом зайнятості: ${names.join(", ")}. Щоденне оновлення.`,
    typeTitle: (type: string) => `Вакансії: ${type.toLowerCase()}`,
    typeDescription: (k: number, type: string, co: number) =>
      `${type}: ${p(k, openJobs)} у провідних технологічних компаніях · ${p(co, countries)}. Щоденне оновлення.`,
    none: (type: string) => `${type}: зараз немає відкритих вакансій.`,
  },
  remoteJobs: {
    title: "Віддалена робота",
    titleIn: (place: string) => `Віддалена робота: ${place}`,
    countryDescription: (k: number, place: string) => `Віддалена робота, ${place}: ${p(k, openJobs)} у провідних технологічних компаніях. Щоденне оновлення.`,
    description: (k: number, c: number) => `Віддалена робота: ${p(k, openJobs)} · ${p(c, techCompanies)}. Щоденне оновлення.`,
    byCountry: "За країною",
  },
  technologies: {
    title: "Вакансії за технологією",
    description: (names: string[]) => `Відкриті вакансії для розробників: ${names.join(", ")} та інші. Щоденне оновлення.`,
  },
  tech: {
    title: (tech: string) => `Вакансії з ${tech}`,
    titleIn: (tech: string, place: string) => `Вакансії з ${tech}: ${place}`,
    description: (k: number, tech: string, co: number) =>
      `${tech}: ${p(k, openJobs)} у провідних технологічних компаніях, ${p(co, countries)}. Щоденне оновлення.`,
    countryDescription: (k: number, tech: string, country: string) =>
      `${tech}, ${country}: ${p(k, openJobs)}, зокрема віддалені. Щоденне оновлення.`,
    cityDescription: (k: number, tech: string, place: string) => `${tech}, ${place}: ${p(k, openJobs)}. Щоденне оновлення.`,
    byCountry: "За країнами",
    topCities: "Популярні міста",
    none: (tech: string) => `Наразі немає відкритих вакансій з ${tech}.`,
    noneIn: (tech: string, place: string) => ({
      before: `Наразі немає вакансій з ${tech} (${place}). Список оновлюється щодня; тим часом перегляньте `,
      link: `усі вакансії: ${place}`,
      after: ".",
    }),
    worldwide: (tech: string) => `Останні вакансії з ${tech} у світі`,
    elsewhere: (tech: string, country: string) => `Інші вакансії з ${tech}: ${country}`,
  },
  analytics: {
    title: "Аналітика",
    description: (k: number) => `Найм у цифрах: ${p(k, openJobs)} за напрямом, компанією, технологією та локацією. Щоденне оновлення.`,
    snapshot: (k: number) => `Знімок: ${p(k, openJobs)}`,
    updated: "оновлено",
    openJobs: "Відкриті вакансії",
    companiesHiring: "Компанії, що наймають",
    remote: "Віддалено",
    latestRun: "Останній запуск",
    trends: "Тренди",
    openOverTime: "Відкриті вакансії в динаміці",
    openJobsUnit: "відкритих вакансій",
    newVsClosed: "Нові та закриті щотижня",
    new: "Нові",
    closed: "Закриті",
    weekTitle: (week: string, nw: number, cl: number) => `Тиждень від ${week}: нових — ${n(nw)}, закритих — ${n(cl)}`,
    trendsPending: (min: number, k: number, since?: string) =>
      `Графіки трендів з'являться, коли історія охоплюватиме ${p(min, days)} (зараз: ${p(k, days)}${since ? `, від ${since}` : ""}).`,
    byFunction: "Вакансії за напрямом",
    byCompany: "Вакансії за компанією",
    topTechnologies: "Популярні технології",
    topCountries: "Популярні країни",
    topCities: "Популярні міста",
    postedHeading: "Коли опубліковано відкриті вакансії",
    medianAge: (d: number) => `Медіанний вік — ${p(d, days)}.`,
    postedEarlier: (k: number) => `Опубліковано раніше: ${p(k, vacancies)}.`,
    undated: (k: number) => `Без дати публікації: ${p(k, vacancies)}.`,
    postedTitle: (label: string, k: number) => `${label}: опубліковано ${p(k, openJobs)}`,
    remoteByFunction: "Частка віддалених вакансій за напрямом",
    changeSince: (date: string) => `Що змінилося від ${date}`,
    growing: "Зростають",
    shrinking: "Скорочуються",
    noChange: "Без змін.",
    moverTitle: (label: string, from: number, to: number) => `${label}: ${n(from)} → ${n(to)} відкритих вакансій`,
    byEmployment: "Вакансії за типом зайнятості",
    remoteShareOverTime: "Частка віддалених вакансій у динаміці",
    remoteShareUnit: "віддалено",
    functionsOverTime: "Відкриті вакансії за напрямом",
    historyLink: "Щоденна історія →",
    history: {
      title: "Історія аналітики",
      description: (k: number, since: string) => `Щоденні знімки відкритих ІТ-вакансій від ${since}: ${p(k, days)} найму за компанією, напрямом, технологією та локацією.`,
      intro: "Щодня наприкінці доби (UTC) робиться знімок усіх відкритих вакансій. Кожен день має власну сторінку, тож минулі цифри не змінюються.",
      date: "Дата",
      open: "Відкриті",
      change: "Зміна",
      new: "Нові",
      closed: "Закриті",
      remote: "Віддалено",
    },
    day: {
      title: (date: string) => `Найм: ${date}`,
      description: (k: number, date: string) => `${date}: ${p(k, openJobs)} за компанією, напрямом, технологією та локацією, і що змінилося за день.`,
      asOf: (date: string) => `Відкриті вакансії наприкінці ${date} (UTC).`,
      vsDayBefore: "до попереднього дня",
      vsWeekBefore: "до попереднього тижня",
      newClosed: "Нові / закриті",
      earlier: "← Попередній день",
      later: "Наступний день →",
    },
  },
} satisfies Messages;
