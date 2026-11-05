import { describe, expect, test } from "bun:test";
import type { CompanyConfig } from "../../src/lib/schema.ts";
import { arbeitnow } from "./arbeitnow.ts";
import { arbeitsagentur, hasOwnSource, textToHtml } from "./arbeitsagentur.ts";
import { ashby } from "./ashby.ts";
import { asklepios, asklepiosLocations } from "./asklepios.ts";
import { parsePosting } from "./jobposting.ts";
import { eightfold } from "./eightfold.ts";
import { applyLinkOf, euresLocations, searchCountry, type Search } from "./eures.ts";
import { helios, parseAddress } from "./helios.ts";
import { isSwissDoctor, markdownToHtml } from "./jobroom.ts";
import { jobtechLocations } from "./jobtech.ts";
import { innerHtmlById, nhsLocation, nhsSalary, parseFeed } from "./nhs.ts";
import { mapLimit } from "./http.ts";
import { lever } from "./lever.ts";
import { oracle, oracleLocation, oracleSite } from "./oracle.ts";
import { parseList, rexx } from "./rexx.ts";
import { parseRss, weworkremotely } from "./weworkremotely.ts";
import { categorize } from "../../src/lib/normalize.ts";
import { apiBase, pickSlices, splitKnown, workday } from "./workday.ts";
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

  const stored = (id: string, path: string) => ({
    id: `workday:nvidia:${id}`,
    slug: `engineer-${id.toLowerCase()}`,
    company: "nvidia",
    title: "Engineer",
    locations: ["US, CA, Santa Clara"],
    remote: false,
    category: "engineering",
    descriptionHtml: "<p>Hi</p>",
    applyUrl: `https://nvidia.wd5.myworkdayjobs.com/NVIDIAExternalCareerSite${path}`,
    postedAt: "2026-11-01T00:00:00.000Z",
    firstSeenAt: "2026-11-01T00:00:00.000Z",
    lastSeenAt: "2026-11-03T00:00:00.000Z",
    source: "workday",
  });

  test("splitKnown reuses stored jobs by path and fetches only new ones", () => {
    const { known, missing } = splitKnown(
      [
        { title: "Senior Engineer", externalPath: "/job/US/Engineer_JR1" },
        { title: "Engineer", externalPath: "/job/US/Engineer_JR2" },
        { title: "Engineer", externalPath: "/job/US/Engineer_JR2" },
        { title: "Lost", externalPath: "" },
      ],
      [stored("JR1", "/job/US/Engineer_JR1"), stored("JR3", "/job/US/Engineer_JR3")],
    );
    expect(known.map((k) => k.previous.id)).toEqual(["workday:nvidia:JR1"]);
    expect(missing).toEqual(["/job/US/Engineer_JR2"]);
  });

  test("normalize keeps a reused job and takes the search result's title", () => {
    const job = workday.normalize(
      { previous: stored("JR1", "/job/US/Engineer_JR1"), title: " Data Scientist " },
      company({ careersUrl: "https://nvidia.wd5.myworkdayjobs.com/NVIDIAExternalCareerSite" }),
    );
    expect(job).toEqual({
      id: "workday:nvidia:JR1",
      originalId: "JR1",
      company: "nvidia",
      title: "Data Scientist",
      locations: ["US, CA, Santa Clara"],
      remote: false,
      category: categorize("Data Scientist"),
      descriptionHtml: "<p>Hi</p>",
      applyUrl: "https://nvidia.wd5.myworkdayjobs.com/NVIDIAExternalCareerSite/job/US/Engineer_JR1",
      postedAt: "2026-11-01T00:00:00.000Z",
      source: "workday",
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

describe("arbeitsagentur duplicates", () => {
  test("hasOwnSource matches the hospital groups fetched from their own sites, and only them", () => {
    expect(hasOwnSource({ firma: "Helios Klinikum Berlin-Buch GmbH" })).toBe(true);
    expect(hasOwnSource({ firma: "Asklepios MVZ Hessen GmbH" })).toBe(true);
    expect(hasOwnSource({ firma: "Sana Klinikum Hof GmbH" })).toBe(true);
    expect(hasOwnSource({ firma: "Sanovetis GmbH" })).toBe(false);
    expect(hasOwnSource({ firma: "Sanatorium Dr. Barner" })).toBe(false);
    expect(hasOwnSource({})).toBe(false);
  });
});

describe("helios", () => {
  const listing = {
    id: "ca6a5096",
    title: "Facharzt/Oberarzt Radiologie (m/w/d) ",
    url: "/job-detail/2cb9b693/facharzt-oberarzt-radiologie-m-w-d",
    businessSegment: "FRESENIUS_HELIOS_HOSPITALS",
    location: "Gifhorn",
  };
  const ad = {
    title: "Facharzt/Oberarzt Radiologie (m/w/d)",
    description: [
      { value: "<p>Intro</p>" },
      { title: "Das erwartet Sie", value: "<ul><li>CT</li></ul>" },
      { title: "Adresse Arbeitsstelle", value: "<p>Helios Klinikum Gifhorn GmbH<br />Campus 6<br />38518 Gifhorn</p>" },
    ],
    attributes: [
      { title: "Einsatzbereich", value: [["Ärztlicher Dienst"]] },
      { title: "Veröffentlicht am", value: [["29.10.2026"]] },
    ],
  };

  test("parseAddress reads the workplace, postal code and town", () => {
    expect(parseAddress(ad.description[2]!.value)).toEqual({ employer: "Helios Klinikum Gifhorn GmbH", postalCode: "38518", city: "Gifhorn" });
    expect(parseAddress("<p>Helios Klinikum Berlin-Buch GmbH<br />Schwanebecker Chaussee 50<br />Berlin 13125</p>")).toEqual({
      employer: "Helios Klinikum Berlin-Buch GmbH",
      postalCode: "13125",
      city: "Berlin",
    });
  });

  test("normalize takes employer and state from the address and leaves it out of the text", () => {
    const job = helios.normalize({ ...listing, ad }, company({ key: "helios" }));
    expect(job).toMatchObject({
      id: "helios:ca6a5096",
      employer: "Helios Klinikum Gifhorn GmbH",
      title: "Facharzt/Oberarzt Radiologie (m/w/d)",
      locations: ["Gifhorn, Niedersachsen, Germany"],
      category: "medicine",
      specialty: "radiology",
      level: "senior",
      descriptionHtml: "<p>Intro</p><h3>Das erwartet Sie</h3><ul><li>CT</li></ul>",
      applyUrl: "https://karriere.fresenius.de/job-detail/2cb9b693/facharzt-oberarzt-radiologie-m-w-d",
      postedAt: "2026-10-29T00:00:00.000Z",
    });
  });

  test("normalize keeps last run's details for a job it didn't fetch again", () => {
    const previous = { employer: "Helios Klinikum Gifhorn GmbH", locations: ["Gifhorn, Niedersachsen, Germany"], descriptionHtml: "<p>Old</p>" };
    const job = helios.normalize({ ...listing, previous: previous as never }, company({ key: "helios" }));
    expect(job).toMatchObject({ employer: previous.employer, locations: previous.locations, descriptionHtml: "<p>Old</p>" });
  });
});

describe("oracle", () => {
  const sana = company({
    key: "sana",
    sector: "medicine",
    careersUrl: "https://fa-x.fa.ocs.oraclecloud.com/hcmUI/CandidateExperience/de/sites/CX_4025",
  });

  test("oracleSite reads the API base and site number", () => {
    expect(oracleSite(sana)).toMatchObject({ api: "https://fa-x.fa.ocs.oraclecloud.com/hcmRestApi/resources/latest", site: "CX_4025" });
  });

  test("oracleLocation names the city of a district and the state", () => {
    expect(oracleLocation("Lichtenberg (Berlin), Berlin, Deutschland", "DE", true)).toBe("Berlin, Berlin, Germany");
    expect(oracleLocation("Köln, Nordrhein-Westfalen, Deutschland", "DE", true)).toBe("Köln, Nordrhein-Westfalen, Germany");
    expect(oracleLocation("Berlin, Deutschland", "DE", true)).toBe("Berlin, Berlin, Germany");
    expect(oracleLocation("Deutschland", "DE", true)).toBe("Germany");
    expect(oracleLocation("Austin, TX, United States", "US", false)).toBe("Austin, TX, United States");
  });

  test("normalize builds the description from its parts", () => {
    const job = oracle.normalize(
      {
        Id: "5541",
        Title: "Assistenzarzt (m/w/d) für Radiologie",
        PostedDate: "2026-11-04",
        PrimaryLocation: "Lichtenberg (Berlin), Berlin, Deutschland",
        PrimaryLocationCountry: "DE",
        JobFamily: "Ärztlicher Dienst",
        LegalEmployer: "Sana Kliniken Berlin-Brandenburg GmbH",
        details: { ExternalDescriptionStr: "<p>Wir</p>", ExternalResponsibilitiesStr: "<ul><li>Befunden</li></ul>", ContentLocale: "de" },
      },
      sana,
    );
    expect(job).toMatchObject({
      id: "oracle:sana:5541",
      employer: "Sana Kliniken Berlin-Brandenburg GmbH",
      locations: ["Berlin, Berlin, Germany"],
      category: "medicine",
      specialty: "radiology",
      level: "resident",
      descriptionHtml: "<p>Wir</p><h3>Ihre Aufgaben</h3><ul><li>Befunden</li></ul>",
      applyUrl: "https://fa-x.fa.ocs.oraclecloud.com/hcmUI/CandidateExperience/de/sites/CX_4025/job/5541",
      postedAt: "2026-11-04T00:00:00.000Z",
    });
  });
});

describe("asklepios", () => {
  test("parsePosting finds the JobPosting among the page's JSON-LD blocks", () => {
    const html = `<script type="application/ld+json">{"@type":"Organization"}</script>
      <script type="application/ld+json">{"@type":"JobPosting","description":"<p>Hi</p>"}</script>`;
    expect(parsePosting(html)).toEqual({ "@type": "JobPosting", description: "<p>Hi</p>" } as never);
    expect(parsePosting("<p>no data</p>")).toBeUndefined();
  });

  test("asklepiosLocations pairs each town with its postal code", () => {
    expect(asklepiosLocations({ location: "Nidda, Lich", plz: "63667, 35423" })).toEqual(["Nidda, Hessen, Germany", "Lich, Hessen, Germany"]);
    const posting = { jobLocation: { address: { addressLocality: "Königstein", addressRegion: "Hessen" } } };
    expect(asklepiosLocations({ location: "Königstein" }, posting)).toEqual(["Königstein, Hessen, Germany"]);
    expect(asklepiosLocations({ location: "bundesweit" })).toEqual(["Germany"]);
  });

  test("normalize keeps the clinic as employer and decodes the posting's entities", () => {
    const job = asklepios.normalize(
      {
        id: "25168",
        title: "Oberarzt Neurologie (w/m/d)",
        company: "Asklepios Neurologische Klinik Falkenstein",
        location: "Königstein",
        plz: "61462",
        careerLevel: "Fachärztin / Facharzt",
        publicationDate: "04.11.26, 00:00",
        jobLink: "https://karriere.asklepios.com/oberarzt-neurologie-wmd-de-j25168.html",
        posting: { description: "<h2></h2><p>Gr&ouml;&szlig;te</p>", qualifications: "<ul><li>Approbation</li></ul>" },
      },
      company({ key: "asklepios" }),
    );
    expect(job).toMatchObject({
      id: "asklepios:25168",
      employer: "Asklepios Neurologische Klinik Falkenstein",
      locations: ["Königstein, Hessen, Germany"],
      specialty: "neurology",
      level: "senior",
      descriptionHtml: "<p>Größte</p><h3>Ihr Profil</h3><ul><li>Approbation</li></ul>",
      postedAt: "2026-11-04T00:00:00.000Z",
    });
  });
});

describe("eures", () => {
  test("euresLocations prefers the city, then the most specific region, then the country", () => {
    expect(euresLocations({ country: "se", locationMap: { SE: ["SE311"] } }, { locations: [{ countryCode: "se", cityName: "ARVIKA" }] })).toEqual([
      "Arvika, Sweden",
    ]);
    expect(euresLocations({ country: "fr", locationMap: { FR: ["FRI2", "FRI22"] } })).toEqual(["Creuse, France"]);
    expect(euresLocations({ country: "nl" }, { locations: [{ countryCode: "nl", cityName: null, region: null }] })).toEqual(["Netherlands"]);
    expect(euresLocations({ country: "at", locationMap: { AT: [null] } })).toEqual(["Austria"]);
  });

  test("applyLinkOf takes the first link of the instructions", () => {
    expect(applyLinkOf(['Pour postuler : <a href="https://candidat.pole-emploi.fr/offres/215HVMJ">lien</a>'])).toBe(
      "https://candidat.pole-emploi.fr/offres/215HVMJ",
    );
    expect(applyLinkOf(["Internetadresse: https://jobs.example.de/job-1.html."])).toBe("https://jobs.example.de/job-1.html");
    expect(applyLinkOf(["CV with attached letter, Telephone"])).toBeUndefined();
  });

  test("searchCountry adds a second sort order when the first returns some vacancies twice", async () => {
    const ids = Array.from({ length: 60 }, (_, i) => `v${i}`);
    const calls: string[] = [];
    // MOST_RECENT repeats v49 on page 2 in place of v50, as tied creation times do
    const order = { MOST_RECENT: ids.map((id) => (id === "v50" ? "v49" : id)), BEST_MATCH: [...ids].reverse() };
    const search: Search = async (_country, page, sort) => {
      calls.push(`${sort}:${page}`);
      return { numberRecords: 60, jvs: order[sort].slice((page - 1) * 50, page * 50).map((id) => ({ id, title: id })) };
    };
    const jobs = await searchCountry("fr", search);
    expect(jobs.map((j) => j.id).sort()).toEqual([...ids].sort());
    expect(jobs[0]).toEqual({ id: "v0", title: "v0", country: "fr" });
    expect(calls).toEqual(["MOST_RECENT:1", "MOST_RECENT:2", "BEST_MATCH:1", "BEST_MATCH:2"]);
  });

  test("searchCountry stops after one sort order when it found every vacancy", async () => {
    const calls: string[] = [];
    const search: Search = async (_country, page, sort) => {
      calls.push(`${sort}:${page}`);
      return { numberRecords: 2, jvs: [{ id: "a", title: "A" }, { id: "b", title: "B" }] };
    };
    expect((await searchCountry("at", search)).map((j) => j.id)).toEqual(["a", "b"]);
    expect(calls).toEqual(["MOST_RECENT:1"]);
  });
});

describe("nhs", () => {
  test("parseFeed reads vacancies and the page count", () => {
    const { vacancies, totalPages } = parseFeed(
      "<nhsJobs><vacancyDetails><id>1</id><reference>C1-26</reference><title>Specialty Doctor &amp; Lead</title><employer>Trust</employer>" +
        "<salary>£113565.00 to £150569.00</salary><postDate>2026-10-26T16:06:40.2</postDate><url>https://beta.jobs.nhs.uk/candidate/jobadvert/C1-26</url>" +
        "<locations><location>Sheffield, S5 7JT</location></locations></vacancyDetails><totalPages>140</totalPages></nhsJobs>",
    );
    expect(totalPages).toBe(140);
    expect(vacancies).toEqual([
      {
        id: "1",
        reference: "C1-26",
        title: "Specialty Doctor & Lead",
        employer: "Trust",
        postDate: "2026-10-26T16:06:40.2",
        salary: "£113565.00 to £150569.00",
        url: "https://beta.jobs.nhs.uk/candidate/jobadvert/C1-26",
        locations: ["Sheffield, S5 7JT"],
      },
    ]);
  });

  test("nhsSalary keeps yearly and hourly pay, and only those", () => {
    expect(nhsSalary("£113565.00 to £150569.00")).toEqual({ currency: "GBP", min: 113565, max: 150569, unit: "YEAR" });
    expect(nhsSalary("£90000.00")).toEqual({ currency: "GBP", min: 90000, max: 90000, unit: "YEAR" });
    expect(nhsSalary("£12.75 to £13.00")).toEqual({ currency: "GBP", min: 12.75, max: 13, unit: "HOUR" });
    expect(nhsSalary("£80.00 to £95.00")).toEqual({ currency: "GBP", min: 80, max: 95, unit: "HOUR" });
    // a locum day rate, a part-time or sessional figure, a placeholder and no figure at all have no clear unit
    expect(nhsSalary("£1500.00")).toBeUndefined();
    expect(nhsSalary("£10500.00 to £12500.00")).toBeUndefined();
    expect(nhsSalary("£1.00")).toBeUndefined();
    expect(nhsSalary("Negotiable")).toBeUndefined();
    expect(nhsSalary(undefined)).toBeUndefined();
    expect(nhsSalary("£150569.00 to £113565.00")).toBeUndefined();
  });

  test("nhsLocation drops the postcode", () => {
    expect(nhsLocation("Barrow-in-Furness, LA14 4LF")).toBe("Barrow-in-Furness, United Kingdom");
    expect(nhsLocation("London")).toBe("London, United Kingdom");
  });

  test("innerHtmlById follows nested elements", () => {
    expect(innerHtmlById('<div id="x"><div><p>a</p></div><p>b</p></div><p>c</p>', "x")).toBe("<div><p>a</p></div><p>b</p>");
    expect(innerHtmlById("<p>none</p>", "x")).toBeUndefined();
  });
});

describe("jobtech", () => {
  test("jobtechLocations names each municipality", () => {
    expect(jobtechLocations({ workplace_addresses: [{ municipality: "Götene" }, { municipality: "Götene" }, { municipality: "Mariestad" }] })).toEqual([
      "Götene, Sweden",
      "Mariestad, Sweden",
    ]);
    expect(jobtechLocations({})).toEqual(["Sweden"]);
  });
});

describe("jobroom", () => {
  test("isSwissDoctor reads German, French and Italian titles", () => {
    expect(isSwissDoctor("Oberärztin / Oberarzt Anästhesie")).toBe(true);
    expect(isSwissDoctor("Médecin chef∙fe de clinique - Unités hospitalières")).toBe(true);
    expect(isSwissDoctor("Medico assistente in medicina interna")).toBe(true);
    expect(isSwissDoctor("<em>Arztsekretär</em>/in")).toBe(false);
    expect(isSwissDoctor("Dipl. Pflegefachperson HF")).toBe(false);
    expect(isSwissDoctor("Assistant·e médical·e")).toBe(false);
  });

  test("markdownToHtml turns headings, bullets and escapes into HTML", () => {
    expect(markdownToHtml("### Ihr Profil\n* Facharzt\n* Teamgeist\n\nFrau \\- <em>Ärztin</em>")).toBe(
      "<h3>Ihr Profil</h3><ul><li>Facharzt</li><li>Teamgeist</li></ul><p>Frau - Ärztin</p>",
    );
  });
});

describe("rexx", () => {
  const html = `<a href="https://jobs.x.de/Oberarzt-mwd-Kardiologie-de-j7067.html">Oberarzt (m/w/d) Kardiologie</a>
    <a target="_blank" href="https://karriere.x.de/pflegefachkraft-de-j3541.html?agid=x">Pflegefachkraft</a>
    <a href="https://jobs.x.de/Oberarzt-mwd-Kardiologie-de-j7067.html">Oberarzt (m/w/d) Kardiologie</a>
    <a href="https://jobs.x.de/stellenangebote.html?start=100">2</a><a href="?start=200">3</a>`;

  test("parseList reads each job once and the other pages", () => {
    const { jobs, starts } = parseList(html, "https://jobs.x.de/stellenangebote.html");
    expect(jobs.map((j) => [j.id, j.title])).toEqual([
      ["7067", "Oberarzt (m/w/d) Kardiologie"],
      ["3541", "Pflegefachkraft"],
    ]);
    expect(jobs[1]!.url).toBe("https://karriere.x.de/pflegefachkraft-de-j3541.html?agid=x");
    expect(starts).toEqual([100, 200]);
  });

  test("normalize names the hospital, not the portal", () => {
    const schoen = company({ key: "schoen-klinik", name: "Schön Klinik" });
    const job = rexx.normalize(
      {
        id: "7067",
        title: "Oberarzt (m/w/d) Kardiologie",
        url: "https://jobs.x.de/Oberarzt-mwd-Kardiologie-de-j7067.html",
        posting: {
          description: "<p>Hi</p>",
          datePosted: "2026-11-02",
          hiringOrganization: { name: "Schön Klinik Karriere Jobportal" },
          jobLocation: { address: { addressLocality: "Bad Arolsen", addressRegion: "Hessen" } },
        },
      },
      schoen,
    );
    expect(job).toMatchObject({
      id: "rexx:schoen-klinik:7067",
      employer: "Schön Klinik Bad Arolsen",
      locations: ["Bad Arolsen, Hessen, Germany"],
      specialty: "cardiology",
      level: "senior",
      postedAt: "2026-11-02T00:00:00.000Z",
    });
  });
});
