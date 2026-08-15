import { describe, expect, it } from "vitest";
import halifaxTaxSaleSnapshotSource from "./halifaxTaxSale.snapshot.json?raw";
import halifaxTaxSaleSnapshot from "./halifaxTaxSale.snapshot.json";
import {
  HALIFAX_TAX_SALE_DATASET_SHA256,
  halifaxTaxSaleEvent,
} from "./halifaxTaxSale";

async function sha256Hex(source: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(source));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

describe("the Halifax September 2026 tender dataset", () => {
  it("pins all 31 owner-free source rows byte for byte", async () => {
    expect(await sha256Hex(halifaxTaxSaleSnapshotSource)).toBe(HALIFAX_TAX_SALE_DATASET_SHA256);
    expect(halifaxTaxSaleSnapshot.ownerNamesExcluded).toBe(true);
    expect(halifaxTaxSaleSnapshot.sourceRowCount).toBe(31);
    expect(halifaxTaxSaleSnapshot.parcelIdentifierCount).toBe(32);
    expect(halifaxTaxSaleSnapshot.mappedListingCount).toBe(29);
    expect(halifaxTaxSaleSnapshot.mappedParcelIdentifierCount).toBe(30);
    expect(halifaxTaxSaleSnapshot.hstYesCount).toBe(9);
    expect(halifaxTaxSaleSnapshot.notRedeemableCount).toBe(2);
  });

  it("maps 29 advertised rows and keeps two source rows as exact geometry exceptions", () => {
    expect(halifaxTaxSaleEvent.eventType).toBe("sealed-tender");
    expect(halifaxTaxSaleEvent.eventStatus).toBe("upcoming");
    expect(halifaxTaxSaleEvent.saleStartsAt).toBe("2026-09-15T10:00:00-03:00");
    expect(halifaxTaxSaleEvent.listings).toHaveLength(29);
    const pids = halifaxTaxSaleEvent.listings.flatMap(({ pids }) => pids);
    expect(pids).toHaveLength(30);
    expect(new Set(pids).size).toBe(30);
    expect(pids).not.toContain("41051889");
    expect(pids).not.toContain("41051897");
    expect(halifaxTaxSaleEvent.geometryExceptions).toEqual([
      {
        recordId: "halifax-2026-09-15-item-26",
        aan: "09417036", pids: ["41051889"],
        location: "40 Regency Park Dr Unit P19 Halifax Cc Unit #P19 *Parking Space",
        reason: "no-nsprd-geometry", checkedOn: "2026-08-15",
      },
      {
        recordId: "halifax-2026-09-15-item-27",
        aan: "09417044", pids: ["41051897"],
        location: "40 Regency Park Dr Unit P20 Halifax Cc Unit #P20 *Parking Space",
        reason: "no-nsprd-geometry", checkedOn: "2026-08-15",
      },
    ]);
  });

  it("preserves opening-bid semantics and keeps public rows owner-free", () => {
    expect(halifaxTaxSaleEvent.listings[0].financial).toEqual({
      kind: "minimum-bid", label: "Opening bid", amountCents: 297_246,
    });
    expect(halifaxTaxSaleEvent.listings[10].pids).toEqual(["00098723", "00632414"]);
    expect(halifaxTaxSaleEvent.listings.filter(
      ({ redemptionCategory }) => redemptionCategory === "not-redeemable",
    ).map(({ aan }) => aan)).toEqual(["05009715", "08587949"]);
    for (const listing of halifaxTaxSaleSnapshot.listings) {
      expect(Object.keys(listing).some((key) => /owner|bidder|occupant|tenant|assessed.?name|hst/i.test(key))).toBe(false);
    }
  });
});
