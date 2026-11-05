import { describe, expect, test } from "bun:test";
import type { Job } from "./schema.ts";
import { categorize } from "./normalize.ts";
import { employmentTypeOf } from "./employment.ts";
import { placesOf } from "./places.ts";
import { technologiesOf } from "./technologies.ts";

function job(overrides: Partial<Job>): Job {
  return {
    id: "test:1",
    slug: "acme-engineer-1",
    company: "acme",
    title: "Engineer",
    locations: [],
    remote: false,
    descriptionHtml: "<p>Hi</p>",
    applyUrl: "https://example.com/1",
    firstSeenAt: "2026-11-01T00:00:00Z",
    lastSeenAt: "2026-11-01T00:00:00Z",
    source: "test",
    ...overrides,
  };
}

describe("placesOf", () => {
  const places = (...labels: string[]) => {
    const p = placesOf(labels);
    return { countries: [...p.countries].sort(), cities: [...p.cities].sort() };
  };

  test("a city implies its country", () => {
    expect(places("Munich")).toEqual({ countries: ["germany"], cities: ["munich"] });
    expect(places("München, Deutschland")).toEqual({ countries: ["germany"], cities: ["munich"] });
  });

  test("reads several cities from one label", () => {
    expect(places("SF, NYC, SEA").cities).toEqual(["new-york", "san-francisco", "seattle"]);
    expect(places("Berlin and Munich").cities).toEqual(["berlin", "munich"]);
  });

  test("remote country labels have a country but no city", () => {
    expect(places("Remote, Germany")).toEqual({ countries: ["germany"], cities: [] });
    expect(places("Remote - USA")).toEqual({ countries: ["united-states"], cities: [] });
    expect(places("New York, USA, Remote")).toEqual({ countries: ["united-states"], cities: [] });
  });

  test("US state codes, but CA stays ambiguous", () => {
    expect(places("Westlake, TX").countries).toEqual(["united-states"]);
    expect(places("Toronto, ON, CA").countries).toEqual(["canada"]);
  });

  test("unknown labels match nothing", () => {
    expect(places("Distributed")).toEqual({ countries: [], cities: [] });
  });
});

describe("technologiesOf", () => {
  const techs = (overrides: Partial<Job>) => [...technologiesOf(job(overrides))].sort();

  test("reads titles", () => {
    expect(techs({ title: "Senior Frontend Engineer", category: "engineering" })).toEqual(["javascript"]);
    expect(techs({ title: "Fullstack Engineer (TypeScript)", category: "engineering" })).toEqual(["javascript", "typescript"]);
    expect(techs({ title: "Staff Engineer (Golang / Node)", category: "engineering" })).toEqual(["go", "javascript", "nodejs"]);
  });

  test("does not confuse Java with JavaScript", () => {
    expect(techs({ title: "Java Developer", category: "engineering" })).toEqual(["java"]);
  });

  test("reads descriptions of engineering roles only", () => {
    const descriptionHtml = "<p>You know <b>TypeScript</b>, React and Python.</p>";
    expect(techs({ category: "engineering", descriptionHtml })).toEqual(["javascript", "python", "react", "typescript"]);
    expect(techs({ title: "Account Executive", category: "sales", descriptionHtml })).toEqual([]);
  });

  test("ignores English words that look like technologies", () => {
    const descriptionHtml = "<p>Go beyond, react quickly and own the go-to-market with swift decisions.</p>";
    expect(techs({ category: "engineering", descriptionHtml })).toEqual([]);
    expect(techs({ title: "Go-to-Market Lead", category: "engineering" })).toEqual([]);
  });

  test("loose title words need a technical role", () => {
    expect(techs({ title: "Head of AI Startups", category: "sales" })).toEqual([]);
    expect(techs({ title: "Senior AI Engineer", category: "engineering" })).toEqual(["machine-learning"]);
  });

  test("technical leaders are read like engineers, other leaders are not", () => {
    const descriptionHtml = "<p>Our stack is Python and Kubernetes.</p>";
    expect(techs({ title: "Engineering Manager, Payments", category: "management", descriptionHtml })).toEqual(["kubernetes", "python"]);
    expect(techs({ title: "Head of Sales", category: "management", descriptionHtml })).toEqual([]);
  });
});

describe("categorize", () => {
  test("a role beats the team it sits in", () => {
    expect(categorize("Sales Manager, Europe, Enterprise Platforms")).toBe("sales");
    expect(categorize("Product Manager, API Platform")).toBe("product");
    expect(categorize("Senior Technical Recruiter, Infrastructure")).toBe("people");
  });

  test("team words still count when no role matches", () => {
    expect(categorize("Threat Intelligence Platform Engineer")).toBe("engineering");
    expect(categorize("Platform Lead, Security")).toBe("engineering");
  });

  test("C-level titles", () => {
    expect(categorize("Chief Technology Officer (CTO)")).toBe("executive");
    expect(categorize("Chief Financial Officer (m/f/d)", "Finance")).toBe("executive");
    expect(categorize("Chief Product & Technology Officer")).toBe("executive");
    expect(categorize("CTO - CDI Paris - Theodo Data & IA")).toBe("executive");
    expect(categorize("Technical Cofounder / CTO | AI & ML PreSeed Startup")).toBe("executive");
    expect(categorize("Interim CFO")).toBe("executive");
    expect(categorize("Managing Director North / UKI")).toBe("executive");
    expect(categorize("Geschäftsführer*in Finanzen & Organisation (m/w/d)")).toBe("executive");
  });

  test("roles near a leader are not C-level", () => {
    expect(categorize("Chief of Staff to the CMO", "Marketing")).toBe("marketing");
    expect(categorize("Executive Assistant to the CEO")).toBeUndefined();
    expect(categorize("Forward Deployed Engineer, Finance [Office of the CTO]")).toBe("engineering");
    expect(categorize("Field CTO, Data and AI")).toBe("data");
    expect(categorize("Data Center Chief Engineer")).toBe("data");
    expect(categorize("Website Growth & CRO Manager (German-Speaking)")).toBe("marketing");
    expect(categorize("Founder's Associate – Praktikum / Intern (m/w/d)")).toBeUndefined();
  });

  test("management titles", () => {
    expect(categorize("Engineering Manager, Cloud Infrastructure")).toBe("management");
    expect(categorize("Software Development Manager, EC2 Nitro")).toBe("management");
    expect(categorize("Manager II, Software Engineering, Infrastructure")).toBe("management");
    expect(categorize("Applied Science Manager, Personalization")).toBe("management");
    expect(categorize("Head of Sales, Amazon Business Mexico")).toBe("management");
    expect(categorize("Director of Product Management, Observability")).toBe("management");
    expect(categorize("Area Vice President, Global Sales")).toBe("management");
    expect(categorize("Teamleiter:in (80-100%)")).toBe("management");
  });

  test("managers of work, not of people, keep their function", () => {
    expect(categorize("Senior Product Manager, Search Infrastructure")).toBe("product");
    expect(categorize("Sr Account Manager, Large Enterprise Commercial")).toBe("sales");
    expect(categorize("Business Development Manager, Enterprise Support")).toBe("sales");
    expect(categorize("Key Account Director - CRM - TMT")).toBe("sales");
    expect(categorize("Art Director")).toBe("design");
    expect(categorize("Slack VP, Product Design (Individual Contributor; Principal Architect)")).toBe("design");
  });
});

describe("employmentTypeOf", () => {
  const type = (title: string, descriptionHtml = "<p>Hi</p>") => employmentTypeOf({ title, descriptionHtml });

  test("full time by default", () => {
    expect(type("Software Engineer")).toBe("full-time");
  });

  test("reads titles", () => {
    expect(type("Software Engineer, Intern (Summer 2027)")).toBe("internship");
    expect(type("Operations Associate, Apprenticeship")).toBe("internship");
    expect(type("Recruiting Coordinator (Fixed-Term Contract)")).toBe("contract");
    expect(type("Infrastructure Engineer - FTC (6 months)")).toBe("contract");
    expect(type("Contract Talent Acquisition Sourcer")).toBe("contract");
    expect(type("Candidate Experience Specialist, Contractor")).toBe("contract");
    expect(type("Support Specialist (Part-Time)")).toBe("part-time");
  });

  test("contract as a subject is not a contract role", () => {
    expect(type("Monetization and Contract Success (MACS) Specialist")).toBe("full-time");
  });

  test("descriptions count only when they describe the role", () => {
    expect(type("GTM Recruiter", "<p>This is an 11 month fixed-term contract.</p>")).toBe("contract");
    expect(type("Data Analyst", "<p>3 years of full-time experience exclusive of internships</p>")).toBe("full-time");
    expect(type("Marketing Manager", "<p>Experience leveraging agency and contractor resources</p>")).toBe("full-time");
    expect(type("Engineer", "<p>We are not considering remote or part-time applicants.</p>")).toBe("full-time");
  });
});
