/**
 * The medical-jobs taxonomy: specialties, career levels and the German states
 * the /medicine pages browse by. Sources tag their jobs with these slugs; names
 * live in the message files under `medicine`.
 */
import type { Job } from "./schema.ts";
import { slugify } from "./normalize.ts";

/** Category of every medical job; tech pages leave these jobs out */
export const MEDICINE = "medicine";

export const isMedicine = (job: Pick<Job, "category">) => job.category === MEDICINE;

// Checked in order, so the narrower names come before the broad ones they contain
// ("Kinder- und Jugendpsychiatrie" before "Psychiatrie", "Radioonkologie" before "Onkologie",
// "Innere Medizin und Kardiologie" before "Innere Medizin")
const specialtyRules = [
  ["child-psychiatry", /kinder- und jugendpsychiatr|child (and adolescent )?psychiatr/i],
  ["psychosomatic-medicine", /psychosomat/i],
  ["psychiatry", /psychiatr/i],
  ["radiology", /radiolog|nuklearmedizin|nuclear medicine|radioonkolog|strahlenther/i],
  ["cardiology", /kardiolog|cardiolog/i],
  ["oncology", /onkolog|oncolog|h[äa]matolog/i],
  ["gastroenterology", /gastroenterolog/i],
  ["emergency-medicine", /notfallmedizin|notarzt|not[äa]rzt|notaufnahme|emergency/i],
  ["orthopaedics", /orthop[äa]d|unfallchirurg|orthop(a)?edic/i],
  ["surgery", /chirurg|surgeon|surgery/i],
  ["gynaecology", /frauenheilkunde|gyn[äa]kolog|geburtshilfe|gyn(a)?ecolog|obstetric/i],
  ["paediatrics", /kinder- und jugendmedizin|kinderheilkunde|p[äa]diatr|kinderarzt|kinder[äa]rzt|pa?ediatric|neonatolog/i],
  ["neurology", /neurolog/i],
  ["dermatology", /haut- und geschlecht|dermatolog/i],
  ["ophthalmology", /augenheilkunde|augenarzt|augen[äa]rzt|ophthalmolog/i],
  ["ent", /hals-nasen-ohren|\bhno\b|otolaryngolog|otorhinolaryngolog/i],
  ["urology", /urolog/i],
  ["occupational-medicine", /arbeitsmedizin|betriebsarzt|betriebs[äa]rzt|occupational/i],
  ["public-health", /[öo]ffentliche[ns]? gesundheitswesen|gesundheitsamt|public health/i],
  ["laboratory-medicine", /laboratoriumsmedizin|mikrobiolog|microbiolog|patholog|transfusionsmedizin|hygiene/i],
  ["rehabilitation", /rehabilit|physikalische/i],
  ["anaesthesiology", /an[äa]sthesi|anaesthesi|anesthesi/i],
  ["general-practice", /allgemeinmedizin|hausarzt|haus[äa]rzt|general practi|weiterbildungsassistent/i],
  ["internal-medicine", /innere medizin|internist|internal medicine|nephrolog|pneumolog|endokrinolog|diabetolog|rheumatolog|geriatr|angiolog/i],
] as const satisfies readonly (readonly [string, RegExp])[];

export const specialties = specialtyRules.map(([slug]) => slug);
export type Specialty = (typeof specialties)[number];

// Head before senior before resident before specialist: "Leitender Oberarzt" is a senior
// post, and "Assistenzarzt/Facharzt" adverts are mostly for residents
const levelRules = [
  ["head", /chefarzt|chef[äa]rzt|chief physician|[äa]rztliche[rn]? (direktor|leiter)/i],
  ["senior", /oberarzt|ober[äa]rzt|leitende[rn]? arzt|leitende ärztin|senior physician|consultant/i],
  ["resident", /assistenzarzt|assistenz[äa]rzt|weiterbildungsassistent|in weiterbildung|resident/i],
  ["specialist", /facharzt|fach[äa]rzt|specialist/i],
] as const satisfies readonly (readonly [string, RegExp])[];

export const levels = levelRules.map(([slug]) => slug);
export type Level = (typeof levels)[number];

const firstMatch = <T extends string>(rules: readonly (readonly [T, RegExp])[], texts: (string | undefined)[]) => {
  for (const text of texts) {
    if (!text) continue;
    for (const [slug, pattern] of rules) if (pattern.test(text)) return slug;
  }
  return undefined;
};

/** The specialty a posting names, from its title first, then the source's occupation. */
export const specialtyOf = (...texts: (string | undefined)[]): Specialty | undefined => firstMatch(specialtyRules, texts);

/** The career level a posting names, from its title first, then the source's occupation. */
export const levelOf = (...texts: (string | undefined)[]): Level | undefined => firstMatch(levelRules, texts);

export const isSpecialty = (slug: string): slug is Specialty => (specialties as readonly string[]).includes(slug);
export const isLevel = (slug: string): slug is Level => (levels as readonly string[]).includes(slug);

export interface State {
  slug: string;
  /** the German name, which location labels use */
  name: string;
  en: string;
  /** the Bundesagentur für Arbeit's code for it */
  code: string;
}

export const states: State[] = [
  { slug: "baden-wuerttemberg", name: "Baden-Württemberg", en: "Baden-Württemberg", code: "BADEN_WUERTTEMBERG" },
  { slug: "bavaria", name: "Bayern", en: "Bavaria", code: "BAYERN" },
  { slug: "berlin", name: "Berlin", en: "Berlin", code: "BERLIN" },
  { slug: "brandenburg", name: "Brandenburg", en: "Brandenburg", code: "BRANDENBURG" },
  { slug: "bremen", name: "Bremen", en: "Bremen", code: "BREMEN" },
  { slug: "hamburg", name: "Hamburg", en: "Hamburg", code: "HAMBURG" },
  { slug: "hesse", name: "Hessen", en: "Hesse", code: "HESSEN" },
  { slug: "mecklenburg-vorpommern", name: "Mecklenburg-Vorpommern", en: "Mecklenburg-Western Pomerania", code: "MECKLENBURG_VORPOMMERN" },
  { slug: "lower-saxony", name: "Niedersachsen", en: "Lower Saxony", code: "NIEDERSACHSEN" },
  { slug: "north-rhine-westphalia", name: "Nordrhein-Westfalen", en: "North Rhine-Westphalia", code: "NORDRHEIN_WESTFALEN" },
  { slug: "rhineland-palatinate", name: "Rheinland-Pfalz", en: "Rhineland-Palatinate", code: "RHEINLAND_PFALZ" },
  { slug: "saarland", name: "Saarland", en: "Saarland", code: "SAARLAND" },
  { slug: "saxony", name: "Sachsen", en: "Saxony", code: "SACHSEN" },
  { slug: "saxony-anhalt", name: "Sachsen-Anhalt", en: "Saxony-Anhalt", code: "SACHSEN_ANHALT" },
  { slug: "schleswig-holstein", name: "Schleswig-Holstein", en: "Schleswig-Holstein", code: "SCHLESWIG_HOLSTEIN" },
  { slug: "thuringia", name: "Thüringen", en: "Thuringia", code: "THUERINGEN" },
];

const stateByName = new Map(states.map((s) => [s.name, s]));
const stateByCode = new Map(states.map((s) => [s.code, s]));
const stateBySlug = new Map(states.map((s) => [s.slug, s]));

export const getState = (slug: string) => stateBySlug.get(slug);
export const stateForCode = (code: string | undefined) => (code ? stateByCode.get(code) : undefined);
/** English name, except on German pages */
export const stateName = (state: State, lang: string) => (lang === "de" ? state.name : state.en);

/** "City, State, Germany", the label medicine sources write for a German workplace */
export const germanLocation = (city: string, state: State | undefined) => [city, state?.name, "Germany"].filter(Boolean).join(", ");

export interface MedicinePlace {
  state?: string;
  /** slug and display name of the city */
  city?: { slug: string; name: string };
}

/** The state and city of a job's first German location. */
export function medicinePlaceOf(job: Pick<Job, "locations">): MedicinePlace {
  for (const label of job.locations) {
    const parts = label.split(", ");
    if (parts.at(-1) !== "Germany" || parts.length !== 3) continue;
    const state = stateByName.get(parts[1]!);
    const name = parts[0]!;
    return { state: state?.slug, city: { slug: slugify(name), name } };
  }
  return {};
}

/** Cities get their own page from this many open jobs; smaller towns are browsed by state */
export const MIN_CITY_JOBS = 10;

export const medicineUrl = "/medicine";
export const specialtiesUrl = "/medicine/specialties";
export const specialtyUrl = (specialty: string, state?: string) => ["/medicine/specialties", specialty, state].filter(Boolean).join("/");
export const levelUrl = (level: string) => `/medicine/levels/${level}`;
export const medicineLocationsUrl = "/medicine/locations";
export const medicineLocationUrl = (state: string, city?: string) => ["/medicine/locations", state, city].filter(Boolean).join("/");
