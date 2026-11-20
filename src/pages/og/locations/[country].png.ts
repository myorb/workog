import type { APIRoute, GetStaticPaths } from "astro";
import { countTags } from "../../../lib/jobs.ts";
import { countries } from "../../../lib/places.ts";
import { shareImageResponse } from "../../../lib/share-image.ts";
import { countryShare, type ShareSubject } from "../../../lib/share-subjects.ts";

// the share image of each tech country page that is indexed
export const getStaticPaths = (async () => {
  const counts = await countTags();
  const subjects = await Promise.all(countries.filter((c) => counts.countries.has(c.slug)).map(countryShare));
  return subjects.filter((s): s is ShareSubject => !!s).map((s) => ({ params: { country: s.path.split("/").at(-1)! }, props: { subject: s } }));
}) satisfies GetStaticPaths;

export const GET: APIRoute = ({ props }) => shareImageResponse((props.subject as ShareSubject).image);
