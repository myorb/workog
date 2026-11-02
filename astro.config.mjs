// @ts-check
import { defineConfig } from "astro/config";

export default defineConfig({
  site: process.env.SITE_URL ?? "https://static-job.pages.dev",
  output: "static",
  trailingSlash: "never",
  build: { format: "file" },
});
