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
import { ANNAPOLIS_TENDER_DATASET_SHA256 } from "./annapolisTaxSale";
import annapolisTenderDatasetSource from "./annapolisTaxSale.snapshot.json?raw";
import { MIDDLETON_TAX_SALE_DATASET_SHA256 } from "./middletonTaxSale";
import middletonDatasetSource from "./middletonTaxSale.snapshot.json?raw";
import {
  CBRM_RESULT_DATASET_SHA256,
  HISTORICAL_DATASET_SHA256,
} from "./historicalTaxSales";
import historicalDatasetSource from "./historicalTaxSales.json?raw";
import cbrmResultDatasetSource from "./cbrmTaxSaleResults.snapshot.json?raw";

async function sha256Hex(source: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(source),
  );
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}

const event = (id: string) => {
  const match = taxSaleEvents.find((candidate) => candidate.id === id);
  expect(match, `Missing tax-sale event ${id}`).toBeDefined();
  return match!;
};

describe("the multi-municipality tax-sale catalog", () => {
  it("pins the byte-for-byte published Inverness book dataset", async () => {
    expect(await sha256Hex(invernessBookDatasetSource)).toBe(
      INVERNESS_BOOK_DATASET_SHA256,
    );
  });

  it("pins the byte-for-byte published Annapolis tender dataset", async () => {
    expect(await sha256Hex(annapolisTenderDatasetSource)).toBe(
      ANNAPOLIS_TENDER_DATASET_SHA256,
    );
  });

  it("pins the byte-for-byte published Middleton notice dataset", async () => {
    expect(await sha256Hex(middletonDatasetSource)).toBe(
      MIDDLETON_TAX_SALE_DATASET_SHA256,
    );
  });

  it("pins the byte-for-byte historical tax-sale dataset", async () => {
    expect(await sha256Hex(historicalDatasetSource)).toBe(
      HISTORICAL_DATASET_SHA256,
    );
  });

  it("pins the owner-free CBRM result dataset", async () => {
    expect(await sha256Hex(cbrmResultDatasetSource)).toBe(
      CBRM_RESULT_DATASET_SHA256,
    );
  });

  it("represents the Annapolis single-parcel tender without inventing fields", () => {
    const annapolis = event("annapolis-county-2026-08-31");

    expect(annapolis.eventType).toBe("sealed-tender");
    expect(annapolis.eventStatus).toBe("upcoming");
    expect(annapolis.saleStartsAt).toBe("2026-08-31T13:00:00-03:00");
    expect(annapolis.listings).toHaveLength(1);
    expect(annapolis.listings[0].pids).toEqual(["05266937"]);
    expect(annapolis.listings[0].aan).toBe("09153144");
    expect(annapolis.listings[0].financial.kind).toBe("minimum-bid");
    expect(annapolis.listings[0].financial.amountCents).toBe(100);
    expect(annapolis.listings[0].redemptionCategory).toBe("six-month");
    expect(annapolis.sourceDatasetSha256).toBe(
      ANNAPOLIS_TENDER_DATASET_SHA256,
    );
    expect(
      eventLifecycleStatus(annapolis, new Date("2026-08-31T15:59:59Z")),
    ).toBe("upcoming");
    expect(
      eventLifecycleStatus(annapolis, new Date("2026-08-31T16:00:01Z")),
    ).toBe("verify-results");
  });

  it("represents the Middleton auction with exact owner-free notice fields", () => {
    const middleton = event("middleton-2026-08-20");

    expect(middleton.eventType).toBe("public-auction");
    expect(middleton.eventStatus).toBe("upcoming");
    expect(middleton.saleStartsAt).toBe("2026-08-20T10:00:00-03:00");
    expect(middleton.listings).toHaveLength(3);
    expect(middleton.listings.map(({ pids }) => pids)).toEqual([
      ["05078472"],
      ["05193040"],
      ["05030911"],
    ]);
    expect(middleton.listings.map(({ financial }) => financial.amountCents)).toEqual([
      1_183_095,
      8_351_154,
      1_536_838,
    ]);
    expect(middleton.listings.map(({ redemptionCategory }) => redemptionCategory)).toEqual([
      "six-month",
      "six-month",
      "not-redeemable",
    ]);
    expect(
      eventLifecycleStatus(middleton, new Date("2026-08-20T12:59:59Z")),
    ).toBe("upcoming");
    expect(
      eventLifecycleStatus(middleton, new Date("2026-08-20T13:00:01Z")),
    ).toBe("verify-results");
  });

  it("preserves the Inverness 45-listing, 47-PID receipt and twelve withdrawals", () => {
    const inverness = event("inverness-county-2026-08-11");
    const pids = inverness.listings.flatMap(({ pids }) => pids);

    expect(inverness.listings).toHaveLength(45);
    expect(pids).toHaveLength(47);
    expect(new Set(pids).size).toBe(47);
    expect(advertisedPidsForEvents([inverness])).toHaveLength(33);
    expect(
      inverness.listings
        .filter(({ listingStatus }) => listingStatus === "withdrawn")
        .map(({ lien }) => lien),
    ).toEqual(["5", "6", "8", "10", "11", "12", "33", "34", "37", "40", "41", "45"]);
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
      "6675756d1ef10419a74b18062dd2dd1a90916879146b31823d431df261372762",
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
      "middleton-2026-08-20",
      "annapolis-county-2026-08-31",
    ]);
    expect(upcoming.flatMap(({ listings }) => listings)).toHaveLength(49);
    expect(pidsForEvents(upcoming)).toHaveLength(51);
    expect(historical.map(({ id }) => id)).toEqual(["cbrm-2026-07-21"]);
    expect(pidsForEvents(historical)).toHaveLength(68);
  });

  it("finds exact PIDs across municipality boundaries", () => {
    expect(listingContextForPid("15054588")).toBeUndefined();
    expect(listingContextForPid("50203256")?.event.municipalityId).toBe(
      "inverness-county",
    );
    expect(listingContextForPid("05266937")?.event.municipalityId).toBe(
      "annapolis-county",
    );
    expect(listingContextForPid("5266937")).toBeUndefined();
    expect(listingContextForPid("1505458")).toBeUndefined();
  });
});
