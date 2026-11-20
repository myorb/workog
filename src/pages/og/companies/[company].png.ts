import type { APIRoute, GetStaticPaths } from "astro";
import { getCompanies } from "../../../lib/jobs.ts";
import { shareImageResponse } from "../../../lib/share-image.ts";
import { companyShare, type ShareSubject } from "../../../lib/share-subjects.ts";

// the share image of each company page (see src/lib/share-subjects.ts)
export const getStaticPaths = (async () => {
  const subjects = await Promise.all((await getCompanies()).map((c) => companyShare(c.key)));
  return subjects.filter((s): s is ShareSubject => !!s).map((s) => ({ params: { company: s.path.split("/").at(-1)! }, props: { subject: s } }));
}) satisfies GetStaticPaths;

export const GET: APIRoute = ({ props }) => shareImageResponse((props.subject as ShareSubject).image);
