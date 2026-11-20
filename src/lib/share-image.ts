/**
 * The per-page share images (og:image) for hub pages: the subject, its open
 * job count and how that changed, so a link to the Google page or to
 * "Psychiatry in Germany" carries its own number on LinkedIn or X.
 *
 * Rendered at build time by the static endpoints under src/pages/og/, and by
 * scripts/linkedin-report.ts. Text is drawn with the Inter files in
 * src/assets/fonts, never system fonts, so the Linux build matches macOS.
 */
import { join } from "node:path";
import { Resvg } from "@resvg/resvg-js";
import { logoMarkup, type LogoVariant } from "./logo.ts";
import { formatNumber } from "./locale.ts";
import { roundPct } from "./trend.ts";

export const SHARE_WIDTH = 1200;
export const SHARE_HEIGHT = 630;

// resolved from the project root: the build bundles this module into dist/, away from src/
const FONT_DIR = join(process.cwd(), "src/assets/fonts");
export const FONT_FILES = ["Inter-Regular.ttf", "Inter-Bold.ttf"].map((f) => join(FONT_DIR, f));
export const FONT = "Inter";

const GLOW: Record<LogoVariant, string> = { tech: "#1e3a8a", medicine: "#115e59", start: "#1e3a8a" };
const UP = "#4ade80";
const DOWN = "#f87171";
const TEXT = "#f5f5f4";
const MUTED = "#a8a29e";

export interface ShareImage {
  variant: LogoVariant;
  /** the subject, usually the page heading */
  title: string;
  count: number;
  /** percent change, unrounded, and the days it spans */
  trend?: { pct: number; days: number };
  /** an optional last line, e.g. the page's strongest insight */
  note?: string;
}

export const escapeXml = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");

/**
 * Splits text into at most `maxLines` lines of about `maxChars` characters,
 * by words, ending in "…" when it doesn't fit. Inter's average glyph is a
 * little over half its size, which is what `maxChars` is estimated from.
 */
export function wrap(text: string, maxChars: number, maxLines: number): string[] {
  const lines: string[] = [];
  let line = "";
  const words = text.split(/\s+/).filter(Boolean);
  for (let i = 0; i < words.length; i++) {
    const word = words[i]!;
    const next = line ? `${line} ${word}` : word;
    if (next.length <= maxChars) {
      line = next;
      continue;
    }
    if (line) lines.push(line);
    line = word.length > maxChars ? `${word.slice(0, maxChars - 1)}…` : word;
    if (lines.length === maxLines) return ellipsize(lines, maxChars);
  }
  if (line) lines.push(line);
  return lines.length > maxLines ? ellipsize(lines.slice(0, maxLines), maxChars) : lines;
}

function ellipsize(lines: string[], maxChars: number): string[] {
  let last = lines.at(-1)!.replace(/[\s,.;:–—-]*…?$/, "");
  // drop whole words until the ellipsis fits
  while (last.length + 1 > maxChars && last.includes(" ")) last = last.slice(0, last.lastIndexOf(" ")).replace(/[\s,.;:–—-]+$/, "");
  if (last.length + 1 > maxChars) last = last.slice(0, maxChars - 1);
  return [...lines.slice(0, -1), `${last}…`];
}

/** "↑ 1.9% in 17 days", the arrow and color by sign */
export function trendText(trend: { pct: number; days: number }): { text: string; color: string } {
  const pct = roundPct(trend.pct);
  const days = `in ${formatNumber(trend.days)} ${trend.days === 1 ? "day" : "days"}`;
  if (pct === 0) return { text: `→ unchanged ${days}`, color: MUTED };
  return pct > 0 ? { text: `↑ ${formatNumber(pct)}% ${days}`, color: UP } : { text: `↓ ${formatNumber(-pct)}% ${days}`, color: DOWN };
}

const text = (x: number, y: number, size: number, fill: string, content: string, weight = 400, anchor = "start") =>
  `<text x="${x}" y="${y}" font-family="${FONT}" font-size="${size}" font-weight="${weight}" fill="${fill}" text-anchor="${anchor}">${escapeXml(content)}</text>`;

/** The image as an SVG document */
export function shareSvg({ variant, title, count, trend, note }: ShareImage): string {
  const titleLines = wrap(title, 30, 2);
  const titleY = titleLines.length > 1 ? 232 : 262;
  const statY = titleY + (titleLines.length - 1) * 74 + 130;
  const change = trend && trendText(trend);
  const countText = formatNumber(count);
  const unit = count === 1 ? "open job" : "open jobs";
  // the unit follows the number: Inter Bold's digits are about 0.62 em wide, separators about 0.27 em
  const em = [...countText].reduce((w, c) => w + (/\d/.test(c) ? 0.66 : 0.28), 0);
  const unitX = 80 + Math.round(em * 112) + 20;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${SHARE_WIDTH}" height="${SHARE_HEIGHT}" viewBox="0 0 ${SHARE_WIDTH} ${SHARE_HEIGHT}">
  <defs>
    <radialGradient id="glow" cx="1000" cy="120" r="700" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="${GLOW[variant]}" stop-opacity="0.9"/>
      <stop offset="1" stop-color="${GLOW[variant]}" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="${SHARE_WIDTH}" height="${SHARE_HEIGHT}" fill="#0c0a09"/>
  <rect width="${SHARE_WIDTH}" height="${SHARE_HEIGHT}" fill="url(#glow)"/>
  <g transform="translate(80 64) scale(0.875)">${logoMarkup({ variant })}</g>
  ${text(150, 107, 40, TEXT, "Workog", 700)}
  ${titleLines.map((line, i) => text(80, titleY + i * 74, 64, TEXT, line, 700)).join("\n  ")}
  ${text(80, statY, 112, TEXT, countText, 700)}
  ${text(unitX, statY, 44, MUTED, unit)}
  ${change ? text(80, statY + 72, 40, change.color, change.text, 700) : ""}
  ${note ? wrap(note, 52, 1).map((line) => text(80, 572, 30, MUTED, line)).join("") : ""}
  ${text(1120, 572, 28, MUTED, "workog.com", 400, "end")}
</svg>`;
}

/** Renders an SVG to PNG with the bundled fonts only */
export function renderPng(svg: string): Buffer {
  const resvg = new Resvg(svg, {
    font: { fontFiles: FONT_FILES, loadSystemFonts: false, defaultFontFamily: FONT },
  });
  return resvg.render().asPng();
}

/** A static endpoint's response for a share image */
export const shareImageResponse = (image: ShareImage) =>
  new Response(new Uint8Array(renderPng(shareSvg(image))), { headers: { "Content-Type": "image/png" } });

/** The alt text of a share image: what it says, in one sentence */
export function shareAlt({ title, count, trend }: ShareImage): string {
  const jobs = `${formatNumber(count)} ${count === 1 ? "open job" : "open jobs"}`;
  if (!trend) return `${title}: ${jobs}`;
  const pct = roundPct(trend.pct);
  const days = `${formatNumber(trend.days)} days`;
  const change = pct > 0 ? `up ${formatNumber(pct)}% in ${days}` : pct < 0 ? `down ${formatNumber(-pct)}% in ${days}` : `unchanged in ${days}`;
  return `${title}: ${jobs}, ${change}`;
}

/** Turns a URL path into the image file the endpoints under src/pages/og/ write for it */
export const shareImagePath = (pagePath: string) => `/og${pagePath === "/" ? "/index" : pagePath}.png`;
