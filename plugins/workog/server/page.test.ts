import { expect, test } from "bun:test";
import { decodeEntities, htmlToText, parseJobPage, slugFrom } from "./page.ts";

const posting = {
  "@context": "https://schema.org",
  "@type": "JobPosting",
  title: "Oberarzt (m/w/d) Kardiologie",
  description: "<h2>Ihre Aufgaben</h2><ul><li>Visiten &amp; Diagnostik</li><li>Lehre</li></ul><p>Wir freuen uns<br>auf Sie.</p>",
  datePosted: "2026-11-04T00:00:00.000Z",
  validThrough: "2026-12-09T05:00:00.000Z",
  employmentType: "FULL_TIME",
  hiringOrganization: { "@type": "Organization", name: "Klinikum Nord" },
  baseSalary: { "@type": "MonetaryAmount", currency: "GBP", value: { "@type": "QuantitativeValue", minValue: 105504, maxValue: 139882, unitText: "YEAR" } },
};
const ld = (thing: object) => `<script type="application/ld+json">${JSON.stringify(thing).replace(/</g, "\\u003c")}</script>`;

test("reads the posting from its JobPosting markup", () => {
  const html = `<head>${ld({ "@type": "BreadcrumbList" })}${ld(posting)}</head><h1 data-x>Ignored</h1><a class="apply" href="https://jobs.example/apply?a=1&amp;b=2" rel="nofollow">Apply</a>`;
  expect(parseJobPage(html)).toEqual({
    title: "Oberarzt (m/w/d) Kardiologie",
    closed: false,
    employer: "Klinikum Nord",
    datePosted: "2026-11-04",
    validThrough: "2026-12-09",
    employmentType: "FULL_TIME",
    salary: "GBP 105,504–139,882 per year",
    remote: false,
    applyUrl: "https://jobs.example/apply?a=1&b=2",
    description: "Ihre Aufgaben\n\n- Visiten & Diagnostik\n- Lehre\n\nWir freuen uns\nauf Sie.",
  });
});

test("a page without the markup is a closed job", () => {
  const html = `<h1 data-astro-cid>Data Engineer</h1><p class="closed" data-astro-cid>This position was closed on Nov 3, 2026 and is no longer accepting applications.</p>`;
  expect(parseJobPage(html)).toEqual({ title: "Data Engineer", closed: true, closedNote: "This position was closed on Nov 3, 2026 and is no longer accepting applications." });
});

test("text helpers", () => {
  expect(decodeEntities("&#8217;&#x2019;&euro;&bogus;")).toBe("’’€&bogus;");
  expect(htmlToText("<p>a</p>\n\n\n<p>b <b>c</b></p>")).toBe("a\n\nb c");
});

test("slugFrom takes a slug or a job URL", () => {
  expect(slugFrom("https://workog.com/jobs/stripe-pm-123?ref=x")).toBe("stripe-pm-123");
  expect(slugFrom("/jobs/stripe-pm-123/")).toBe("stripe-pm-123");
  expect(slugFrom("stripe-pm-123")).toBe("stripe-pm-123");
  expect(slugFrom("https://workog.com/companies/stripe")).toBeUndefined();
});
