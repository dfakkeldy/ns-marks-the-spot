import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import * as results from "./halifaxTaxSaleResults.mjs";

const notice = JSON.parse(readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), "../src/data/halifaxTaxSale.snapshot.json"), "utf8"));
const resultUrl = "https://www.halifax.ca/sites/default/files/documents/home-property/property-taxes/tax-sale-website-results-sept15.26.pdf";
const resultText = `Assessment #      PID                                        Location    Opening Bid   Selling Price   Redeemable
03042227       00649160   Old Public Rd Nine Mile River - Land            $4,286.73    $100,000.00         Yes
03294625       40290983   206 South Rd South Section - Building          $21,686.14      NO BIDS           Yes
08587949       40636888   Privateer Rd Lot 4 West Dover - Land           $27,368.77     $61,888.00         No
08960526       40772188   Jeddore Cape Lot 2 Lower West Jeddore - Land    $7,306.40     $55,000.00         Yes`;

describe("Halifax published results", () => {
  it("finds one dated PDF on the official results page and rejects ambiguous or foreign links", () => {
    const html = `<a href="${resultUrl}">Results</a>`;
    expect(results.findHalifaxResultPdf(html, "2026-09-15")).toBe(resultUrl);
    expect(() => results.findHalifaxResultPdf(html.replace("www.halifax.ca", "example.test"), "2026-09-15")).toThrow(/found 0/);
    expect(() => results.findHalifaxResultPdf(html, "2026-05-12")).toThrow(/found 0/);
    expect(() => results.findHalifaxResultPdf(`${html}<a href="${resultUrl}?revision=2">Other</a>`, "2026-09-15")).toThrow(/found 2/);
  });

  it("uses printed selling prices and NO BIDS, without inferring dispositions for absent rows", () => {
    const rows = results.parseHalifaxResultText(resultText);
    expect(rows).toHaveLength(4);
    expect(rows[0]).toMatchObject({ aan: "03042227", pids: ["00649160"], outcome: "sold", winningBidCents: 10_000_000 });
    expect(rows[1]).toMatchObject({ aan: "03294625", outcome: "unsold", winningBidCents: null });
    const addition = results.buildHalifaxHistoricalAddition(notice, rows, resultUrl, "a".repeat(64), "2026-10-04");
    expect(addition.records).toHaveLength(10);
    expect(addition.records.filter(({ outcome }) => outcome === "sold")).toHaveLength(3);
    expect(addition.records.filter(({ outcome }) => outcome === "unsold")).toHaveLength(1);
    expect(addition.records.filter(({ outcome }) => outcome === "unknown")).toHaveLength(6);
    expect(addition.records.filter(({ outcome }) => outcome === "withdrawn")).toHaveLength(0);
    expect(addition.event).toMatchObject({ id: "halifax-2026-09-15", resultStatus: "verified", resultUrl });
    expect(addition.snapshot).toMatchObject({ ownerNamesExcluded: true, resultRowCount: 4, missingNoticeRowCount: 6 });
  });

  it("rejects duplicate or changed AAN, PID, amount, location and redemption before ingestion", () => {
    for (const changed of [
      resultText.replace("00649160", "00649161"),
      resultText.replace("03042227", "03042228"),
      resultText.replace("$4,286.73", "$4,286.74"),
      resultText.replace("Old Public Rd", "Other Public Rd"),
      resultText.replace("$100,000.00         Yes", "$100,000.00         No"),
    ]) {
      expect(() => results.buildHalifaxHistoricalAddition(notice, results.parseHalifaxResultText(changed), resultUrl, "a".repeat(64), "2026-10-04")).toThrow(/reconcile/);
    }
    expect(() => results.parseHalifaxResultText(`${resultText}\n${resultText.split("\n")[1]}`)).toThrow(/Duplicate/);
    expect(() => results.parseHalifaxResultText(resultText.replace("NO BIDS", "PENDING"))).toThrow(/selling price/);
    expect(() => results.parseHalifaxResultText(resultText.replace("NO BIDS", ""))).toThrow(/columns/);
    expect(() => results.parseHalifaxResultText(resultText.replace("Selling Price", "Assessed Owner"))).toThrow(/header/);
  });

  it("retains retrieval dates on identical results and rejects rewriting accepted outcomes", () => {
    const args = [notice, results.parseHalifaxResultText(resultText), resultUrl, "a".repeat(64)];
    const initial = results.buildHalifaxHistoricalAddition(...args, "2026-10-04");
    const unchanged = results.buildHalifaxHistoricalAddition(...args, "2026-10-05", initial.snapshot);
    expect(unchanged).toEqual(initial);
    expect(() => results.buildHalifaxHistoricalAddition(notice, results.parseHalifaxResultText(resultText.replace("$100,000.00", "$101,000.00")), resultUrl, "b".repeat(64), "2026-10-05", initial.snapshot)).toThrow(/changed after ingestion/);
  });
});
