# Spec: Doctor jobs (Germany and EU)

Status: Phase 1 in progress · 2026-11-04. Built: the `medicine` category, specialties and career levels, the `arbeitsagentur` source (employers only), the start page, `/tech` and the `/medicine` section. Not yet: EURES, the recruitment-agency jobs with duplicate merging, and Phase 2.

## Goal

Add open jobs for medical doctors in Germany and the rest of Europe, so the site covers a second audience besides tech. A doctor should be able to browse by specialty, country and city, and every listing should link to the original posting.

**Out of scope:** nurses, dentists, vets, medical assistants and other health roles. They can follow later with the same sources.

## Size

These are live counts, taken on 2026-11-04.

| Source | Doctor jobs |
| --- | --- |
| Arbeitsagentur, field "Human- und Zahnmedizin" | 22,092 |
| … of which dentists | 896 |
| … of which from one agency (Sanovetis GmbH) | ~7,700 |
| … from employers only (`pav=false`) | 5,977 |
| EURES, ISCO 221 "Medical doctors", all countries | 37,979 |
| … of which Germany (taken from the Arbeitsagentur) | 22,456 |
| … all countries except Germany | ~15,500 |
| JobTech Sweden, "läkare" | 656 |

The site has 52,728 open jobs today. After removing duplicates, we expect to add **25,000–30,000 jobs**, roughly half as many again as the site already has.

## Sources

### Phase 1

| Key | Source | Covers | Access |
| --- | --- | --- | --- |
| `arbeitsagentur` | Bundesagentur für Arbeit, Jobsuche | Germany | Public JSON API behind the web app's shared client ID (`X-API-Key: jobboerse-jobsuche`). Not officially documented. |
| `eures` | EURES job search | Every EU/EEA country plus Switzerland, **except Germany** | The public JSON API behind the portal (`/eures/api/jv-searchengine/public/jv-search/search`). Not officially documented. |

**Why both:** EURES gets its German jobs from the Arbeitsagentur, so listing Germany from both would show every German job twice. The Arbeitsagentur gives us more for Germany: its own occupation codes, specialties and a flag for private agencies. EURES is the only single source for the rest of Europe.

**Filters:**
- `arbeitsagentur`:
  - `berufsfeld=Human- und Zahnmedizin`.
  - Drop jobs whose occupation (`beruf`) is a dentist or dental role (`Zahnarzt…`, `Assistenzzahnarzt…`).
- `eures`:
  - `occupationUris=[http://data.europa.eu/esco/isco/C221]`. This covers C2211 (generalist) and C2212 (specialist).
  - `locationCodes`: every country except `de`.

### Phase 2 (more depth per country)

| Key | Source | Why | Access |
| --- | --- | --- | --- |
| `francetravail` | France Travail "Offres d'emploi" API | France has 8,716 jobs on EURES, and the national source likely has more | Official. OAuth client credentials after registering on francetravail.io, under a licence. |
| `jobtech` | Arbetsförmedlingen JobSearch | Sweden | Official, open, no key |
| `nav` | NAV pam-stilling-feed | Norway | Official. Free token after registering. A change feed, so we filter for doctors ourselves. |

Once a country has its own national source, take it out of the `eures` countries in the same change, so its jobs aren't listed twice.

### Not planned

- **Doctor job boards** (ärztestellen.de, praktischArzt, DocCheck): no public feed. Partnership only.
- **Hospital career sites** (softgarden and others): worth looking at later, for jobs that hospitals don't post on the Arbeitsagentur.

## Pipeline changes

### Config

Each source is one entry in `data/companies.json` with `board: true`, like `arbeitnow`. `company` is the board, and `employer` is the hospital or practice.

```json
{ "key": "arbeitsagentur", "name": "Bundesagentur für Arbeit", "source": "arbeitsagentur", "board": true },
{ "key": "eures", "name": "EURES", "source": "eures", "board": true }
```

### Fetching

- **Search pages.** Page through the search results, sorted newest first. The Arbeitsagentur stops returning results after about 10,000 per query, so split the query by German state (Bundesland) or by publication age until each piece is under the limit.
- **Descriptions.** Neither search returns the full job text. Each job needs a second request (Arbeitsagentur `jobdetails/{refnr}`, EURES `jv/id/{id}`). Fetch details **only for jobs not in yesterday's file**, and keep the stored description for the rest. On a normal day that's a few hundred detail requests. The first full fetch is ~30,000 requests, so run it on its own, outside the daily run.
- **Rate.** At most 2 requests per second per source, with a generic User-Agent and retries with backoff. The daily workflow times out after 30 minutes, which holds about 3,600 requests per source at that rate. That's enough for daily changes, not for the first fetch.
- **Sanity checks.** Keep the existing ones (fall back to yesterday's file on a failed fetch, 0 jobs, <50% of yesterday's count, >20% invalid). Running out of time on detail requests is not a failure: keep the jobs already fetched, and leave the rest for the next run.

### Normalizing

| Job field | Arbeitsagentur | EURES |
| --- | --- | --- |
| `id` | `arbeitsagentur:<refnr>` | `eures:<id>` |
| `employer` | `arbeitgeber` | employer name |
| `title` | `stellenangebotsTitel`, or `titel` from details | title in the posting's language |
| `locations` | `stellenlokationen[].adresse` → "City, Germany" | location → "City, Country" |
| `remote` | `homeofficemoeglich` | from the title or text, using `isRemote` |
| `category` | always `medicine` | always `medicine` |
| `specialty` (new) | from `beruf`, e.g. "Facharzt/-ärztin - Innere Medizin" → `internal-medicine` | from ESCO occupation, if more specific than C221 |
| `descriptionHtml` | from details, cleaned with `sanitizeDescription` | from details, same |
| `applyUrl` | `externeUrl` if there is one, else the job's page on arbeitsagentur.de | the employer's link if there is one, else the job's page on the EURES portal |
| `postedAt` | `veroeffentlichungszeitraum.von` | publication date |

**New optional field `specialty`.** A short list we control (about 30 values: `general-practice`, `internal-medicine`, `psychiatry`, `radiology`, `anaesthesiology`, `surgery`, `paediatrics`, `gynaecology`, `neurology`, `oncology`, `occupational-medicine`, …). The list maps the Arbeitsagentur's specialty names and ESCO codes onto these values. Anything that doesn't match stays empty.

### Category

- Add `medicine` to `categoryRules` in `src/lib/normalize.ts`, **as the first rule**, so tech sources that list a doctor role (Apple Health, Amazon One Medical) file it correctly.
- The title rule must work in several languages: `physician`, `medical doctor`, `Arzt/Ärztin`, `Assistenz-/Fach-/Ober-/Chefarzt`, `médecin`, `médico`, `läkare`, `lekarz`, `lékař`. Leave out bare `doctor`, which also matches "doctoral", and Dutch `arts`, which matches too many unrelated words.
- Feed jobs (the two sources above) set `medicine` directly and skip the title rule.
- Add the category's name to all four message files (en, de, es, uk).

### Duplicate postings

- One agency posts the same job again for each of hundreds of towns (Sanovetis: ~7,700 ads). Merge postings that have the same employer, same title and same description text into **one job with all their locations**.
- Also limit each employer to 200 open jobs per source. Keep the newest, and log what was dropped in `data/runs/latest.json`.
- Recruitment agencies (`pav=true`) stay in, but are marked so pages can sort employers first. **Open question:** hide them entirely?

## Site changes

- **Browse pages** for doctor jobs, like the existing technology and location pages:
  - `/medicine/` — every doctor job, with links by specialty and by country.
  - `/medicine/[specialty]/`
  - `/medicine/[specialty]/[country]/`
  - `/medicine/[country]/[city]/`
  - These go through the four languages (`[...lang]`) like every other page, and only exist when they have at least one job.
- **Home page filters:** add "Medicine" to the category filter, and a specialty filter that only shows when Medicine is picked.
- **Job page:** show employer, specialty, contract type and the source ("via Bundesagentur für Arbeit" / "via EURES").
- **Structured data:** JobPosting with `occupationalCategory` "221 Medical doctors" (ISCO-08), `hiringOrganization` = employer, and `validThrough` the same as today.
- **Sitemaps:** the new pages go into the split sitemap. Doctor job pages are added to the indexing pings like any other job.
- **Analytics:** `medicine` shows up in the category counts by itself. Add a breakdown by specialty to the snapshot (`SnapshotSchema.specialties`).

## Data size

`data/jobs/` is 338 MB for ~53k jobs. Doctor descriptions are long, so 30k more jobs will add an estimated **150–250 MB**, and a daily commit churns more of it. Before Phase 1 ships, decide whether descriptions stay in git or move to storage outside the repo. **Open question.**

## Legal and fairness

- Both Phase 1 APIs are public endpoints that their own websites use, but neither is documented or covered by a published licence. Before launch, read each site's terms of use (Arbeitsagentur Impressum/Nutzungsbedingungen, EURES legal notice). If either forbids reuse, ask the operator for permission or switch to the official route (EURES cooperates with partners through national job services).
- Always link to the original posting. Never offer an apply form of our own. Name the source on every page.
- Don't keep personal data beyond what the posting shows publicly. Contact names and phone numbers stay inside the cleaned description and are never indexed separately.

## Rollout

1. **Category only:** add `medicine` and the message names, then check how existing tech-company jobs get categorized. Small and safe.
2. **`arbeitsagentur` source, filtered to employers only (`pav=false`, ~6,000 jobs).** Run the first fetch by hand, check the result, then turn on daily runs.
3. **Browse pages and filters** for medicine.
4. **Add recruitment agencies** with the duplicate merge (about another 15,000 jobs).
5. **`eures` source**, without Germany.
6. **Phase 2:** France Travail, JobTech, NAV, one at a time, each taking its country out of EURES.

## Acceptance criteria

- The daily run finishes inside the 30-minute timeout with both sources on.
- No German job appears twice (Arbeitsagentur and EURES).
- At least 90% of doctor jobs have a full description and a valid `applyUrl`.
- No employer has more than 200 open jobs per source.
- `/medicine/` and the specialty pages render in all four languages, and their JobPosting data passes the existing structured-data tests.
- `bun test` covers: both normalizers, the medicine category rule (including the "doctoral" false positive), the specialty mapping, the duplicate merge and the Germany exclusion.

## Open questions

1. Recruitment-agency jobs: show them, mark them, or hide them?
2. Descriptions: keep them in git, or move them to storage outside the repo?
3. Postings in other languages (German, French, …): show them as they are, or translate the titles?
4. Should dentists get their own category later, from the same feed?
5. Confirm both sites' terms allow reuse before step 2.
