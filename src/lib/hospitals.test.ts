import { describe, expect, test } from "bun:test";
import { hospitalKey, hospitalSlugOf, indexHospitals, MIN_HOSPITAL_JOBS } from "./hospitals.ts";

const jobs = (employer: string | undefined, company: string, n: number) => Array.from({ length: n }, () => ({ employer, company }));

describe("hospitalKey", () => {
  test("ignores legal forms, so spellings of one hospital share a page", () => {
    expect(hospitalKey("Helios Klinikum Erfurt GmbH")).toBe(hospitalKey("Helios Klinikum Erfurt"));
    expect(hospitalKey("MEDIAN Unternehmensgruppe B.V. & Co. KG")).toBe("median-unternehmensgruppe");
    expect(hospitalKey("Universitätsmedizin Rostock KdöR")).toBe("universitatsmedizin-rostock");
    expect(hospitalKey("Klinikum Itzehoe gGmbH")).toBe("klinikum-itzehoe");
  });

  test("keeps words that only look like a legal form", () => {
    expect(hospitalKey("Klinik am See")).toBe("klinik-am-see");
    expect(hospitalKey("Agaplesion Diakonieklinikum")).toBe("agaplesion-diakonieklinikum");
  });
});

describe("indexHospitals", () => {
  const groups = new Map([["helios", "Helios Kliniken"]]);
  const index = indexHospitals(
    [
      ...jobs("Helios Klinikum Erfurt GmbH", "helios", 4),
      ...jobs("Helios Klinikum Erfurt", "helios", 2),
      ...jobs("Johanniter  GmbH", "arbeitsagentur", MIN_HOSPITAL_JOBS),
      ...jobs("Kleine Praxis", "arbeitsagentur", MIN_HOSPITAL_JOBS - 1),
      ...jobs(undefined, "arbeitsagentur", 3),
    ],
    groups,
  );

  test("gives a page only to employers with enough jobs, most jobs first", () => {
    expect(index.hospitals.map((h) => [h.slug, h.name, h.count])).toEqual([
      ["helios-klinikum-erfurt", "Helios Klinikum Erfurt GmbH", 6],
      ["johanniter", "Johanniter GmbH", MIN_HOSPITAL_JOBS],
    ]);
  });

  test("puts a group's hospitals under it and counts all its jobs", () => {
    expect(index.groups).toMatchObject([{ slug: "helios", name: "Helios Kliniken", count: 6 }]);
    expect(index.groups[0]!.hospitals.map((h) => h.slug)).toEqual(["helios-klinikum-erfurt"]);
    expect(index.hospitals[0]!.group).toBe("helios");
    expect(index.hospitals[1]!.group).toBeUndefined();
  });

  test("hospitalSlugOf finds the page for every spelling, and none for small employers", () => {
    expect(hospitalSlugOf(index, "Helios Klinikum Erfurt")).toBe("helios-klinikum-erfurt");
    expect(hospitalSlugOf(index, "Johanniter  GmbH")).toBe("johanniter");
    expect(hospitalSlugOf(index, "Kleine Praxis")).toBeUndefined();
    expect(hospitalSlugOf(index, undefined)).toBeUndefined();
  });

  test("a group's slug is never given to an employer", () => {
    const clash = indexHospitals(jobs("Helios GmbH", "arbeitsagentur", MIN_HOSPITAL_JOBS), groups);
    expect(clash.hospitals).toEqual([]);
  });
});
