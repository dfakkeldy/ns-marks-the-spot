import { describe, expect, it } from "vitest";
import * as cbrmRefresher from "./refreshCbrmTaxSaleResults.mjs";
import {
  classifyCbrmResult,
  extractLatestResultsPdfUrl,
  parseCbrmResultText,
  reconcileCbrmResults,
  updateCbrmDatasetHash,
} from "./refreshCbrmTaxSaleResults.mjs";

const RESULT_TEXT = `
JULY 21, 2026 TAX SALE
LIEN AAN PID NAME ADDRESS LOCATION MIN BID REDEMP WINNING BID
26-10 546828 15129406 OWNER OMITTED 158 VICTORIA RD LAND BUILDING SYDNEY $ 9,947.01 IMMED $ 9,947.01
26-21 2904233 15498496 OWNER OMITTED 8 PATTON RD LAND BUILDING PORT CALEDONIA $ 9,716.89 6 MTH PAID AT SALE
26-23 1870254 15437817 OWNER OMITTED 98 CENTRE AVE LAND GLACE BAY $ 17,211.81 IMMED
`;

const NOTICE_LISTINGS = [
  {
    lien: "26-10",
    aan: "546828",
    pids: ["15129406"],
    financial: { amountCents: 994_701 },
    redemptionCategory: "immediate-deed",
  },
  {
    lien: "26-21",
    aan: "2904233",
    pids: ["15498496"],
    financial: { amountCents: 971_689 },
    redemptionCategory: "six-month",
  },
  {
    lien: "26-23",
    aan: "1870254",
    pids: ["15437817"],
    financial: { amountCents: 1_721_181 },
    redemptionCategory: "immediate-deed",
  },
];

describe("CBRM tax-sale result ingestion", () => {
  it("extracts only owner-free result fields from the rendered text", () => {
    const parsed = parseCbrmResultText(RESULT_TEXT);

    expect(parsed).toEqual({
      saleDate: "2026-07-21",
      rows: [
        {
          lien: "26-10",
          aan: "546828",
          pid: "15129406",
          minimumBidCents: 994_701,
          redemptionCategory: "immediate-deed",
          winningRaw: "$ 9,947.01",
        },
        {
          lien: "26-21",
          aan: "2904233",
          pid: "15498496",
          minimumBidCents: 971_689,
          redemptionCategory: "six-month",
          winningRaw: "PAID AT SALE",
        },
        {
          lien: "26-23",
          aan: "1870254",
          pid: "15437817",
          minimumBidCents: 1_721_181,
          redemptionCategory: "immediate-deed",
          winningRaw: "",
        },
      ],
    });
    expect(JSON.stringify(parsed)).not.toContain("OWNER OMITTED");
  });

  it("keeps non-numeric dispositions fail-closed", () => {
    expect(classifyCbrmResult("$ 9,947.01")).toEqual({
      outcome: "sold",
      winningBidCents: 994_701,
    });
    expect(classifyCbrmResult("PAID AT SALE")).toEqual({
      outcome: "unknown",
      winningBidCents: null,
      resultNote:
        'Official winning-bid column reads "PAID AT SALE"; no completed sale or winning bid is inferred.',
    });
    expect(classifyCbrmResult("")).toEqual({
      outcome: "unknown",
      winningBidCents: null,
      resultNote:
        "The official result row publishes no winning bid or disposition; no outcome is inferred.",
    });
    expect(() => classifyCbrmResult("WALKED AWAY")).toThrow(
      'Unrecognized CBRM result "WALKED AWAY"',
    );
  });

  it("rejects a result row that does not match its owner-free notice fields", () => {
    const parsed = parseCbrmResultText(RESULT_TEXT);
    const changedPid = parsed.rows.map((row) =>
      row.lien === "26-10" ? { ...row, pid: "15000000" } : row,
    );

    expect(() => reconcileCbrmResults(NOTICE_LISTINGS, changedPid)).toThrow(
      "CBRM result 26-10 does not match its notice PID",
    );
  });

  it("reconciles published rows without inventing outcomes for omitted notice rows", () => {
    const parsed = parseCbrmResultText(RESULT_TEXT);

    expect(reconcileCbrmResults(NOTICE_LISTINGS, parsed.rows)).toEqual([
      {
        lien: "26-10",
        aan: "546828",
        pid: "15129406",
        minimumBidCents: 994_701,
        redemptionCategory: "immediate-deed",
        outcome: "sold",
        winningBidCents: 994_701,
      },
      {
        lien: "26-21",
        aan: "2904233",
        pid: "15498496",
        minimumBidCents: 971_689,
        redemptionCategory: "six-month",
        outcome: "unknown",
        winningBidCents: null,
        resultNote:
          'Official winning-bid column reads "PAID AT SALE"; no completed sale or winning bid is inferred.',
      },
      {
        lien: "26-23",
        aan: "1870254",
        pid: "15437817",
        minimumBidCents: 1_721_181,
        redemptionCategory: "immediate-deed",
        outcome: "unknown",
        winningBidCents: null,
        resultNote:
          "The official result row publishes no winning bid or disposition; no outcome is inferred.",
      },
    ]);
  });

  it("selects the newest official sold-properties PDF from the landing page", () => {
    const html = `
      <a href="/wp-content/uploads/2026/03/Sold-Properties-March-10-2026-Tax-Sale.pdf">
        List of Sold Properties - Tax Sale March 10, 2026
      </a>
      <a href="/wp-content/uploads/2026/07/List-of-Sold-Properties-July-21-2026.pdf">
        List of Sold Properties - Tax Sale July 21, 2026
      </a>
    `;

    expect(
      extractLatestResultsPdfUrl(
        html,
        "https://cbrm.ns.ca/business/property-sales-management/tax-sales/",
      ),
    ).toBe(
      "https://cbrm.ns.ca/wp-content/uploads/2026/07/List-of-Sold-Properties-July-21-2026.pdf",
    );
  });

  it("updates the public snapshot receipt without rewriting unrelated model code", () => {
    const source = `before
export const CBRM_RESULT_DATASET_SHA256 =
  "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
after`;

    expect(
      updateCbrmDatasetHash(
        source,
        "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
      ),
    ).toBe(`before
export const CBRM_RESULT_DATASET_SHA256 =
  "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
after`);
  });

  it("keeps the original retrieval date when the official result bytes and rows are unchanged", () => {
    const current = {
      schemaVersion: 1,
      eventId: "cbrm-2026-07-21",
      saleDate: "2026-07-21",
      landingPage:
        "https://cbrm.ns.ca/business/property-sales-management/tax-sales/",
      source:
        "https://cbrm.ns.ca/wp-content/uploads/2026/07/List-of-Sold-Properties-July-21-2026.pdf",
      retrievedDate: "2026-07-27",
      sourceDocumentSha256:
        "755a685b15193daf0d7a07389bd0836e67d55d8fe4c5b94206de9e07baffc0b0",
      ownerNamesExcluded: true,
      resultRowCount: 1,
      results: [{
        lien: "26-10",
        aan: "546828",
        pid: "15129406",
        minimumBidCents: 994_701,
        redemptionCategory: "immediate-deed",
        outcome: "sold",
        winningBidCents: 994_701,
      }],
    };

    const snapshot = cbrmRefresher.buildCbrmSnapshot(
      current,
      {
        saleDate: "2026-07-21",
        rows: current.results,
      },
      current.source,
      Buffer.from("same document"),
      new Date("2026-07-28T12:00:00Z"),
    );

    expect(snapshot).toEqual(current);
  });
});
