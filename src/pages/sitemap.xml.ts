import type { APIRoute } from "astro";
import { getSitemaps } from "../lib/sitemap.ts";

/** Sitemap index; the URLs themselves are in /sitemap-<name>.xml */
export const GET: APIRoute = async ({ site }) => {
  const sitemaps = (await getSitemaps()).map(({ name }) => `  <sitemap><loc>${new URL(`/sitemap-${name}.xml`, site).href}</loc></sitemap>`);
  const body = `<?xml version="1.0" encoding="UTF-8"?>
<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${sitemaps.join("\n")}
</sitemapindex>
`;
  return new Response(body, { headers: { "Content-Type": "application/xml; charset=utf-8" } });
};
