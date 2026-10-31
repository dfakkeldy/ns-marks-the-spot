import type { TaxSaleEvent } from "./taxSaleTypes";
import { halifaxTimestamp } from "./halifaxTime";
import victoriaTaxSaleSnapshot from "./victoriaTaxSale.snapshot.json";

export const VICTORIA_TAX_SALE_DATASET_SHA256 =
  "ef3ceceb96c400e48d260b5b2e614e328f1a4a86b0103c51ff09e3019721160e";
export const VICTORIA_TAX_SALE_RESULT_DATASET_SHA256 =
  "f2a15dcbb92426e62284c4d439779ae4840cdf28a36c3accf05f79c0e1dae21d";

const VICTORIA_EVENT_ID = `victoria-county-${victoriaTaxSaleSnapshot.eventDate}`;

type VictoriaSnapshotListing = {
  item: number;
  aan: string;
  pids: string[];
  description: string;
  redeemable: boolean;
  totalOwingCents: number;
  listingStatus: "advertised" | "withdrawn";
};

function victoriaSaleMethod(saleMethod: unknown): TaxSaleEvent["eventType"] {
  if (saleMethod === "public-auction" || saleMethod === "sealed-tender") {
    return saleMethod;
  }
  throw new Error(`Unrecognized Victoria sale method ${String(saleMethod)}.`);
}

export const victoriaTaxSaleEvent: TaxSaleEvent = {
  id: VICTORIA_EVENT_ID,
  municipalityId: "victoria-county",
  municipality: victoriaTaxSaleSnapshot.municipality,
  shortMunicipality: "Victoria County",
  eventType: victoriaSaleMethod(victoriaTaxSaleSnapshot.saleMethod),
  eventStatus: "upcoming",
  saleStartsAt: halifaxTimestamp(victoriaTaxSaleSnapshot.eventDate, victoriaTaxSaleSnapshot.bidDeadlineTime),
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
