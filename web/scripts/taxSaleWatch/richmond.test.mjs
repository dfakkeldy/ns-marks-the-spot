import { describe, expect, it } from "vitest";
import * as richmond from "./richmond.mjs";

const RESULT_PAGE = `
<h2>June 12, 2026 PROPERTY TAX SALE - RESULTS</h2>
<table>
  <tr><th colspan="10">June 12, 2026 PROPERTY TAX SALE - RESULTS</th></tr>
  <tr><th colspan="10">SCHEDULE OF LANDS</th></tr>
  <tr>
    <th>#</th><th>District</th><th>AAN #</th><th>PID #</th>
    <th>Assessed Name</th><th>Description / Address / Location</th>
    <th>Redeem-able</th><th>Taxes, Interest, Other Charges</th>
    <th>Successful Bid</th><th>Successful Bidder</th>
  </tr>
  <tr>
    <td>4</td><td>5</td><td>05483379</td><td>75067348</td>
    <td>OWNER OMITTED</td>
    <td>Land - 317 St. Peter's Fourchu Road, Lower L'Ardoise</td>
    <td>No</td><td>$ 2,633.57</td><td>$3,500.00</td>
    <td>BIDDER OMITTED</td>
  </tr>
</table>`;

describe("Richmond tax-sale result ingestion", () => {
  it("extracts only public map fields from the official result table", () => {
    const sale = richmond.parseResults(RESULT_PAGE);

    expect(sale).toEqual({
      saleDate: "2026-06-12",
      heading: "June 12, 2026 PROPERTY TAX SALE - RESULTS",
      listingIdentifierLabel: "AAN",
      rows: [{
        listingIdentifier: "05483379",
        pid: "75067348",
        description: "Land - 317 St. Peter's Fourchu Road, Lower L'Ardoise",
        redemptionLabel: "Redeemable - No",
        advertisedAmountCents: 263_357,
        winningRaw: "$3,500.00",
      }],
    });
    expect(JSON.stringify(sale)).not.toMatch(/OWNER OMITTED|BIDDER OMITTED/u);
  });

  it("classifies only a numeric successful bid", () => {
    expect(richmond.classifyOutcome("$29,000.00")).toEqual({
      outcome: "sold",
      winningBidCents: 2_900_000,
    });
    expect(() => richmond.classifyOutcome("NO BID")).toThrow(
      /Unrecognized Richmond successful-bid value/u,
    );
  });
});
