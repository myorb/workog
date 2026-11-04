import { defaultLang, intlLocale, type Lang } from "./locale.ts";
import { t } from "./i18n.ts";

/**
 * One Intl.DateTimeFormat per language and style: toLocaleDateString() builds a
 * new formatter on every call, which added up to seconds over a build's pages.
 */
function cachedFormat(options: Intl.DateTimeFormatOptions): (iso: string, lang: Lang) => string {
  const formats = new Map<Lang, Intl.DateTimeFormat>();
  return (iso, lang) => {
    let format = formats.get(lang);
    if (!format) formats.set(lang, (format = new Intl.DateTimeFormat(intlLocale(lang), options)));
    return format.format(new Date(iso));
  };
}

const dateFormat = cachedFormat({ year: "numeric", month: "short", day: "numeric", timeZone: "UTC" });
const shortDateFormat = cachedFormat({ month: "short", day: "numeric", timeZone: "UTC" });
const dateTimeFormat = cachedFormat({
  year: "numeric",
  month: "short",
  day: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "UTC",
  timeZoneName: "short",
});

export function formatDate(iso: string, lang: Lang = defaultLang): string {
  return dateFormat(iso, lang);
}

/** Month and day only, for chart labels */
export function formatShortDate(iso: string, lang: Lang = defaultLang): string {
  return shortDateFormat(iso, lang);
}

export function formatDateTime(iso: string, lang: Lang = defaultLang): string {
  return dateTimeFormat(iso, lang);
}

export function formatLocations(locations: string[], remote: boolean, max = 3, lang: Lang = defaultLang): string {
  const m = t(lang);
  const shown = locations.slice(0, max);
  const extra = locations.length - shown.length;
  const text = shown.join(" · ") + (extra > 0 ? ` ${m.moreLocations(extra)}` : "");
  return text || (remote ? m.remote : m.locationNotListed);
}

/** English-only count with a naive plural, for non-page outputs like llms.txt; pages use the message catalogs */
export function plural(n: number, word: string): string {
  const plural = /[^aeiou]y$/.test(word) ? `${word.slice(0, -1)}ies` : `${word}s`;
  return `${n.toLocaleString("en-US")} ${n === 1 ? word : plural}`;
}
