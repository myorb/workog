import { expect, test } from "bun:test";
import { validThrough } from "./structured-data.ts";

test("validThrough is 30 days after the job was last seen", () => {
  expect(validThrough({ lastSeenAt: "2026-11-03T05:00:00.000Z" })).toBe("2026-12-03T05:00:00.000Z");
});
