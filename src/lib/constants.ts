/** List pages never show more jobs than this; deeper browsing goes through search. */
export const LIST_PAGE_LIMIT = 50;

/** The analytics page hides trend charts until history covers this many days. */
export const TREND_MIN_DAYS = 7;

/**
 * Browse pages with fewer open jobs than this are `noindex` and left out of the
 * sitemap. Near-empty pages read as thin content and make search engines crawl
 * a young site more slowly; they still render, so links to them keep working.
 * Section and index pages (/remote, /medicine, ...) and company pages are exempt.
 */
export const MIN_INDEX_JOBS = 5;

/** Whether a browse page with this many open jobs should stay out of search engines */
export const isThin = (count: number) => count < MIN_INDEX_JOBS;
