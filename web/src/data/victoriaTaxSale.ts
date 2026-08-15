import type { TaxSaleEvent } from "./taxSaleTypes";
import victoriaTaxSaleSnapshot from "./victoriaTaxSale.snapshot.json";

export const VICTORIA_TAX_SALE_DATASET_SHA256 =
  "d2444c096300054cdcf53e9b74dbede0c108da6bb9acea50bb80b773cd4d9b43";

const VICTORIA_EVENT_ID = "victoria-county-2026-09-14";

type VictoriaSnapshotListing = {
  item: number;
  aan: string;
  pids: string[];
  description: string;
  redeemable: boolean;
  totalOwingCents: number;
  listingStatus: "advertised" | "withdrawn";
};

export const victoriaTaxSaleEvent: TaxSaleEvent = {
  id: VICTORIA_EVENT_ID,
  municipalityId: "victoria-county",
  municipality: victoriaTaxSaleSnapshot.municipality,
  shortMunicipality: "Victoria County",
  eventType: "sealed-tender",
  eventStatus: "upcoming",
  saleStartsAt: `${victoriaTaxSaleSnapshot.eventDate}T${victoriaTaxSaleSnapshot.bidDeadlineTime}:00-03:00`,
  venue: victoriaTaxSaleSnapshot.venue,
  sourceUrl: victoriaTaxSaleSnapshot.source,
  landingPageUrl: victoriaTaxSaleSnapshot.landingPage,
  sourceLabel: "Official Victoria County tax-sale notice",
  publishedOn: victoriaTaxSaleSnapshot.publishedOn,
  retrievedOn: victoriaTaxSaleSnapshot.retrievedDate,
  sourceDatasetSha256: VICTORIA_TAX_SALE_DATASET_SHA256,
  listings: (victoriaTaxSaleSnapshot.listings as VictoriaSnapshotListing[]).map((listing) => ({
    eventId: VICTORIA_EVENT_ID,
    recordId: `${VICTORIA_EVENT_ID}-item-${listing.item}`,
    aan: listing.aan,
    pids: listing.pids,
    location: listing.description,
    financial: {
      kind: "recovery-amount",
      label: "Total owing (subject to municipal confirmation)",
      amountCents: listing.totalOwingCents,
    },
    redemptionCategory: listing.redeemable ? "six-month" : "not-redeemable",
    redemptionLabel: listing.redeemable ? "Redeemable - Yes" : "Redeemable - No",
    listingStatus: listing.listingStatus,
  })),
};
