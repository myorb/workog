/**
 * Tells search engines which job pages changed in the last run, once the site
 * built from it is live. Reads data/runs/changes.json written by fetch.ts.
 *
 *   bun scripts/ping.ts             # wait for the deploy, then ping
 *   bun scripts/ping.ts --no-wait   # ping now
 *
 * - IndexNow (Bing, Yandex, Seznam, Naver): every opened, closed and dropped job.
 *   The key is public by design and served from public/<key>.txt.
 * - Google Indexing API, which accepts pages with JobPosting markup: opened and
 *   closed jobs as URL_UPDATED (closed pages are noindex now), dropped ones as
 *   URL_DELETED. Needs GOOGLE_INDEXING_KEY, a service account's JSON key; the
 *   service account must be an owner of the site in Search Console. The default
 *   quota is 200 URLs a day, so new jobs go first and the rest are skipped.
 *
 * A failed ping is logged and never fails the process: search engines still
 * find the changes through the sitemap.
 */
import { createSign } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { JobChangesSchema } from "./fetch.ts";

const DATA_DIR = join(import.meta.dirname, "..", "data");
const SITE = process.env.SITE_URL || "https://workog.com";
export const INDEXNOW_KEY = "bf6f1d24d876292da4961a3ae984ea98";
const GOOGLE_DAILY_QUOTA = 200;
/** App Platform usually deploys in 3-6 minutes */
const DEPLOY_TIMEOUT_MS = 20 * 60 * 1000;
const POLL_MS = 30 * 1000;

type Changes = ReturnType<typeof JobChangesSchema.parse>;

const jobUrl = (slug: string) => new URL(`/jobs/${slug}`, SITE).href;

/** Resolves true once the live site was built from the run that started at `startedAt` */
async function waitForDeploy(startedAt: string): Promise<boolean> {
  const deadline = Date.now() + DEPLOY_TIMEOUT_MS;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(new URL("/version.json", SITE), { cache: "no-store" });
      if (res.ok && ((await res.json()) as { run: string | null }).run === startedAt) return true;
    } catch {
      // not reachable yet, keep polling
    }
    await new Promise((resolve) => setTimeout(resolve, POLL_MS));
  }
  return false;
}

/** Google's notifications in quota order: new jobs first, then closed, then dropped */
export function googleNotifications(changes: Changes, quota = GOOGLE_DAILY_QUOTA) {
  return [
    ...changes.opened.map((slug) => ({ url: jobUrl(slug), type: "URL_UPDATED" as const })),
    ...changes.closed.map((slug) => ({ url: jobUrl(slug), type: "URL_UPDATED" as const })),
    ...changes.dropped.map((slug) => ({ url: jobUrl(slug), type: "URL_DELETED" as const })),
  ].slice(0, quota);
}

async function pingIndexNow(urls: string[]): Promise<void> {
  const host = new URL(SITE).host;
  // the protocol takes up to 10,000 URLs per request
  for (let i = 0; i < urls.length; i += 10_000) {
    const res = await fetch("https://api.indexnow.org/indexnow", {
      method: "POST",
      headers: { "Content-Type": "application/json; charset=utf-8" },
      body: JSON.stringify({
        host,
        key: INDEXNOW_KEY,
        keyLocation: new URL(`/${INDEXNOW_KEY}.txt`, SITE).href,
        urlList: urls.slice(i, i + 10_000),
      }),
    });
    if (!res.ok) throw new Error(`IndexNow ${res.status}: ${await res.text()}`);
  }
  console.log(`IndexNow: submitted ${urls.length} URLs`);
}

const base64url = (data: string | Buffer) => Buffer.from(data).toString("base64url");

/** OAuth token for a service account, from a self-signed JWT */
async function googleToken(key: { client_email: string; private_key: string }): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const header = base64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claims = base64url(
    JSON.stringify({
      iss: key.client_email,
      scope: "https://www.googleapis.com/auth/indexing",
      aud: "https://oauth2.googleapis.com/token",
      iat: now,
      exp: now + 3600,
    }),
  );
  const signature = createSign("RSA-SHA256").update(`${header}.${claims}`).sign(key.private_key, "base64url");
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: `${header}.${claims}.${signature}` }),
  });
  if (!res.ok) throw new Error(`Google token ${res.status}: ${await res.text()}`);
  return ((await res.json()) as { access_token: string }).access_token;
}

async function pingGoogle(changes: Changes, keyJson: string): Promise<void> {
  const token = await googleToken(JSON.parse(keyJson));
  const notifications = googleNotifications(changes);
  const total = changes.opened.length + changes.closed.length + changes.dropped.length;
  let sent = 0;
  for (const notification of notifications) {
    const res = await fetch("https://indexing.googleapis.com/v3/urlNotifications:publish", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(notification),
    });
    if (res.status === 429) {
      console.warn("Google Indexing API: daily quota used up");
      break;
    }
    if (!res.ok) throw new Error(`Google Indexing API ${res.status} for ${notification.url}: ${await res.text()}`);
    sent++;
  }
  console.log(`Google Indexing API: notified ${sent} of ${total} changed URLs`);
}

async function main() {
  const changes = JobChangesSchema.parse(JSON.parse(await readFile(join(DATA_DIR, "runs", "changes.json"), "utf8")));
  const urls = [...changes.opened, ...changes.closed, ...changes.dropped].map(jobUrl);
  if (!urls.length) {
    console.log("No job pages changed, nothing to ping");
    return;
  }

  if (!process.argv.includes("--no-wait")) {
    console.log(`Waiting for ${SITE} to serve the run from ${changes.startedAt}…`);
    if (!(await waitForDeploy(changes.startedAt))) {
      console.error(`The deploy didn't go live within ${DEPLOY_TIMEOUT_MS / 60_000} minutes; not pinging`);
      process.exitCode = 1;
      return;
    }
  }

  await pingIndexNow(urls).catch((err) => console.error(String(err)));
  const googleKey = process.env.GOOGLE_INDEXING_KEY;
  if (googleKey) await pingGoogle(changes, googleKey).catch((err) => console.error(String(err)));
  else console.log("GOOGLE_INDEXING_KEY not set, Google not notified");
}

if (import.meta.main) await main();
