/**
 * Patterns in the daily counts worth a sentence: a record high, a streak, a
 * rank among peers, a share of the market, growth ahead of or behind the
 * market. Pure functions that return typed insights, never prose; the
 * wording lives in the messages' `insights` block (see insightText), so the
 * same finding reads naturally on a page in any language, on a share image
 * and in a LinkedIn post.
 *
 * Each insight carries a score for how notable it is, so a channel can take
 * the strongest one to three.
 */
import type { Lang } from "./locale.ts";
import { t } from "./i18n.ts";
import type { Change } from "./trend.ts";
import { comparable, roundPct } from "./trend.ts";
import { sharePct } from "./reports.ts";

export type PeerKind = "companies" | "countries" | "specialties" | "states";
export type Section = "tech" | "medicine";

export type Insight = { score: number } & (
  | { kind: "record"; high: boolean; days: number }
  | { kind: "streak"; up: boolean; days: number }
  | { kind: "rank"; rank: number; of: number; peers: PeerKind }
  | { kind: "share"; pct: number; section: Section }
  | { kind: "outpaced"; pct: number; totalPct: number; days: number; section: Section }
  | { kind: "top"; label: string; count: number; pct: number }
);

export type InsightKind = Insight["kind"];
export const insightKinds: InsightKind[] = ["record", "streak", "rank", "share", "outpaced", "top"];

/** A record needs this much history, or every new key would be at its high */
export const RECORD_MIN_DAYS = 14;
/** Shorter runs of daily gains are noise */
export const STREAK_MIN_DAYS = 5;
/** Ranks below this aren't worth a sentence */
export const RANK_MAX = 10;
/** Shares under this aren't worth a sentence */
export const SHARE_MIN_PCT = 3;
/** Growth this many points ahead of or behind the market is worth a sentence */
export const OUTPACE_MIN_POINTS = 5;

/**
 * The count is higher (or lower) than on every earlier day in `history`,
 * oldest first, the current count last. Ties don't count as records.
 */
export function recordInsight(history: { date: string; value: number | undefined }[]): Insight | undefined {
  const known = history.filter((h): h is { date: string; value: number } => h.value !== undefined);
  if (known.length < 2) return undefined;
  const days = Math.round((Date.parse(known.at(-1)!.date) - Date.parse(known[0]!.date)) / 86_400_000);
  if (days < RECORD_MIN_DAYS) return undefined;
  const now = known.at(-1)!.value;
  const before = known.slice(0, -1).map((h) => h.value);
  if (now > Math.max(...before)) return { kind: "record", high: true, days, score: 60 + Math.min(days, 90) / 3 };
  if (now > 0 && now < Math.min(...before)) return { kind: "record", high: false, days, score: 45 + Math.min(days, 90) / 3 };
  return undefined;
}

/** Days in a row, up to now, on which the count rose (or fell) from the day before */
export function streakInsight(values: (number | undefined)[]): Insight | undefined {
  const known = values.filter((v): v is number => v !== undefined);
  let run = 0;
  let dir = 0;
  for (let i = known.length - 1; i > 0; i--) {
    const step = Math.sign(known[i]! - known[i - 1]!);
    if (step === 0 || (dir && step !== dir)) break;
    dir = step;
    run++;
  }
  if (run < STREAK_MIN_DAYS) return undefined;
  return { kind: "streak", up: dir > 0, days: run, score: 30 + run * 4 };
}

/** The key's place among its peers by count, ties broken by key like the report tables */
export function rankInsight(peers: Map<string, number> | Record<string, number>, key: string, kind: PeerKind): Insight | undefined {
  const entries = peers instanceof Map ? [...peers] : Object.entries(peers);
  const sorted = entries.filter(([, v]) => v > 0).sort(([ka, a], [kb, b]) => b - a || ka.localeCompare(kb));
  const rank = sorted.findIndex(([k]) => k === key) + 1;
  if (rank < 1 || rank > RANK_MAX || sorted.length < 3) return undefined;
  return { kind: "rank", rank, of: sorted.length, peers: kind, score: 55 - rank * 4 };
}

export function shareInsight(count: number, total: number, section: Section): Insight | undefined {
  const pct = sharePct(count, total);
  if (pct < SHARE_MIN_PCT || pct >= 100) return undefined;
  return { kind: "share", pct, section, score: 20 + Math.min(pct, 50) / 2 };
}

/** The subject's change compared with its whole section's over the same span */
export function outpacedInsight(change: Change | undefined, total: Change | undefined, section: Section): Insight | undefined {
  if (!change || !total) return undefined;
  const pct = roundPct(change.pct);
  const totalPct = roundPct(total.pct);
  const gap = Math.abs(pct - totalPct);
  if (gap < OUTPACE_MIN_POINTS) return undefined;
  return { kind: "outpaced", pct, totalPct, days: change.days, section, score: 25 + Math.min(gap, 50) };
}

/** The biggest part of the subject, e.g. the city with most of a company's jobs */
export function topInsight(parts: Map<string, number> | undefined, count: number, label: (key: string) => string): Insight | undefined {
  if (!parts || !count) return undefined;
  const [key, top] = [...parts].sort(([ka, a], [kb, b]) => b - a || ka.localeCompare(kb))[0] ?? [];
  if (!key || !top || parts.size < 2) return undefined;
  const pct = sharePct(top, count);
  return { kind: "top", label: label(key), count: top, pct, score: 10 + pct / 5 };
}

/** Strongest first; equal scores keep the order the patterns were checked in */
export const ranked = (insights: (Insight | undefined)[]): Insight[] =>
  insights.filter((i): i is Insight => !!i).sort((a, b) => b.score - a.score);

/** The series' history in the snapshots safe to compare, with today's count last */
export function seriesHistory<S extends { date: string; open: number }>(
  snapshots: S[],
  value: (s: S) => number | undefined,
  count: number,
  today?: string,
): { date: string; value: number | undefined }[] {
  const history = comparable(snapshots).map((s) => ({ date: s.date, value: value(s) }));
  const last = history.at(-1);
  // the latest snapshot is today's count already; otherwise today's count extends it
  if (last && (!today || last.date >= today)) return [...history.slice(0, -1), { date: last.date, value: count }];
  return today ? [...history, { date: today, value: count }] : history;
}

/** A stable small number from a key, so a page's wording varies from its neighbors' but never between builds */
export function variant(key: string, choices: number): number {
  let h = 0;
  for (const c of key) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return h % Math.max(1, choices);
}

const pick = <F>(options: F[], key: string): F => options[variant(key, options.length)]!;

/** One insight as a sentence, about `name` (the subject's display name), in `lang` */
export function insightText(insight: Insight, name: string, lang: Lang, key = name): string {
  const m = t(lang).insights;
  switch (insight.kind) {
    case "record":
      return pick(m.record, key)(name, insight.high, insight.days);
    case "streak":
      return pick(m.streak, key)(name, insight.up, insight.days);
    case "rank":
      return pick(m.rank, key)(name, insight.rank, insight.of, insight.peers);
    case "share":
      return pick(m.share, key)(name, insight.pct, insight.section);
    case "outpaced":
      return pick(m.outpaced, key)(name, insight.pct, insight.totalPct, insight.days, insight.section);
    case "top":
      return pick(m.top, key)(insight.label, insight.count, insight.pct);
  }
}

/** The strongest `limit` insights as sentences, at most one per kind */
export function insightSentences(insights: Insight[], name: string, lang: Lang, key = name, limit = 3): string[] {
  const seen = new Set<InsightKind>();
  return ranked(insights)
    .filter((i) => !seen.has(i.kind) && seen.add(i.kind))
    .slice(0, limit)
    .map((i) => insightText(i, name, lang, key));
}
