# Spec: Job alerts

Status: Draft · 2026-11-05. Nothing built yet. Paid from day one: €4.99/mo or €39/yr after a 7-day trial, billed through Paddle.

## Goal

Let a visitor on any browse page pay for a subscription that emails them the new jobs from that page, once a day. An alert is just the page's URL: "Cardiology in Bayern", "React in Berlin" or "Remote jobs in Spain".

This is the first paid service built beside the static site. Browsing stays free; the subscription sells convenience: no need to come back and check, one email a day with only the jobs that are new for you. Along the way it builds the numbers (subscribers per specialty, region and technology) that later products, such as sponsored jobs or the agency feeds, will be sold on.

**Out of scope for now:** user accounts and passwords, alerts on free-text search (the site has none), instant alerts (the pipeline runs once a day anyway) and Telegram (Phase 2).

## Two repos

| Repo | Owns | Knows about the other |
| --- | --- | --- |
| `myorb/workog` (this one) | the site, the URL grammar, which tags a job has, the labels in four languages | nothing: it publishes the contract below and links to `alerts.workog.com` |
| `myorb/workog-alerts` (new) | subscribers, payments, matching, email | only the contract: three public JSON files and the alert link. No code, routes or taxonomies of the site |

The two never share code and deploy on their own. The site can rename a route, add a section or change how it reads a specialty from a title, and the service doesn't change, as long as the contract holds.

This spec lives in the site repo until `myorb/workog-alerts` exists. Then the parts under "The service" move there as its spec, and this file keeps the contract and the site changes.

## How it fits

```
myorb/workog                                                      myorb/workog-alerts
GitHub Actions (05:00 UTC)        DigitalOcean App Platform       DigitalOcean App Platform, second app (fra)
fetch → commit data/  ──push──▶   build → workog.com              alerts.workog.com
                                   ├─ /version.json ◀── poll hourly ── scheduled job `send` (cron 0 * * * *)
                                   ├─ /feeds/v1/new-jobs.json ◀────────┤
                                   ├─ /feeds/v1/vocab.json ◀── on subscribe ── web service `web`
                                   └─ "🔔 Get alerts" link ──────────▶ /new?…   ├─ Managed Postgres (fra1)
                                                                               ├─ outbox → email provider
                                                                               ├─ /c/… click redirect → workog.com/jobs/<slug>
                                                     Paddle checkout ──webhook──┘
```

- The service polls `/version.json`, which `scripts/ping.ts` already uses to tell that a deploy is live. When `run` changes, it fetches the feed and sends that day's emails. The daily workflow doesn't change.
- If the service is down, the site doesn't notice. If the site is down, the service sends nothing that day and catches up the next day, because the feed covers 7 days (see below).

## The contract

Everything the service needs from the site, and nothing else. It's all public, read-only and versioned under `/feeds/v1/`.

### Tags

A filter is a list of tags, plain strings in the form `key:value`. **A job matches an alert when the job has every tag of the alert.** That's the whole matching rule; the service doesn't need to know what any tag means.

| Key | Values | Jobs |
| --- | --- | --- |
| `section` | `tech`, `medicine` | all |
| `technology` | technology slug | tech |
| `country` | country slug | tech |
| `city` | city slug | both (medical cities always come with an `area`) |
| `remote` | `true` (left out when not remote) | tech |
| `employment` | employment type | tech |
| `company` | company key | all |
| `specialty`, `level` | slugs from `src/lib/medicine.ts` | medicine |
| `area` | a German state or a country; a German job has both `area:germany` and its state | medicine |
| `hospital` | hospital slug (if `getHospitalIndex` can tag jobs cheaply; otherwise Phase 2) | medicine |

A job's tags come from the same functions the pages filter with (`tagsOf`, `medicinePlace`), so an alert gets exactly the jobs its page lists.

**Why tags, not page lists.** A city only has a page while it has `MIN_CITY_JOBS` open jobs. If an alert were "the jobs on page X", it would silently stop working whenever the page went away. An alert on `specialty:cardiology area:bayern city:munchen` keeps matching whether or not the page exists today.

### The alert link

Every page with a filter links to:

```
https://alerts.workog.com/new?v=1&lang=de&path=/de/medicine/levels/senior/cardiology/bayern
                             &tags=section:medicine,specialty:cardiology,level:senior,area:bayern
```

- `tags` is the filter. The service never parses `path`; it only stores it, for the "and N more on the page →" link.
- The link is public, so anyone can edit it. The service checks every tag against `vocab.json` and rejects unknown ones. The worst a hand-edited link can do is create a valid alert the person didn't see on a page.

### `/feeds/v1/new-jobs.json`

Every open job first seen in the 7 days before the latest run, newest first:

```jsonc
{
  "version": 1,
  "run": "2026-11-05T05:03:16.544Z",          // same value as /version.json
  "jobs": [
    {
      "slug": "raphaelsklinik-oberarzt-m-w-d-nuklearmedizin-157",
      "title": "Oberarzt (m/w/d) Nuklearmedizin",
      "employer": "Raphaelsklinik",            // employer ?? company name
      "where": "Münster",                       // formatLocations(…, 1)
      "firstSeenAt": "2026-11-05T05:03:16.544Z",
      "tags": ["section:medicine", "company:alexianer", "specialty:radiology", "level:senior",
               "area:germany", "area:nordrhein-westfalen", "city:munster"]
    }
  ]
}
```

- **Size:** about 1–2k new jobs a day, so about 10k jobs for 7 days at roughly 300 bytes each. That's around 3 MB, under 1 MB gzipped. It has no descriptions.
- **Why 7 days:** the service sends each alert the jobs with `firstSeenAt` after that alert's cursor, so a missed day, a failed send or a quiet run that deploys nothing just means a bigger email next time. Nothing is lost.

### `/feeds/v1/vocab.json`

The label of every tag that open jobs have, in each language, so the service can show "Kardiologie · Oberarzt · Bayern" without knowing what a specialty is:

```jsonc
{
  "version": 1,
  "run": "2026-11-05T05:03:16.544Z",
  "labels": {
    "specialty:cardiology": { "en": "Cardiology", "de": "Kardiologie", "es": "Cardiología", "uk": "Кардіологія" },
    "area:bayern": { "en": "Bavaria", "de": "Bayern", "es": "Baviera", "uk": "Баварія" }
  },
  "aliases": { "technology:golang": "technology:go" }   // renamed slugs, old → new
}
```

- The service reads it only when someone subscribes, and copies the alert's label into its own database. An alert keeps its name even after its tags go out of `vocab.json` for a while.
- `aliases` is how a renamed slug survives: the service rewrites matching alerts once, the next time it reads vocab. The site adds an alias whenever it renames a slug, and keeps it for good.

### Compatibility rules

- **Not breaking:** adding fields, tag keys, tags or languages. The service ignores what it doesn't know.
- **Breaking:** removing or renaming a field or a tag key, or changing what a tag means. That ships as `/feeds/v2/`, and v1 keeps being published for 30 days while the service moves over.
- **Both sides check the contract:**
  - The site has a zod schema for both files and a test that builds them from fixture jobs.
  - The service keeps its own copy of the schema, and a nightly CI job in its repo validates the live files against it. If the site breaks the contract by accident, the service's CI says so before the next send.
- `/feeds/` is `Disallow`ed in `robots.txt`. It holds nothing the job pages don't already show.

## Changes to the site

These are the only changes, all in one PR in `myorb/workog`:

1. **`src/lib/alerts.ts` (new).** `alertTags(path) → string[] | undefined` reads the URL grammar below, and `jobTags(job) → string[]` gives a job's tags. Used only by the site.
2. **`src/pages/feeds/v1/new-jobs.json.ts` and `vocab.json.ts` (new).** Built like `src/pages/medicine/filters.json.ts`. Labels come from the existing `src/lib/messages/*` and `i18n.ts`.
3. **`src/layouts/Base.astro`.** A "Verträge hier kündigen" link in the footer, on every page (see Legal). And on pages where `alertTags(Astro.url.pathname)` matches, a "🔔 Get alerts for this page" link in the header, built as above.
4. **`src/lib/messages/{en,de,es,uk}.ts`.** Two strings: the alert link and the cancel link.
5. **`src/pages/robots.txt.ts`.** `Disallow: /feeds/`.
6. **Tests:**
   - every route in the table below gives the expected tags, and unknown paths give `undefined`;
   - for a sample of pages, the jobs whose `jobTags` contain the page's tags are exactly the jobs the page lists;
   - both feeds match their zod schema.

The site stays static. There is no new runtime and no cookies.

## URL grammar

This lives only in the site repo. Paths are read without their language prefix (`/de`, `/es`, `/uk`), and the prefix becomes the email's language. Every alert also gets `section:tech` or `section:medicine`.

| Path | Tags |
| --- | --- |
| `/tech` | `section:tech` only: every non-medical job |
| `/technologies/<tech>` | technology |
| `/technologies/<tech>/remote` | technology, remote |
| `/technologies/<tech>/<country>` | technology, country (only the main list, not the "worldwide remote" list below it) |
| `/technologies/<tech>/<country>/<city>` | technology, country, city |
| `/locations/<country>` | country |
| `/locations/<country>/<city>` | country, city |
| `/remote` | remote |
| `/remote/<country>` | remote, country |
| `/employment/<type>` | employment |
| `/companies/<key>` | company |
| `/medicine` | `section:medicine` only: every medical job |
| `/medicine/specialties/<specialty>[/<area>[/<city>]]` | specialty, area, city |
| `/medicine/levels/<level>[/<specialty>][/<area>[/<city>]]` | level, specialty, area, city (the second segment is a specialty if it's in `specialties`, otherwise an area) |
| `/medicine/locations/<area>[/<city>]` | area, city |
| `/medicine/hospitals/<hospital>` | hospital |

Index pages (`/locations`, `/technologies` and so on), job pages and analytics don't get the link.

## The service

Repo `myorb/workog-alerts`.

### Stack

**A second DigitalOcean App Platform app**, separate from the site's, in region `fra`, built from the new repo's `Dockerfile` and `.do/app.yaml`. Everything is **Bun** and TypeScript, like the site's pipeline. It has three components:

| Component | Does | Size | Cost |
| --- | --- | --- | --- |
| `web` (service) | subscribe page, Paddle and email-provider webhooks, manage and cancel pages, click redirect, `/health` | smallest shared instance | $5/mo |
| `send` (scheduled job, `0 * * * *`) | the hourly check and the daily send (see Flows), then works through the `outbox` | smallest instance, billed only while it runs | well under $1/mo |
| `db` (Managed Postgres, `fra1`) | all data, through Bun's built-in Postgres client | smallest single node | about $15/mo |

- **Why App Platform:** there's no server to look after: no HTTPS setup, OS updates, firewall or backup scripts. It deploys on push to `main` the same way the site does, keeps the previous deployment if the build or health check fails, and rolls back from the dashboard.
- **Why Postgres:** App Platform has no persistent disk, so SQLite is out. Managed Postgres comes with daily backups and 7 days of point-in-time restore. Only the app is let in (trusted sources). Paddle stays the record of who paid, so subscriptions can also be rebuilt from its API.
- **In the EU:** the app and the database are both in Frankfurt, so subscriber emails stay in the EU.
- **No queue service:** sends go through an `outbox` table. The daily run writes one row per email, then the same job works through it at the provider's rate limit, retrying failures with backoff. Whatever is left when a run ends goes out on the next run.
- **Job limits:** check how long a scheduled job may run before building. A community post says 30 minutes, which isn't confirmed. Even so, it's plenty: a daily send for 1,000 subscribers takes a few minutes with the provider's batch API.
- **Shaped so it can move later:** matching, building emails and sending are plain functions that the job calls. If the timed follow-ups (trial ending, "nothing new this week") grow, these can move into a workflow tool such as Inngest by wrapping them, without a rewrite.
- **Email:** Resend (EU region) to start, which is free up to 3k emails a month and then $20 for 50k. Move to Amazon SES (about $0.10 per 1,000) once volume passes about 50k a month. Mail is sent from `alerts@mail.workog.com`, a subdomain, so a deliverability problem never touches the main domain. SPF, DKIM and DMARC are set up before the first send.
- **Payments: Paddle, as merchant of record.** Paddle is the seller in law: it charges, collects and pays EU VAT in every country (no OSS filings for us), sends invoices, handles refunds and chargebacks, and gives a hosted page to cancel. We get a payout and one webhook. It costs 5% + $0.50 per payment, more than Stripe's ~1.5% + €0.25, but Stripe would leave VAT registration, invoicing and the German cancellation rules to us. That's not worth it for a one-person business at this size. The fixed $0.50 is why the yearly plan is pushed (see Plans).
- **Its own CI:** GitHub Actions runs the tests on every push and the nightly contract check; App Platform builds and deploys `main` itself. The Paddle and Resend secrets live only in the alerts app's encrypted environment variables; the site repo never sees them.

### Data

```sql
subscriber (id, email UNIQUE, lang, token, created_at, bounced_at,
            paddle_customer_id, paddle_subscription_id,
            status,                 -- trialing | active | past_due | canceled
            paid_until)             -- end of the paid or trial period; sends stop after it
alert      (id, subscriber_id, tags, path, label, cursor, created_at, paused_at)
           -- tags: the filter; label: copied from vocab.json; cursor: last firstSeenAt sent
send       (id, subscriber_id, run, jobs, sent_at, provider_id)       -- one row per email, for stats and dedup
outbox     (id, subscriber_id, run, payload, attempts, next_try_at)   -- emails waiting to go out
click      (send_id, slug, at)
```

Nothing else is stored: no names, no CVs, no IPs, no card details (Paddle holds those). `token` is a random 32-byte value used in manage links, and it is the only "login".

### Plans

| Plan | Price | Includes |
| --- | --- | --- |
| Monthly | €4.99/mo | up to 10 alerts, one daily email |
| Yearly | €39/yr (about 35% off, 4+ months free) | the same |

- **7-day free trial on both, card up front.** Paddle starts the trial at checkout and charges on day 8 unless the subscriber cancels. A week is up to 7 daily emails: long enough to see that the emails are useful, short enough not to give the product away.
- **Prices include VAT** (Paddle shows local currency and tax), so a German doctor sees €4.99, not €4.19 + VAT.
- **Why the yearly plan matters:** on €4.99 Paddle keeps about €0.75 (15%); on €39 it keeps about €2.45 (6%). The subscribe page shows yearly first.
- **Later, if the numbers ask for it:** a higher price for the medical section (doctors earn more and have fewer alternatives), or lower regional prices for the Ukrainian audience. Paddle supports price per country, so neither needs new code.

### Flows

- **Subscribe:** `GET /new?…` checks the tags against `vocab.json` (cached until the next run) and shows the filter spelled out ("Cardiology · Senior · Bayern") in the page's language, and **what it would have sent**: "23 new jobs matched this in the last 7 days", with the 5 newest listed. The feed already covers 7 days, so this costs nothing and is the strongest reason to pay. Below that: the plan choice and a "Start 7-day free trial" button that opens Paddle checkout (overlay), which collects email and card. The path and language travel in Paddle's `custom_data`.
- **Paid (webhook `subscription.created` / `transaction.completed`):** create the subscriber and its first alert with the cursor set to now, `status = trialing`. Send the welcome email: the 5 newest matching jobs, the manage link and the trial end date. The checkout already proves the address is real and that the person asked for the emails, so there is no separate opt-in confirmation.
- **Billing changes (webhooks `subscription.updated` / `canceled` / `past_due`):** update `status` and `paid_until`. A canceled subscriber keeps getting emails until `paid_until`, then stops. `past_due` keeps sending while Paddle retries the card (its dunning emails do the reminding), and stops if it ends canceled. Webhooks are verified by signature and are idempotent on Paddle's event id.
- **Daily send (scheduled job `send`, every hour):**
  1. Fetch `/version.json`. If `run` is the same as last time, stop.
  2. Fetch `new-jobs.json` and index its jobs by tag string: `specialty:cardiology` → job ids, and so on.
  3. For each alert of a subscriber with `status` trialing, active or past_due and `paid_until` in the future, intersect the index sets of its tags and keep the jobs with `firstSeenAt > cursor`.
  4. Group by subscriber, so each person gets **one email a day** with a section per alert. Show at most 20 jobs per alert, then "and N more on the page →".
  5. Write one `outbox` row per subscriber, in the same transaction that moves the cursors, so no job is sent twice or skipped. The sender loop sends each row through the provider, writes `send` and deletes the row, retrying failures with backoff.
- **Click:** every job link is `alerts.workog.com/c/<send>/<slug>`. It records the click and redirects to `workog.com/jobs/<slug>?utm_source=alerts`, the job page on Workog, not the employer's site. That keeps the visit on Workog, where the employer gets the credit later.
- **More alerts:** every alert link on the site, for someone already subscribed, goes through the same page. It recognises them by the manage token in a cookie set only on `alerts.workog.com`, or asks for their email and sends a magic link. Then it adds the alert with one click, up to the plan's 10.
- **Manage:** `/m/<token>` lists your alerts and lets you pause or delete each one. It also has the cancel button (see Legal) and a link to Paddle's portal for card, invoices and plan changes. "Delete my data" cancels the subscription and removes the rows; it doesn't just flag them.
- **Stop emails:** a `List-Unsubscribe` header with one-click POST (RFC 8058, which Gmail and Yahoo require for bulk senders), plus a link in the footer. For a paid subscriber, this pauses the emails; it doesn't cancel billing. The page it lands on says so and offers the cancel button next to it, so nobody pays for emails they think they stopped.
- **Bounces and complaints:** a provider webhook sets `bounced_at` and stops all sends to that address.

### The email

- **Subject:** "12 new jobs: Cardiology in Bayern" for one alert, or "27 new jobs for your 3 alerts".
- **Each job:** title, employer, city, and the date it was first seen. These are the same fields as the site's job list, with the same visited-link styling.
- **Format:** plain HTML (no images, so no tracking pixel), with a text part. Opens aren't tracked; clicks are the metric.
- **Footer:** manage, stop emails, Impressum, privacy.
- **No email** on a day with no new matches. On a day with none, a subscriber who has had no email for 7 days gets a short "nothing new for Cardiology in Bayern this week; widen it?" note, linking to the broader page's alert. A paid subscription that goes silent for weeks gets canceled.

## Legal

Selling a subscription to consumers in Germany and the EU adds duties. Paddle covers the payment and tax parts; the rest is on us.

- **Paddle (as merchant of record) covers:** VAT in every EU country, invoices, the payment terms in its checkout, refunds and chargebacks.
- **Cancel button (§312k BGB):** every online consumer subscription in Germany needs a clearly labelled "Verträge hier kündigen" button, reachable without logging in, leading to a confirmation page. It goes in the site footer (on all pages, linking to `alerts.workog.com/cancel`) and on the manage page. The confirmation page asks only for the email and has one "Jetzt kündigen" button. Pressing it cancels via Paddle's API right away (no emailed link to click, which the law treats as an extra hurdle), shows the end date, and sends a confirmation email with the date and time. This is the one piece of the site footer that's legally required, not optional.
- **Right of withdrawal (14 days, digital service):** the checkout asks the subscriber to agree that the service starts now and that they lose the withdrawal right for the part already used. The free trial makes this mostly theoretical, but the checkbox and the withdrawal notice have to be there. Paddle's checkout has the consent built in; our terms repeat it.
- **Terms (AGB) and the Impressum and privacy policy:** three static pages on workog.com, in all languages. The terms describe the service: daily emails of new jobs matching your alerts, from public sources, with no guarantee of completeness. The privacy policy names Paddle, DigitalOcean and the email provider as processors (Paddle as an independent controller for payments), says what is stored and how to delete it, and gives the legal basis: the contract, Art. 6(1)(b) GDPR.
- **Data processing agreements:** accept DigitalOcean's and the email provider's.
- **What we sell is the emails, not the jobs.** The job data stays free on the site. The terms must not imply that subscribers get jobs nobody else sees.

## Making money from it

1. **Phase 1 (this spec): paid alerts.** €4.99/mo or €39/yr after a 7-day trial. Measure the funnel below, trial → paid conversion and churn.
2. **Phase 2: sponsored job in the digest.** One clearly marked "Featured" job at the top of the emails whose alert matches it. Hospitals and companies pay per week, priced on how many matching subscribers it reaches. For example: "your anaesthesiology Oberarzt job in front of the 640 doctors with an anaesthesiology or Bayern alert". The `subscriber × tag` counts are the sales sheet. With a paid list, keep it to one per email; people paying won't accept an ad-heavy digest. Telegram as a second channel goes in this phase too, at the same price; the Ukrainian audience in particular uses it more than email.
3. **Phase 3: a richer plan if the data asks for it.** A weekly market note for your search (how long jobs stay open, who is hiring most, from the archive), or folding the list into the doctor talent pool and the agency feeds.

**The risk to watch:** the jobs are public, so the subscription competes with "I'll just check the page" and with the free alerts on LinkedIn, Indeed and StepStone. What we have that they don't is precision (one specialty, one level, one region, across hospital sites they don't list) and one email with only new jobs. If trial → paid stays under about 10% after the first 200 trials, test a free tier (1 alert, weekly email) that upgrades to daily and to more alerts.

## What to measure

- Alert link clicks → subscribe page → checkout opened → trial started → first payment (the funnel, per page type, section and language)
- Trial → paid conversion, monthly churn, yearly vs monthly mix, revenue per month
- Active subscribers and alerts, by tag
- Emails sent, clicks per email, emails paused, and complaints per send (keep complaints under 0.1%)
- Visits to job pages from `utm_source=alerts`

The site has no analytics yet. Add a privacy-friendly one (Plausible, EU-hosted; no cookies) in the same PR, so the funnel's first step is counted.

## Cost

Running costs are small; Paddle's fee is the biggest cost.

| Item | 100 paying | 1,000 paying |
| --- | --- | --- |
| App Platform service + job, Managed Postgres | $21 | $21–35 (bigger instance if needed) |
| Email (one a day each) | $0 (Resend free) | $20 (Resend) |
| Paddle fees (half monthly, half yearly) | ~€45 | ~€450 |
| **Revenue, gross incl. VAT** | **~€410/mo** | **~€4,100/mo** |
| **Left after VAT (~19%), fees and running costs** | **~€280/mo** | **~€2,950/mo** |

Revenue counts a yearly subscriber as €3.25 a month. Income tax on what's left is on top.

## Milestones

1. **Site PR in `myorb/workog`:** `src/lib/alerts.ts` with tests, the two feeds, `robots.txt`, and analytics. The feeds go live straight away; they're harmless, and the service is then built against real data. The header link and the footer cancel link stay behind a `PUBLIC_ALERTS` build flag until the service is live.
2. **New repo `myorb/workog-alerts`:** the contract schema and its nightly check first, then the subscribe page with the 7-day preview, Paddle checkout and webhooks, manage, cancel, stop emails, daily send, click redirect and bounce webhook. Tested against the live v1 feeds and Paddle's sandbox.
3. **Launch:** Paddle account approval (they review the website and terms first, which takes a few days, so apply early), the alerts app and database, with a test restore from a backup, DNS (`alerts.`, and `mail.` with SPF/DKIM/DMARC), Impressum, terms and privacy pages, turn on the flag, then a week watching the numbers above with the alert webhook already in use for the pipeline.
4. **Phase 2:** Telegram bot and the sponsored slot.

## Open questions

- Who is the legal entity and address for the Impressum, the terms and the Paddle account? Paddle pays out to a business or a sole trader; in Germany that means at least a registered Gewerbe.
- Are €4.99/mo and €39/yr right, with one price for tech and medicine? A higher medical price is the first experiment worth running.
- Should alerts go only to job pages on Workog (better for building the business), or straight to the employer's apply link (one click less for the seeker)? This spec picks Workog. For paying subscribers, straight to the apply link may feel like better value.
