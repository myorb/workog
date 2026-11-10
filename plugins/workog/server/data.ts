/**
 * Loads Workog's open-job index from the site (/api/v1, src/lib/job-index.ts)
 * and keeps it on disk, so a new session downloads the rows again only after
 * the daily pipeline run has changed them. With no network it serves the last
 * copy it has.
 */
import { mkdir, readdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { ApiIndex, Section } from "../../../src/lib/job-index.ts";
import type { Row } from "./search.ts";

const API_VERSION = 1;
/** How long an index is trusted before asking the site whether a new run is out */
const INDEX_TTL_MS = 30 * 60 * 1000;
const TIMEOUT_MS = 60_000;

export class Workog {
  private index?: { value: ApiIndex; at: number };
  private indexLoad?: Promise<ApiIndex>;
  private rowsByRun = new Map<string, Promise<Row[]>>();

  constructor(
    /** the site, e.g. https://workog.com */
    readonly base: string,
    /** where downloaded files are kept between sessions; none keeps them in memory only */
    private readonly cacheDir: string | undefined,
    private readonly userAgent: string,
  ) {}

  jobUrl = (slug: string) => new URL(`/jobs/${slug}`, this.base).href;

  async getIndex(): Promise<ApiIndex> {
    if (this.index && Date.now() - this.index.at < INDEX_TTL_MS) return this.index.value;
    return (this.indexLoad ??= this.loadIndex().finally(() => (this.indexLoad = undefined)));
  }

  private async loadIndex(): Promise<ApiIndex> {
    let value: ApiIndex;
    try {
      value = JSON.parse(await this.fetchText("/api/v1/index.json")) as ApiIndex;
      if (value.version !== API_VERSION) throw new Error(`Workog's job index is version ${value.version}, but this server reads version ${API_VERSION}. Update the Workog plugin.`);
      await this.writeCache("index.json", JSON.stringify(value));
    } catch (error) {
      const stale = this.index?.value ?? (await this.readCache("index.json").then((s) => (s ? (JSON.parse(s) as ApiIndex) : undefined)));
      if (!stale || stale.version !== API_VERSION) throw error;
      value = stale;
    }
    this.index = { value, at: Date.now() };
    return value;
  }

  /** Every open job in a section, from the run the current index names */
  async rows(section: Section): Promise<Row[]> {
    const index = await this.getIndex();
    const key = `${runDir(index.run)}/${section}`;
    let rows = this.rowsByRun.get(key);
    if (!rows) {
      rows = this.loadRows(index, section);
      rows.catch(() => this.rowsByRun.delete(key));
      // one run's rows at a time
      for (const old of this.rowsByRun.keys()) if (!old.startsWith(`${runDir(index.run)}/`)) this.rowsByRun.delete(old);
      this.rowsByRun.set(key, rows);
    }
    return rows;
  }

  private async loadRows(index: ApiIndex, section: Section): Promise<Row[]> {
    const dir = runDir(index.run);
    const parts = await Promise.all(
      index.sections[section].files.map(async (file) => {
        const cached = await this.readCache(join(dir, file));
        const text = cached ?? (await this.fetchText(`/api/v1/${file}`));
        if (!cached) await this.writeCache(join(dir, file), text);
        // tagged in place: a copy of 80,000 rows would double the memory the server holds while loading
        const rows = JSON.parse(text) as Row[];
        for (const row of rows) row.section = section;
        return rows;
      }),
    );
    await this.pruneCache(dir);
    return parts.flat();
  }

  async fetchText(path: string): Promise<string> {
    const url = new URL(path, this.base);
    const res = await fetch(url, { headers: { "User-Agent": this.userAgent }, signal: AbortSignal.timeout(TIMEOUT_MS) });
    if (!res.ok) throw new Error(`${url.href} answered ${res.status} ${res.statusText}`);
    return res.text();
  }

  private async readCache(file: string): Promise<string | undefined> {
    if (!this.cacheDir) return undefined;
    return readFile(join(this.cacheDir, file), "utf8").catch(() => undefined);
  }

  /** Written to a temporary name first, so a killed server never leaves half a file */
  private async writeCache(file: string, text: string): Promise<void> {
    if (!this.cacheDir) return;
    const path = join(this.cacheDir, file);
    try {
      await mkdir(join(path, ".."), { recursive: true });
      await writeFile(`${path}.tmp`, text);
      await rename(`${path}.tmp`, path);
    } catch {
      // a cache that can't be written only costs a download next time
    }
  }

  /** Drops the files of older runs */
  private async pruneCache(keep: string): Promise<void> {
    if (!this.cacheDir) return;
    const entries = await readdir(this.cacheDir, { withFileTypes: true }).catch(() => []);
    for (const e of entries) {
      if (e.isDirectory() && e.name.startsWith("run-") && e.name !== keep) await rm(join(this.cacheDir, e.name), { recursive: true, force: true }).catch(() => {});
    }
  }
}

const runDir = (run: string | null) => `run-${(run ?? "unknown").replace(/[^0-9A-Za-z]/g, "")}`;
