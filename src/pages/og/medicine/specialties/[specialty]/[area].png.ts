import type { APIRoute, GetStaticPaths } from "astro";
import { getMedicineCounts } from "../../../../../lib/jobs.ts";
import { shareImageResponse } from "../../../../../lib/share-image.ts";
import { specialtyAreaShare, type ShareSubject } from "../../../../../lib/share-subjects.ts";

// the share image of each specialty-in-country page that is indexed ("Psychiatry jobs in Germany")
export const getStaticPaths = (async () => {
  const keys = [...(await getMedicineCounts()).specialtyAreas.keys()];
  const subjects = await Promise.all(keys.map((key) => specialtyAreaShare(...(key.split("/") as [string, string]))));
  return subjects
    .filter((s): s is ShareSubject => !!s)
    .map((s) => {
      const [specialty, area] = s.path.split("/").slice(-2) as [string, string];
      return { params: { specialty, area }, props: { subject: s } };
    });
}) satisfies GetStaticPaths;

export const GET: APIRoute = ({ props }) => shareImageResponse((props.subject as ShareSubject).image);
