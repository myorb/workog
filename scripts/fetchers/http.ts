const USER_AGENT =
  process.env.FETCH_USER_AGENT ?? "static-job/0.1 (+https://static-job.pages.dev/about)";

const TIMEOUT_MS = 30_000;
const MAX_RETRIES = 3;

export const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** GET a JSON document with a timeout and up to 3 retries with exponential backoff. */
export async function getJson<T>(url: string): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    if (attempt > 0) await sleep(1000 * 2 ** (attempt - 1));
    try {
      const res = await fetch(url, {
        headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      if (res.ok) return (await res.json()) as T;
      lastError = new Error(`HTTP ${res.status} for ${url}`);
      // 4xx other than rate limiting will not get better with a retry
      if (res.status < 500 && res.status !== 429) break;
    } catch (err) {
      lastError = err;
    }
  }
  throw lastError;
}
