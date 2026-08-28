import type { TaxSaleEvent, TaxSaleListingStatus } from "./taxSaleTypes";
import { halifaxTimestamp } from "./halifaxTime";
import invernessTaxSaleSnapshot from "./invernessTaxSale.snapshot.json";

export type TaxSaleListing = {
  lien: number;
  aan: string;
  location: string;
  totalArrearsCents: number;
  redeemable: boolean;
  pids: string[];
  listingStatus: TaxSaleListingStatus;
};

export const INVERNESS_BOOK_DATASET_SHA256 =
  "d95bc8357ae406f6a2e3e26b7de7a8d9d52d9fd11fc35cafc3ad321e543ce4ba";

export const invernessTaxSaleNotice = {
  municipality: "Municipality of the County of Inverness",
  publishedOn: invernessTaxSaleSnapshot.publishedDate,
  retrievedOn: invernessTaxSaleSnapshot.retrievedDate,
  saleStartsAt: halifaxTimestamp("2026-08-11", "09:30"),
  venue: "St. Peter's Parish Hall, 260 Main Street, Port Hood",
  sourceUrl: invernessTaxSaleSnapshot.source,
} as const;

export const taxSaleListings: TaxSaleListing[] =
  invernessTaxSaleSnapshot.listings.map((listing) => ({
    lien: listing.lien,
    aan: listing.aan,
    location: listing.location,
    totalArrearsCents: Math.round(listing.recoveryAmount * 100),
    redeemable: listing.redeemable,
    pids: listing.pids,
    listingStatus:
      listing.listingStatus === "withdrawn" ? "withdrawn" : "advertised",
  }));

export const taxSalePids = taxSaleListings
  .filter(({ listingStatus }) => listingStatus === "advertised")
  .flatMap(({ pids }) => pids);

export function listingForPid(pid: string): TaxSaleListing | undefined {
  return taxSaleListings.find(({ pids }) => pids.includes(pid));
}

export const invernessTaxSaleEvent: TaxSaleEvent = {
  id: "inverness-county-2026-08-11",
  municipalityId: "inverness-county",
  municipality: "Municipality of the County of Inverness",
  shortMunicipality: "Inverness County",
  eventType: "public-auction",
  eventStatus: "upcoming",
  saleStartsAt: invernessTaxSaleNotice.saleStartsAt,
  venue: invernessTaxSaleNotice.venue,
  sourceUrl: invernessTaxSaleNotice.sourceUrl,
  sourceLabel: "Official Inverness County notice",
  publishedOn: invernessTaxSaleNotice.publishedOn,
  retrievedOn: invernessTaxSaleNotice.retrievedOn,
  sourceDatasetSha256: INVERNESS_BOOK_DATASET_SHA256,
  listings: taxSaleListings.map((listing) => ({
    eventId: "inverness-county-2026-08-11",
    recordId: `inverness-county-2026-08-11-lien-${listing.lien}`,
    lien: String(listing.lien),
    aan: listing.aan,
    pids: listing.pids,
    location: listing.location,
    financial: {
      kind: "total-arrears",
      label: "Total arrears",
      amountCents: listing.totalArrearsCents,
    },
    redemptionCategory: listing.redeemable
      ? "six-month"
      : "not-redeemable",
    redemptionLabel: listing.redeemable
      ? "Redeemable - Yes"
      : "Redeemable - No",
    listingStatus: listing.listingStatus,
  })),
};
