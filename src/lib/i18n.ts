import { defaultLang, intlLocale, locales, type Lang } from "./locale.ts";
import type { Country } from "./places.ts";
import { en, type Messages } from "./messages/en.ts";
import { uk } from "./messages/uk.ts";
import { es } from "./messages/es.ts";
import { de } from "./messages/de.ts";

export { defaultLang, locales, type Lang };

export const languageNames: Record<Lang, string> = { en: "English", uk: "Українська", es: "Español", de: "Deutsch" };

const messages: Record<Lang, Messages> = { en, uk, es, de };
export const t = (lang: Lang) => messages[lang];

/** The page's language, from the `[...lang]` route param; English has no prefix */
export const getLang = (param: string | undefined): Lang =>
  (locales as readonly string[]).includes(param ?? "") ? (param as Lang) : defaultLang;

/** Crosses getStaticPaths entries with every language. English keeps the unprefixed URL. */
export function withLangs<P extends { params: Record<string, string | undefined> }>(paths: P[]) {
  return paths.flatMap((path) =>
    locales.map((lang) => ({ ...path, params: { ...path.params, lang: lang === defaultLang ? undefined : lang } })),
  );
}

// Job pages are English-only: their content comes from the career sites, and four copies would push
// the deploy past Cloudflare Pages' file limit
const untranslated = /^\/jobs\//;

export function localizePath(path: string, lang: Lang): string {
  if (lang === defaultLang || untranslated.test(path)) return path;
  return path === "/" ? `/${lang}` : `/${lang}${path}`;
}

/** The English path for a possibly prefixed pathname */
export function stripLang(pathname: string): string {
  const [, first, ...rest] = pathname.split("/");
  if (!(locales as readonly string[]).includes(first ?? "")) return pathname;
  return `/${rest.join("/")}`;
}

const regionCodes: Record<string, string> = {
  "united-states": "US", canada: "CA", mexico: "MX", brazil: "BR", chile: "CL", argentina: "AR", colombia: "CO",
  "united-kingdom": "GB", ireland: "IE", germany: "DE", france: "FR", netherlands: "NL", spain: "ES", portugal: "PT",
  italy: "IT", switzerland: "CH", austria: "AT", belgium: "BE", luxembourg: "LU", sweden: "SE", denmark: "DK",
  lithuania: "LT", cyprus: "CY", poland: "PL", romania: "RO", slovenia: "SI", iceland: "IS", israel: "IL",
  "united-arab-emirates": "AE", "saudi-arabia": "SA", india: "IN", singapore: "SG", japan: "JP", "south-korea": "KR",
  china: "CN", taiwan: "TW", thailand: "TH", vietnam: "VN", malaysia: "MY", indonesia: "ID", philippines: "PH",
  australia: "AU", "new-zealand": "NZ",
};

const regionNames = new Map<Lang, Intl.DisplayNames>();

export function countryName(country: Pick<Country, "slug" | "name">, lang: Lang): string {
  const code = regionCodes[country.slug];
  if (lang === defaultLang || !code) return country.name;
  if (!regionNames.has(lang)) regionNames.set(lang, new Intl.DisplayNames(intlLocale(lang), { type: "region" }));
  return regionNames.get(lang)!.of(code) ?? country.name;
}

export const categoryName = (category: string | undefined, lang: Lang) => {
  const names = t(lang).categories;
  return names[category ?? "other"] ?? names.other!;
};
