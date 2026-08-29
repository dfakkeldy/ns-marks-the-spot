import type { TaxSaleEvent, TaxSaleGeometryException } from "./taxSaleTypes";
import { halifaxTimestamp } from "./halifaxTime";
import halifaxTaxSaleSnapshot from "./halifaxTaxSale.snapshot.json";

export const HALIFAX_TAX_SALE_DATASET_SHA256 =
  "fab79b24349baf4e953934c37b46fa4a529cf62b15f8bfb820ef6b30f339d119";

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

type HalifaxSnapshotException = {
  aan: string;
  pid: string;
  reason: string;
  checkedOn: string;
};

/**
 * Split snapshot rows into mapped listings and geometry exceptions, PER PID.
 *
 * The previous shape had two failure modes the automation-refreshed snapshot
 * could trigger without any code change. A multi-PID listing with ONE
 * unmappable PID was dropped from `listings` entirely — its mappable parcels
 * vanished from the map — and the exception builder THREW at module load for
 * exactly that shape, bricking the whole app on import. Now a listing keeps
 * its mappable PIDs, its unmappable PIDs become an exception row for the
 * same record (per-PID row rendering and per-PID unavailable counts make
 * that representation exact), and a stale exception that matches no source
 * row is returned as an orphan for the snapshot TEST to reject — CI is where
 * a bad refresh should fail, never the user's map at load time.
 */
export function halifaxListingsAndExceptions(
  listings: HalifaxSnapshotListing[],
  exceptions: HalifaxSnapshotException[],
): {
  listings: HalifaxTaxSaleEvent["listings"];
  geometryExceptions: TaxSaleGeometryException[];
  orphanedExceptionPids: string[];
} {
  const exceptionByPid = new Map(
    exceptions.map((exception) => [exception.pid, exception]),
  );
  const claimed = new Set<string>();
  const mapped: HalifaxTaxSaleEvent["listings"] = [];
  const geometryExceptions: TaxSaleGeometryException[] = [];
  for (const listing of listings) {
    const excepted = listing.pids.filter((pid) => {
      const exception = exceptionByPid.get(pid);
      return exception !== undefined && exception.aan === listing.aan;
    });
    const mappable = listing.pids.filter((pid) => !excepted.includes(pid));
    for (const pid of excepted) {
      claimed.add(pid);
    }
    if (mappable.length > 0) {
      mapped.push({
        eventId: HALIFAX_EVENT_ID,
        recordId: `${HALIFAX_EVENT_ID}-item-${listing.item}`,
        aan: listing.aan,
        pids: mappable,
        location: listing.description,
        financial: { kind: "minimum-bid", label: "Opening bid", amountCents: listing.openingBidCents },
        redemptionCategory: listing.redeemable ? "six-month" : "not-redeemable",
        redemptionLabel: listing.redeemable ? "Redeemable - Yes" : "Redeemable - No",
        listingStatus: listing.listingStatus,
      });
    }
    if (excepted.length > 0) {
      const receipt = exceptionByPid.get(excepted[0])!;
      geometryExceptions.push({
        recordId: `${HALIFAX_EVENT_ID}-item-${listing.item}`,
        aan: listing.aan,
        pids: excepted,
        location: listing.description,
        reason: receipt.reason as "no-nsprd-geometry",
        checkedOn: receipt.checkedOn,
      });
    }
  }
  return {
    listings: mapped,
    geometryExceptions,
    orphanedExceptionPids: exceptions
      .map(({ pid }) => pid)
      .filter((pid) => !claimed.has(pid)),
  };
}

const derived = halifaxListingsAndExceptions(
  snapshotListings,
  halifaxTaxSaleSnapshot.geometryExceptions,
);

export const halifaxTaxSaleEvent: HalifaxTaxSaleEvent = {
  id: HALIFAX_EVENT_ID,
  municipalityId: "halifax-regional-municipality",
  municipality: halifaxTaxSaleSnapshot.municipality,
  shortMunicipality: "Halifax",
  eventType: "sealed-tender",
  eventStatus: "upcoming",
  saleStartsAt: halifaxTimestamp(halifaxTaxSaleSnapshot.eventDate, halifaxTaxSaleSnapshot.bidDeadlineTime),
  venue: halifaxTaxSaleSnapshot.venue,
  sourceUrl: halifaxTaxSaleSnapshot.source,
  secondarySourceUrl: halifaxTaxSaleSnapshot.tenderInstructions,
  landingPageUrl: halifaxTaxSaleSnapshot.landingPage,
  sourceLabel: "Official Halifax Schedule A tax-sale notice",
  retrievedOn: halifaxTaxSaleSnapshot.retrievedDate,
  sourceDatasetSha256: HALIFAX_TAX_SALE_DATASET_SHA256,
  listings: derived.listings,
  geometryExceptions: derived.geometryExceptions,
};

/** For the snapshot test: a refresh whose exceptions match no source row. */
export const halifaxOrphanedExceptionPids = derived.orphanedExceptionPids;
