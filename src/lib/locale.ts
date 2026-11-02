export const locales = ["en", "uk", "es", "de"] as const;
export type Lang = (typeof locales)[number];
export const defaultLang: Lang = "en";

const intlLocales: Record<Lang, string> = { en: "en-US", uk: "uk-UA", es: "es-ES", de: "de-DE" };
export const intlLocale = (lang: Lang) => intlLocales[lang];

export const formatNumber = (n: number, lang: Lang = defaultLang) => n.toLocaleString(intlLocale(lang));

/** Noun forms by CLDR plural category; `other` is the fallback */
export type PluralForms = Partial<Record<Intl.LDMLPluralRule, string>> & { other: string };

/** `p(3, { one: "job", other: "jobs" })` → "3 jobs", with the language's plural rules */
export function pluralizer(lang: Lang) {
  const rules = new Intl.PluralRules(intlLocale(lang));
  return (n: number, forms: PluralForms) => `${formatNumber(n, lang)} ${forms[rules.select(n)] ?? forms.other}`;
}
