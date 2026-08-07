import type { TaxSaleEvent } from "./taxSaleTypes";
import middletonTaxSaleSnapshot from "./middletonTaxSale.snapshot.json";

export const MIDDLETON_TAX_SALE_DATASET_SHA256 =
  "de851169cf38c179ba9fc82012a36907dd99632f74d58f11e01d72d32f09dac6";

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
