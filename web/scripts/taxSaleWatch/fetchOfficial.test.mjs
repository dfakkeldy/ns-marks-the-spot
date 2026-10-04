import { describe, expect, it } from "vitest";
import { fetchOfficial } from "./fetchOfficial.mjs";

const url = "https://victoriacounty.com/property-tax-sale-notice/";
describe("official municipal source fetching", () => {
  it("recovers from a connection reset with a bounded retry", async () => {
    let attempts = 0;
    const waits = [];
    const response = new Response("Official notice");
    const result = await fetchOfficial(url, {
      fetchImpl: async () => {
        attempts += 1;
        if (attempts === 1) throw new TypeError("fetch failed", { cause: { code: "ECONNRESET" } });
        return response;
      },
      sleep: async (ms) => waits.push(ms),
    });
    expect(await result.text()).toBe("Official notice");
    expect(attempts).toBe(2);
    expect(waits).toEqual([500]);
  });

  it("stops after three transient failures", async () => {
    let attempts = 0;
    await expect(fetchOfficial(url, {
      fetchImpl: async () => { attempts += 1; throw new TypeError("fetch failed", { cause: { code: "ECONNRESET" } }); },
      sleep: async () => {},
    })).rejects.toThrow(/source-error.*ECONNRESET.*3 attempts/);
    expect(attempts).toBe(3);
  });

  it("retries server errors but preserves ordinary HTTP failures", async () => {
    let attempts = 0;
    const result = await fetchOfficial(url, {
      fetchImpl: async () => ++attempts < 3 ? new Response("Unavailable", { status: 503 }) : new Response("Official notice"),
      sleep: async () => {},
    });
    expect(await result.text()).toBe("Official notice");
    attempts = 0;
    await expect(fetchOfficial(url, { fetchImpl: async () => { attempts += 1; return new Response("Missing", { status: 404 }); } })).rejects.toThrow(/HTTP 404/);
    expect(attempts).toBe(1);
  });

  it("reports a JavaScript verification page as a source error without retrying or printing its body", async () => {
    let attempts = 0;
    await expect(fetchOfficial(url, {
      fetchImpl: async () => {
        attempts += 1;
        return new Response("<script>verification()</script><noscript>Enable JavaScript</noscript>", { status: 307, headers: { "content-type": "text/html" } });
      },
    })).rejects.toThrow(/source-error.*HTTP 307.*JavaScript verification/);
    expect(attempts).toBe(1);
  });
});
