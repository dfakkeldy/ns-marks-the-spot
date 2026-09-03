import { describe, expect, it } from "vitest";
import victoriaTaxSaleSnapshotSource from "./victoriaTaxSale.snapshot.json?raw";
import victoriaTaxSaleSnapshot from "./victoriaTaxSale.snapshot.json";
import {
  VICTORIA_TAX_SALE_DATASET_SHA256,
  victoriaTaxSaleEvent,
} from "./victoriaTaxSale";

async function sha256Hex(source: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(source));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

describe("the Victoria County September 2026 tender dataset", () => {
  it("pins the owner-free snapshot byte for byte", async () => {
    expect(await sha256Hex(victoriaTaxSaleSnapshotSource)).toBe(VICTORIA_TAX_SALE_DATASET_SHA256);
    expect(victoriaTaxSaleSnapshot.ownerNamesExcluded).toBe(true);
    expect(victoriaTaxSaleSnapshot.sourceRowCount).toBe(9);
    expect(victoriaTaxSaleSnapshot.opaqueRemovedRowCount).toBe(4);
  });

  it("publishes five exact advertised PIDs without inventing removed-row identities", () => {
    expect(victoriaTaxSaleEvent.eventType).toBe("sealed-tender");
    expect(victoriaTaxSaleEvent.eventStatus).toBe("upcoming");
    expect(victoriaTaxSaleEvent.saleStartsAt).toBe("2026-09-14T12:00:00-03:00");
    expect(victoriaTaxSaleEvent.publishedOn).toBe("2026-08-13");
    expect(victoriaTaxSaleEvent.listings).toHaveLength(5);
    expect(victoriaTaxSaleEvent.listings.map(({ pids }) => pids)).toEqual([
      ["85032795"], ["85066322"], ["85014165"],
      ["85168979"], ["85062669"],
    ]);
    expect(victoriaTaxSaleEvent.listings.map(({ financial }) => financial.amountCents)).toEqual([
      184_935, 116_751, 176_636, 428_197, 200_118,
    ]);
    expect(victoriaTaxSaleEvent.listings.every(
      ({ redemptionCategory, listingStatus }) =>
        redemptionCategory === "six-month" && listingStatus === "advertised",
    )).toBe(true);
  });

  it("keeps the archived official receipt external and the public rows owner-free", () => {
    expect(victoriaTaxSaleSnapshot.archiveReceipt.url).toBe(
      "https://web.archive.org/web/20260903202648id_/https://victoriacounty.com/property-tax-sale-notice/",
    );
    expect(victoriaTaxSaleSnapshot.archiveReceipt.sha256).toMatch(/^[0-9a-f]{64}$/);
    for (const listing of victoriaTaxSaleSnapshot.listings) {
      expect(Object.keys(listing).some((key) => /owner|bidder|occupant|tenant|assessed.?name/i.test(key))).toBe(false);
      expect(listing.pids).toHaveLength(1);
    }
  });
});
