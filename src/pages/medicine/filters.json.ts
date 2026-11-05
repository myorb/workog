import type { APIRoute } from "astro";
import { getMedicineComboKeys } from "../../lib/links.ts";

/**
 * Every combination of specialty, level and place with a page, as
 * medicineComboKey()s, for the medical filter form. Too many to inline in the
 * page (some 9,000), so the form fetches them once it's used.
 */
export const GET: APIRoute = async () =>
  new Response(JSON.stringify([...(await getMedicineComboKeys())].sort()), {
    headers: { "Content-Type": "application/json; charset=utf-8" },
  });
