import { describe, expect, it } from "vitest";
import halifaxTaxSaleSnapshotSource from "./halifaxTaxSale.snapshot.json?raw";
import halifaxTaxSaleSnapshot from "./halifaxTaxSale.snapshot.json";
import halifaxResultSource from "./halifaxTaxSaleResults.snapshot.json?raw";
import halifaxResultSnapshot from "./halifaxTaxSaleResults.snapshot.json";
import { historicalTaxSaleRecords } from "./historicalTaxSales";
import {
  HALIFAX_TAX_SALE_DATASET_SHA256,
  HALIFAX_TAX_SALE_RESULT_DATASET_SHA256,
  halifaxListingsAndExceptions,
  halifaxOrphanedExceptionPids,
  halifaxTaxSaleEvent,
} from "./halifaxTaxSale";

async function sha256Hex(source: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(source));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

describe("the Halifax December 2026 tender dataset", () => {
  it("pins all 40 owner-free exact-PID rows byte for byte", async () => {
    expect(await sha256Hex(halifaxTaxSaleSnapshotSource)).toBe(HALIFAX_TAX_SALE_DATASET_SHA256);
    expect(halifaxTaxSaleSnapshot.ownerNamesExcluded).toBe(true);
    expect(halifaxTaxSaleSnapshot.tenderNumber).toBe("HRM-TaxSale24");
    expect(halifaxTaxSaleSnapshot.eventDate).toBe("2026-12-08");
    expect(halifaxTaxSaleSnapshot.sourceRowCount).toBe(41);
    expect(halifaxTaxSaleSnapshot.listingCount).toBe(40);
    expect(halifaxTaxSaleSnapshot.parcelIdentifierCount).toBe(40);
    expect(halifaxTaxSaleSnapshot.mappedListingCount).toBe(40);
    expect(halifaxTaxSaleSnapshot.mappedParcelIdentifierCount).toBe(40);
    expect(halifaxTaxSaleSnapshot.mobileHomeWithoutPidCount).toBe(1);
    expect(halifaxTaxSaleSnapshot.hstYesCount).toBe(13);
    expect(halifaxTaxSaleSnapshot.notRedeemableCount).toBe(2);
  });

  it("publishes TaxSale24 as the current upcoming notice", () => {
    expect(halifaxTaxSaleEvent.id).toBe("halifax-2026-12-08");
    expect(halifaxTaxSaleEvent.eventType).toBe("sealed-tender");
    expect(halifaxTaxSaleEvent.eventStatus).toBe("upcoming");
    expect(halifaxTaxSaleEvent.saleStartsAt).toBe("2026-12-08T10:00:00-04:00");
    expect(halifaxTaxSaleEvent.listings).toHaveLength(40);
    const pids = halifaxTaxSaleEvent.listings.flatMap(({ pids }) => pids);
    expect(pids).toHaveLength(40);
    expect(new Set(pids).size).toBe(40);
    expect(pids).toContain("00251272");
    expect(pids).not.toContain("00015966");
    expect(pids).not.toContain("41051889");
    expect(pids).not.toContain("41051897");
    expect(halifaxTaxSaleEvent.geometryExceptions).toEqual([]);
  });

  it("keeps the closed TaxSale23 results in the historical dataset", async () => {
    expect(await sha256Hex(halifaxResultSource)).toBe(HALIFAX_TAX_SALE_RESULT_DATASET_SHA256);
    expect(halifaxResultSnapshot.ownerNamesExcluded).toBe(true);
    expect(halifaxResultSnapshot.resultRowCount).toBe(4);
    const records = historicalTaxSaleRecords.filter(({ eventId }) => eventId === "halifax-2026-09-15");
    expect(records).toHaveLength(10);
    expect(records.filter(({ outcome }) => outcome === "sold")).toHaveLength(3);
    expect(records.filter(({ outcome }) => outcome === "unsold")).toHaveLength(1);
    expect(records.filter(({ outcome }) => outcome === "unknown")).toHaveLength(6);
    expect(records.filter(({ outcome }) => outcome === "unknown").every(({ winningBidCents }) => winningBidCents === null)).toBe(true);
  });

  it("preserves opening-bid semantics and keeps public rows owner-free", () => {
    expect(halifaxTaxSaleEvent.listings[0].financial).toEqual({
      kind: "minimum-bid", label: "Opening bid", amountCents: 240_949,
    });
    expect(halifaxTaxSaleEvent.listings.find(({ aan }) => aan === "00473049")?.pids).toEqual(["00251272"]);
    expect(halifaxTaxSaleEvent.listings.filter(
      ({ redemptionCategory }) => redemptionCategory === "not-redeemable",
    ).map(({ aan }) => aan)).toEqual(["03287408", "09666591"]);
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
        recordId: "halifax-2026-12-08-item-1",
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
