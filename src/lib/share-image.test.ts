import { describe, expect, test } from "bun:test";
import { escapeXml, renderPng, shareAlt, shareImagePath, shareSvg, trendText, wrap } from "./share-image.ts";

describe("share images", () => {
  test("render a 1200×630 PNG with the bundled fonts", () => {
    const png = renderPng(shareSvg({ variant: "tech", title: "AT&T jobs", count: 3228, trend: { pct: 1.93, days: 17 } }));
    expect([...png.subarray(0, 8)]).toEqual([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    // IHDR: width and height, big-endian, right after the chunk header
    expect(png.readUInt32BE(16)).toBe(1200);
    expect(png.readUInt32BE(20)).toBe(630);
  });

  test("escape names for XML", () => {
    expect(escapeXml(`AT&T <"x">`)).toBe("AT&amp;T &lt;&quot;x&quot;&gt;");
    expect(shareSvg({ variant: "tech", title: "AT&T jobs", count: 1 })).toContain("AT&amp;T jobs");
  });

  test("wrap long titles into at most two lines, ending in an ellipsis", () => {
    expect(wrap("Google jobs", 30, 2)).toEqual(["Google jobs"]);
    const lines = wrap("Psychiatry and psychotherapy jobs in Germany for doctors at every level", 30, 2);
    expect(lines).toHaveLength(2);
    expect(lines[1]!.endsWith("…")).toBe(true);
    expect(lines.every((l) => l.length <= 30)).toBe(true);
  });

  test("show the trend's direction", () => {
    expect(trendText({ pct: 1.93, days: 17 }).text).toBe("↑ 1.9% in 17 days");
    expect(trendText({ pct: -12.4, days: 30 }).text).toBe("↓ 12% in 30 days");
    expect(trendText({ pct: 0.01, days: 30 }).text).toBe("→ unchanged in 30 days");
  });

  test("describe the image in its alt text", () => {
    expect(shareAlt({ variant: "tech", title: "Google jobs", count: 3228, trend: { pct: 1.93, days: 17 } })).toBe("Google jobs: 3,228 open jobs, up 1.9% in 17 days");
    expect(shareAlt({ variant: "medicine", title: "Psychiatry jobs in Germany", count: 1 })).toBe("Psychiatry jobs in Germany: 1 open job");
  });

  test("put each page's image under /og", () => {
    expect(shareImagePath("/companies/google")).toBe("/og/companies/google.png");
  });
});
