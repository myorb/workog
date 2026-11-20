/**
 * The insights for a hub page's subject (a company, country, specialty or
 * state), from the daily snapshots: what Insights.astro writes under the
 * page's summary line and what the share image's last line says.
 */
import { insightText, outpacedInsight, rankInsight, ranked, recordInsight, seriesHistory, shareInsight, streakInsight, topInsight, type Insight, type PeerKind, type Section } from "./insights.ts";
import { seriesSnapshots, seriesValue, type Series } from "./series.ts";
import { changeOver } from "./trend.ts";
import type { Lang } from "./locale.ts";

const peerKinds: Record<string, PeerKind> = { companies: "companies", countries: "countries", specialties: "specialties", states: "states" };

export interface HubSubject {
  series: Series & { key: string };
  /** the page's own count, which may be newer than the last snapshot */
  count: number;
  /** what the subject's jobs split into, e.g. a company's cities, for the "largest share" sentence */
  parts?: Map<string, number>;
  partLabel?: (key: string) => string;
}

export async function hubInsights({ series, count, parts, partLabel = (k) => k }: HubSubject): Promise<Insight[]> {
  const section: Section = series.section;
  const snapshots = await seriesSnapshots(series);
  const value = seriesValue(series);
  const latest = snapshots.at(-1);
  const history = seriesHistory(snapshots, value, count);
  const peerKind = series.dim ? peerKinds[series.dim] : undefined;
  const peers = latest && series.dim && peerKind ? { ...(latest[series.dim] as Record<string, number>), [series.key]: count } : undefined;
  return ranked([
    recordInsight(history),
    streakInsight(history.map((h) => h.value)),
    peers && peerKind ? rankInsight(peers, series.key, peerKind) : undefined,
    latest ? shareInsight(count, latest.open, section) : undefined,
    latest ? outpacedInsight(changeOver(snapshots, value, count), changeOver(snapshots, (s) => s.open, latest.open), section) : undefined,
    topInsight(parts, count, partLabel),
  ]);
}

/**
 * For a monthly report: the strongest records and streaks among the month's
 * largest rows of one dimension (companies, specialties), as of its last day.
 * `snapshots` must end with the month's last snapshot.
 */
export function leaderInsights<S extends { date: string; open: number }>(
  snapshots: S[],
  dim: string,
  rows: { key: string; label: string; to: number }[],
  lang: Lang,
  limit = 2,
): string[] {
  const value = (key: string) => (s: S) => ((s as Record<string, unknown>)[dim] as Record<string, number> | undefined)?.[key];
  const found = rows.flatMap((row) => {
    const history = seriesHistory(snapshots, value(row.key), row.to);
    return ranked([recordInsight(history), streakInsight(history.map((h) => h.value))]).map((insight) => ({ insight, row }));
  });
  return found
    .sort((a, b) => b.insight.score - a.insight.score)
    .slice(0, limit)
    .map(({ insight, row }) => insightText(insight, row.label, lang, row.key));
}
