import { expect, test } from "bun:test";
import { baseSalary, validThrough } from "./structured-data.ts";

test("validThrough is 30 days after the job was last seen", () => {
  expect(validThrough({ lastSeenAt: "2026-11-03T05:00:00.000Z" })).toBe("2026-12-03T05:00:00.000Z");
});

test("baseSalary gives a range, or a single value when there is one figure", () => {
  expect(baseSalary({ currency: "GBP", min: 113565, max: 150569, unit: "YEAR" })).toEqual({
    "@type": "MonetaryAmount",
    currency: "GBP",
    value: { "@type": "QuantitativeValue", minValue: 113565, maxValue: 150569, unitText: "YEAR" },
  });
  expect(baseSalary({ currency: "GBP", min: 13.15, max: 13.15, unit: "HOUR" })).toEqual({
    "@type": "MonetaryAmount",
    currency: "GBP",
    value: { "@type": "QuantitativeValue", value: 13.15, unitText: "HOUR" },
  });
});
