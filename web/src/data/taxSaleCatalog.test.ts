import { describe, expect, it } from "vitest";
import {
  eventLifecycleStatus,
  eventsForStatus,
  listingContextForPid,
  pidsForEvents,
  taxSaleEvents,
} from "./taxSaleCatalog";
import { INVERNESS_BOOK_DATASET_SHA256 } from "./invernessTaxSale";
import invernessBookDatasetSource from "./invernessTaxSale.snapshot.json?raw";

const event = (id: string) => {
  const match = taxSaleEvents.find((candidate) => candidate.id === id);
  expect(match, `Missing tax-sale event ${id}`).toBeDefined();
  return match!;
};

describe("the multi-municipality tax-sale catalog", () => {
  it("pins the byte-for-byte published Inverness book dataset", async () => {
    const digest = await crypto.subtle.digest(
      "SHA-256",
      new TextEncoder().encode(invernessBookDatasetSource),
    );
    const sha256 = Array.from(new Uint8Array(digest), (byte) =>
      byte.toString(16).padStart(2, "0"),
    ).join("");

    expect(sha256).toBe(INVERNESS_BOOK_DATASET_SHA256);
  });

  it("preserves the Inverness 45-listing, 47-PID receipt and anomalies", () => {
    const inverness = event("inverness-county-2026-08-11");
    const pids = inverness.listings.flatMap(({ pids }) => pids);

    expect(inverness.listings).toHaveLength(45);
    expect(pids).toHaveLength(47);
    expect(new Set(pids).size).toBe(47);
    expect(
      inverness.listings.find(({ lien }) => lien === "11")?.pids,
    ).toEqual(["50076777", "50207794", "50207802"]);
    expect(
      inverness.listings.find(({ lien }) => lien === "19")
        ?.redemptionCategory,
    ).toBe("not-redeemable");
    expect(inverness.listings.find(({ lien }) => lien === "1")?.aan).toBe(
      "00603988",
    );
    expect(INVERNESS_BOOK_DATASET_SHA256).toBe(
      "b69a50e76fd87fc6785e4742367796a4d2ee9f013b9c0ebd002868e01d5c3be4",
    );
    expect(inverness.sourceDatasetSha256).toBe(
      INVERNESS_BOOK_DATASET_SHA256,
    );
  });

  it("relabels an advertised event after its sale date without inventing results", () => {
    const cbrm = event("cbrm-2026-07-21");

    expect(eventLifecycleStatus(cbrm, new Date("2026-07-21T13:59:59Z"))).toBe(
      "upcoming",
    );
    expect(eventLifecycleStatus(cbrm, new Date("2026-07-21T14:00:00Z"))).toBe(
      "verify-results",
    );
    expect(cbrm.eventStatus).toBe("upcoming");
    expect(cbrm.listings.every(({ listingStatus }) => listingStatus === "advertised")).toBe(
      true,
    );
  });

  it("reconciles the CBRM notice to 67 listings and 68 unique PIDs", () => {
    const cbrm = event("cbrm-2026-07-21");
    const pids = cbrm.listings.flatMap(({ pids }) => pids);

    expect(cbrm.listings).toHaveLength(67);
    expect(pids).toHaveLength(68);
    expect(new Set(pids).size).toBe(68);
    expect(cbrm.listings.find(({ lien }) => lien === "26-13")?.pids).toEqual([
      "15426125",
      "15789985",
    ]);
  });

  it("keeps every public listing owner-free and within the allowed schema", () => {
    const allowedFields = new Set([
      "eventId",
      "recordId",
      "lien",
      "aan",
      "pids",
      "addressOrDescription",
      "location",
      "financial",
      "redemptionCategory",
      "redemptionLabel",
      "listingStatus",
    ]);

    for (const listing of taxSaleEvents.flatMap(({ listings }) => listings)) {
      expect(Object.keys(listing).every((key) => allowedFields.has(key))).toBe(
        true,
      );
      expect(
        Object.keys(listing).some((key) =>
          /owner|bidder|occupant|tenant|assessed.?name/i.test(key),
        ),
      ).toBe(false);
      expect(listing.pids.every((pid) => /^\d{8}$/.test(pid))).toBe(true);
      expect(Number.isInteger(listing.financial.amountCents)).toBe(true);
    }
  });

  it("isolates upcoming and historical event counts", () => {
    const upcoming = eventsForStatus("upcoming");
    const historical = eventsForStatus("historical");

    expect(upcoming.map(({ id }) => id)).toEqual([
      "cbrm-2026-07-21",
      "inverness-county-2026-08-11",
    ]);
    expect(upcoming.flatMap(({ listings }) => listings)).toHaveLength(112);
    expect(pidsForEvents(upcoming)).toHaveLength(115);
    expect(historical).toEqual([]);
    expect(pidsForEvents(historical)).toEqual([]);
  });

  it("finds exact PIDs across municipality boundaries", () => {
    expect(listingContextForPid("15054588")?.event.municipalityId).toBe(
      "cbrm",
    );
    expect(listingContextForPid("50203256")?.event.municipalityId).toBe(
      "inverness-county",
    );
    expect(listingContextForPid("1505458")).toBeUndefined();
  });
});
