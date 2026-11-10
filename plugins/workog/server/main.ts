#!/usr/bin/env node
/**
 * Workog MCP server: searches the open jobs on workog.com for an AI assistant.
 * Runs over stdio, as the Claude Code plugin in plugins/workog starts it, or
 * with --http [port] as a streamable HTTP server at /mcp, for apps that only
 * reach servers by URL, such as ChatGPT.
 *
 *   WORKOG_URL        the site to read (default https://workog.com)
 *   WORKOG_CACHE_DIR  where to keep downloaded job files between sessions
 *   HOST              the address --http listens on (default 127.0.0.1)
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { createServer } from "node:http";
import { homedir } from "node:os";
import { join } from "node:path";
import { z } from "zod";
import plugin from "../.claude-plugin/plugin.json" with { type: "json" };
import { Workog } from "./data.ts";
import { parseJobPage, slugFrom } from "./page.ts";
import { companyName, compile, count, FilterError, type Filters, groupings, labelOf, type Row, search, valuesOf, type Vocab } from "./search.ts";

const base = process.env.WORKOG_URL || "https://workog.com";
const cacheDir = process.env.WORKOG_CACHE_DIR || join(homedir(), ".cache", "workog-mcp");
const workog = new Workog(base, cacheDir, `workog-mcp/${plugin.version} (+${base})`);

const n = (k: number) => k.toLocaleString("en-US");
const MAX_DESCRIPTION = 30_000;

const filterShape = {
  section: z.enum(["tech", "medicine"]).optional().describe('"tech": jobs at tech companies and tech job boards; "medicine": jobs for doctors in Europe. Left out, it follows from the other filters, else both.'),
  query: z.string().optional().describe("Words that must all appear in the title, employer, company or location, e.g. \"staff backend engineer\" or \"Oberarzt Kardiologie\". Accents and case don't matter."),
  company: z.string().optional().describe("Company or source, by slug or name, e.g. \"stripe\" or \"Helios\". count_jobs by company lists them."),
  employer: z.string().optional().describe("Part of the hiring organization's name, e.g. a hospital (\"Charité\") or the employer behind a job-board posting."),
  country: z.string().optional().describe("Country slug or English name, e.g. \"germany\", \"United Kingdom\"."),
  city: z.string().optional().describe("City name or slug, e.g. \"berlin\", \"München\"."),
  state: z.string().optional().describe("German state (medical jobs only), e.g. \"bavaria\", \"Nordrhein-Westfalen\"."),
  location: z.string().optional().describe("Free text matched against the job's location labels, for places the other filters don't know, e.g. \"Austin, TX\" or \"Ruhr\"."),
  remote: z.boolean().optional().describe("true: remote jobs only; false: on-site or hybrid only."),
  technology: z.string().optional().describe("Tech jobs: technology slug or name, e.g. \"rust\", \"kubernetes\", \"TypeScript\"."),
  category: z.string().optional().describe("Tech jobs: job function, e.g. engineering, data, design, product, sales, marketing, management, executive."),
  employment: z.enum(["full-time", "part-time", "contract", "internship"]).optional().describe("Tech jobs: employment type."),
  specialty: z.string().optional().describe("Medical jobs: specialty slug or name, e.g. \"cardiology\", \"anaesthesiology\", \"general-practice\"."),
  level: z.string().optional().describe("Medical jobs: career level, one of resident (Assistenzarzt), specialist (Facharzt), senior (Oberarzt), head (Chefarzt)."),
  posted_within_days: z.number().int().min(1).max(365).optional().describe("Only jobs Workog first saw within this many days."),
};

async function rowsFor(filters: Filters): Promise<{ rows: Row[]; vocab: Vocab; run: string | null }> {
  const index = await workog.getIndex();
  const compiled = compile(filters, index.vocab);
  const all = (await Promise.all(compiled.sections.map((s) => workog.rows(s)))).flat();
  return { rows: search(all, compiled), vocab: index.vocab, run: index.run };
}

function describeRow(row: Row, vocab: Vocab): string {
  const company = companyName(vocab, row.company);
  const by = row.employer ? `${row.employer} (via ${company})` : company;
  const where = [row.locations.slice(0, 3).join("; ") + (row.locations.length > 3 ? `; +${row.locations.length - 3} more` : ""), row.remote ? "remote" : ""].filter(Boolean).join(", ");
  const tags =
    row.section === "tech"
      ? [row.category && labelOf(row.category, "category", vocab), row.employment !== "full-time" && row.employment, ...(row.technologies ?? []).slice(0, 6).map((t) => labelOf(t, "technology", vocab))]
      : [row.specialty && labelOf(row.specialty, "specialty", vocab), row.level && labelOf(row.level, "level", vocab)];
  const salary = row.salary && `${row.salary.currency} ${n(row.salary.min)}${row.salary.max !== row.salary.min ? `–${n(row.salary.max)}` : ""} per ${row.salary.unit.toLowerCase()}`;
  return [
    `**${row.title}** — ${by}`,
    `   ${[where || "location not given", tags.filter(Boolean).join(", "), salary, `first seen ${row.firstSeen}`].filter(Boolean).join(" · ")}`,
    `   ${workog.jobUrl(row.slug)}`,
  ].join("\n");
}

const asOf = (run: string | null) => (run ? ` Data from Workog's run of ${run.slice(0, 16).replace("T", " ")} UTC.` : "");

/** Tool results: text for the model, errors it can act on flagged as such */
async function respond(work: () => Promise<string>) {
  try {
    return { content: [{ type: "text" as const, text: await work() }] };
  } catch (error) {
    const text = error instanceof FilterError ? error.message : `Workog could not be reached or read: ${error instanceof Error ? error.message : String(error)}`;
    return { content: [{ type: "text" as const, text }], isError: true };
  }
}

/** A server with Workog's tools; every server shares the one Workog and its loaded rows */
function workogServer(): McpServer {
  const server = new McpServer({ name: "workog", version: plugin.version });

  server.registerTool(
    "search_jobs",
    {
      title: "Search open jobs",
      description:
        "Search the open jobs on Workog: tech jobs fetched daily from tech companies' own careers sites and tech job boards, and jobs for doctors across Europe from public job services and hospital groups. Returns titles, employers, places, tags, first-seen dates and each job's Workog URL; call get_job for the full text and apply link.",
      inputSchema: {
        ...filterShape,
        limit: z.number().int().min(1).max(50).default(15).describe("Jobs to return."),
        offset: z.number().int().min(0).default(0).describe("Jobs to skip, for the next page."),
      },
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    ({ limit, offset, ...filters }) =>
      respond(async () => {
        const { rows, vocab, run } = await rowsFor(filters);
        if (!rows.length) return `No open jobs match.${asOf(run)} Loosen a filter, or use count_jobs to see which values have jobs.`;
        const page = rows.slice(offset, offset + limit);
        const order = filters.query ? "best title matches first, then newest" : "newest first";
        const head = `${n(rows.length)} open jobs match (${order}); showing ${n(offset + 1)}–${n(offset + page.length)}.${asOf(run)}`;
        const more = offset + page.length < rows.length ? `\n\nMore: call again with offset ${offset + page.length}.` : "";
        return `${head}\n\n${page.map((r, i) => `${offset + i + 1}. ${describeRow(r, vocab)}`).join("\n")}${more}`;
      }),
  );

  server.registerTool(
    "get_job",
    {
      title: "Read a job",
      description: "The full posting for one Workog job: description, employer, employment type, salary when stated, dates and the link to apply on the employer's or job board's site. Takes the slug or the workog.com/jobs/… URL from search_jobs.",
      inputSchema: {
        job: z.string().describe("The job's slug or Workog URL."),
        max_chars: z.number().int().min(500).max(MAX_DESCRIPTION).default(12_000).describe("Longest description to return."),
      },
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    ({ job, max_chars }) =>
      respond(async () => {
        const slug = slugFrom(job);
        if (!slug) throw new FilterError(`"${job}" is not a Workog job slug or URL; take one from search_jobs.`);
        const url = workog.jobUrl(slug);
        let html: string;
        try {
          html = await workog.fetchText(`/jobs/${slug}`);
        } catch (error) {
          if (error instanceof Error && / 404 /.test(error.message)) throw new FilterError(`No Workog job at ${url}: it never existed, or it closed more than 14 days ago.`);
          throw error;
        }
        const page = parseJobPage(html);
        if (page.closed) return `# ${page.title}\n\nClosed: ${page.closedNote ?? "this job is no longer open."}\n${url}`;
        const description = page.description ?? "";
        const cut = description.length > max_chars ? `${description.slice(0, max_chars)}…\n\n[Description cut at ${n(max_chars)} of ${n(description.length)} characters; ask with a higher max_chars for more.]` : description;
        const facts = [
          ["Employer", page.employer],
          ["Employment", page.employmentType?.toLowerCase().replace(/_/g, "-")],
          ["Remote", page.remote ? "yes" : undefined],
          ["Salary", page.salary],
          ["Posted", page.datePosted],
          ["Listed until", page.validThrough],
          ["Apply", page.applyUrl],
          ["Workog page", url],
        ].filter(([, v]) => v);
        return `# ${page.title}\n\n${facts.map(([k, v]) => `- ${k}: ${v}`).join("\n")}\n\n## Description\n\n${cut || "The posting has no description."}`;
      }),
  );

  server.registerTool(
    "count_jobs",
    {
      title: "Count open jobs",
      description:
        "Counts the open jobs that match the filters, broken down by one field: which companies hire most for a technology, which cities have the most cardiology jobs, how many remote jobs each country has. Also lists the valid values (slugs) for a filter.",
      inputSchema: {
        ...filterShape,
        group_by: z.enum(groupings).describe("The field to count by."),
        top: z.number().int().min(1).max(200).default(25).describe("How many values to list."),
      },
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    ({ group_by, top, ...filters }) =>
      respond(async () => {
        const { rows, vocab, run } = await rowsFor(filters);
        const { counts, unset } = count(rows, group_by, vocab);
        const lines = counts.slice(0, top).map(([value, k]) => {
          const label = labelOf(value, group_by, vocab);
          return `- ${label}${label !== value ? ` (${value})` : ""}: ${n(k)}`;
        });
        const multi = rows.some((r) => valuesOf(r, group_by, vocab).length > 1) ? " A job with several values counts once for each." : "";
        return [
          `${n(rows.length)} open jobs match.${asOf(run)} By ${group_by}, top ${n(Math.min(top, counts.length))} of ${n(counts.length)}:${multi}`,
          "",
          ...lines,
          ...(unset ? ["", `${n(unset)} matching jobs have no ${group_by}.`] : []),
        ].join("\n");
      }),
  );

  server.registerTool(
    "market_summary",
    {
      title: "Job market summary",
      description: "Today's headline numbers from Workog with 30-day changes: open jobs by company, technology, country, remote share; for doctors by specialty, career level, country, German state and hospital. Each line links to its Workog page, for citing.",
      inputSchema: {
        section: z.enum(["tech", "medicine"]).optional().describe("Only this section's numbers."),
      },
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    ({ section }) =>
      respond(async () => {
        const text = await workog.fetchText("/llms-full.txt");
        if (!section) return text;
        const [head, ...parts] = text.split(/^(?=## )/m);
        const wanted = parts.filter((p) => (section === "tech" ? /^## Tech/.test(p) : /^## Medical/.test(p)));
        return [head, ...wanted].join("");
      }),
  );

  return server;
}

/** Stateless streamable HTTP at /mcp: a fresh server and transport per request */
function serveHttp(port: number, host: string) {
  const http = createServer(async (req, res) => {
    const path = new URL(req.url ?? "/", "http://x").pathname;
    if (path === "/" || path === "/health") {
      res.writeHead(200, { "Content-Type": "text/plain" }).end(`Workog MCP server ${plugin.version}: connect your app to /mcp\n`);
      return;
    }
    if (path !== "/mcp") {
      res.writeHead(404).end();
      return;
    }
    if (req.method !== "POST") {
      res.writeHead(405, { Allow: "POST" }).end();
      return;
    }
    const server = workogServer();
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
    res.on("close", () => {
      void transport.close();
      void server.close();
    });
    try {
      await server.connect(transport);
      await transport.handleRequest(req, res);
    } catch (error) {
      console.error(error);
      if (!res.headersSent) res.writeHead(500).end();
    }
  });
  http.listen(port, host, () => console.error(`Workog MCP server on http://${host}:${port}/mcp`));
}

const at = process.argv.indexOf("--http");
if (at === -1) {
  await workogServer().connect(new StdioServerTransport());
} else {
  const arg = process.argv[at + 1];
  serveHttp(arg && /^\d+$/.test(arg) ? Number(arg) : 8787, process.env.HOST || "127.0.0.1");
}
