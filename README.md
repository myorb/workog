# Workog

A static job portal: a daily pipeline fetches open jobs from company career sites into `data/jobs/*.json`, and Astro pre-renders one page per job plus browse pages. See the technical spec for the full design.

## Commands

```bash
bun install
bun run fetch            # fetch all companies into data/ (or: bun run fetch figma stripe)
bun run build            # pre-render the site into dist/
bun run preview          # serve dist/ on localhost:4321
bun test                 # pipeline unit tests
bun run check            # type-check Astro pages and scripts
bun run alert            # send a webhook alert for sources that fell back in the last run
bun run snapshot         # rewrite today's data/history snapshot (or: bun run snapshot 2026-11-02)
bun run ping             # tell search engines about the last run's job changes once it's live (or: --no-wait)
bun scripts/postal-states.ts  # regenerate the postal code → German state table (rarely needed)
bun scripts/nuts-names.ts     # regenerate the EU region names EURES locations use (rarely needed)
EURES_MAX_DETAILS=20000 bun run fetch eures  # one-off backfill of EURES job texts past the daily cap
```

## Automation

| Workflow | Trigger | Does |
| --- | --- | --- |
| `.github/workflows/daily.yml` | 05:00 UTC daily, or "Run workflow" | fetch → commit `data/` → alert; then, in a second job, wait for the deploy → ping search engines |
| DigitalOcean App Platform (`.do/app.yaml`) | push to `main` | test → build → deploy, via `Dockerfile` |

App Platform watches `main` through its GitHub app, so the daily data commit deploys the same way a developer push does. A failing `bun test` fails the App Platform build, and the previous deployment keeps serving.

**Stopping early.** `scripts/fetch.ts` sets the step output `changed`, ignoring `lastSeenAt` because it moves on every run. When nothing else changed, the run stops before committing, so nothing is deployed. On those days the committed `data/runs/seen.json` and the site's "last updated" time stay at the last run that changed something.

**Sanity checks.** A source falls back, keeping yesterday's file, if:
- the fetch fails,
- it returns 0 valid jobs,
- it returns fewer than 50% of its previous open count, or
- more than 20% of its jobs fail validation.

**Closing jobs.** A job missing from a run stays open and counts the miss in `missedRuns`; it closes only when `CLOSE_AFTER_MISSES` (2) successful runs in a row missed it, and seeing it again resets the count. The paginated boards (Arbeitnow, NHS, EURES) skip some jobs at random on each run, and before this most of the jobs they "closed" came back the next run. A fallback or a capped run doesn't count as a miss.

**Archive.** A job closed for 14 days loses its page (404) and moves from `data/jobs` to `data/archive/<company>/<YYYY-MM>.jsonl` (by month of `closedAt`), where it stays for good (`src/lib/archive.ts`). Archive records are slim: no description, but with the technologies and employment type it gave, about 0.7 KB instead of 6 KB. If an archived job comes back, it leaves the archive and gets its old slug and `firstSeenAt` back, so it counts as reopened, not new. The site never reads the archive; the pipeline and `bun run snapshot` do.

`data/runs/latest.json` records `fallbackStreak` for each source and marks it `broken` after 3 fallbacks in a row. A fallback never fails the workflow; it triggers an alert. Broken sources are flagged 🚨 in the alert.

### One-time setup

1. Push this repo to GitHub with `main` as the default branch.
2. Install the DigitalOcean GitHub app on `myorb/workog`, then create the App Platform static site:
   ```bash
   doctl apps create --spec .do/app.yaml
   ```
3. Point `workog.com` at the app as shown under the app's Settings → Domains.
4. Add the repository secret:
   - `ALERT_WEBHOOK_URL`: a Slack or Discord incoming webhook, or `https://api.telegram.org/bot<token>/sendMessage?chat_id=<id>`
   - `GOOGLE_INDEXING_KEY` (optional): the JSON key of a Google Cloud service account with the Indexing API enabled. Add the service account's email as an **Owner** of the site in Search Console. Without it, only IndexNow is pinged.
5. Set the `SITE_URL` build-time env var in `.do/app.yaml` if the site isn't served at `https://workog.com`.
6. Start the first run from Actions → Daily update → Run workflow.

To roll back, roll back to an earlier deployment in the App Platform dashboard, or `git revert` the data commit, which triggers a new deployment.

## Layout

| Path | Purpose |
| --- | --- |
| `data/companies.json` | Company list and source config |
| `data/jobs/<company>.json` | Job[] per company, written by the pipeline; split into `<company>.<n>.json` parts past 1,000 jobs. Medical-job sources (`sector: "medicine"`) are in `data/jobs/medicine/` |
| `data/archive/<company>/<YYYY-MM>.jsonl` | Jobs closed for more than 14 days, one slim JSON line each, kept for good; see Archive above |
| `data/runs/seen.json` | Each company's last successful run time, which is the `lastSeenAt` of every job that run saw |
| `data/runs/latest.json` | Per-source counts and status of the last run |
| `data/runs/changes.json` | Slugs of the jobs the last run opened, closed or dropped (moved to the archive); read by `scripts/ping.ts` |
| `data/runs/history.json` | Per-company open/new/closed counts, one line per day; feeds the `/analytics` trend charts |
| `data/history/<date>.json` | Snapshot of open jobs at the end of each day, by company, function, country, city, technology and employment type; feeds the movers, remote-share and per-function trends on `/analytics` and one permanent page per day under `/analytics/history` |
| `data/history/medicine/<date>.json` | The same for medical jobs, by specialty, career level, country, German state and hospital; feeds the 30-day changes on the `/medicine` pages and the medical reports |
| `scripts/fetch.ts` | Pipeline: fetch → normalize → validate → merge → write |
| `scripts/fetchers/` | One module per source: `greenhouse.ts`, `ashby.ts`, `lever.ts`, `smartrecruiters.ts`, `workday.ts`, `eightfold.ts`, `amazon.ts`, `arbeitnow.ts`, `arbeitsagentur.ts` and `workingnomads.ts` (JSON APIs), `weworkremotely.ts` (RSS), `apple.ts` and `google.ts` (read the JSON their search pages embed); `http.ts` has the shared retrying client and `mapLimit` for bounded parallel requests |
| `src/lib/schema.ts` | zod schemas for Job, CompanyConfig and runs |
| `src/lib/jobs.ts` | The only data-access module pages use |
| `src/lib/job-files.ts` | Reads and writes `data/jobs` and `data/runs/seen.json`, for the pipeline and the site |
| `src/pages/[...lang]/` | Browse pages, built once per language: English at `/`, others under `/uk`, `/es`, `/de`. `/` is the start page; the tech home is `/tech` and the medical-jobs section lives under `/medicine` |
| `src/lib/medicine.ts` | Medical-jobs taxonomy: specialties, career levels and German states, with the rules that read them from titles |
| `src/lib/hospitals.ts` | Hospitals and hospital groups for `/medicine/hospitals`: employers merged across legal-form spellings, a page from 5 open jobs; groups are companies marked `"group": true` |
| `src/lib/nuts-names.ts` | Generated NUTS code → EU region name table, for EURES jobs that name a region but no city |
| `src/lib/postal-states.ts` | Generated postal code → German state table, for hospital sites that give a postal code but no state |
| `src/pages/jobs/[slug].astro` | Job pages, English only (content comes from the career sites, and per-language copies would quadruple the build) |
| `src/lib/messages/` | UI strings per language; `src/lib/i18n.ts` has the routing and lookup helpers |

## Medical jobs

`data/companies.json` marks medical-job sources with `"sector": "medicine"`; today that is `arbeitsagentur`, the Bundesagentur für Arbeit's job board, filtered to doctors and to employers only (no recruitment agencies), plus Europe's public job services (`eures` for the EU/EEA outside Germany, Sweden and Switzerland; `nhs` for the UK; `jobtech` for Sweden; `jobroom` for Switzerland) and the careers sites of hospital groups: `helios`, `asklepios`, `sana` (an `oracle` source) and the `rexx` portals of Schön Klinik, the Alexianer and ISAR Klinikum. The Arbeitsagentur source skips those groups' postings, which copy jobs from their own sites, and EURES skips its copies of Arbeitsagentur postings. Its jobs carry `category: "medicine"` plus `specialty` and `level`, and stay out of every tech page, the analytics and the company list: `getOpenJobs()` returns tech jobs only, `getOpenMedicineJobs()` the medical jobs.

Search results have no description, so the fetcher reads each new job's details separately, at most 1,500 a run to stay inside the workflow timeout; the first run leaves the rest without text for the next runs to fill. The source sends the Jobsuche web app's own public client id, an undocumented API that may change.

## Search engines

- `/sitemap.xml` is a sitemap index. `/sitemap-pages-<n>.xml` lists the browse pages in every language, each with `hreflang` alternates; `/sitemap-jobs-<n>.xml` lists the open job pages. Each file holds at most 10,000 URLs.
- Job pages carry JobPosting markup with `validThrough` set to 30 days after the job was last seen, so postings expire from Google for Jobs if the pipeline stops or stops checking a job (a capped company's job outside its newest `maxJobs`).
- Crosslinks: hub pages list only the newest 50 jobs, so each job page links to the next 5 open jobs on its team (same company and category) and in its place (first city, else country, else remote), wrapping around (`src/lib/related.ts`). Every open job is then linked from at least one other page. Job pages also link to their technology, place and employment hubs; hub pages link to the companies hiring there, related technologies and the country's other cities.
- `scripts/ping.ts` polls `/version.json` until the site serves the new run, then sends the changed job URLs to IndexNow (key file `public/bf6f1d24d876292da4961a3ae984ea98.txt`) and to the Google Indexing API. Google's default quota is 200 URLs a day: new jobs go first, then closed ones (`URL_UPDATED`, since the page is now `noindex`), then ones dropped after the 14-day retention, whose pages are gone and whose records are in the archive (`URL_DELETED`). A failed ping is logged and doesn't fail the workflow.

## Analytics history

Every fetch writes `data/history/<today>.json` (`scripts/snapshot.ts`) alongside the jobs, and it is committed with them. Snapshots are never pruned, so `/analytics/history/<date>` keeps rendering the same numbers forever. A day without a commit has no file; trend charts repeat the day before.

Every fetch also writes `data/history/medicine/<today>.json` for the medical jobs; it starts on 2026-11-04, the first day medical jobs were on file.

**Dated summary lines.** Each browse page (section home, company, technology, country, remote, specialty, career level, medical location, hospital, `/analytics`) opens with a line such as "Cardiology jobs: 609 open positions as of Nov 5, 2026, up 6% in 30 days" (`src/components/AsOf.astro`). The change compares the live count with the snapshot 30 days earlier, or the oldest one if history is shorter, and is left out under 7 days (`src/lib/trend.ts`). A day-over-day change of more than 25% in a section's total means sources were added or lost, not hiring, so comparisons never reach back past one: on 2026-11-02 the tech total was 6,449 against 52,402 the next day.

**Monthly reports.** `/reports/tech/<YYYY-MM>` and `/reports/medicine/<YYYY-MM>` compare the month's last snapshot with the last one before the month began, under the same coverage rule (`src/lib/reports.ts`). A month in progress updates daily; once it is over its numbers never change, so its URL is safe to cite. `/llms-full.txt` gives today's headline numbers with their 30-day changes in one plain-text file.

To rebuild a past day, run `bun run snapshot <date>`. It counts the jobs in `data/jobs` and `data/archive` whose `firstSeenAt` and `closedAt` bracket the end of that day. It is accurate from 2026-11-03, when the archive began keeping closed jobs; for a company with `maxJobs`, only for jobs in its newest `maxJobs`.

## Adding a company

Add an entry to `data/companies.json`, then run `bun run fetch <key>`. Each source needs one field:

| `source` | Field | Where to find it |
| --- | --- | --- |
| `greenhouse` | `boardToken` | `boards.greenhouse.io/<token>` |
| `ashby` | `boardToken` | `jobs.ashbyhq.com/<token>` |
| `lever` | `boardToken` | `jobs.lever.co/<token>` |
| `smartrecruiters` | `boardToken` | `jobs.smartrecruiters.com/<CompanyIdentifier>`, case-sensitive |
| `workday` | `careersUrl` | the public site, e.g. `https://nvidia.wd5.myworkdayjobs.com/NVIDIAExternalCareerSite` |
| `eightfold` | `careersUrl` | the public site with its domain, e.g. `https://explore.jobs.netflix.net/careers?domain=netflix.com` |

| `arbeitnow`, `weworkremotely`, `workingnomads` | `"board": true` | none; see below |

### Job boards

Three open job boards are fetched as well: Arbeitnow (its free JSON API, about 4k jobs, mostly in Germany), We Work Remotely (its per-category RSS feeds, since the site-wide feed stops at 100) and Working Nomads (its public JSON feed). Each board is one entry in `data/companies.json` with `"board": true`. Its jobs keep the board as `company` and carry the hiring organization's name in `employer`. Job pages name the employer as the company, in the JobPosting markup too, and link to the board as "Listed on". The apply link goes to the board's own posting.

Most other boards, such as Indeed, LinkedIn, StepStone and XING, have no public feed or forbid scraping. Adzuna, Jooble and Careerjet need an API key. Remotive's free API forbids passing its jobs on to Google Jobs, which the JobPosting markup does. A job a board lists may also be on a tracked company's own board; such duplicates aren't merged.

SmartRecruiters, Workday and Eightfold leave descriptions out of their search results, so these fetchers make one request per job, a few at a time (`mapLimit`). Workday counts no more than 2,000 results per search, so a bigger site is fetched one value of a facet (job family, location) at a time, picking the facet that covers the most jobs with every value under 2,000.

Microsoft and Meta aren't covered: their careers APIs refuse anonymous requests.

## Big companies

Amazon, Apple and Google are fetched in full every day, about 21k, 5k and 3k jobs, in under 3 minutes. Their fetchers page through results one request at a time. Companies are fetched 12 at a time, the ones with the most jobs last run first, so the slow ones aren't left waiting at the end.

A company can set `maxJobs` to fetch only its newest jobs, if a full fetch ever gets too slow. A capped run adds and updates jobs but never closes any: a job missing from the newest `maxJobs` may just be older (Amazon doesn't even sort strictly by posting date), so it is kept as it was. Run Actions → Daily update → Run workflow with **Fetch every job** ticked, or locally, to fetch capped companies in full and close their jobs:

```bash
bun run fetch --all                 # every company, ignoring maxJobs
bun run fetch --all amazon          # just Amazon
```

Amazon's search endpoint stops at 10,000 results, so a full Amazon fetch searches one country at a time and splits a country with more (the US) by business category; if a slice still hits the cap, the fetch fails and Amazon falls back to yesterday's data.

The job files are laid out so a daily commit changes only the jobs that really changed (`src/lib/job-files.ts`):

- **Parts.** A company with more than 1,000 jobs (about 7 MB) is written as `data/jobs/<company>.<n>.json` parts. Each job lands in a part by a hash of its id, so it stays put from day to day. The part count is a power of two that doubles when parts pass 1,000 jobs and halves only below 250, so a company near a boundary doesn't reshuffle its files.
- **`lastSeenAt`.** It moves for every job on every run, so it isn't stored for the jobs a run saw: they take it from the company's time in `data/runs/seen.json`. Closed jobs, and a capped company's older jobs the run didn't reach, keep their own.
- **All or nothing.** A fetch run stages every file it writes as `<file>.staged` and renames them into place only once every company is done, so a run that crashes or is killed leaves `data/` as the last run left it. The next run removes the leftover `.staged` files, which git ignores.
- **Changing the layout.** After changing it, run `bun run repack` to rewrite `data/jobs` without fetching.

## Status

Milestones 1 (pipeline skeleton) and 2 (daily automation) are done. Amazon, Apple and Google fetchers are in. Next: Lever and Ashby, location and category pages, `/new` and `/remote` (milestone 3).
