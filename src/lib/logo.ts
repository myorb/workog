/**
 * The Workog mark: a W whose tall middle stroke spikes like a heartbeat or a
 * chart peak. Drawn on a 64×64 grid. The tile takes its section's color: blue
 * for tech, teal for medicine, and a blend of the two on the start page and
 * wherever the site is shown as a whole (app icons, the manifest).
 *
 * This is the single source: Logo.astro inlines it in the header,
 * scripts/icons.ts renders the favicons and app icons from it and
 * scripts/og-images.ts puts it on the share images.
 */

export type LogoVariant = "tech" | "medicine" | "start";

/** The tile's gradient, top-left to bottom-right */
export const LOGO_COLORS: Record<LogoVariant, [from: string, to: string]> = {
  tech: ["#3b82f6", "#1e40af"],
  medicine: ["#2dd4bf", "#0f766e"],
  start: ["#2563eb", "#0d9488"],
};

/** The W itself, a single stroke */
export const LOGO_PATH = "M11 21l9 25 12-33 12 33 9-25";

/**
 * The mark's inner SVG markup for a 64×64 viewBox. The gradient's id carries
 * the variant, so pages that inline several variants stay valid; `square`
 * drops the rounded corners for platforms that round icons themselves (iOS).
 */
export function logoMarkup({ variant = "start", square = false }: { variant?: LogoVariant; square?: boolean } = {}) {
  const [from, to] = LOGO_COLORS[variant];
  const id = `workog-logo-${variant}`;
  return (
    `<defs><linearGradient id="${id}" x1="0" y1="0" x2="64" y2="64" gradientUnits="userSpaceOnUse">` +
    `<stop offset="0" stop-color="${from}"/><stop offset="1" stop-color="${to}"/></linearGradient></defs>` +
    `<rect width="64" height="64"${square ? "" : ' rx="15"'} fill="url(#${id})"/>` +
    `<path d="${LOGO_PATH}" fill="none" stroke="#fff" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"/>`
  );
}

/** A standalone SVG document of the mark */
export function logoSvg(options: { size?: number; square?: boolean; variant?: LogoVariant } = {}) {
  const size = options.size ? ` width="${options.size}" height="${options.size}"` : "";
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"${size}>${logoMarkup(options)}</svg>`;
}

/** The favicon files for a section, as rendered by scripts/icons.ts */
export const faviconPaths = (variant: LogoVariant) =>
  variant === "start" ? { svg: "/favicon.svg", ico: "/favicon.ico" } : { svg: `/favicon-${variant}.svg`, ico: `/favicon-${variant}.ico` };
