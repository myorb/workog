import type { APIRoute, GetStaticPaths } from "astro";
import { apiFiles } from "../../../lib/job-index.ts";

// The open-job index the Workog MCP server searches (src/lib/job-index.ts)
export const getStaticPaths = (async () => {
  const files = await apiFiles();
  return [...files].map(([file, value]) => ({ params: { file }, props: { value } }));
}) satisfies GetStaticPaths;

export const GET: APIRoute<{ value: unknown }> = ({ props }) =>
  new Response(JSON.stringify(props.value), { headers: { "Content-Type": "application/json; charset=utf-8" } });
