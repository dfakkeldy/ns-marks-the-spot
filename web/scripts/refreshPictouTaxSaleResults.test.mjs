import { describe, expect, it } from "vitest";
import * as pictou from "./refreshPictouTaxSaleResults.mjs";

const RESULT_TEXT = `
Assessment No. PID District Description Minimum Bid Redeemable (Post-Sale) Subject to HST Selling Price
04708903 00868265 09 4158 Little Harbour Road, Land and Dwelling $1,200.00 No No $15,000.00
08839565 65066565 10 90 Campbell Land, Lot 10 McLellans Brook, Dwelling $1,200.00 No No Removed
`;

describe("Pictou tax-sale result ingestion", () => {
  it("extracts exact identifiers and printed result states from the dated PDF", () => {
    expect(pictou.parsePictouResultText(RESULT_TEXT)).toEqual({
      rows: [
        {
          listingIdentifier: "04708903",
          pid: "00868265",
          district: "09",
          description: "4158 Little Harbour Road, Land and Dwelling",
          advertisedAmountCents: 120_000,
          redemptionLabel: "Redeemable - No",
          hst: false,
          sellingRaw: "$15,000.00",
        },
        {
          listingIdentifier: "08839565",
          pid: "65066565",
          district: "10",
          description:
            "90 Campbell Land, Lot 10 McLellans Brook, Dwelling",
          advertisedAmountCents: 120_000,
          redemptionLabel: "Redeemable - No",
          hst: false,
          sellingRaw: "Removed",
        },
      ],
    });
  });

  it("keeps removed distinct from a numeric sale", () => {
    expect(pictou.classifyPictouResult("$15,000.00")).toEqual({
      outcome: "sold",
      winningBidCents: 1_500_000,
    });
    expect(pictou.classifyPictouResult("Removed")).toEqual({
      outcome: "withdrawn",
      winningBidCents: null,
      resultNote:
        'Official selling-price column reads "Removed"; the property was taken out of this tender and no selling price is published.',
    });
    expect(() => pictou.classifyPictouResult("Pending")).toThrow(
      /Unrecognized Pictou selling-price value/u,
    );
  });

  it("selects the newest dated official result PDF from the landing page", () => {
    const html = `
      <a href="/assets/results-2025.pdf">March 1, 2025</a>
      <a href="/assets/MOPC-Finance-Master-Tax-Sale-Results-April-10-20261.pdf">April 10, 2026</a>
    `;
    expect(
      pictou.extractLatestPictouResultsPdfUrl(
        html,
        "https://munpict.ca/departments-and-services/finance/tax-sale/",
      ),
    ).toEqual({
      saleDate: "2026-04-10",
      url:
        "https://munpict.ca/assets/MOPC-Finance-Master-Tax-Sale-Results-April-10-20261.pdf",
    });
  });

  it("builds an owner-free historical event and ledger receipt", () => {
    const addition = pictou.buildPictouAddition({
      saleDate: "2026-04-10",
      rows: pictou.parsePictouResultText(RESULT_TEXT).rows,
      landingPageUrl:
        "https://munpict.ca/departments-and-services/finance/tax-sale/",
      noticeUrl: "https://munpict.ca/assets/notice.pdf",
      noticeSha256: "a".repeat(64),
      resultUrl: "https://munpict.ca/assets/result.pdf",
      resultSha256: "b".repeat(64),
      retrievedOn: "2026-07-28",
    });

    expect(addition.event).toMatchObject({
      id: "pictou-2026-04-10",
      resultStatus: "verified",
      noticeSha256: "a".repeat(64),
      resultSha256: "b".repeat(64),
    });
    expect(addition.records.map(({ outcome }) => outcome)).toEqual([
      "sold",
      "withdrawn",
    ]);
    expect(addition.ledgerEntry.documentSha256).toEqual([
      "a".repeat(64),
      "b".repeat(64),
    ]);
    expect(JSON.stringify(addition)).not.toMatch(/owner|bidder/iu);
  });
});
