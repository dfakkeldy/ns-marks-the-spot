import { describe, expect, it } from "vitest";
import {
  advertisedPidsForEvents,
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

  it("preserves the Inverness 45-listing, 47-PID receipt and five withdrawals", () => {
    const inverness = event("inverness-county-2026-08-11");
    const pids = inverness.listings.flatMap(({ pids }) => pids);

    expect(inverness.listings).toHaveLength(45);
    expect(pids).toHaveLength(47);
    expect(new Set(pids).size).toBe(47);
    expect(advertisedPidsForEvents([inverness])).toHaveLength(40);
    expect(
      inverness.listings
        .filter(({ listingStatus }) => listingStatus === "withdrawn")
        .map(({ lien }) => lien),
    ).toEqual(["5", "6", "10", "11", "12"]);
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
      "9112514ad22d1daac4c854b57a4e374b04eef6072c66735a64db66d05ff5ed9f",
    );
    expect(inverness.sourceDatasetSha256).toBe(
      INVERNESS_BOOK_DATASET_SHA256,
    );
  });

  it("archives the CBRM event without inventing parcel outcomes", () => {
    const cbrm = event("cbrm-2026-07-21");

    expect(eventLifecycleStatus(cbrm, new Date("2026-07-21T13:59:59Z"))).toBe(
      "historical",
    );
    expect(cbrm.eventStatus).toBe("historical");
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
      "inverness-county-2026-08-11",
    ]);
    expect(upcoming.flatMap(({ listings }) => listings)).toHaveLength(45);
    expect(pidsForEvents(upcoming)).toHaveLength(47);
    expect(historical.map(({ id }) => id)).toEqual(["cbrm-2026-07-21"]);
    expect(pidsForEvents(historical)).toHaveLength(68);
  });

  it("finds exact PIDs across municipality boundaries", () => {
    expect(listingContextForPid("15054588")).toBeUndefined();
    expect(listingContextForPid("50203256")?.event.municipalityId).toBe(
      "inverness-county",
    );
    expect(listingContextForPid("1505458")).toBeUndefined();
  });
});
