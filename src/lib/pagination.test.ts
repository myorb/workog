import { expect, test } from "bun:test";
import { extraPages, pageCount, pagerPages, pageSlice, pageUrl } from "./pagination.ts";

test("pageCount rounds up to whole pages of 50 and never drops below 1", () => {
  expect(pageCount(0)).toBe(1);
  expect(pageCount(50)).toBe(1);
  expect(pageCount(51)).toBe(2);
  expect(pageCount(790)).toBe(16);
});

test("page 1 is the browse page itself", () => {
  expect(pageUrl("/companies/stripe", 1)).toBe("/companies/stripe");
  expect(pageUrl("/companies/stripe", 3)).toBe("/companies/stripe/page/3");
});

test("pageSlice and extraPages cover every job exactly once", () => {
  const jobs = Array.from({ length: 123 }, (_, i) => i);
  const pages = [1, ...extraPages(jobs.length)];
  expect(pages).toEqual([1, 2, 3]);
  expect(pages.flatMap((p) => pageSlice(jobs, p))).toEqual(jobs);
});

test("pagerPages links the ends, neighbours and long jumps", () => {
  expect(pagerPages(1, 3)).toEqual([1, 2, 3]);
  expect(pagerPages(50, 400)).toEqual([1, 20, 40, 47, 48, 49, 50, 51, 52, 53, 60, 80, 150, 400]);
});
