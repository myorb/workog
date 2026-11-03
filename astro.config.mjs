// @ts-check
import { defineConfig } from "astro/config";

export default defineConfig({
  site: process.env.SITE_URL ?? "https://workog.com",
  output: "static",
  trailingSlash: "never",
  build: { format: "directory" },
});
