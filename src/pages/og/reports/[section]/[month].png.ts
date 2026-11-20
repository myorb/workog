import type { APIRoute, GetStaticPaths } from "astro";
import { shareImageResponse } from "../../../../lib/share-image.ts";
import { reportShares, type ShareSubject } from "../../../../lib/share-subjects.ts";

// the share image of each monthly report
export const getStaticPaths = (async () =>
  (await Promise.all((["tech", "medicine"] as const).map(async (section) => (await reportShares(section)).map((s) => ({ section, s })))))
    .flat()
    .map(({ section, s }) => ({ params: { section, month: s.path.split("/").at(-1)! }, props: { subject: s } }))) satisfies GetStaticPaths;

export const GET: APIRoute = ({ props }) => shareImageResponse((props.subject as ShareSubject).image);
