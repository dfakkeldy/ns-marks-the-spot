import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { runWatch } from "../watchTaxSaleSources.mjs";
import { CUMBERLAND_SOURCE } from "./cumberland.mjs";

const dataDir = resolve(dirname(fileURLToPath(import.meta.url)), "../../src/data");
const read = (name) => JSON.parse(readFileSync(resolve(dataDir, name), "utf8"));
const noticeHtml = `<table><tr><th>AAN</th><th>PID</th><th>District</th><th>Assessed Owner and Location/Description</th><th>Total Due</th><th>Redeemable</th></tr><tr><td>12345678</td><td>25000001</td><td>1</td><td>[OMITTED]</td><td>$1,000.00</td><td>Yes</td></tr></table>`;
function deps(overrides = {}) {
  return {
    now: "2026-10-04", nowInstant: new Date("2026-10-04T23:30:00Z"),
    fetchImpl: async () => new Response("Enable JavaScript", { status: 307, headers: { "content-type": "text/html" } }),
    snapshot: read("cumberlandTaxSale.snapshot.json"),
    dataset: JSON.stringify(read("historicalTaxSales.json")),
    ledger: JSON.stringify(read("historicalSourceLedger.json")),
    browserReceipt: {
      sourceKind: "owner-free-rendered-notice", sourceUrl: CUMBERLAND_SOURCE.landingPageUrl,
      capturedAt: "2026-10-04T23:29:00Z", html: noticeHtml, observedTableRowCount: 2,
      ...overrides,
    },
  };
}

describe("rendered official notice receipts", () => {
  it("can verify a fresh official pre-sale notice after HTTP JavaScript verification blocks fetch", async () => {
    const input = deps();
    const report = await runWatch(CUMBERLAND_SOURCE, input);
    expect(report.status).toBe("unchanged");
    expect(report.snapshot).toEqual(input.snapshot);
    expect(report.summary).toMatch(/normal browser.*pre-sale notice/u);
    expect(report.dataset).toBeUndefined();
    expect(report.ledger).toBeUndefined();
  });

  it("rejects stale, future, foreign, untyped or malformed browser receipts", async () => {
    for (const changed of [
      { capturedAt: "2026-10-04T22:00:00Z" }, { capturedAt: "2026-10-05T23:30:00Z" },
      { sourceUrl: "https://example.test/tax-sales.html" }, { sourceKind: "raw-html" },
      { html: "<p>Tax sales information</p>" },
      { html: noticeHtml.replace("[OMITTED]", "PRIVATE FIELD") },
      { html: noticeHtml.replace(/<tr><td>[\s\S]*?<\/tr>/u, "") },
      { observedTableRowCount: 3 },
      { html: noticeHtml.replace("$1,000.00", "$1,,000.00") },
      { html: noticeHtml.replace("$1,000.00", "$1,.00") },
    ]) {
      await expect(runWatch(CUMBERLAND_SOURCE, deps(changed))).rejects.toThrow(/browser receipt/);
    }
  });

  it("never substitutes a browser receipt for result ingestion or an ordinary HTTP failure", async () => {
    await expect(runWatch(CUMBERLAND_SOURCE, deps({ html: `${noticeHtml}<h1>OCTOBER 20, 2026 TAX SALE RESULTS</h1>` }))).rejects.toThrow(/browser receipt/);
    const input = deps();
    input.fetchImpl = async () => new Response("Missing", { status: 404 });
    await expect(runWatch(CUMBERLAND_SOURCE, input)).rejects.toThrow(/HTTP 404/);
  });
});
