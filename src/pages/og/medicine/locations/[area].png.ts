import type { APIRoute, GetStaticPaths } from "astro";
import { getArea, medicineCountries, states } from "../../../../lib/medicine.ts";
import { shareImageResponse } from "../../../../lib/share-image.ts";
import { medicineAreaShare, type ShareSubject } from "../../../../lib/share-subjects.ts";

// the share image of each medical state and country page that is indexed
export const getStaticPaths = (async () => {
  const subjects = await Promise.all([...states, ...medicineCountries].map(({ slug }) => medicineAreaShare(getArea(slug)!)));
  return subjects.filter((s): s is ShareSubject => !!s).map((s) => ({ params: { area: s.path.split("/").at(-1)! }, props: { subject: s } }));
}) satisfies GetStaticPaths;

export const GET: APIRoute = ({ props }) => shareImageResponse((props.subject as ShareSubject).image);
