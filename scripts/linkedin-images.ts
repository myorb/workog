/**
 * Renders the LinkedIn company page images into marketing/linkedin/:
 *
 * - cover.png: the page's banner, 1128×191 as LinkedIn specifies, drawn at 2×
 *   so it stays sharp. LinkedIn puts the page's logo over the banner's lower
 *   left corner on desktop and crops its sides on phones, so the slogan sits
 *   in the middle.
 * - logo.png: the page's logo, 400×400, the full-bleed start-page mark
 *   (LinkedIn rounds and frames logos itself).
 *
 *   bun scripts/linkedin-images.ts
 *
 * Text is drawn with the machine's system fonts, so render on macOS to match.
 * Posts can use public/og.png, which already has LinkedIn's 1.91:1 shape.
 */
import { mkdir } from "node:fs/promises";
import sharp from "sharp";
import { LOGO_COLORS, logoSvg } from "../src/lib/logo.ts";

const OUT = new URL("../marketing/linkedin/", import.meta.url).pathname;
const FONT = "Helvetica Neue, Helvetica, Arial, sans-serif";
const [TECH] = LOGO_COLORS.tech;
const [MEDICINE] = LOGO_COLORS.medicine;

/** LinkedIn's banner size; the file is SCALE times larger */
const W = 1128;
const H = 191;
const SCALE = 2;

const cover = `<svg xmlns="http://www.w3.org/2000/svg" width="${W * SCALE}" height="${H * SCALE}" viewBox="0 0 ${W} ${H}">
  <defs>
    <radialGradient id="tech" cx="250" cy="40" r="520" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="#1e3a8a" stop-opacity="0.95"/>
      <stop offset="1" stop-color="#1e3a8a" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="medicine" cx="880" cy="150" r="520" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="#115e59" stop-opacity="0.95"/>
      <stop offset="1" stop-color="#115e59" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="${W}" height="${H}" fill="#0c0a09"/>
  <rect width="${W}" height="${H}" fill="url(#tech)"/>
  <rect width="${W}" height="${H}" fill="url(#medicine)"/>
  <text x="${W / 2}" y="98" text-anchor="middle" font-family="${FONT}" font-size="46" font-weight="700" fill="#f5f5f4">Top <tspan fill="${TECH}">tech</tspan> jobs. Top <tspan fill="${MEDICINE}">doctor</tspan> jobs.</text>
  <text x="${W / 2}" y="136" text-anchor="middle" font-family="${FONT}" font-size="19" fill="#a8a29e" letter-spacing="1">workog.com</text>
</svg>`;

if (import.meta.main) {
  await mkdir(OUT, { recursive: true });
  await sharp(Buffer.from(cover)).png({ compressionLevel: 9 }).toFile(`${OUT}cover.png`);
  await sharp(Buffer.from(logoSvg({ size: 400, square: true }))).png({ compressionLevel: 9 }).toFile(`${OUT}logo.png`);
  console.log("marketing/linkedin/cover.png\nmarketing/linkedin/logo.png");
}
