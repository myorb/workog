import type { APIRoute, GetStaticPaths } from "astro";
import { defaultLang } from "../lib/i18n.ts";
import { getSitemaps, type Sitemap } from "../lib/sitemap.ts";

export const getStaticPaths = (async () =>
  (await getSitemaps()).map((sitemap) => ({ params: { name: sitemap.name }, props: { sitemap } }))) satisfies GetStaticPaths;

export const GET: APIRoute<{ sitemap: Sitemap }> = ({ props, site }) => {
  const href = (path: string) => new URL(path, site).href;
  const urls = props.sitemap.entries.map(({ path, lastmod, alternates }) => {
    const links = alternates
      ? [...alternates, { lang: "x-default", path: alternates.find((a) => a.lang === defaultLang)!.path }]
          .map((a) => `\n    <xhtml:link rel="alternate" hreflang="${a.lang}" href="${href(a.path)}"/>`)
          .join("")
      : "";
    return `  <url><loc>${href(path)}</loc>${lastmod ? `<lastmod>${lastmod}</lastmod>` : ""}${links}${links ? "\n  " : ""}</url>`;
  });
  const body = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">
${urls.join("\n")}
</urlset>
`;
  return new Response(body, { headers: { "Content-Type": "application/xml; charset=utf-8" } });
};
