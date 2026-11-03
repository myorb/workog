import { describe, expect, test } from "bun:test";
import { googleNotifications } from "./ping.ts";

describe("googleNotifications", () => {
  test("puts new jobs first and stops at the quota", () => {
    const changes = { startedAt: "", opened: ["a", "b"], closed: ["c"], dropped: ["d"] };
    expect(googleNotifications(changes, 3)).toEqual([
      { url: "https://workog.com/jobs/a", type: "URL_UPDATED" },
      { url: "https://workog.com/jobs/b", type: "URL_UPDATED" },
      { url: "https://workog.com/jobs/c", type: "URL_UPDATED" },
    ]);
    expect(googleNotifications(changes).at(-1)).toEqual({ url: "https://workog.com/jobs/d", type: "URL_DELETED" });
  });
});
