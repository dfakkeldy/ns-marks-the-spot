import { describe, expect, it } from "vitest";
import {
  annapolisTaxSaleEvent,
  annapolisTaxSaleNotice,
} from "./annapolisTaxSale";
import annapolisTaxSaleSnapshot from "./annapolisTaxSale.snapshot.json";

describe("the Annapolis County August 2026 tender dataset", () => {
  it("records the official tender notice details", () => {
    expect(annapolisTaxSaleNotice.sourceUrl).toBe(
      "https://annapoliscounty.ca/tax-finance/tax-sale/2342-june-2026-tax-sale-by-tender",
    );
    expect(annapolisTaxSaleNotice.tenderNumber).toBe("08-2026");
    expect(annapolisTaxSaleNotice.tendersCloseAt).toBe(
      "2026-08-31T13:00:00-03:00",
    );
    expect(annapolisTaxSaleNotice.venue).toBe(
      "752 St George Street, Annapolis Royal",
    );
    expect(annapolisTaxSaleNotice.retrievedOn).toBe("2026-07-23");
  });

  it("preserves the single Cornwallis Park listing with eight-digit identifiers", () => {
    expect(annapolisTaxSaleEvent.listings).toHaveLength(1);

    const listing = annapolisTaxSaleEvent.listings[0];
    expect(listing.pids).toEqual(["05266937"]);
    expect(listing.aan).toBe("09153144");
    expect(listing.addressOrDescription).toBe("SHOPPING CENTRE - LOT 227");
    expect(listing.location).toBe("1043 Highway 1, Cornwallis Park");
    expect(listing.financial).toEqual({
      kind: "minimum-bid",
      label: "Minimum bid (plus HST on the total bid)",
      amountCents: 100,
    });
    expect(listing.redemptionCategory).toBe("six-month");
    expect(listing.redemptionLabel).toBe("Redeemable - 6 months");
    expect(listing.listingStatus).toBe("advertised");
  });

  it("models the sealed-tender deadline as the sale timestamp", () => {
    expect(annapolisTaxSaleEvent.eventType).toBe("sealed-tender");
    expect(annapolisTaxSaleEvent.eventStatus).toBe("upcoming");
    expect(annapolisTaxSaleEvent.saleStartsAt).toBe(
      annapolisTaxSaleNotice.tendersCloseAt,
    );
  });

  it("keeps the public snapshot owner-free and hash-anchored to the linked PDFs", () => {
    expect(annapolisTaxSaleSnapshot.ownerNamesExcluded).toBe(true);
    for (const listing of annapolisTaxSaleSnapshot.listings) {
      expect(
        Object.keys(listing).some((key) => /owner|bidder|occupant|tenant/i.test(key)),
      ).toBe(false);
    }
    expect(annapolisTaxSaleSnapshot.supportingDocuments).toHaveLength(2);
    for (const document of annapolisTaxSaleSnapshot.supportingDocuments) {
      expect(document.url.startsWith("https://annapoliscounty.ca/")).toBe(true);
      expect(document.sha256).toMatch(/^[0-9a-f]{64}$/);
    }
  });
});
