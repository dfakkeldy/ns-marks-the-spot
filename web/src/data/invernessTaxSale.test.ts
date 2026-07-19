import { describe, expect, it } from "vitest";
import {
  invernessTaxSaleNotice,
  taxSaleListings,
  taxSalePids,
} from "./invernessTaxSale";

describe("the Inverness County 2026 public dataset", () => {
  it("preserves all 45 notice entries and all 47 unique PIDs", () => {
    expect(taxSaleListings).toHaveLength(45);
    expect(taxSalePids).toHaveLength(47);
    expect(new Set(taxSalePids).size).toBe(47);
  });

  it("preserves the three-parcel lien 11", () => {
    const listing = taxSaleListings.find(({ lien }) => lien === 11);

    expect(listing?.pids).toEqual(["50076777", "50207794", "50207802"]);
  });

  it("normalizes the visibly confirmed lien 19 value to not redeemable", () => {
    const listing = taxSaleListings.find(({ lien }) => lien === 19);

    expect(listing?.redeemable).toBe(false);
  });

  it("contains only public map fields and does not republish assessed-owner names", () => {
    for (const listing of taxSaleListings) {
      expect(Object.keys(listing).sort()).toEqual([
        "aan",
        "lien",
        "location",
        "pids",
        "redeemable",
        "totalArrearsCents",
      ]);
    }
  });

  it("records the corrected official source and sale details", () => {
    expect(invernessTaxSaleNotice.sourceUrl).toBe(
      "https://invernesscounty.ca/wp-content/uploads/2026/07/Tax-Sale_August-11.pdf",
    );
    expect(invernessTaxSaleNotice.publishedOn).toBe("2026-07-16");
    expect(invernessTaxSaleNotice.saleStartsAt).toBe("2026-08-11T09:30:00-03:00");
    expect(invernessTaxSaleNotice.venue).toBe(
      "St. Peter's Parish Hall, 260 Main Street, Port Hood",
    );
  });
});
