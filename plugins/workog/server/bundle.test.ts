import { expect, test } from "bun:test";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

// The plugin runs the committed bundle with plain node, so it must match the source: `bun run mcp:build`
test("dist/workog-mcp.mjs is built from the current source", async () => {
  const dir = await mkdtemp(join(tmpdir(), "workog-mcp-"));
  try {
    const out = join(dir, "workog-mcp.mjs");
    const build = Bun.spawnSync(["bun", "build", join(import.meta.dir, "main.ts"), "--target=node", "--format=esm", "--minify", "--outfile", out]);
    expect(build.exitCode).toBe(0);
    const fresh = await readFile(out, "utf8");
    const committed = await readFile(join(import.meta.dir, "dist", "workog-mcp.mjs"), "utf8");
    expect(committed === fresh, "the bundle is stale: run `bun run mcp:build`").toBe(true);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}, 30_000);
