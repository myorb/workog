import type { APIRoute, GetStaticPaths } from "astro";
import { specialties } from "../../../../lib/medicine.ts";
import { shareImageResponse } from "../../../../lib/share-image.ts";
import { specialtyShare, type ShareSubject } from "../../../../lib/share-subjects.ts";

// the share image of each specialty page that is indexed
export const getStaticPaths = (async () => {
  const subjects = await Promise.all(specialties.map(specialtyShare));
  return subjects.filter((s): s is ShareSubject => !!s).map((s) => ({ params: { specialty: s.path.split("/").at(-1)! }, props: { subject: s } }));
}) satisfies GetStaticPaths;

export const GET: APIRoute = ({ props }) => shareImageResponse((props.subject as ShareSubject).image);
