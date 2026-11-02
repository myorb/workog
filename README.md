# Static Job

A static job portal: a daily pipeline fetches open jobs from company career sites into `data/jobs/*.json`, and Astro pre-renders one page per job plus browse pages. See the technical spec for the full design.

## Commands

```bash
bun install
bun run fetch            # fetch all companies into data/ (or: bun run fetch figma stripe)
bun run build            # pre-render the site into dist/
bun run preview          # serve dist/ on localhost:4321
bun test                 # pipeline unit tests
bun run check            # type-check Astro pages and scripts
bun run deploy           # deploy dist/ to Cloudflare Pages production (needs wrangler login)
bun run alert            # send a webhook alert for sources that fell back in the last run
```

## Automation

| Workflow | Trigger | Does |
| --- | --- | --- |
| `.github/workflows/daily.yml` | 05:00 UTC daily, or "Run workflow" | fetch → commit `data/` → build → deploy → alert |
| `.github/workflows/deploy.yml` | push to `main`, or "Run workflow" | test → build → deploy |

The daily job deploys by itself because pushes made with `GITHUB_TOKEN` don't trigger other workflows. Both share one concurrency group, so they never deploy at the same time.

**Stopping early.** `scripts/fetch.ts` sets the step output `changed`, ignoring `lastSeenAt` because it moves on every run. When nothing else changed, the run stops before commit, build and deploy. On those days the committed `lastSeenAt` and the site's "last updated" time stay at the last run that changed something.

**Sanity checks.** A source falls back, keeping yesterday's file, if:
- the fetch fails,
- it returns 0 valid jobs,
- it returns fewer than 50% of its previous open count, or
- more than 20% of its jobs fail validation.

`data/runs/latest.json` records `fallbackStreak` for each source and marks it `broken` after 3 fallbacks in a row. A fallback never fails the workflow; it triggers an alert. Broken sources are flagged 🚨 in the alert.

### One-time setup

1. Push this repo to GitHub with `main` as the default branch.
2. Create the Cloudflare Pages project (direct upload):
   ```bash
   bunx wrangler pages project create static-job --production-branch main
   ```
3. Create a Cloudflare API token with the **Cloudflare Pages: Edit** permission.
4. Add repository secrets:
   - `CLOUDFLARE_API_TOKEN`
   - `CLOUDFLARE_ACCOUNT_ID`
   - `ALERT_WEBHOOK_URL`: a Slack or Discord incoming webhook, or `https://api.telegram.org/bot<token>/sendMessage?chat_id=<id>`
5. Set the `SITE_URL` env var for builds if the site isn't served at `https://static-job.pages.dev`.
6. Start the first run from Actions → Daily update → Run workflow.

To roll back, redeploy an earlier deployment in the Cloudflare dashboard, or `git revert` the data commit, which triggers `deploy.yml`.

## Layout

| Path | Purpose |
| --- | --- |
| `data/companies.json` | Company list and source config |
| `data/jobs/<company>.json` | Job[] per company, written by the pipeline |
| `data/runs/latest.json` | Per-source counts and status of the last run |
| `scripts/fetch.ts` | Pipeline: fetch → normalize → validate → merge → write |
| `scripts/fetchers/` | One module per source (`greenhouse.ts` so far) |
| `src/lib/schema.ts` | zod schemas for Job, CompanyConfig and runs |
| `src/lib/jobs.ts` | The only data-access module pages use |
| `src/pages/` | `/`, `/jobs/[slug]`, `/companies`, `/companies/[company]`, `/404` |

## Adding a Greenhouse company

Add an entry to `data/companies.json` with the board token from `boards.greenhouse.io/<token>`, then run `bun run fetch <key>`.

## Status

Milestones 1 (pipeline skeleton) and 2 (daily automation) are done. Next: Apple and Google fetchers, Lever and Ashby, location and category pages, `/new` and `/remote` (milestone 3).
