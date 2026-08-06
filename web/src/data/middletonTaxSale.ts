import type { TaxSaleEvent } from "./taxSaleTypes";
import middletonTaxSaleSnapshot from "./middletonTaxSale.snapshot.json";

export const MIDDLETON_TAX_SALE_DATASET_SHA256 =
  "f15fd253bf3b2eb01361e7f9a08ea2c05f2242aef95bc99ca3eae5ffe2a7240d";

const MIDDLETON_EVENT_ID = "middleton-2026-08-20";

type MiddletonSnapshotListing = {
  item: number;
  address: string;
  pids: string[];
  aan: string;
  totalDueCents: number;
  redeemable: boolean;
  listingStatus: "advertised" | "withdrawn";
};

export const middletonTaxSaleEvent: TaxSaleEvent = {
  id: MIDDLETON_EVENT_ID,
  municipalityId: "middleton",
  municipality: middletonTaxSaleSnapshot.municipality,
  shortMunicipality: "Middleton",
  eventType: "public-auction",
  eventStatus: "upcoming",
  saleStartsAt: `${middletonTaxSaleSnapshot.eventDate}T${middletonTaxSaleSnapshot.saleTime}:00-03:00`,
  venue: middletonTaxSaleSnapshot.venue,
  sourceUrl: middletonTaxSaleSnapshot.source,
  landingPageUrl: middletonTaxSaleSnapshot.source,
  sourceLabel: "Official Town of Middleton notice",
  retrievedOn: middletonTaxSaleSnapshot.retrievedDate,
  sourceDatasetSha256: MIDDLETON_TAX_SALE_DATASET_SHA256,
  listings: (middletonTaxSaleSnapshot.listings as MiddletonSnapshotListing[]).map(
    (listing) => ({
      eventId: MIDDLETON_EVENT_ID,
      recordId: `${MIDDLETON_EVENT_ID}-item-${listing.item}`,
      aan: listing.aan,
      pids: listing.pids,
      location: listing.address,
      financial: {
        kind: "recovery-amount",
        label: "Total due (subject to municipal confirmation)",
        amountCents: listing.totalDueCents,
      },
      redemptionCategory: listing.redeemable
        ? "six-month"
        : "not-redeemable",
      redemptionLabel: listing.redeemable
        ? "Redeemable - Yes"
        : "Redeemable - No",
      listingStatus: listing.listingStatus,
    }),
  ),
};
