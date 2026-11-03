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
```

## Automation

| Workflow | Trigger | Does |
| --- | --- | --- |
| `.github/workflows/daily.yml` | 05:00 UTC daily, or "Run workflow" | fetch → commit `data/` → alert; then, in a second job, wait for the deploy → ping search engines |
| DigitalOcean App Platform (`.do/app.yaml`) | push to `main` | test → build → deploy, via `Dockerfile` |

App Platform watches `main` through its GitHub app, so the daily data commit deploys the same way a developer push does. A failing `bun test` fails the App Platform build, and the previous deployment keeps serving.

**Stopping early.** `scripts/fetch.ts` sets the step output `changed`, ignoring `lastSeenAt` because it moves on every run. When nothing else changed, the run stops before committing, so nothing is deployed. On those days the committed `lastSeenAt` and the site's "last updated" time stay at the last run that changed something.

**Sanity checks.** A source falls back, keeping yesterday's file, if:
- the fetch fails,
- it returns 0 valid jobs,
- it returns fewer than 50% of its previous open count, or
- more than 20% of its jobs fail validation.

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
| `data/jobs/<company>.json` | Job[] per company, written by the pipeline; split into `<company>.<n>.json` parts past 5,000 jobs |
| `data/runs/latest.json` | Per-source counts and status of the last run |
| `data/runs/changes.json` | Slugs of the jobs the last run opened, closed or dropped; read by `scripts/ping.ts` |
| `data/runs/history.json` | Per-company open/new/closed counts, one line per day; feeds the `/analytics` trend charts |
| `data/history/<date>.json` | Snapshot of open jobs at the end of each day, by company, function, country, city, technology and employment type; feeds the movers, remote-share and per-function trends on `/analytics` and one permanent page per day under `/analytics/history` |
| `scripts/fetch.ts` | Pipeline: fetch → normalize → validate → merge → write |
| `scripts/fetchers/` | One module per source: `greenhouse.ts`, `amazon.ts` (JSON API), `apple.ts` and `google.ts` (read the JSON their search pages embed) |
| `src/lib/schema.ts` | zod schemas for Job, CompanyConfig and runs |
| `src/lib/jobs.ts` | The only data-access module pages use |
| `src/pages/[...lang]/` | Browse pages, built once per language: English at `/`, others under `/uk`, `/es`, `/de` |
| `src/pages/jobs/[slug].astro` | Job pages, English only (content comes from the career sites, and per-language copies would quadruple the build) |
| `src/lib/messages/` | UI strings per language; `src/lib/i18n.ts` has the routing and lookup helpers |

## Search engines

- `/sitemap.xml` is a sitemap index. `/sitemap-pages-<n>.xml` lists the browse pages in every language, each with `hreflang` alternates; `/sitemap-jobs-<n>.xml` lists the open job pages. Each file holds at most 10,000 URLs.
- Job pages carry JobPosting markup with `validThrough` set to 30 days after the job was last seen, so postings expire from Google for Jobs if the pipeline stops or stops checking a job (a capped company's job outside its newest 1,000).
- Crosslinks: hub pages list only the newest 50 jobs, so each job page links to the next 5 open jobs on its team (same company and category) and in its place (first city, else country, else remote), wrapping around (`src/lib/related.ts`). Every open job is then linked from at least one other page. Job pages also link to their technology, place and employment hubs; hub pages link to the companies hiring there, related technologies and the country's other cities.
- `scripts/ping.ts` polls `/version.json` until the site serves the new run, then sends the changed job URLs to IndexNow (key file `public/bf6f1d24d876292da4961a3ae984ea98.txt`) and to the Google Indexing API. Google's default quota is 200 URLs a day: new jobs go first, then closed ones (`URL_UPDATED`, since the page is now `noindex`), then ones dropped after the 14-day retention (`URL_DELETED`). A failed ping is logged and doesn't fail the workflow.

## Analytics history

Every fetch writes `data/history/<today>.json` (`scripts/snapshot.ts`) alongside the jobs, and it is committed with them. Snapshots are never pruned, unlike closed jobs, which are dropped after 14 days, so `/analytics/history/<date>` keeps rendering the same numbers forever. A day without a commit has no file; trend charts repeat the day before.

To rebuild a past day from the jobs still on file, run `bun run snapshot <date>`. It counts the jobs whose `firstSeenAt` and `closedAt` bracket the end of that day, so it is only accurate for the last 14 days, and big companies only for jobs in their newest 1,000.

## Adding a Greenhouse company

Add an entry to `data/companies.json` with the board token from `boards.greenhouse.io/<token>`, then run `bun run fetch <key>`.

## Big companies

Amazon, Apple and Google set `maxJobs: 1000`, so the daily run fetches only their newest 1,000 jobs. A capped run adds and updates jobs but never closes any: a job missing from the newest 1,000 may just be older (Amazon doesn't even sort strictly by posting date), so it is kept as it was.

To fetch every job, run Actions → Daily update → Run workflow with **Fetch every job** ticked, or locally:

```bash
bun run fetch --all                 # every company, ignoring maxJobs
bun run fetch --all amazon          # just Amazon
```

Only a full run closes jobs. Between full runs, jobs that have closed on these three sites still show as open, so run one every week or two. Amazon's search endpoint stops at 10,000 results, so a full Amazon fetch searches one country at a time and splits a country with more (the US) by business category; if a slice still hits the cap, the fetch fails and Amazon falls back to yesterday's data.

A company with more than 5,000 jobs is written as `data/jobs/<company>.<n>.json` parts, because GitHub rejects files over 100 MB. Each job lands in a part by a hash of its id, so it stays put from day to day.

## Status

Milestones 1 (pipeline skeleton) and 2 (daily automation) are done. Amazon, Apple and Google fetchers are in. Next: Lever and Ashby, location and category pages, `/new` and `/remote` (milestone 3).
