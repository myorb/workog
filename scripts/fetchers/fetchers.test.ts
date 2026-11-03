import { describe, expect, test } from "bun:test";
import type { CompanyConfig } from "../../src/lib/schema.ts";
import { ashby } from "./ashby.ts";
import { eightfold } from "./eightfold.ts";
import { mapLimit } from "./http.ts";
import { lever } from "./lever.ts";
import { apiBase, pickSlices, workday } from "./workday.ts";

const company = (extra: Partial<CompanyConfig>): CompanyConfig => ({ key: "acme", name: "Acme", source: "test", ...extra });

describe("mapLimit", () => {
  test("keeps order and never runs more than the limit at once", async () => {
    let running = 0;
    let peak = 0;
    const out = await mapLimit([30, 10, 20, 5, 15], 2, async (ms) => {
      peak = Math.max(peak, ++running);
      await new Promise((r) => setTimeout(r, ms));
      running--;
      return ms * 2;
    });
    expect(out).toEqual([60, 20, 40, 10, 30]);
    expect(peak).toBe(2);
  });
});

describe("workday", () => {
  test("apiBase reads tenant and site, skipping a locale", () => {
    expect(apiBase(company({ careersUrl: "https://nvidia.wd5.myworkdayjobs.com/NVIDIAExternalCareerSite" }))).toBe(
      "https://nvidia.wd5.myworkdayjobs.com/wday/cxs/nvidia/NVIDIAExternalCareerSite",
    );
    expect(apiBase(company({ careersUrl: "https://intel.wd1.myworkdayjobs.com/en-US/External" }))).toBe(
      "https://intel.wd1.myworkdayjobs.com/wday/cxs/intel/External",
    );
  });

  test("pickSlices takes the facet covering most jobs with every value under the cap", () => {
    const slices = pickSlices([
      { facetParameter: "timeType", values: [{ id: "full", count: 2748 }, { id: "part", count: 1 }] },
      { facetParameter: "jobFamilyGroup", values: [{ id: "eng", count: 1733 }, { id: "sales", count: 320 }] },
      {
        facetParameter: "locationMainGroup",
        values: [{ facetParameter: "locations", values: [{ id: "us", count: 1500 }, { id: "in", count: 600 }] }],
      },
    ]);
    expect(slices?.parameter).toBe("locations");
    expect(slices?.values.map((v) => v.id)).toEqual(["us", "in"]);
  });

  test("normalize namespaces the id by tenant", () => {
    const job = workday.normalize(
      {
        jobReqId: "JR1",
        title: " Engineer ",
        jobDescription: "<p>Hi</p>",
        location: "India, Bengaluru",
        additionalLocations: ["US, CA, Santa Clara"],
        startDate: "2026-11-03",
        externalUrl: "https://nvidia.wd5.myworkdayjobs.com/x/job/JR1",
      },
      company({ careersUrl: "https://nvidia.wd5.myworkdayjobs.com/NVIDIAExternalCareerSite" }),
    );
    expect(job).toMatchObject({
      id: "workday:nvidia:JR1",
      title: "Engineer",
      locations: ["India, Bengaluru", "US, CA, Santa Clara"],
      postedAt: "2026-11-03T00:00:00.000Z",
    });
  });
});

describe("normalize", () => {
  test("ashby merges primary and secondary locations", () => {
    const job = ashby.normalize(
      {
        id: "a1",
        title: "Engineer",
        department: "Engineering",
        location: "New York, NY",
        secondaryLocations: [{ location: "Remote (US)" }, { location: "New York, NY" }],
        isListed: true,
        workplaceType: "Hybrid",
        jobUrl: "https://jobs.ashbyhq.com/acme/a1",
        descriptionHtml: "<h1>About</h1><p>Hi</p>",
      },
      company({}),
    );
    expect(job.locations).toEqual(["New York, NY", "Remote (US)"]);
    expect(job.remote).toBe(true);
    expect(job.descriptionHtml).toBe("<h2>About</h2><p>Hi</p>");
  });

  test("lever appends its lists to the description", () => {
    const job = lever.normalize(
      {
        id: "l1",
        text: "Designer",
        categories: { location: "London", team: "Design" },
        createdAt: Date.UTC(2026, 10, 1),
        description: "<div>Intro</div>",
        lists: [{ text: "What you'll do", content: "<li>Draw</li>" }],
        hostedUrl: "https://jobs.lever.co/acme/l1",
      },
      company({}),
    );
    expect(job).toMatchObject({ locations: ["London"], category: "design", postedAt: "2026-11-01T00:00:00.000Z" });
    expect(job.descriptionHtml).toContain("<h3>What you'll do</h3><ul><li>Draw</li></ul>");
  });

  test("eightfold spaces out its locations", () => {
    const job = eightfold.normalize(
      {
        id: 79,
        name: "Studio Manager",
        locations: ["Berlin,Germany"],
        work_location_option: "onsite",
        job_description: "<p>Hi</p>",
        canonicalPositionUrl: "https://explore.jobs.netflix.net/careers/job/79",
      },
      company({}),
    );
    expect(job).toMatchObject({ id: "eightfold:79", locations: ["Berlin, Germany"], remote: false });
  });
});
