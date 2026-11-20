import { LIST_PAGE_LIMIT } from "./constants.ts";

/**
 * Numbered list pages behind a browse page, so search engines can reach every
 * open job in a few clicks instead of only through the related-job chain on
 * job pages. Page 1 is the browse page itself; page k lives at `<base>/page/<k>`.
 */

/** How many list pages a browse page with this many jobs has; always at least 1 */
export const pageCount = (jobCount: number) => Math.max(1, Math.ceil(jobCount / LIST_PAGE_LIMIT));

export const pageUrl = (base: string, page: number) => (page <= 1 ? base : `${base}/page/${page}`);

/** The jobs shown on one list page, newest first like the browse page */
export const pageSlice = <T>(jobs: T[], page: number) => jobs.slice((page - 1) * LIST_PAGE_LIMIT, page * LIST_PAGE_LIMIT);

/** The page numbers that need their own route: 2 up to the last */
export const extraPages = (jobCount: number) => Array.from({ length: pageCount(jobCount) - 1 }, (_, i) => i + 2);

/**
 * The page numbers a pager links to: the first and last, the near neighbours,
 * and longer jumps, so any of 400 pages is a few clicks from any other.
 */
export function pagerPages(page: number, total: number): number[] {
  const offsets = [0, 1, 2, 3, 10, 30, 100];
  const pages = new Set([1, total]);
  for (const o of offsets) for (const p of [page - o, page + o]) if (p >= 1 && p <= total) pages.add(p);
  return [...pages].sort((a, b) => a - b);
}
