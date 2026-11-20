/**
 * Turns a monthly report into ready-to-post marketing material, written into
 * marketing/linkedin/:
 *
 * - report-<section>-<month>.png: a 1200×627 chart for a LinkedIn post (the
 *   1.91:1 link-image shape): the month's total, its change, the daily
 *   totals as a line and the biggest risers.
 * - report-<section>-<month>.md: a draft LinkedIn post and, for the medical
 *   section, a short press pitch in English and German for trade press. All
 *   text is generated from patterns in the numbers (src/lib/insights.ts and
 *   the report sentences in src/lib/messages), so it is always in sync with
 *   the published report. Edit before posting; nothing is sent anywhere.
 *
 *   bun scripts/linkedin-report.ts [tech|medicine] [YYYY-MM]
 *
 * Without a month it takes the last complete one.
 */
import { mkdir, writeFile } from "node:fs/promises";
import { getCompanies, getMedicineSnapshots, getSnapshots } from "../src/lib/jobs.ts";
import { biggestMoves, reportMonths, reportRows, reportUrl, sharePct, type ReportRow, type ReportSection } from "../src/lib/reports.ts";
import { comparable, roundPct } from "../src/lib/trend.ts";
import { formatDate, formatMonth } from "../src/lib/format.ts";
import { countryName, t } from "../src/lib/i18n.ts";
import { formatNumber, type Lang } from "../src/lib/locale.ts";
import { GERMANY, getMedicineCountry, getState, stateName } from "../src/lib/medicine.ts";
import { leaderInsights } from "../src/lib/page-insights.ts";
import { escapeXml, FONT, renderPng } from "../src/lib/share-image.ts";
import { logoMarkup } from "../src/lib/logo.ts";

const SITE = process.env.SITE_URL ?? "https://workog.com";
const OUT = new URL("../marketing/linkedin/", import.meta.url).pathname;
const W = 1200;
const H = 627;

const section = (process.argv[2] ?? "medicine") as ReportSection;
if (section !== "tech" && section !== "medicine") throw new Error(`usage: bun scripts/linkedin-report.ts [tech|medicine] [YYYY-MM]`);

type Snap = { date: string; open: number; [dim: string]: unknown };
const snapshots: Snap[] = section === "tech" ? await getSnapshots() : await getMedicineSnapshots();
const months = reportMonths(snapshots, new Date().toISOString().slice(0, 10));
const r = process.argv[3] ? months.find((m) => m.month === process.argv[3]) : (months.findLast((m) => m.complete) ?? months.at(-1));
if (!r) throw new Error(`no report for ${process.argv[3] ?? "any month"}; months: ${months.map((m) => m.month).join(", ")}`);
const { end, base, month } = r;
const upToEnd = snapshots.filter((s) => s.date <= end.date);
const inMonth = comparable(upToEnd).filter((s) => s.date.startsWith(month));
const pct = base ? roundPct(((end.open - base.open) / base.open) * 100) : undefined;
const url = new URL(reportUrl(section, month), SITE).href;

// the report's two main dimensions, labeled in a language
const companyNames = new Map((await getCompanies()).map((c) => [c.key, c.name]));
const mainDim = section === "tech" ? "companies" : "specialties";
const placeDim = section === "tech" ? "countries" : "countries";
function label(dim: string, key: string, lang: Lang): string {
  if (dim === "companies") return companyNames.get(key) ?? key;
  if (dim === "specialties") return t(lang).medicine.specialties[key] ?? key;
  if (dim === "states") {
    const s = getState(key);
    return s ? stateName(s, lang) : key;
  }
  const c = getMedicineCountry(key);
  return c ? countryName(c, lang) : key;
}
const rows = (dim: string, lang: Lang): ReportRow[] =>
  reportRows(end[dim] as Record<string, number>, base?.[dim] as Record<string, number> | undefined, (k) => ({ label: label(dim, k, lang) }));

/** Rows that grew the most in jobs, at least `min` */
const risers = (list: ReportRow[], n = 3, min = 1) =>
  list
    .filter((x) => x.from !== undefined && x.to - x.from >= min)
    .sort((a, b) => b.to - b.from! - (a.to - a.from!))
    .slice(0, n);

// ---------- the image ----------

function chartSvg(): string {
  const monthLabel = formatMonth(month, "en");
  const title = section === "tech" ? `Tech hiring · ${monthLabel}` : `Doctor job market · ${monthLabel}`;
  const color = section === "tech" ? "#60a5fa" : "#2dd4bf";
  const up = "#4ade80";
  const down = "#f87171";
  // the line: daily totals in the month
  const x0 = 80, x1 = 650, y0 = 560, y1 = 330;
  const values = inMonth.map((s) => s.open);
  const lo = Math.min(...values), hi = Math.max(...values);
  const span = Math.max(1, hi - lo);
  const pts = inMonth.map((s, i) => {
    const x = values.length > 1 ? x0 + ((x1 - x0) * i) / (values.length - 1) : (x0 + x1) / 2;
    const y = y0 - ((s.open - lo) / span) * (y0 - y1);
    return [Math.round(x), Math.round(y)] as const;
  });
  const path = pts.map(([x, y], i) => `${i ? "L" : "M"}${x} ${y}`).join(" ");
  const area = pts.length > 1 ? `${path} L${pts.at(-1)![0]} ${y0} L${pts[0]![0]} ${y0} Z` : "";
  const text = (x: number, y: number, size: number, fill: string, s: string, weight = 400, anchor = "start") =>
    `<text x="${x}" y="${y}" font-family="${FONT}" font-size="${size}" font-weight="${weight}" fill="${fill}" text-anchor="${anchor}">${escapeXml(s)}</text>`;
  const change =
    pct === undefined ? "" : text(80, 268, 34, pct > 0 ? up : pct < 0 ? down : "#a8a29e", `${pct > 0 ? "↑" : pct < 0 ? "↓" : "→"} ${formatNumber(Math.abs(pct))}% over the month`, 700);
  const rise = risers(rows(mainDim, "en"));
  const panel = rise.length
    ? [
        text(770, 330, 26, "#a8a29e", "Biggest risers"),
        ...rise.flatMap((x, i) => [
          text(770, 380 + i * 62, 30, "#f5f5f4", x.label.length > 22 ? `${x.label.slice(0, 21)}…` : x.label, 700),
          text(1120, 380 + i * 62, 30, up, `+${formatNumber(x.to - x.from!)}`, 700, "end"),
        ]),
      ].join("\n  ")
    : "";
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <radialGradient id="glow" cx="1000" cy="100" r="700" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="${section === "tech" ? "#1e3a8a" : "#115e59"}" stop-opacity="0.9"/>
      <stop offset="1" stop-color="${section === "tech" ? "#1e3a8a" : "#115e59"}" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="fill" x1="0" y1="${y1}" x2="0" y2="${y0}" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="${color}" stop-opacity="0.35"/>
      <stop offset="1" stop-color="${color}" stop-opacity="0"/>
    </linearGradient>
  </defs>
  <rect width="${W}" height="${H}" fill="#0c0a09"/>
  <rect width="${W}" height="${H}" fill="url(#glow)"/>
  <g transform="translate(80 48) scale(0.75)">${logoMarkup({ variant: section })}</g>
  ${text(142, 85, 32, "#f5f5f4", "Workog", 700)}
  ${text(1120, 85, 26, "#a8a29e", title, 400, "end")}
  ${text(80, 210, 104, "#f5f5f4", formatNumber(end.open), 700)}
  ${text(80 + Math.round([...formatNumber(end.open)].reduce((w, c) => w + (/\d/.test(c) ? 0.66 : 0.28), 0) * 104) + 20, 210, 36, "#a8a29e", section === "tech" ? "open tech jobs" : "open doctor jobs")}
  ${change}
  ${area ? `<path d="${area}" fill="url(#fill)"/>` : ""}
  ${pts.length > 1 ? `<path d="${path}" fill="none" stroke="${color}" stroke-width="4" stroke-linejoin="round" stroke-linecap="round"/>` : ""}
  ${text(x0, y0 + 36, 22, "#a8a29e", formatDate(inMonth[0]?.date ?? end.date, "en"))}
  ${text(x1, y0 + 36, 22, "#a8a29e", formatDate(end.date, "en"), 400, "end")}
  ${values.length > 1 ? text(x1 + 14, y1 + 8, 20, "#a8a29e", formatNumber(hi)) + text(x1 + 14, y0 + 8, 20, "#a8a29e", formatNumber(lo)) : ""}
  ${panel}
  ${text(1120, y0 + 36, 22, "#a8a29e", "workog.com/reports", 400, "end")}
</svg>`;
}

// ---------- the text ----------

const signed = (x: number, lang: Lang) => `${x > 0 ? "+" : x < 0 ? "−" : ""}${formatNumber(Math.abs(x), lang)}`;

/** The report's own key findings in a language: the same sentences the report page shows, plus records and streaks */
function findings(lang: Lang): string[] {
  const rp = t(lang).reports;
  const date = (iso: string) => formatDate(iso, lang);
  const main = rows(mainDim, lang);
  const out: string[] = [];
  const places = rows(placeDim, lang);
  out.push(
    (section === "tech" ? rp.techTotal(end.open, main.length, date(end.date)) : rp.medicineTotal(end.open, places.length, date(end.date))) +
      (base && pct !== undefined ? rp.changeFrom(pct, base.open, date(base.date)) : "."),
  );
  if (main.length) out.push(rp.leaders(main.slice(0, 3).map((x) => ({ label: x.label, count: x.to }))));
  if (section === "medicine") {
    const germany = (end.countries as Record<string, number>)[GERMANY];
    const states = rows("states", lang);
    if (germany && states[0]) out.push(rp.germany(germany, sharePct(germany, end.open), states[0].label, states[0].to));
  } else if (places[0]) out.push(rp.topCountry(places[0].label, sharePct(places[0].to, end.open)));
  if (base) {
    const { up, down } = biggestMoves(main);
    if (up) out.push(rp.grew(up.label, up.to - up.from!));
    if (down) out.push(rp.shrank(down.label, down.from! - down.to));
  }
  out.push(...leaderInsights(upToEnd, mainDim, main.slice(0, 10), lang));
  return out.map((f) => f.replace(/\.\.$/, "."));
}

/** The opening line, from the strongest pattern: a big move, a record, or the total */
function hook(lang: "en" | "de"): string {
  const monthLabel = formatMonth(month, lang);
  const what = section === "tech" ? { en: "Open roles at top tech companies", de: "Offene Stellen bei Top-Tech-Unternehmen" } : { en: "Open doctor jobs across Europe", de: "Offene Arztstellen in Europa" };
  const rise = risers(rows(mainDim, lang), 1)[0];
  if (pct !== undefined && Math.abs(pct) >= 5) {
    return lang === "en"
      ? `${what.en} ${pct > 0 ? "rose" : "fell"} ${formatNumber(Math.abs(pct))}% in ${monthLabel}.`
      : `${what.de} ${pct > 0 ? "stiegen" : "sanken"} im ${monthLabel} um ${formatNumber(Math.abs(pct), "de")} %.`;
  }
  if (rise && rise.from && (rise.to - rise.from) / rise.from >= 0.1) {
    const p = roundPct(((rise.to - rise.from) / rise.from) * 100);
    return lang === "en"
      ? `${rise.label} openings jumped ${formatNumber(p)}% in ${monthLabel}, while the overall market moved ${signed(pct ?? 0, "en")}%.`
      : `${rise.label}: ${formatNumber(p, "de")} % mehr offene Stellen im ${monthLabel}, der Gesamtmarkt ${signed(pct ?? 0, "de")} %.`;
  }
  return lang === "en"
    ? `${formatNumber(end.open)} ${section === "tech" ? "open tech jobs" : "open doctor jobs"} at the end of ${monthLabel}${pct !== undefined ? ` (${signed(pct, "en")}% over the month)` : ""}.`
    : `${formatNumber(end.open, "de")} ${section === "tech" ? "offene Tech-Jobs" : "offene Arztstellen"} Ende ${monthLabel}${pct !== undefined ? ` (${signed(pct, "de")} % im Monat)` : ""}.`;
}

function linkedinPost(): string {
  const f = findings("en");
  const tags = section === "tech" ? "#TechJobs #Hiring #TechRecruiting #JobMarket" : "#Healthcare #Doctors #HospitalStaffing #MedicalJobs #Ärztemangel";
  return [
    hook("en"),
    "",
    ...f.slice(1, 4).map((x) => `• ${x}`),
    "",
    `Full report, with every ${section === "tech" ? "company, function and country" : "specialty, country and German state"}: ${url}`,
    "",
    `Counted daily from ${section === "tech" ? "official careers sites" : "public job services and hospital careers sites"}. Free to cite with a link.`,
    "",
    tags,
  ].join("\n");
}

function pitch(lang: "en" | "de"): string {
  const rp = t(lang).reports;
  const monthLabel = formatMonth(month, lang);
  const f = findings(lang);
  const title = rp.medicineTitle(monthLabel);
  const subject = lang === "en" ? `Data: ${hook("en")}` : `Daten: ${hook("de")}`;
  const intro =
    lang === "en"
      ? `Workog counts every open job for doctors in Germany and across Europe once a day. Our ${monthLabel} numbers may be useful for your coverage of hospital staffing:`
      : `Workog zählt täglich alle offenen Stellen für Ärztinnen und Ärzte in Deutschland und Europa. Unsere Zahlen für ${monthLabel} könnten für Ihre Berichterstattung zur Personallage in Kliniken interessant sein:`;
  const offer =
    lang === "en"
      ? `The full tables (by specialty, career level, country, German state and hospital) are at ${url}. The data is free to use with a link; we're happy to send a breakdown for a specific specialty or region.`
      : `Die vollständigen Tabellen (nach Fachrichtung, Karrierestufe, Land, Bundesland und Klinik) finden Sie unter ${url}. Die Daten dürfen mit Link frei verwendet werden; gern schicken wir eine Auswertung für eine bestimmte Fachrichtung oder Region.`;
  return [
    `**${lang === "en" ? "Subject" : "Betreff"}:** ${subject}`,
    "",
    intro,
    "",
    ...f.slice(0, 4).map((x) => `- ${x}`),
    "",
    offer,
    "",
    `_${lang === "en" ? "Method" : "Methode"}:_ ${rp.medicineMethod}`,
    "",
    `_${lang === "en" ? "Citation" : "Zitierhinweis"}:_ ${rp.citeAs(title, url, formatDate(end.date, lang))}`,
  ].join("\n");
}

const name = `report-${section}-${month}`;
const md = [
  `# ${section === "tech" ? "Tech hiring" : "Doctor job market"}: ${formatMonth(month, "en")}`,
  "",
  `Generated by scripts/linkedin-report.ts from data as of ${end.date}${r.complete ? "" : " (month in progress)"}. Image: ${name}.png`,
  "",
  "## LinkedIn post",
  "",
  linkedinPost(),
  ...(section === "medicine"
    ? ["", "## Press pitch (English)", "", pitch("en"), "", "## Pressemitteilung (Deutsch, z. B. Deutsches Ärzteblatt)", "", pitch("de")]
    : []),
  "",
].join("\n");

await mkdir(OUT, { recursive: true });
await writeFile(`${OUT}${name}.png`, renderPng(chartSvg()));
await writeFile(`${OUT}${name}.md`, md);
console.log(`marketing/linkedin/${name}.png`);
console.log(`marketing/linkedin/${name}.md`);
