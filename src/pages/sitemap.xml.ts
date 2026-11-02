import type { APIRoute } from "astro";
import { getSitemapEntries } from "../lib/sitemap.ts";

export const GET: APIRoute = async ({ site }) => {
  const urls = (await getSitemapEntries()).map(({ path, lastmod }) => {
    const loc = new URL(path, site).href;
    return `  <url><loc>${loc}</loc>${lastmod ? `<lastmod>${lastmod}</lastmod>` : ""}</url>`;
  });
  const body = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.join("\n")}
</urlset>
`;
  return new Response(body, { headers: { "Content-Type": "application/xml; charset=utf-8" } });
};
