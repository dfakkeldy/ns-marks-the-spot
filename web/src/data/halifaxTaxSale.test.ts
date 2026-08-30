import { describe, expect, it } from "vitest";
import halifaxTaxSaleSnapshotSource from "./halifaxTaxSale.snapshot.json?raw";
import halifaxTaxSaleSnapshot from "./halifaxTaxSale.snapshot.json";
import {
  HALIFAX_TAX_SALE_DATASET_SHA256,
  halifaxListingsAndExceptions,
  halifaxOrphanedExceptionPids,
  halifaxTaxSaleEvent,
} from "./halifaxTaxSale";

async function sha256Hex(source: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(source));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

describe("the Halifax September 2026 tender dataset", () => {
  it("pins all 28 owner-free source rows byte for byte", async () => {
    expect(await sha256Hex(halifaxTaxSaleSnapshotSource)).toBe(HALIFAX_TAX_SALE_DATASET_SHA256);
    expect(halifaxTaxSaleSnapshot.ownerNamesExcluded).toBe(true);
    expect(halifaxTaxSaleSnapshot.sourceRowCount).toBe(28);
    expect(halifaxTaxSaleSnapshot.parcelIdentifierCount).toBe(28);
    expect(halifaxTaxSaleSnapshot.mappedListingCount).toBe(26);
    expect(halifaxTaxSaleSnapshot.mappedParcelIdentifierCount).toBe(26);
    expect(halifaxTaxSaleSnapshot.hstYesCount).toBe(8);
    expect(halifaxTaxSaleSnapshot.notRedeemableCount).toBe(1);
  });

  it("maps 26 advertised rows and keeps two source rows as exact geometry exceptions", () => {
    expect(halifaxTaxSaleEvent.eventType).toBe("sealed-tender");
    expect(halifaxTaxSaleEvent.eventStatus).toBe("upcoming");
    expect(halifaxTaxSaleEvent.saleStartsAt).toBe("2026-09-15T10:00:00-03:00");
    expect(halifaxTaxSaleEvent.listings).toHaveLength(26);
    const pids = halifaxTaxSaleEvent.listings.flatMap(({ pids }) => pids);
    expect(pids).toHaveLength(26);
    expect(new Set(pids).size).toBe(26);
    expect(pids).not.toContain("41051889");
    expect(pids).not.toContain("41051897");
    expect(halifaxTaxSaleEvent.geometryExceptions).toEqual([
      {
        recordId: "halifax-2026-09-15-item-23",
        aan: "09417036", pids: ["41051889"],
        location: "40 Regency Park Dr Unit P19 Halifax Cc Unit #P19 *Parkin",
        reason: "no-nsprd-geometry", checkedOn: "2026-08-15",
      },
      {
        recordId: "halifax-2026-09-15-item-24",
        aan: "09417044", pids: ["41051897"],
        location: "40 Regency Park Dr Unit P20 Halifax Cc Unit #P20 *Parkin",
        reason: "no-nsprd-geometry", checkedOn: "2026-08-15",
      },
    ]);
  });

  it("preserves opening-bid semantics and keeps public rows owner-free", () => {
    expect(halifaxTaxSaleEvent.listings[0].financial).toEqual({
      kind: "minimum-bid", label: "Opening bid", amountCents: 297_246,
    });
    expect(halifaxTaxSaleEvent.listings.find(({ aan }) => aan === "02365103")?.pids).toEqual(["00098723"]);
    expect(halifaxTaxSaleEvent.listings.filter(
      ({ redemptionCategory }) => redemptionCategory === "not-redeemable",
    ).map(({ aan }) => aan)).toEqual(["08587949"]);
    for (const listing of halifaxTaxSaleSnapshot.listings) {
      expect(Object.keys(listing).some((key) => /owner|bidder|occupant|tenant|assessed.?name|hst/i.test(key))).toBe(false);
    }
  });
});

describe("halifaxListingsAndExceptions", () => {
  const listing = (
    item: number,
    aan: string,
    pids: string[],
  ) => ({
    item,
    aan,
    pids,
    description: `Row ${item}`,
    openingBidCents: 1_000_00,
    redeemable: true,
    listingStatus: "advertised" as const,
  });

  it("keeps a partially unmappable listing's mappable parcels on the map", () => {
    // The previous shape dropped the WHOLE listing from `listings` when one
    // of its PIDs had a geometry exception — and the exception builder threw
    // at module load for exactly this snapshot shape, bricking the app.
    const derived = halifaxListingsAndExceptions(
      [listing(1, "00000001", ["11111111", "22222222"])],
      [{ aan: "00000001", pid: "22222222", reason: "no-nsprd-geometry", checkedOn: "2026-08-20" }],
    );

    expect(derived.listings).toHaveLength(1);
    expect(derived.listings[0].pids).toEqual(["11111111"]);
    expect(derived.geometryExceptions).toEqual([
      expect.objectContaining({
        recordId: "halifax-2026-09-15-item-1",
        pids: ["22222222"],
        reason: "no-nsprd-geometry",
      }),
    ]);
    expect(derived.orphanedExceptionPids).toEqual([]);
  });

  it("moves a fully unmappable listing to exceptions whole", () => {
    const derived = halifaxListingsAndExceptions(
      [listing(2, "00000002", ["33333333"])],
      [{ aan: "00000002", pid: "33333333", reason: "no-nsprd-geometry", checkedOn: "2026-08-20" }],
    );
    expect(derived.listings).toHaveLength(0);
    expect(derived.geometryExceptions[0].pids).toEqual(["33333333"]);
  });

  it("returns a stale exception as an orphan instead of throwing at module load", () => {
    // A bad snapshot refresh must fail in CI (the assertion below), never in
    // the user's browser at import time.
    const derived = halifaxListingsAndExceptions(
      [listing(3, "00000003", ["44444444"])],
      [{ aan: "00000009", pid: "99999999", reason: "no-nsprd-geometry", checkedOn: "2026-08-20" }],
    );
    expect(derived.listings).toHaveLength(1);
    expect(derived.geometryExceptions).toHaveLength(0);
    expect(derived.orphanedExceptionPids).toEqual(["99999999"]);
  });

  it("rejects the CURRENT snapshot if any exception stops matching a source row", () => {
    expect(halifaxOrphanedExceptionPids).toEqual([]);
  });
});
