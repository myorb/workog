import { expect, test } from "bun:test";
import { addressesOf, baseSalary, parseLocation, validThrough } from "./structured-data.ts";

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

test("parseLocation reads city, region and country from a label", () => {
  expect(parseLocation("Bad Füssing, Bayern, Germany")).toEqual({ locality: "Bad Füssing", region: "Bayern", country: "DE" });
  expect(parseLocation("Seattle, WA, United States")).toEqual({ locality: "Seattle", region: "WA", country: "US" });
  expect(parseLocation("SEATTLE, WA, United States")).toEqual({ locality: "Seattle", region: "WA", country: "US" });
  expect(parseLocation("Lyon, France")).toEqual({ locality: "Lyon", country: "FR" });
  expect(parseLocation("Tromsø, Norway")).toEqual({ locality: "Tromsø", country: "NO" });
  expect(parseLocation("Nord, France")).toEqual({ region: "Nord", country: "FR" });
  expect(parseLocation("London, United Kingdom")).toEqual({ locality: "London", country: "GB" });
  expect(parseLocation("London")).toBeUndefined();
  expect(parseLocation("Remote, United States")).toBeUndefined();
});

test("addressesOf keeps parsed places, falls back to known cities, then countries, without duplicates", () => {
  expect(addressesOf(["Seattle, WA, United States", "SEATTLE, WA, United States", "London"])).toEqual([
    { locality: "Seattle", region: "WA", country: "US" },
    { locality: "London", country: "GB" },
  ]);
  expect(addressesOf(["Remote - Germany"])).toEqual([{ country: "DE" }]);
});
