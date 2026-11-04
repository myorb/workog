import { describe, expect, test } from "bun:test";
import type { CompanyConfig } from "../../src/lib/schema.ts";
import { arbeitnow } from "./arbeitnow.ts";
import { arbeitsagentur, textToHtml } from "./arbeitsagentur.ts";
import { ashby } from "./ashby.ts";
import { eightfold } from "./eightfold.ts";
import { mapLimit } from "./http.ts";
import { lever } from "./lever.ts";
import { parseRss, weworkremotely } from "./weworkremotely.ts";
import { apiBase, pickSlices, workday } from "./workday.ts";
import { workingnomads } from "./workingnomads.ts";

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

describe("job boards", () => {
  test("arbeitnow keeps the employer and decodes the description", () => {
    const job = arbeitnow.normalize(
      {
        slug: "dev-berlin-1",
        company_name: "Acme GmbH ",
        title: "Developer",
        description: "&lt;p&gt;Hi&lt;/p&gt;",
        remote: false,
        url: "https://www.arbeitnow.com/jobs/companies/acme/dev-berlin-1",
        tags: ["Engineering"],
        job_types: [],
        location: "Deutschland / Berlin",
        created_at: Date.UTC(2026, 10, 1) / 1000,
      },
      company({ key: "arbeitnow" }),
    );
    expect(job).toMatchObject({
      id: "arbeitnow:dev-berlin-1",
      company: "arbeitnow",
      employer: "Acme GmbH",
      locations: ["Deutschland", "Berlin"],
      descriptionHtml: "<p>Hi</p>",
      postedAt: "2026-11-01T00:00:00.000Z",
    });
  });

  test("weworkremotely splits the employer from the title and names a few countries", () => {
    const [item] = parseRss(`<rss><channel><item>
      <title>Acme: Senior Engineer</title>
      <region>Anywhere in the World</region>
      <country>🇬🇧 United Kingdom of Great Britain and Northern Ireland, 🇧🇦 Bosnia and Herzegovina and 🇩🇪 Germany</country>
      <category>Back-End Programming</category>
      <type>Full-Time</type>
      <description>&lt;p&gt;Build &amp;amp; ship&lt;/p&gt;</description>
      <pubDate>Tue, 03 Nov 2026 17:09:02 +0000</pubDate>
      <guid>https://weworkremotely.com/remote-jobs/acme-senior-engineer</guid>
      <link>https://weworkremotely.com/remote-jobs/acme-senior-engineer</link>
    </item></channel></rss>`);
    const job = weworkremotely.normalize(item!, company({ key: "weworkremotely" }));
    expect(job).toMatchObject({
      id: "weworkremotely:acme-senior-engineer",
      employer: "Acme",
      title: "Senior Engineer",
      locations: ["United Kingdom", "Bosnia and Herzegovina", "Germany"],
      remote: true,
      descriptionHtml: "<p>Build &amp; ship</p>",
      postedAt: "2026-11-03T17:09:02.000Z",
    });
  });

  test("weworkremotely names the region for long country lists", () => {
    const [item] = parseRss(
      `<item><title>Acme: PM</title><region>USA Only</region><country>${"🇺🇸 A, ".repeat(6)}🇨🇦 B</country><guid>x/pm</guid><link>https://weworkremotely.com/remote-jobs/pm</link></item>`,
    );
    expect(weworkremotely.normalize(item!, company({})).locations).toEqual(["USA"]);
  });

  test("workingnomads drops time zones from locations", () => {
    const base = {
      url: "https://www.workingnomads.com/job/go/42/",
      title: "Analyst",
      description: "<p>x</p>",
      company_name: "Acme",
    };
    expect(workingnomads.normalize({ ...base, location: "Time zone: CET (+/- 3 hours)" }, company({}))).toMatchObject({
      id: "workingnomads:42",
      locations: [],
      remote: true,
    });
    expect(workingnomads.normalize({ ...base, location: "Canada" }, company({})).locations).toEqual(["Canada"]);
  });
});

describe("arbeitsagentur", () => {
  const raw = {
    referenznummer: "13884-349397-S",
    stellenangebotsTitel: "Assistenzarzt/ Assistenzärztin (m/w/d) für das Zentrum ...",
    hauptberuf: "Assistenzarzt/-ärztin",
    firma: "Städtische Kliniken Mönchengladbach GmbH ",
    stellenlokationen: [{ adresse: { ort: "Mönchengladbach", region: "NORDRHEIN_WESTFALEN", land: "DEUTSCHLAND" } }],
    homeofficemoeglich: false,
    datumErsteVeroeffentlichung: "2026-11-04",
    externeURL: "https://jobboard.onapply.de/listing/349397?source=arbeitsagentur",
    stellenangebotsBeschreibung: "Für unser Zentrum für Geriatrie suchen wir\neine Assistenzärztin.\n\n- Teilzeit oder Vollzeit\n- Weiterbildung",
  };

  test("normalize tags the job as medicine with specialty, level and a state", () => {
    const job = arbeitsagentur.normalize(raw, company({ key: "arbeitsagentur" }));
    expect(job).toMatchObject({
      id: "arbeitsagentur:13884-349397-S",
      employer: "Städtische Kliniken Mönchengladbach GmbH",
      title: "Assistenzarzt/ Assistenzärztin (m/w/d) für das Zentrum…",
      locations: ["Mönchengladbach, Nordrhein-Westfalen, Germany"],
      category: "medicine",
      level: "resident",
      applyUrl: "https://jobboard.onapply.de/listing/349397?source=arbeitsagentur",
      postedAt: "2026-11-04T00:00:00.000Z",
    });
    expect(job.descriptionHtml).toBe("<p>Für unser Zentrum für Geriatrie suchen wir<br />eine Assistenzärztin.</p><ul><li>Teilzeit oder Vollzeit</li><li>Weiterbildung</li></ul>");
  });

  test("normalize keeps last run's description and falls back to the job's own page", () => {
    const { externeURL: _, stellenangebotsBeschreibung: __, ...bare } = raw;
    const job = arbeitsagentur.normalize({ ...bare, descriptionHtml: "<p>Kept</p>" }, company({ key: "arbeitsagentur" }));
    expect(job.descriptionHtml).toBe("<p>Kept</p>");
    expect(job.applyUrl).toBe("https://www.arbeitsagentur.de/jobsuche/jobdetail/13884-349397-S");
  });

  test("normalize falls back to the occupation for a missing title and leaves out an anonymous employer", () => {
    const { stellenangebotsTitel: _, firma: __, ...anonymous } = raw;
    const job = arbeitsagentur.normalize(anonymous, company({ key: "arbeitsagentur" }));
    expect(job.title).toBe("Assistenzarzt/-ärztin");
    expect(job.employer).toBeUndefined();
  });

  test("textToHtml drops separator lines and escapes markup", () => {
    expect(textToHtml("----------\nA <b> & B\n\n* one\n* two")).toBe("<p>A &lt;b&gt; &amp; B</p><ul><li>one</li><li>two</li></ul>");
  });
});
