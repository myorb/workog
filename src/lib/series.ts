/**
 * The change behind a page's dated summary line, shared by AsOf.astro, the
 * share images and the insights so all three always show the same number.
 */
import type { MedicineSnapshotDimension, SnapshotDimension } from "./analytics.ts";
import { getLatestRun, getMedicineSnapshots, getSnapshots } from "./jobs.ts";
import { changeOver, type Change } from "./trend.ts";

export type Series =
  | { section: "tech"; dim?: SnapshotDimension | "remote"; key?: string }
  | { section: "medicine"; dim?: MedicineSnapshotDimension; key?: string };

export type Snapshot = { date: string; open: number; remote?: number; [dim: string]: unknown };

export const seriesSnapshots = async (series: Series): Promise<Snapshot[]> =>
  series.section === "tech" ? await getSnapshots() : await getMedicineSnapshots();

/** The series' value in one snapshot, undefined when the key wasn't counted that day */
export const seriesValue =
  (series: Series) =>
  (s: Snapshot): number | undefined => {
    if (!series.dim) return s.open;
    if (series.dim === "remote") return s.remote;
    return (s[series.dim] as Record<string, number> | undefined)?.[series.key ?? ""];
  };

/** How `count` compares with the series 30 days back, and the date the numbers are as of */
export async function seriesChange(series: Series, count: number): Promise<{ change?: Change; date?: string }> {
  const snapshots = await seriesSnapshots(series);
  const run = await getLatestRun();
  return { change: changeOver(snapshots, seriesValue(series), count), date: run?.finishedAt ?? snapshots.at(-1)?.date };
}
