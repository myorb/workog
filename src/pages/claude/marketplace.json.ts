import type { APIRoute } from "astro";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

// The repo's Claude Code marketplace, served so `claude plugin marketplace add https://workog.com/claude/marketplace.json`
// needn't clone the repo and its data; the plugin itself installs from plugins/workog alone (git-subdir)
export const GET: APIRoute = async () =>
  new Response(await readFile(join(process.cwd(), ".claude-plugin", "marketplace.json"), "utf8"), {
    headers: { "Content-Type": "application/json; charset=utf-8" },
  });
