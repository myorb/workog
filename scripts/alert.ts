/**
 * Sends a webhook alert to ALERT_WEBHOOK_URL (Slack, Discord or Telegram).
 *
 *   bun scripts/alert.ts                  # report fallback sources from runs/latest.json
 *   bun scripts/alert.ts "Build failed"   # send this message instead
 *
 * Telegram: use https://api.telegram.org/bot<token>/sendMessage?chat_id=<id>
 * Without ALERT_WEBHOOK_URL the alert is only printed.
 */
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { type Run, RunSchema } from "../src/lib/schema.ts";

export function formatRunAlert(run: Pick<Run, "startedAt" | "sources">): string | undefined {
  const fallbacks = run.sources.filter((s) => s.status === "fallback");
  if (!fallbacks.length) return undefined;
  const lines = fallbacks.map((s) => {
    const label = s.broken ? `🚨 BROKEN ${s.company}` : `⚠️ ${s.company}`;
    const streak = s.fallbackStreak > 1 ? `, ${s.fallbackStreak} runs in a row` : "";
    return `${label} (${s.source}): ${s.reason ?? "fallback"}. Fetched ${s.fetched}, invalid ${s.invalid}; kept ${s.open} open jobs from the previous run${streak}.`;
  });
  return [`Workog run ${run.startedAt}: ${fallbacks.length} source(s) fell back`, ...lines].join("\n");
}

function runLink(): string | undefined {
  const { GITHUB_SERVER_URL, GITHUB_REPOSITORY, GITHUB_RUN_ID } = process.env;
  if (!GITHUB_SERVER_URL || !GITHUB_REPOSITORY || !GITHUB_RUN_ID) return undefined;
  return `${GITHUB_SERVER_URL}/${GITHUB_REPOSITORY}/actions/runs/${GITHUB_RUN_ID}`;
}

async function send(text: string): Promise<void> {
  const url = process.env.ALERT_WEBHOOK_URL;
  console.log(text);
  if (!url) {
    console.log("(ALERT_WEBHOOK_URL not set, alert not sent)");
    return;
  }
  const host = new URL(url).hostname;
  // Discord expects `content`; Slack and Telegram's sendMessage take `text`
  const body = /(^|\.)discord(app)?\.com$/.test(host) ? { content: text } : { text };
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new Error(`webhook returned HTTP ${res.status}: ${await res.text()}`);
}

async function main() {
  const message = process.argv.slice(2).join(" ");
  let text: string | undefined;
  if (message) {
    text = message;
  } else {
    const file = join(import.meta.dirname, "..", "data", "runs", "latest.json");
    const run = RunSchema.parse(JSON.parse(await readFile(file, "utf8")));
    text = formatRunAlert(run);
  }
  if (!text) {
    console.log("All sources ok, no alert.");
    return;
  }
  const link = runLink();
  await send(link ? `${text}\n${link}` : text);
}

if (import.meta.main) await main();
