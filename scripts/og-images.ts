/**
 * Renders the 1200×630 share images in public/: og.png for the tech section,
 * og-medicine.png for the medical section and og-start.png for the start page.
 * Base.astro picks one by the page's section. Run after changing the copy:
 *
 *   bun scripts/og-images.ts
 *
 * Text is drawn with the machine's system fonts, so render on macOS to match.
 */
import sharp from "sharp";
import { logoMarkup, type LogoVariant } from "../src/lib/logo.ts";

interface Image {
  file: string;
  /** whose colors the logo takes */
  variant: LogoVariant;
  /** the glow in the top-right corner */
  glow: string;
  lines: string[];
}

export const images: Image[] = [
  { file: "og.png", variant: "tech", glow: "#1e3a8a", lines: ["Open jobs at top tech companies, refreshed daily", "from official career sites."] },
  { file: "og-medicine.png", variant: "medicine", glow: "#115e59", lines: ["Jobs for doctors at hospitals and practices", "across Europe, refreshed daily."] },
  { file: "og-start.png", variant: "start", glow: "#1e3a8a", lines: ["Tech jobs and jobs for doctors, refreshed daily", "from the employers."] },
];

const svg = ({ variant, glow, lines }: Image) => `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
  <defs>
    <radialGradient id="glow" cx="1000" cy="120" r="700" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="${glow}" stop-opacity="0.9"/>
      <stop offset="1" stop-color="${glow}" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="1200" height="630" fill="#0c0a09"/>
  <rect width="1200" height="630" fill="url(#glow)"/>
  <g transform="translate(96 180) scale(1.875)">${logoMarkup({ variant })}</g>
  <text x="246" y="272" font-family="Helvetica Neue, Helvetica, Arial, sans-serif" font-size="84" font-weight="700" fill="#f5f5f4">Workog</text>
  ${lines.map((line, i) => `<text x="96" y="${380 + i * 56}" font-family="Helvetica Neue, Helvetica, Arial, sans-serif" font-size="36" fill="#a8a29e">${line}</text>`).join("\n  ")}
</svg>`;

if (import.meta.main) {
  for (const image of images) {
    await sharp(Buffer.from(svg(image))).png({ compressionLevel: 9 }).toFile(new URL(`../public/${image.file}`, import.meta.url).pathname);
    console.log(`public/${image.file}`);
  }
}
