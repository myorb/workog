import { defaultLang, intlLocale, type Lang } from "./locale.ts";
import { t } from "./i18n.ts";

export function formatDate(iso: string, lang: Lang = defaultLang): string {
  return new Date(iso).toLocaleDateString(intlLocale(lang), { year: "numeric", month: "short", day: "numeric", timeZone: "UTC" });
}

/** Month and day only, for chart labels */
export function formatShortDate(iso: string, lang: Lang = defaultLang): string {
  return new Date(iso).toLocaleDateString(intlLocale(lang), { month: "short", day: "numeric", timeZone: "UTC" });
}

export function formatDateTime(iso: string, lang: Lang = defaultLang): string {
  return new Date(iso).toLocaleString(intlLocale(lang), {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "UTC",
    timeZoneName: "short",
  });
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
