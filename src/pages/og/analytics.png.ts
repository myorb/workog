import type { APIRoute } from "astro";
import { shareImageResponse } from "../../lib/share-image.ts";
import { analyticsShare } from "../../lib/share-subjects.ts";

// the analytics page's share image
export const GET: APIRoute = async () => shareImageResponse((await analyticsShare()).image);
