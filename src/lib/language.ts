/**
 * Guesses the language of a job posting from its common function words, so
 * job pages (whose own labels are English) can mark the title and description
 * with their real language. Returns undefined when the text is too short or no
 * language clearly wins: an unmarked element inherits the page's "en", which
 * is wrong for a Slovak posting but no worse than before.
 */

/** Function words per language. A word several languages share counts for each of them in part. */
const WORDS: Record<string, string> = {
  en: "the and of with you your our we are will this that have from for to is be",
  de: "und der die das mit für sie wir ist eine einen den von zu im auf des dem bei sich nicht oder auch werden ihre",
  fr: "le la les de et des du un une pour vous nous est avec dans au sur qui votre nos aux à ou en être",
  es: "el la los las de y del para con una por es su sus como nuestro más un en",
  it: "il la di per con una che della sono nel alla gli è dei delle nostro un in",
  nl: "het en van een voor met je wij zijn op bij ook onze naar wordt",
  pt: "o os de da do para com uma em que no na dos das um ao seu sua você não",
  sv: "och att det som för med är på av till har oss eller vår din inom",
  da: "og at det som for med er på af til har os eller vores din inden",
  pl: "w na z do oraz się dla jest nie od że lub jako pracy",
  cs: "v na je se pro s z do že jsou nebo jako práce",
  sl: "in v na je se za s z do da so ali kot dela",
  hr: "i u na je se za s z do da su ili kao rada",
  ro: "și şi în de la cu pentru un o care este din pe sau",
  hu: "az és egy hogy van nem is meg vagy valamint",
  fi: "ja on sekä että tai ovat olla myös kanssa joka",
};

/** word → the languages that use it */
const LANGS_BY_WORD = new Map<string, string[]>();
for (const [lang, words] of Object.entries(WORDS)) {
  for (const word of words.split(" ")) LANGS_BY_WORD.set(word, [...(LANGS_BY_WORD.get(word) ?? []), lang]);
}

/** how much of a long description to read; the start decides it */
const MAX_CHARS = 4000;
/** the winner needs at least this score, about this many distinctive words */
const MIN_SCORE = 4;
/** and must beat the runner-up by this factor */
const MARGIN = 1.5;

const textOf = (html: string) =>
  html
    .replace(/<[^>]*>/g, " ")
    .replace(/&[a-z]+;|&#\d+;/gi, " ")
    .slice(0, MAX_CHARS)
    .toLowerCase();

/** The BCP 47 code of the text's language, or undefined if unsure. */
export function detectLanguage(html: string): string | undefined {
  const text = textOf(html);
  const letters = text.match(/\p{L}/gu)?.length ?? 0;
  if (!letters) return undefined;
  // Greek is the only language here with its own script
  if ((text.match(/\p{Script=Greek}/gu)?.length ?? 0) > letters / 2) return "el";

  const scores = new Map<string, number>();
  for (const word of text.match(/\p{L}+/gu) ?? []) {
    const langs = LANGS_BY_WORD.get(word);
    if (!langs) continue;
    for (const lang of langs) scores.set(lang, (scores.get(lang) ?? 0) + 1 / langs.length);
  }
  const [best, second] = [...scores].sort((a, b) => b[1] - a[1]);
  if (!best || best[1] < MIN_SCORE) return undefined;
  if (second && best[1] < second[1] * MARGIN) return undefined;
  return best[0];
}

/** German job titles name the genders they address: "(m/w/d)", "(w/m/d)", "(m/w/x)" */
const GERMAN_TITLE = /\((?:m\/w|w\/m)\/[dx]\)/i;

/** The language of a job's posting, from its description, else its title. */
export const jobLanguage = (job: { title: string; descriptionHtml: string }): string | undefined =>
  detectLanguage(job.descriptionHtml) ?? (GERMAN_TITLE.test(job.title) ? "de" : detectLanguage(job.title));
