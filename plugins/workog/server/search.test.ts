import { describe, expect, test } from "bun:test";
import { compile, count, FilterError, fold, type Row, search, sectionsFor, type Vocab } from "./search.ts";

const vocab: Vocab = {
  companies: [
    { slug: "stripe", name: "Stripe", section: "tech" },
    { slug: "arbeitnow", name: "Arbeitnow", section: "tech", board: true },
    { slug: "helios", name: "Helios", section: "medicine" },
  ],
  categories: [{ slug: "engineering", name: "Engineering" }, { slug: "other", name: "Other" }],
  countries: [{ slug: "germany", name: "Germany" }, { slug: "united-states", name: "United States" }],
  cities: [{ slug: "berlin", name: "Berlin", country: "germany" }, { slug: "munich", name: "Munich", country: "germany" }],
  technologies: [{ slug: "rust", name: "Rust" }, { slug: "python", name: "Python" }],
  employment: ["full-time", "part-time", "contract", "internship"],
  specialties: [{ slug: "cardiology", name: "Cardiology" }],
  levels: [{ slug: "senior", name: "Senior physician (Oberarzt)" }],
  medicineCountries: [{ slug: "germany", name: "Germany" }, { slug: "france", name: "France" }],
  states: [{ slug: "bavaria", name: "Bavaria" }],
};

const tech = (slug: string, fields: Partial<Extract<Row, { section: "tech" }>> = {}): Row => ({
  section: "tech", slug, title: "Engineer", company: "stripe", locations: [], remote: false, firstSeen: "2026-11-05", employment: "full-time", ...fields,
});
const med = (slug: string, fields: Partial<Extract<Row, { section: "medicine" }>> = {}): Row => ({
  section: "medicine", slug, title: "Arzt", company: "helios", locations: [], remote: false, firstSeen: "2026-11-05", ...fields,
});

const rows: Row[] = [
  tech("old-rust", { title: "Backend Engineer (Rust)", technologies: ["rust"], countries: ["germany"], cities: ["berlin"], locations: ["Berlin, Germany"], firstSeen: "2026-10-01" }),
  tech("new-python", { title: "Data Engineer", technologies: ["python"], countries: ["united-states"], remote: true, firstSeen: "2026-11-09" }),
  tech("rust-lead", { title: "Rust Engineering Lead", company: "arbeitnow", employer: "Ferrous GmbH", technologies: ["rust"], countries: ["germany"], cities: ["munich", "berlin"], firstSeen: "2026-11-01" }),
  med("cardio-munich", { title: "Oberarzt Kardiologie", specialty: "cardiology", level: "senior", country: "germany", state: "bavaria", city: "München", locations: ["München, Bayern, Germany"] }),
  med("cardio-lyon", { title: "Cardiologue", specialty: "cardiology", country: "france", city: "Lyon", locations: ["Lyon, France"], firstSeen: "2026-11-08" }),
];

const find = (filters: Parameters<typeof compile>[0], now?: number) => {
  const c = compile(filters, vocab, now);
  return search(rows.filter((r) => c.sections.includes(r.section)), c).map((r) => r.slug);
};

describe("search", () => {
  test("filters by tags, newest first", () => {
    expect(find({ technology: "Rust" })).toEqual(["rust-lead", "old-rust"]);
    expect(find({ city: "berlin", technology: "rust" })).toEqual(["rust-lead", "old-rust"]);
    expect(find({ remote: true })).toEqual(["new-python"]);
  });

  test("a text query ranks title matches first and searches employers", () => {
    expect(find({ query: "rust engineer" })).toEqual(["rust-lead", "old-rust"]);
    expect(find({ query: "ferrous" })).toEqual(["rust-lead"]);
  });

  test("accents and case don't matter", () => {
    expect(fold("  Zürich  Oberärztin ")).toBe("zurich oberarztin");
    expect(find({ city: "munchen" })).toEqual(["cardio-munich"]);
  });

  test("country covers both sections", () => {
    expect(find({ country: "Germany" })).toEqual(["cardio-munich", "rust-lead", "old-rust"]);
    expect(find({ country: "france" })).toEqual(["cardio-lyon"]);
  });

  test("medical filters pick the medicine section", () => {
    expect(find({ specialty: "cardiology" })).toEqual(["cardio-lyon", "cardio-munich"]);
    expect(find({ specialty: "cardiology", state: "Bavaria", level: "senior" })).toEqual(["cardio-munich"]);
  });

  test("posted_within_days counts from the day Workog first saw the job", () => {
    expect(find({ posted_within_days: 3 }, Date.parse("2026-11-10T12:00:00Z"))).toEqual(["new-python", "cardio-lyon"]);
  });

  test("location matches label text", () => {
    expect(find({ location: "bayern" })).toEqual(["cardio-munich"]);
  });

  test("an unknown value names the close ones", () => {
    expect(() => compile({ technology: "rustlang" }, vocab)).toThrow(/Did you mean: rust \(Rust\)/);
    expect(() => compile({ city: "Atlantis", section: "tech" }, vocab)).toThrow(FilterError);
  });

  test("sections: inferred, and conflicts refused", () => {
    expect(sectionsFor({}, vocab)).toEqual(["tech", "medicine"]);
    expect(sectionsFor({ company: "helios" }, vocab)).toEqual(["medicine"]);
    expect(() => sectionsFor({ specialty: "cardiology", technology: "rust" }, vocab)).toThrow(FilterError);
    expect(() => sectionsFor({ section: "tech", company: "helios" }, vocab)).toThrow(FilterError);
  });
});

test("count lists values most first and counts jobs without one", () => {
  expect(count(rows, "city", vocab)).toEqual({ counts: [["berlin", 2], ["Lyon", 1], ["München", 1], ["munich", 1]], unset: 1 });
  expect(count(rows, "employer", vocab).counts).toEqual([["Helios", 2], ["Stripe", 2], ["Ferrous GmbH", 1]]);
});
