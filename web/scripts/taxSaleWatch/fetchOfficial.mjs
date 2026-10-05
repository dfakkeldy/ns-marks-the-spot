import { setTimeout as sleepDefault } from "node:timers/promises";

const TRANSIENT_CODES = new Set([
  "ECONNRESET", "ETIMEDOUT", "EAI_AGAIN", "UND_ERR_CONNECT_TIMEOUT", "UND_ERR_SOCKET",
]);

/** Retry transport/server failures only; never print an untrusted response body. */
export async function fetchOfficial(url, {
  accept = "text/html", fetchImpl = fetch, sleep = sleepDefault,
} = {}) {
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    let response;
    try {
      response = await fetchImpl(url, {
        headers: { Accept: accept, "User-Agent": "NS-Marks-tax-sale-monitor/1.0" },
        signal: AbortSignal.timeout(30_000),
      });
    } catch (error) {
      const code = error?.cause?.code ?? error?.code ?? error?.name;
      const transient = TRANSIENT_CODES.has(code) || code === "TimeoutError";
      if (!transient || attempt === 3) {
        throw new Error(`source-error: ${code} after ${attempt} attempts: ${url}`, { cause: error });
      }
      await sleep(attempt * 500);
      continue;
    }
    if (response.ok) return response;
    if (response.status >= 500 && response.status <= 599 && attempt < 3) {
      await response.body?.cancel();
      await sleep(attempt * 500);
      continue;
    }
    let detail = "";
    if (response.status === 307 && response.headers?.get("content-type")?.includes("text/html")) {
      const body = await response.text();
      if (/javascript/iu.test(body)) detail = "; JavaScript verification blocks automatic ingestion";
    }
    throw new Error(`source-error: HTTP ${response.status}${detail}: ${url}`);
  }
}
