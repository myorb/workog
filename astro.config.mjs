// @ts-check
import { defineConfig } from "astro/config";

export default defineConfig({
  site: process.env.SITE_URL ?? "https://workog.com",
  output: "static",
  trailingSlash: "never",
  // DigitalOcean App Platform serves every file with max-age=10 and offers no way to change it,
  // so a linked stylesheet is refetched on nearly every visit; inlining saves that render-blocking request
  build: { format: "directory", inlineStylesheets: "always" },
});
