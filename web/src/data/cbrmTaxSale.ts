import type {
  RedemptionCategory,
  TaxSaleEvent,
} from "./taxSaleTypes";
import cbrmTaxSaleSnapshot from "./cbrmTaxSale.snapshot.json";

type CbrmSourceListing = {
  lien: string;
  aan: string;
  pids: string[];
  addressOrDescription: string;
  location: string;
  minimumBidCents: number;
  redemptionCategory: Extract<
    RedemptionCategory,
    "six-month" | "immediate-deed"
  >;
};

const CBRM_EVENT_ID = "cbrm-2026-07-21";

const cbrmSourceListings =
  cbrmTaxSaleSnapshot.listings as CbrmSourceListing[];

export const cbrmTaxSaleEvent: TaxSaleEvent = {
  id: CBRM_EVENT_ID,
  municipalityId: "cbrm",
  municipality: cbrmTaxSaleSnapshot.municipality,
  shortMunicipality: "CBRM",
  eventType: "public-auction",
  eventStatus: "historical",
  saleStartsAt: `${cbrmTaxSaleSnapshot.saleDate}T${cbrmTaxSaleSnapshot.saleTime}:00-03:00`,
  venue: cbrmTaxSaleSnapshot.venue,
  landingPageUrl: cbrmTaxSaleSnapshot.landingPage,
  sourceUrl: cbrmTaxSaleSnapshot.source,
  secondarySourceUrl: cbrmTaxSaleSnapshot.secondarySource,
  sourceLabel: "Official CBRM property list",
  retrievedOn: cbrmTaxSaleSnapshot.retrievedDate,
  listings: cbrmSourceListings.map((listing) => ({
    eventId: CBRM_EVENT_ID,
    recordId: `${CBRM_EVENT_ID}-lien-${listing.lien}`,
    lien: listing.lien,
    aan: listing.aan,
    pids: listing.pids,
    addressOrDescription: listing.addressOrDescription,
    location: listing.location,
    financial: {
      kind: "minimum-bid",
      label: "Minimum bid",
      amountCents: listing.minimumBidCents,
    },
    redemptionCategory: listing.redemptionCategory,
    redemptionLabel:
      listing.redemptionCategory === "six-month"
        ? "Six-month redemption"
        : "Immediate deed (municipal category)",
    listingStatus: "advertised",
  })),
};
