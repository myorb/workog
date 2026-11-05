import type { APIRoute } from "astro";

/**
 * AI search and assistant crawlers, named so that a later rule for one of them
 * can't shut them out by accident: ChatGPT search and Copilot cite from what
 * these fetch, and `*` alone would be overridden by any group naming them.
 */
const AI_CRAWLERS = [
  "GPTBot",
  "OAI-SearchBot",
  "ChatGPT-User",
  "PerplexityBot",
  "Perplexity-User",
  "ClaudeBot",
  "Claude-SearchBot",
  "Claude-User",
  "Google-Extended",
  "Applebot-Extended",
  "bingbot",
];

export const GET: APIRoute = ({ site }) =>
  new Response(
    [
      "# Search engines and AI assistants may crawl and cite every page.",
      "User-agent: *",
      "Allow: /",
      "",
      ...AI_CRAWLERS.map((bot) => `User-agent: ${bot}`),
      "Allow: /",
      "",
      `Sitemap: ${new URL("/sitemap.xml", site).href}`,
      "",
    ].join("\n"),
    { headers: { "Content-Type": "text/plain; charset=utf-8" } },
  );
