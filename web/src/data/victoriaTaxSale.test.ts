import { describe, expect, it } from "vitest";
import victoriaTaxSaleSnapshotSource from "./victoriaTaxSale.snapshot.json?raw";
import victoriaTaxSaleSnapshot from "./victoriaTaxSale.snapshot.json";
import {
  VICTORIA_TAX_SALE_DATASET_SHA256,
  VICTORIA_TAX_SALE_RESULT_DATASET_SHA256,
  victoriaTaxSaleEvent,
} from "./victoriaTaxSale";
import victoriaResultSnapshotSource from "./victoriaTaxSaleResults.snapshot.json?raw";
import victoriaResultSnapshot from "./victoriaTaxSaleResults.snapshot.json";

async function sha256Hex(source: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(source));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

describe("the Victoria County November 2026 public-auction dataset", () => {
  it("pins the owner-free snapshot byte for byte", async () => {
    expect(await sha256Hex(victoriaTaxSaleSnapshotSource)).toBe(VICTORIA_TAX_SALE_DATASET_SHA256);
    expect(victoriaTaxSaleSnapshot.ownerNamesExcluded).toBe(true);
    expect(victoriaTaxSaleSnapshot.saleMethod).toBe("public-auction");
    expect(victoriaTaxSaleSnapshot.sourceRowCount).toBe(3);
    expect(victoriaTaxSaleSnapshot.opaqueRemovedRowCount).toBe(0);
    expect(await sha256Hex(victoriaResultSnapshotSource)).toBe(
      VICTORIA_TAX_SALE_RESULT_DATASET_SHA256,
    );
    expect(victoriaResultSnapshot.ownerNamesExcluded).toBe(true);
    expect(victoriaResultSnapshot.resultRowCount).toBe(9);
    expect(victoriaResultSnapshot.matchedNoticeListingCount).toBe(4);
    expect(victoriaResultSnapshot.opaqueRemovedRowCount).toBe(4);
    expect(victoriaResultSnapshot.unspecifiedRowCount).toBe(1);
  });

  it("publishes three exact advertised PIDs from the official auction notice", () => {
    expect(victoriaTaxSaleEvent.id).toBe("victoria-county-2026-11-23");
    expect(victoriaTaxSaleEvent.eventType).toBe("public-auction");
    expect(victoriaTaxSaleEvent.eventStatus).toBe("upcoming");
    expect(victoriaTaxSaleEvent.saleStartsAt).toBe("2026-11-23T11:00:00-04:00");
    expect(victoriaTaxSaleEvent.publishedOn).toBe("2026-10-23");
    expect(victoriaTaxSaleEvent.listings).toHaveLength(3);
    expect(victoriaTaxSaleEvent.listings.map(({ pids }) => pids)).toEqual([
      ["85001774"], ["85041416"], ["85058345"],
    ]);
    expect(victoriaTaxSaleEvent.listings.map(({ financial }) => financial.amountCents)).toEqual([
      395_048, 100_000, 184_094,
    ]);
    expect(victoriaTaxSaleEvent.listings.map(({ redemptionCategory }) => redemptionCategory)).toEqual([
      "six-month", "not-redeemable", "six-month",
    ]);
    expect(victoriaTaxSaleEvent.listings.every(
      ({ listingStatus }) => listingStatus === "advertised",
    )).toBe(true);
  });

  it("keeps the archived official receipt external and the public rows owner-free", () => {
    expect(victoriaTaxSaleSnapshot.archiveReceipt.url).toBe(
      "https://web.archive.org/web/20261023200058id_/https://victoriacounty.com/property-tax-sale-notice/",
    );
    expect(victoriaTaxSaleSnapshot.archiveReceipt.sha256).toMatch(/^[0-9a-f]{64}$/);
    for (const listing of victoriaTaxSaleSnapshot.listings) {
      expect(Object.keys(listing).some((key) => /owner|bidder|occupant|tenant|assessed.?name/i.test(key))).toBe(false);
      expect(listing.pids).toHaveLength(1);
    }
  });
});
