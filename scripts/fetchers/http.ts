import { AsyncLocalStorage } from "node:async_hooks";

/**
 * Counts the requests made inside `requestStats.run(stats, fn)`, so the fetch
 * script can show how far a slow source has got while it runs.
 */
export const requestStats = new AsyncLocalStorage<{ requests: number }>();

const USER_AGENT =
  process.env.FETCH_USER_AGENT ?? "workog/0.1 (+https://workog.com/about)";

const TIMEOUT_MS = 30_000;
const MAX_RETRIES = 3;

export const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Requests a URL and reads the body with `read`, with a timeout and up to 3
 * retries with exponential backoff. A body `read` can't parse is retried too:
 * some sites answer a burst of requests with a 200 "try again later" page.
 */
async function request<T>(
  url: string,
  accept: string,
  read: (res: Response) => Promise<T>,
  body?: unknown,
  headers: Record<string, string> = {},
): Promise<T> {
  let lastError: unknown;
  let rateLimited = false;
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    // a rate limit takes longer to clear than a flaky response
    if (attempt > 0) await sleep((rateLimited ? 5000 : 1000) * 2 ** (attempt - 1));
    const stats = requestStats.getStore();
    if (stats) stats.requests++;
    try {
      const res = await fetch(url, {
        method: body === undefined ? "GET" : "POST",
        headers: {
          "User-Agent": USER_AGENT,
          Accept: accept,
          ...(body === undefined ? {} : { "Content-Type": "application/json" }),
          ...headers,
        },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      if (res.ok) return await read(res);
      lastError = new Error(`HTTP ${res.status} for ${url}`);
      rateLimited = res.status === 429;
      // 4xx other than rate limiting will not get better with a retry
      if (res.status < 500 && res.status !== 429) break;
    } catch (err) {
      lastError = err;
    }
  }
  throw lastError;
}

export async function getJson<T>(url: string, headers?: Record<string, string>): Promise<T> {
  return request(url, "application/json", (res) => res.json() as Promise<T>, undefined, headers);
}

/** POST a JSON body and read a JSON response, for search endpoints that take their query as a body. */
export async function postJson<T>(url: string, body: unknown): Promise<T> {
  return request(url, "application/json", (res) => res.json() as Promise<T>, body);
}

/** GET an HTML page, for career sites that embed their data in the page instead of offering an API. */
export async function getText(url: string): Promise<string> {
  return request(url, "text/html", (res) => res.text());
}

/**
 * Maps `items` through `fn` with at most `limit` calls in flight, keeping the
 * order. Career sites are not real APIs, so keep `limit` small.
 */
export async function mapLimit<T, R>(items: readonly T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i]!);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}
