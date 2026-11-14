# Architecture: Job alerts service

Status: Draft · 2026-11-09. Goes with [job-alerts.md](job-alerts.md), which says *what* the service does (the contract, plans, flows, legal). This file says *how* `myorb/workog-alerts` is built: its parts, its data, and what keeps it correct when things fail. It moves to the new repo with the service half of the spec.

Where this file and the spec differ, this file wins; the differences are listed at the end under "Changes to the spec".

## The shape

One repo, one Docker image, three entry points on DigitalOcean App Platform, one Postgres database. No queue, no cache server, no frontend framework.

```
                 workog.com (static)                         Paddle                Resend (EU)
     /version.json  /feeds/v1/new-jobs.json  /feeds/v1/vocab.json   │ webhooks  ▲ API      │ webhooks  ▲ API
            ▲                 ▲                    ▲                 ▼           │          ▼           │
┌───────────┼─────────────────┼────────────────────┼──── alerts app (fra) ───────┼──────────────────────┼────┐
│           │                 │                    │                             │                      │    │
│   send (scheduled job, hourly)                web (service, 1 instance)                                     │
│   1. poll version  2. read feed + vocab       pages: /new /m/<token> /cancel /stop   webhooks: /hooks/*    │
│   3. match → outbox (one txn)                 /c/<send>/<slug> redirect   /health                         │
│   4. drain outbox  5. daily chores            sends transactional mail inline, outbox is the retry net    │
│           │                                              │                                                │
│           └──────────────────────┬───────────────────────┘                                                │
│                                  ▼                                                                        │
│                     Managed Postgres (fra1) ◀── migrate (pre-deploy job)                                  │
└───────────────────────────────────────────────────────────────────────────────────────────────────────────┘
```

| Entry point | App Platform kind | Command | Runs |
| --- | --- | --- | --- |
| `web` | service | `bun src/web/main.ts` | always, 1 instance |
| `send` | scheduled job, `0 * * * *` | `bun src/send/main.ts` | a few seconds an hour; a few minutes once a day |
| `migrate` | pre-deploy job | `bun src/db/migrate.ts` | before each deploy; a failure stops the deploy |

All three are the same image, so they always run the same code version.

## Code layout

```
src/
  core/        pure functions, no I/O: match, digest, cursor, plans, tag parsing
  contract/    zod schemas for version.json, new-jobs.json, vocab.json (a copy of the site's) + fetchFeed()
  db/          Bun.sql client, one file of queries per table, migrate.ts
  billing/     Paddle: verify webhook, get/cancel/resume subscription, status mapping
  mail/        Resend: send, verify webhook; templates/ (one function per email); render.ts
  web/         main.ts (Bun.serve routes), routes/*.ts, html.ts (escaping template tag), rate-limit.ts
  send/        main.ts: the hourly run, step by step, calling the modules above
  i18n/        en.ts, de.ts, es.ts, uk.ts: the service's own strings (pages and emails)
  ops/         log.ts (JSON lines), notify.ts (posts to ALERT_WEBHOOK_URL)
migrations/    0001_init.sql, 0002_….sql
test/          fixtures (feeds, Paddle and Resend events), integration tests against Postgres
```

**One rule:** `core/` imports nothing outside itself, and `billing/`, `mail/` and `contract/` don't import `db/`. Only `web/` and `send/` put the pieces together. That keeps matching and email building testable without a database, and is what makes the "move to Inngest later" option in the spec a wrap, not a rewrite.

**Libraries:** `zod` and nothing else at runtime. Bun has the HTTP server (`Bun.serve` with `routes`), the Postgres client (`Bun.sql`), crypto and the test runner. Paddle and Resend are called with `fetch`, not their SDKs: a dozen calls between them, and no SDK upgrades to chase.

**Pages** are server-rendered HTML strings from `web/html.ts`, a tagged template that escapes every value. The only script on any page is Paddle.js on `/new`, plus Plausible. Styles are one inline stylesheet that copies the site's look.

## Data

Full schema for the first migration. The spec's tables are kept; what's new is marked.

```sql
CREATE TABLE subscriber (
  id                     bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  email                  text NOT NULL UNIQUE,              -- lower-cased
  lang                   text NOT NULL,                     -- en | de | es | uk
  token                  text NOT NULL UNIQUE,              -- 32 random bytes, base64url; the manage "login"
  paddle_customer_id     text UNIQUE,
  paddle_subscription_id text UNIQUE,
  status                 text NOT NULL,                     -- trialing | active | past_due | paused | canceled
  paid_until             timestamptz,                       -- shown to the subscriber; sends follow status
  had_trial              boolean NOT NULL DEFAULT true,     -- new: one trial per email
  bounced_at             timestamptz,
  last_email_at          timestamptz,                       -- new: for the "nothing new this week" note
  created_at             timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE alert (
  id            bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  subscriber_id bigint NOT NULL REFERENCES subscriber ON DELETE CASCADE,
  tags          text[] NOT NULL,                            -- sorted, so equal filters compare equal
  path          text NOT NULL,
  label         jsonb NOT NULL,                             -- {"en": "Cardiology · Bavaria", "de": …}, from vocab
  cursor        timestamptz NOT NULL,                       -- the feed `run` this alert has been matched up to
  paused_at     timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (subscriber_id, tags)
);
CREATE INDEX ON alert USING gin (tags);

CREATE TABLE outbox (
  id            bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,   -- becomes send.id and the provider's idempotency key
  subscriber_id bigint REFERENCES subscriber ON DELETE CASCADE,
  kind          text NOT NULL,                             -- digest | welcome | quiet | link | cancel_receipt
  run           timestamptz,                               -- digest and quiet only
  to_email      text NOT NULL,
  payload       jsonb NOT NULL,                            -- data for the template, not rendered HTML
  attempts      int NOT NULL DEFAULT 0,
  next_try_at   timestamptz NOT NULL DEFAULT now(),
  last_error    text,
  UNIQUE (subscriber_id, kind, run)                         -- one digest per person per run, even if two jobs overlap
);

CREATE TABLE send (
  id            bigint PRIMARY KEY,                         -- = outbox.id
  subscriber_id bigint REFERENCES subscriber ON DELETE SET NULL,   -- kept for stats after "delete my data"
  kind          text NOT NULL,
  run           timestamptz,
  jobs          int NOT NULL DEFAULT 0,
  sent_at       timestamptz NOT NULL DEFAULT now(),
  provider_id   text
);

CREATE TABLE click (send_id bigint NOT NULL REFERENCES send ON DELETE CASCADE, slug text NOT NULL, at timestamptz NOT NULL DEFAULT now());

-- new: the feed runs the service has processed. Inserting the row is the "is this run new?" check.
CREATE TABLE feed_run (run timestamptz PRIMARY KEY, jobs int NOT NULL, matched int, emails int, at timestamptz NOT NULL DEFAULT now());

-- new: Paddle and Resend event ids already handled
CREATE TABLE webhook_event (id text PRIMARY KEY, source text NOT NULL, type text NOT NULL, at timestamptz NOT NULL DEFAULT now());

-- new: proof of each cancellation (§312k asks for a confirmation with date and time)
CREATE TABLE cancellation (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  email text NOT NULL, kind text NOT NULL, reason text,
  requested_end text NOT NULL,                              -- 'earliest' or a date
  effective_end timestamptz,                                -- null when no subscription matched
  at timestamptz NOT NULL DEFAULT now()
);

-- new: one row per day per tag, so the Phase 2 sales sheet has history from day one
CREATE TABLE stats_daily (day date NOT NULL, tag text NOT NULL, subscribers int NOT NULL, alerts int NOT NULL, PRIMARY KEY (day, tag));
```

- **Retention:** `webhook_event` rows older than 30 days are deleted; `click` and `send` stay (they hold no personal data once the subscriber is gone); `cancellation` rows stay 3 years (the limitation period) and are then deleted.
- **"Delete my data"** cancels at Paddle, then deletes the `subscriber` row. Alerts and pending outbox rows go with it; `send` rows lose their `subscriber_id`.

## Correctness rules

These are the invariants the code and tests are built around.

1. **Paddle is the truth about money.** A webhook is only a hint that subscription X changed: the handler fetches X from Paddle's API and writes what it returns. Out-of-order or replayed webhooks can't leave a wrong status, and a missed one is caught by the daily reconcile (below).
2. **Who gets email is decided by `status` alone:** `trialing`, `active` or `past_due`, and `bounced_at` empty. Paddle keeps a subscription `active` until the end of a scheduled cancellation, so `paid_until` doesn't need checking at send time.
3. **The cursor is the feed's `run`.** A new job's `firstSeenAt` is exactly the run's `startedAt` (`scripts/fetch.ts`), so an alert matched up to run R gets, next time, the jobs with `firstSeenAt > R`. After a run, *every* active, unpaused alert's cursor moves to R, matched or not. A new alert starts at the latest run. Resuming a paused alert, or a subscriber coming back, moves the cursor to the latest run too, so nobody gets a week of backlog at once. **This needs one line added to the contract** (see the end).
4. **Cursors move in the same transaction that writes the outbox rows.** Either both happen or neither does.
5. **A run is processed once.** `INSERT INTO feed_run … ON CONFLICT DO NOTHING RETURNING run` starts that transaction; if it returns nothing, another job got there first and this one only drains the outbox. Together with `UNIQUE (subscriber_id, kind, run)` on `outbox`, two overlapping jobs can't double-send.
6. **An email is sent at most once, and retried until it is.** Rows are claimed with a lease:
   ```sql
   UPDATE outbox SET attempts = attempts + 1, next_try_at = now() + interval '10 minutes'
   WHERE id IN (SELECT id FROM outbox WHERE next_try_at <= now() ORDER BY id LIMIT 100 FOR UPDATE SKIP LOCKED)
   RETURNING *;
   ```
   Each row goes to Resend with `Idempotency-Key: outbox-<id>`. On success, one transaction inserts `send` (same id) and deletes the row. If the process dies after Resend accepted it, the lease runs out, the row is retried, and Resend recognises the key. Failures back off (10 min, 30 min, 2 h, 6 h); after 6 attempts the row stays with `last_error` and `notify` fires.
7. **The feed is validated before anything is matched.** A feed that fails the zod schema, or has 0 jobs while the previous run had thousands, stops the run before step 3, notifies, and leaves cursors where they are. The next good feed covers the gap (7 days).

## The hourly run (`send/main.ts`)

```
fetch /version.json ─ same run as the latest feed_run? ─ yes ─▶ drain outbox, done
        │ no
fetch new-jobs.json + vocab.json, validate (rule 7)
apply vocab aliases to stored alerts (rewrite tags, merge duplicates)
BEGIN
  INSERT feed_run (rule 5)
  load active alerts; match in memory: tag → Set<job index>, intersect smallest set first, keep firstSeenAt > cursor
  group by subscriber → one digest payload per person (≤ 20 jobs per alert, ≤ 100 per email)
  INSERT outbox rows; UPDATE alert cursors (rule 3, 4)
COMMIT
drain outbox (rule 6), at Resend's rate limit
once a day (first run after 05:00 UTC): quiet notes, stats_daily, reconcile, retention cleanup
```

- **Sizes:** the feed is ~10k jobs, 3 MB; the index is a few MB in memory. 1,000 subscribers × 10 alerts is 10k intersections of small sets: well under a second. The whole run is bound by sending, which at Resend's batch endpoint (100 per call) is a few minutes for thousands of emails.
- **The 100-job cap per email** keeps the HTML under Gmail's 102 KB clipping limit; the rest is behind "and N more on the page →".
- **Vocab aliases** are applied by this job every run, not only when someone subscribes, so a renamed slug fixes every alert on the next run.
- **Reconcile:** list the Paddle subscriptions updated in the last 48 hours and upsert each (rule 1). Catches anything a webhook missed.
- **The quiet note** goes to an active subscriber whose `last_email_at` is over 7 days ago, at most once a week.
- **Heartbeat:** if `/version.json` hasn't moved for 30 hours, `notify` once. That's the site's pipeline stalling, seen from the outside.

## The web service

| Route | Auth | Does |
| --- | --- | --- |
| `GET /new?v&lang&path&tags` | none (cookie if present) | validate tags against cached vocab; show filter, "N jobs in 7 days" and 5 newest from the cached feed; email field (see "Subscribe" below) |
| `POST /new` | none, rate-limited | known email → magic-link email; new email → open Paddle checkout pre-filled with that email and the right price |
| `GET /welcome` | none | after checkout: "check your inbox", no data shown |
| `GET /m/<token>` | token | list alerts, pause/resume/delete, cancel, "delete my data", link to Paddle portal; sets the cookie |
| `POST /m/<token>/…` | token | the actions above; `add` takes tags/path/lang from a magic link |
| `GET /cancel`, `POST /cancel` | none, rate-limited | §312k form → `cancellation` row, Paddle cancel, receipt page, receipt email |
| `GET /stop/<token>`, `POST /stop/<token>` | token | RFC 8058 one-click: pause all alerts; the page offers cancel next to it |
| `GET /c/<send>/<slug>` | none | record click, 302 to `SITE_URL/jobs/<slug>?utm_source=alerts` |
| `POST /hooks/paddle` | `Paddle-Signature` HMAC | dedupe on event id, then rule 1 |
| `POST /hooks/resend` | Svix signature | dedupe; bounce or complaint → `bounced_at` |
| `GET /health` | none | `SELECT 1`; App Platform checks it |

- **Feed cache in `web`:** the feed and vocab are held in memory and refreshed when `/version.json` changes, checked at most every 10 minutes. They're public and 3 MB, so there's nothing to share through the database.
- **Transactional email** (welcome, magic link, cancel receipt) is written to `outbox` and sent inline in the same request. If Resend fails, the row stays and the next hourly run retries it. One sending path, one retry rule.
- **The checkout race:** the overlay's success callback only sends the visitor to `/welcome`. The subscriber is created by the webhook, which usually arrives within seconds; the welcome email carries the manage link. Nothing on `/welcome` depends on the webhook having arrived.

## Subscribe: email first

The spec opens Paddle checkout straight away and learns the email from the webhook. This design asks for the email on `/new` first, then opens checkout pre-filled with it. That fixes two problems the spec leaves open, at one cost:

- **Double subscriptions.** Someone who already pays but has no cookie (other browser, phone) would otherwise check out again and pay twice. With email first, a known address gets a magic link that adds the alert to the existing subscription instead.
- **Repeat trials.** An address that already had a trial gets the plan's no-trial price (Paddle sets the trial on the price, so each plan has two prices).
- **Enumeration, accepted.** A known address gets "check your inbox" and a new one gets checkout, so the page does tell whether an address subscribes. That's the price of the two fixes above. Rate limits keep it to a few guesses a minute, and the answer only says someone gets job emails. Former subscribers go to checkout like new ones.

The email isn't stored until the webhook creates the subscriber. Paddle's checkout still collects the card and confirms the address is real.

## Security

- **Tokens:** `token` is 32 random bytes from `crypto.getRandomValues`, compared in constant time. It's in every email footer, so it's stored as is; "delete my data" removes it, and a "new link" button on the manage page rotates it.
- **Cookie:** `t=<token>`, `HttpOnly; Secure; SameSite=Lax; Path=/`, on `alerts.workog.com` only, 1 year.
- **CSRF:** every state-changing action is a POST to a URL that holds the token, so a forged form would have to know it. The cookie alone never authorises a change; `/new` with a cookie only pre-fills the "add alert" button, which posts to `/m/<token>/add`.
- **Malicious cancellation.** `/cancel` needs only an email, by law, so anyone who knows an address can cancel it. The default end date is "earliest", which Paddle executes as a scheduled cancellation at the period end; the receipt email links to the manage page, where "keep my subscription" removes the scheduled change. Nothing is lost until the period ends.
- **Rate limits:** in memory, per IP, in `web` (one instance): `/cancel` and `POST /new` 5 a minute, `/c/` 60 a minute. If `web` ever runs two instances, these become per instance, which is still fine.
- **Redirect:** `/c/` only redirects to `SITE_URL/jobs/` plus a slug matching `^[a-z0-9-]{1,200}$`. It is not an open redirect.
- **Headers:** a CSP that allows only self, Paddle's checkout domains and Plausible; `X-Frame-Options: DENY` except where Paddle needs it.
- **Secrets** are App Platform encrypted env vars, never in the repo: `DATABASE_URL`, `PADDLE_API_KEY`, `PADDLE_WEBHOOK_SECRET`, `RESEND_API_KEY`, `RESEND_WEBHOOK_SECRET`, `ALERT_WEBHOOK_URL`. Public config: `PADDLE_CLIENT_TOKEN`, the four price ids, `SITE_URL`, `ALERTS_URL`, `PADDLE_ENV` (`sandbox` | `production`).
- **Database:** trusted sources only (the app). Manual queries go through the App Platform console of the `web` component, not by opening the database to a laptop.

## Languages

The service has its own strings in `src/i18n/{en,de,es,uk}.ts`: page text, email text, subject lines. The same keys in each file, checked by a test. Tag labels come from vocab and are stored per alert in `label`, so the service never translates a tag itself. A subscriber's emails use `subscriber.lang`, taken from the page they first subscribed on and changeable on the manage page.

## Operations

- **Logs:** one JSON line per event to stdout (`{"at", "level", "msg", …}`), read in App Platform's log view. No email addresses in logs: subscriber id only.
- **Notify** (`ALERT_WEBHOOK_URL`, the same Slack/Discord/Telegram hook as the site's pipeline): failed or invalid feed, a run that matched 0 alerts while the previous matched hundreds, outbox rows out of retries, complaint rate over 0.1% for a run, webhook signature failures over 10 an hour, the 30-hour heartbeat.
- **Daily summary** to the same hook after the send: run, jobs, emails sent, failures, new trials, conversions, cancels. That's the dashboard until there's a reason for a real one.
- **Stats** for the funnel: alert link click and `/new` view from Plausible (on both domains); checkout opened from a Plausible event; trial, paid, churn from the database. `bun run stats` prints the spec's "What to measure" list from SQL.
- **Backups:** Managed Postgres daily backups and 7-day point-in-time restore; a test restore before launch (spec, milestone 3). If everything were lost, subscriptions and emails come back from Paddle's API; only alerts would be lost.

## Environments and deploys

| | Database | Paddle | Email | Feed |
| --- | --- | --- | --- | --- |
| Local | Postgres 17 in Docker | sandbox; webhooks through a tunnel or Paddle's simulator | Resend test addresses | `FEED_URL` → the live site, or `test/fixtures` |
| CI | Postgres service container | recorded events in `test/fixtures` | fake | fixtures, plus the nightly check against live |
| Production | Managed Postgres, `fra1` | production | Resend EU, `mail.workog.com` | `https://workog.com` |

There's no staging app: the sandbox and fixtures cover it, and it would double the database bill. Revisit if a second person works on it.

- **Deploy:** push to `main` → GitHub Actions runs the tests → App Platform builds the image, runs `migrate`, then rolls `web` over once `/health` passes. A failed migration or health check keeps the old deployment.
- **Migrations** are plain SQL files applied in order, each in a transaction, recorded in `schema_migration`. Because `migrate` runs while the old code is still serving, every migration must work with both: add first, use in the next deploy, remove in the one after.
- **CI:** `bun test` (unit and integration against Postgres) on every push; a nightly workflow that validates the live `/feeds/v1/*` against `src/contract` and fails loudly.

## Testing

| Layer | What | How |
| --- | --- | --- |
| `core` | matching, cursor rule, digest grouping and caps, tag parsing | unit tests, table-driven |
| `contract` | schemas accept the site's real files | fixtures copied from a real build; nightly check against live |
| `mail` | every template in every language renders, has a text part, stays under 100 KB at the caps | snapshot tests |
| `billing` | signature check, status mapping for every Paddle status | recorded events |
| `db` + `send` | a full run: feed in → outbox rows → cursors moved; same run twice → no new rows; crash between claim and send → resent once | integration tests on real Postgres |
| `web` | each route's happy path and refusal (bad token, bad tags, unknown email on `/cancel`) | `Bun.serve` on a random port, `fetch` |
| End to end | checkout → webhook → welcome → daily email → click → cancel | by hand in the Paddle sandbox before launch |

## When to change this

- **Over ~10k subscribers or the job hitting its time limit:** split the drain out of `send` into its own job running every 10 minutes. Nothing else changes: the outbox already allows several senders.
- **More timed follow-ups** (trial ending, win-back): move them into a workflow tool, as the spec says.
- **Over ~50k emails a month:** swap `mail/resend.ts` for SES; the rest only sees `send(email)`.
- **Telegram (Phase 2):** a `channel` column on `outbox` and `send`, and a second sender next to Resend. Matching doesn't change.

## Changes to the spec

1. **Contract, `new-jobs.json`:** add "A job first seen in run R has `firstSeenAt` equal to R." It's true today (`scripts/fetch.ts` gives new jobs the run's `startedAt`) and the cursor depends on it, so the site's feed test should check it.
2. **Data:** new tables `feed_run`, `webhook_event`, `cancellation`, `stats_daily`; `outbox` gets `kind`, `to_email`, `last_error` and a unique key; `send.id` is the outbox id; `alert.label` is per language.
3. **Sending is decided by `status`, not `paid_until`** (rule 2). `paid_until` is for display only.
4. **Webhooks re-fetch the subscription** instead of applying the event body (rule 1), plus a daily reconcile.
5. **Subscribe asks for the email before checkout** ("Subscribe: email first"), with two Paddle prices per plan.
6. **Vocab aliases are applied by the hourly job**, not only on subscribe.
7. **Cancel defaults to the end of the period**, undoable from the manage page until then.

## Open questions

- **Email first, or checkout first as the spec has it?** Email first is one more step before checkout, which may cost some conversion, and it reveals whether an address subscribes. Without it, double subscriptions and repeat trials need manual refunds.
- **Do we keep `cancellation` rows for 3 years** after "delete my data"? This design says yes (legal obligation to prove the cancellation, Art. 6(1)(c) GDPR); the privacy policy has to say so.
- **Can an App Platform scheduled job overlap itself** if a run takes over an hour? The design doesn't depend on the answer (rules 5 and 6), but it decides whether the drain needs splitting sooner.
