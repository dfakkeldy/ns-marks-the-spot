import type { TaxSaleEvent, TaxSaleGeometryException } from "./taxSaleTypes";
import halifaxTaxSaleSnapshot from "./halifaxTaxSale.snapshot.json";

export const HALIFAX_TAX_SALE_DATASET_SHA256 =
  "33949145508644e6aa516eff2adf47483ac4f1f597fdaee6810942477e5577ec";

const HALIFAX_EVENT_ID = "halifax-2026-09-15";

type HalifaxSnapshotListing = {
  item: number;
  aan: string;
  pids: string[];
  description: string;
  openingBidCents: number;
  redeemable: boolean;
  listingStatus: "advertised" | "withdrawn";
};

type HalifaxTaxSaleEvent = TaxSaleEvent & {
  geometryExceptions: TaxSaleGeometryException[];
};

const snapshotListings = halifaxTaxSaleSnapshot.listings as HalifaxSnapshotListing[];
const exceptionByPid = new Map(
  halifaxTaxSaleSnapshot.geometryExceptions.map((exception) => [exception.pid, exception]),
);

export const halifaxTaxSaleEvent: HalifaxTaxSaleEvent = {
  id: HALIFAX_EVENT_ID,
  municipalityId: "halifax-regional-municipality",
  municipality: halifaxTaxSaleSnapshot.municipality,
  shortMunicipality: "Halifax",
  eventType: "sealed-tender",
  eventStatus: "upcoming",
  saleStartsAt: `${halifaxTaxSaleSnapshot.eventDate}T${halifaxTaxSaleSnapshot.bidDeadlineTime}:00-03:00`,
  venue: halifaxTaxSaleSnapshot.venue,
  sourceUrl: halifaxTaxSaleSnapshot.source,
  secondarySourceUrl: halifaxTaxSaleSnapshot.tenderInstructions,
  landingPageUrl: halifaxTaxSaleSnapshot.landingPage,
  sourceLabel: "Official Halifax Schedule A tax-sale notice",
  retrievedOn: halifaxTaxSaleSnapshot.retrievedDate,
  sourceDatasetSha256: HALIFAX_TAX_SALE_DATASET_SHA256,
  listings: snapshotListings
    .filter(({ pids }) => pids.every((pid) => !exceptionByPid.has(pid)))
    .map((listing) => ({
      eventId: HALIFAX_EVENT_ID,
      recordId: `${HALIFAX_EVENT_ID}-item-${listing.item}`,
      aan: listing.aan,
      pids: listing.pids,
      location: listing.description,
      financial: { kind: "minimum-bid", label: "Opening bid", amountCents: listing.openingBidCents },
      redemptionCategory: listing.redeemable ? "six-month" : "not-redeemable",
      redemptionLabel: listing.redeemable ? "Redeemable - Yes" : "Redeemable - No",
      listingStatus: listing.listingStatus,
    })),
  geometryExceptions: halifaxTaxSaleSnapshot.geometryExceptions.map((exception) => {
    const listing = snapshotListings.find(
      ({ aan, pids }) => aan === exception.aan && pids.length === 1 && pids[0] === exception.pid,
    );
    if (!listing) {
      throw new Error(`Halifax geometry exception ${exception.aan}/${exception.pid} is not an exact source row.`);
    }
    return {
      recordId: `${HALIFAX_EVENT_ID}-item-${listing.item}`,
      aan: listing.aan,
      pids: listing.pids,
      location: listing.description,
      reason: exception.reason as "no-nsprd-geometry",
      checkedOn: exception.checkedOn,
    };
  }),
};
