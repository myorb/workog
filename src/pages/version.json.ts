import type { APIRoute } from "astro";
import { getLatestRun } from "../lib/jobs.ts";

/** The pipeline run this build was made from; scripts/ping.ts polls it to know a deploy is live */
export const GET: APIRoute = async () =>
  new Response(JSON.stringify({ run: (await getLatestRun())?.startedAt ?? null }) + "\n", {
    headers: { "Content-Type": "application/json; charset=utf-8" },
  });
