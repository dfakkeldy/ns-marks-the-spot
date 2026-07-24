import type { TaxSaleEvent } from "./taxSaleTypes";
import annapolisTaxSaleSnapshot from "./annapolisTaxSale.snapshot.json";

export const ANNAPOLIS_TENDER_DATASET_SHA256 =
  "ccfe84b6452c25fce271a8a83ebd9f18fe2055d126d426efac79c415ea84d87b";

export const annapolisTaxSaleNotice = {
  municipality: "Municipality of the County of Annapolis",
  tenderNumber: annapolisTaxSaleSnapshot.tenderNumber,
  retrievedOn: annapolisTaxSaleSnapshot.retrievedDate,
  tendersCloseAt: "2026-08-31T13:00:00-03:00",
  venue: "752 St George Street, Annapolis Royal",
  sourceUrl: annapolisTaxSaleSnapshot.source,
} as const;

const ANNAPOLIS_EVENT_ID = "annapolis-county-2026-08-31";

export const annapolisTaxSaleEvent: TaxSaleEvent = {
  id: ANNAPOLIS_EVENT_ID,
  municipalityId: "annapolis-county",
  municipality: annapolisTaxSaleNotice.municipality,
  shortMunicipality: "Annapolis County",
  eventType: "sealed-tender",
  eventStatus: "upcoming",
  saleStartsAt: annapolisTaxSaleNotice.tendersCloseAt,
  venue: annapolisTaxSaleNotice.venue,
  landingPageUrl: annapolisTaxSaleSnapshot.landingPage,
  sourceUrl: annapolisTaxSaleNotice.sourceUrl,
  secondarySourceUrl: annapolisTaxSaleSnapshot.supportingDocuments[0].url,
  sourceLabel: "Official Annapolis County tender notice",
  retrievedOn: annapolisTaxSaleNotice.retrievedOn,
  sourceDatasetSha256: ANNAPOLIS_TENDER_DATASET_SHA256,
  listings: annapolisTaxSaleSnapshot.listings.map((listing) => ({
    eventId: ANNAPOLIS_EVENT_ID,
    recordId: `${ANNAPOLIS_EVENT_ID}-tender-${listing.tenderItem}`,
    aan: listing.aan,
    pids: listing.pids,
    addressOrDescription: listing.description,
    location: listing.address,
    financial: {
      kind: "minimum-bid",
      label: "Minimum bid (plus HST on the total bid)",
      amountCents: Math.round(listing.minimumBid * 100),
    },
    redemptionCategory:
      listing.redemptionPeriod === "six-month" ? "six-month" : "unknown",
    redemptionLabel:
      listing.redemptionPeriod === "six-month"
        ? "Redeemable - 6 months"
        : "Redemption period not stated",
    listingStatus:
      listing.listingStatus === "withdrawn" ? "withdrawn" : "advertised",
  })),
};
