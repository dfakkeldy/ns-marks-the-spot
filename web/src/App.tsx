import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
} from "react";
import appIconUrl from "../../docs/assets/app-icon.svg";
import {
  MapCanvas,
  type MapLayerId,
  type MapLayerStatus,
} from "./components/MapCanvas";
import { TaxSalePropertyList } from "./components/TaxSalePropertyList";
import {
  advertisedPidsForEvents,
  eventLifecycleStatus,
  eventsForStatus,
  listingContextForPid,
  taxSaleEvents,
  type TaxSaleEvent,
  type TaxSaleListing,
} from "./data/taxSaleCatalog";
import {
  calculateFinancialComparison,
  historicalContextsForPid,
  historicalOutcomeLabel,
  historicalTaxSaleEvents,
  historicalTaxSaleRecords,
  matchedHistoricalPids,
  type HistoricalOutcome,
  type HistoricalRecordContext,
} from "./data/historicalTaxSales";
import {
  PROVINCE_ATTRIBUTION,
  PROVINCE_LICENSE_ACCEPTANCE_KEY,
  PROVINCE_LICENSE_URL,
} from "./licensing/provinceLicense";
import {
  allResourceLayerCatalog,
  floodHazardLayerCatalog,
  hydroPilotLayerCatalog,
  initialHydroPilotLayerVisibility,
  initialFloodHazardLayerVisibility,
  initialProvinceLayerVisibility,
  initialResourceLayerVisibility,
  nativeLayerCatalog,
  provinceLayerCatalog,
  resourceLayerCatalog,
  type HydroPilotLayerDescriptor,
  type HydroPilotLayerId,
  type FloodHazardLayerDescriptor,
  type FloodHazardLayerId,
  type ProvinceLayerId,
  type ResourceControlDescriptor,
  type ResourceLayerId,
  type WebLayerDescriptor,
} from "./layers/layerCatalog";
import {
  CIVIC_ADDRESS_DATASET_URL,
  OPEN_GOVERNMENT_ATTRIBUTION,
  OPEN_GOVERNMENT_LICENCE_URL,
  fetchCivicAddresses,
  formatCivicRoadName,
  searchCivicAddresses,
  type CivicAddress,
} from "./services/civicAddresses";
import {
  fetchParcelAtPoint,
  fetchParcels,
  normalizePid,
  NSPRD_LAYER_URL,
  type NsprdFeatureCollection,
} from "./services/nsprd";
import {
  googleMapsDirectionsUrl,
  plusCodeForCoordinates,
} from "./services/googleMaps";
import {
  ADJACENT_ROAD_DISTANCE_METRES,
  fetchParcelContext,
  mappedAreaForPid,
  type MappedArea,
  type ParcelContext,
} from "./services/parcelContext";
import { buildEvidenceNote } from "./services/evidenceNote";
import {
  fetchParcelFloodHazardEvidence,
  type ParcelFloodHazardEvidence,
} from "./services/floodHazard";
import {
  buildMapShareUrl,
  parseMapShareState,
  type MapMode,
  type MapPosition,
  type ShareLayerId,
} from "./services/mapShareState";
import {
  fetchParcelResourceIntersections,
  type ParcelResourceIntersections,
} from "./services/parcelResources";

const BETA_SIGNUP_URL =
  "mailto:map@kinnokilabs.com?subject=NS%20Marks%20The%20Spot%20beta%20signup";

type TaxSaleFilter = "all" | "redemption" | "immediate-or-none";
type HistoricalOutcomeFilter = "all" | HistoricalOutcome;

const EMPTY_FEATURES: NsprdFeatureCollection = {
  type: "FeatureCollection",
  features: [],
};

type ParcelContextState =
  | { status: "idle" | "loading" | "error"; value: ParcelContext }
  | { status: "ready"; value: ParcelContext };

type CivicAddressState =
  | { status: "idle" | "loading" | "error"; value: CivicAddress[] }
  | { status: "ready"; value: CivicAddress[] };

type ParcelResourceState =
  | { status: "idle" | "loading"; value: ParcelResourceIntersections }
  | { status: "ready"; value: ParcelResourceIntersections };

type FloodHazardState =
  | { status: "idle" | "loading" }
  | { status: "ready"; value: ParcelFloodHazardEvidence };

const EMPTY_PARCEL_CONTEXT: ParcelContext = { roads: [], water: [] };
const EMPTY_CIVIC_ADDRESSES: CivicAddress[] = [];
const EMPTY_RESOURCE_INTERSECTIONS: ParcelResourceIntersections = {
  "mineral-occurrences": { status: "ready", intersections: [] },
  "mineral-tenure": { status: "ready", intersections: [] },
  "abandoned-mines": { status: "ready", intersections: [] },
};

const allMapLayerIds: MapLayerId[] = [
  "modern",
  ...provinceLayerCatalog.map(({ id }) => id),
  ...allResourceLayerCatalog.map(({ id }) => id),
  ...hydroPilotLayerCatalog.map(({ id }) => id),
  ...floodHazardLayerCatalog.map(({ id }) => id),
];

function initialLayerStatuses(): Record<MapLayerId, MapLayerStatus> {
  return Object.fromEntries(
    allMapLayerIds.map((id) => [id, { status: "idle" }]),
  ) as Record<MapLayerId, MapLayerStatus>;
}

function disabledProvinceLayers(): Record<ProvinceLayerId, boolean> {
  return Object.fromEntries(
    provinceLayerCatalog.map(({ id }) => [id, false]),
  ) as Record<ProvinceLayerId, boolean>;
}

const currency = new Intl.NumberFormat("en-CA", {
  style: "currency",
  currency: "CAD",
});

const eventDate = new Intl.DateTimeFormat("en-CA", {
  dateStyle: "long",
  timeZone: "America/Halifax",
});

const upcomingTaxSaleEvents = eventsForStatus("upcoming");
const upcomingTaxSalePids = advertisedPidsForEvents(upcomingTaxSaleEvents);
const allHistoricalTaxSalePids = matchedHistoricalPids();
const historicalMunicipalities = Array.from(
  new Map(
    historicalTaxSaleEvents.map((event) => [
      event.municipalityId,
      event.shortMunicipality,
    ]),
  ),
);
const historicalYears = Array.from(
  new Set(historicalTaxSaleEvents.map(({ saleDate }) => saleDate.slice(0, 4))),
).sort((left, right) => right.localeCompare(left));
const historicalOutcomeOrder: HistoricalOutcome[] = [
  "sold",
  "unsold",
  "withdrawn",
  "cancelled",
  "redeemed",
  "unknown",
];
const historicalOutcomes = historicalOutcomeOrder.filter((outcome) =>
  historicalTaxSaleRecords.some((record) => record.outcome === outcome),
);

function eventDateLabel(event: TaxSaleEvent): string {
  const timestamp = event.saleStartsAt ?? event.closedAt;
  return timestamp ? eventDate.format(new Date(timestamp)) : "Date not listed";
}

function countLabel(count: number, singular: string): string {
  return `${count} ${count === 1 ? singular : `${singular}s`}`;
}

function snapshotDateLabel(event: TaxSaleEvent): string {
  return eventDate.format(
    new Date(`${event.retrievedOn}T12:00:00-03:00`),
  );
}

function eventLifecycleLabel(event: TaxSaleEvent, now: number): string {
  switch (eventLifecycleStatus(event, now)) {
    case "historical":
      return "Historical";
    case "verify-results":
      return "Past sale date — verify results with the municipality.";
    case "upcoming":
      return "Upcoming";
  }
}

function listingStatusLabel(listing: TaxSaleListing): string {
  switch (listing.listingStatus) {
    case "advertised":
      return "Advertised in notice";
    case "withdrawn":
      return "Withdrawn in current municipal notice revision";
    case "sold":
      return "Historical sold result - not available";
    case "unsold":
      return "Historical unsold result - not available";
  }
}

function listingMatchesTaxSaleFilter(
  listing: TaxSaleListing,
  filter: TaxSaleFilter,
): boolean {
  if (filter === "redemption") {
    return listing.redemptionCategory === "six-month";
  }
  if (filter === "immediate-or-none") {
    return (
      listing.redemptionCategory === "immediate-deed" ||
      listing.redemptionCategory === "not-redeemable"
    );
  }
  return true;
}

function historicalSaleMethodLabel(
  method: HistoricalRecordContext["event"]["saleMethod"],
): string {
  return method === "sealed-tender" ? "Sealed tender" : "Public auction";
}

function matchMethodLabel(
  context: HistoricalRecordContext,
): string {
  switch (context.record.nspMatchMethod) {
    case "exact-official-pid":
      return "Exact official eight-digit PID";
    case "deterministic-reconciliation":
      return "Deterministic authoritative-field reconciliation";
    case "none":
      return "Not matched";
  }
}

function isLicenceAccepted(): boolean {
  return (
    localStorage.getItem(PROVINCE_LICENSE_ACCEPTANCE_KEY) === "accepted"
  );
}

function mergeFeatureCollections(
  current: NsprdFeatureCollection,
  incoming: NsprdFeatureCollection,
): NsprdFeatureCollection {
  const featureKey = (
    feature: NsprdFeatureCollection["features"][number],
  ) => `${feature.properties.PID}:${JSON.stringify(feature.geometry)}`;
  const featureKeys = new Set(
    current.features.map(featureKey),
  );

  return {
    type: "FeatureCollection",
    features: [
      ...current.features,
      ...incoming.features.filter((feature) => {
        const key = featureKey(feature);
        if (featureKeys.has(key)) {
          return false;
        }
        featureKeys.add(key);
        return true;
      }),
    ],
  };
}

function HistoricalOutcomeDetails({
  context,
  selectedPid,
}: {
  context: HistoricalRecordContext;
  selectedPid: string;
}) {
  const { event, record } = context;
  const comparison = calculateFinancialComparison(event, record);
  const awaitingResults = event.resultStatus === "awaiting-official-results";
  const winningBidLabel =
    record.winningBidCents !== null
      ? currency.format(record.winningBidCents / 100)
      : record.outcome === "unsold"
        ? "No winning bid - official result says no bids"
        : awaitingResults
          ? "Awaiting official results"
          : "Not published in verified sources";

  return (
    <article className="historical-outcome-card">
      <header>
        <div>
          <strong>
            {awaitingResults
              ? "Outcome pending"
              : historicalOutcomeLabel(record.outcome)}
          </strong>
          <span>{eventDate.format(new Date(`${event.saleDate}T12:00:00-03:00`))}</span>
        </div>
        <span className={`outcome-marker ${record.outcome}`}>
          Historical record
        </span>
      </header>
      <dl className="parcel-facts historical-facts">
        <div>
          <dt>Municipality</dt>
          <dd>{event.municipality}</dd>
        </div>
        <div>
          <dt>Event / method</dt>
          <dd>
            {event.id} · {historicalSaleMethodLabel(event.saleMethod)}
          </dd>
        </div>
        <div>
          <dt>{event.listingIdentifierLabel}</dt>
          <dd>{record.listingIdentifier}</dd>
        </div>
        <div>
          <dt>PID / match</dt>
          <dd>
            {selectedPid} · {matchMethodLabel(context)}
          </dd>
        </div>
        <div>
          <dt>Official location</dt>
          <dd>{record.civicDescription}</dd>
        </div>
        <div>
          <dt>{event.advertisedAmountLabel}</dt>
          <dd>{currency.format(record.advertisedAmountCents / 100)}</dd>
        </div>
        <div>
          <dt>Winning bid</dt>
          <dd>{winningBidLabel}</dd>
        </div>
        {comparison ? (
          <>
            <div>
              <dt>Difference</dt>
              <dd>{currency.format(comparison.differenceCents / 100)}</dd>
            </div>
            <div>
              <dt>Above {event.advertisedAmountLabel.toLocaleLowerCase()}</dt>
              <dd>{comparison.percentageAbove.toFixed(2)}%</dd>
            </div>
            <div>
              <dt>Winning-bid multiple</dt>
              <dd>{comparison.winningBidMultiple.toFixed(2)}×</dd>
            </div>
          </>
        ) : null}
        <div>
          <dt>Redemption field</dt>
          <dd>{record.redemptionLabel}</dd>
        </div>
        <div>
          <dt>Source snapshots</dt>
          <dd>
            Notice {event.noticeSnapshotDate} · {event.resultSnapshotDate
              ? `result ${event.resultSnapshotDate}`
              : `results checked ${event.resultCheckedOn}`}
          </dd>
        </div>
        <div>
          <dt>Retrieved</dt>
          <dd>{event.retrievedOn}</dd>
        </div>
      </dl>
      {record.pids.length > 1 ? (
        <p className="multi-pid-warning">
          This one listing covers {record.pids.length} PIDs ({record.pids.join(", ")}).
          The listing-level amounts are not divided between parcels.
        </p>
      ) : null}
      {record.resultNote ? <p className="historical-result-note">{record.resultNote}</p> : null}
      <div className="historical-source-links">
        <a href={event.noticeUrl} target="_blank" rel="noreferrer">
          Official notice
        </a>
        {event.resultUrl ? (
          <a href={event.resultUrl} target="_blank" rel="noreferrer">
            Official result
          </a>
        ) : event.landingPageUrl ? (
          <a href={event.landingPageUrl} target="_blank" rel="noreferrer">
            Check official results
          </a>
        ) : null}
      </div>
      <p className="historical-limit">
        {awaitingResults
          ? "Dated notice record only; no result is claimed. It is not a current offering and does not prove a sale, present ownership, title, redemption, legal access, or parcel status."
          : "Dated outcome only. It is not a current offering and does not prove present ownership, title, redemption, legal access, or parcel status."}
      </p>
    </article>
  );
}

function ParcelInspector({
  pid,
  context,
  mappedArea,
  mappedContext,
  civicAddresses,
  historicalContexts,
  resourceIntersections,
  floodHazard,
  mapMode,
  shareUrl,
  shareMessage,
  onCopyShareUrl,
  onExportEvidence,
  evidenceReady,
  now,
  onClose,
}: {
  pid: string;
  context?: { event: TaxSaleEvent; listing: TaxSaleListing };
  mappedArea: MappedArea | null;
  mappedContext: ParcelContextState;
  civicAddresses: CivicAddressState;
  historicalContexts: HistoricalRecordContext[];
  resourceIntersections: ParcelResourceState;
  floodHazard: FloodHazardState;
  mapMode: MapMode;
  shareUrl: string;
  shareMessage: string | null;
  onCopyShareUrl: () => void;
  onExportEvidence: () => void;
  evidenceReady: boolean;
  now: number;
  onClose: () => void;
}) {
  const listing = context?.listing;
  const event = context?.event;
  const firstHistoricalContext = historicalContexts[0];
  const lifecycleStatus = event
    ? eventLifecycleStatus(event, now)
    : undefined;
  const historical = lifecycleStatus === "historical";
  const needsResultVerification = lifecycleStatus === "verify-results";

  return (
    <aside className="parcel-inspector" aria-label={`Parcel ${pid} details`}>
      <button
        className="inspector-close"
        type="button"
        onClick={onClose}
        aria-label="Close parcel details"
      >
        ×
      </button>
      <h2>
        {listing?.addressOrDescription ??
          listing?.location ??
          firstHistoricalContext?.record.civicDescription ??
          `PID ${pid}`}
      </h2>
      <p className={listing ? "notice-status" : "parcel-status"}>
        {listing
          ? historical
            ? "Historical result - not available"
            : needsResultVerification
              ? "Past sale date — verify results with the municipality."
            : "Listed in official notice"
          : historicalContexts.length > 0
            ? `${historicalContexts.length} historical tax-sale ${historicalContexts.length === 1 ? "record" : "records"}`
            : "NSPRD parcel"}
      </p>
      <p className={`parcel-mode-marker ${mapMode}`}>
        {mapMode === "current" ? "Current-notice mode" : "Historical-records mode"}
      </p>
      <dl className="parcel-facts">
        {event ? (
          <>
            <div>
              <dt>Municipality</dt>
              <dd>{event.municipality}</dd>
            </div>
            <div>
              <dt>Event</dt>
              <dd>
                {eventDateLabel(event)} · {eventLifecycleLabel(event, now)}
              </dd>
            </div>
          </>
        ) : null}
        <div>
          <dt>PID</dt>
          <dd>{pid}</dd>
        </div>
        {mappedArea ? (
          <div>
            <dt>Mapped area</dt>
            <dd>{mappedArea.label}</dd>
          </div>
        ) : null}
        {listing ? (
          <>
            <div>
              <dt>Lien</dt>
              <dd>{listing.lien}</dd>
            </div>
            {listing.aan ? (
              <div>
                <dt>AAN</dt>
                <dd>{listing.aan}</dd>
              </div>
            ) : null}
            <div>
              <dt>Official location</dt>
              <dd>{listing.location}</dd>
            </div>
            <div>
              <dt>{listing.financial.label}</dt>
              <dd>{currency.format(listing.financial.amountCents / 100)}</dd>
            </div>
            <div>
              <dt>Redemption</dt>
              <dd>{listing.redemptionLabel}</dd>
            </div>
            <div>
              <dt>Listing status</dt>
              <dd>{listingStatusLabel(listing)}</dd>
            </div>
            <div>
              <dt>Source retrieved</dt>
              <dd>{event?.retrievedOn}</dd>
            </div>
          </>
        ) : null}
      </dl>
      {mappedArea ? (
        <p className="mapped-area-note">
          Calculated from NSPRD geometry and approximate; not a survey.
        </p>
      ) : null}
      {historicalContexts.length > 0 ? (
        <section className="historical-outcomes" aria-label="Historical tax-sale records">
          <h3>Historical tax-sale records</h3>
          {historicalContexts.map((historicalContext) => (
            <HistoricalOutcomeDetails
              key={historicalContext.record.recordId}
              context={historicalContext}
              selectedPid={pid}
            />
          ))}
        </section>
      ) : null}
      <CivicAddressDetails state={civicAddresses} />
      <MappedContextDetails state={mappedContext} civicAddresses={civicAddresses} />
      <FloodHazardDetails state={floodHazard} />
      <ParcelResourceDetails state={resourceIntersections} />
      {listing ? (
        <p className="sale-warning">
          <span aria-hidden="true">!</span>
          {historical
            ? "This is a dated historical result, not a currently available property."
            : listing.listingStatus === "withdrawn"
              ? `The municipality's current notice revision strikes this listing out. Verify status directly with ${event?.shortMunicipality}; this map does not imply access, clear title, possession or buildability.`
            : needsResultVerification
              ? `The advertised sale date has passed. Verify results and current status with ${event?.shortMunicipality}. This map does not imply access, clear title, possession or buildability.`
            : `Properties may be paid, removed or deferred. Verify current status with ${event?.shortMunicipality}. This map does not imply access, clear title, possession or buildability.`}
        </p>
      ) : historicalContexts.length === 0 ? (
        <p className="sale-warning neutral">
          This PID is not listed in any municipal notice included by this map.
        </p>
      ) : null}
      {event ? (
        <a
          className="primary-action inspector-action"
          href={event.sourceUrl}
          target="_blank"
          rel="noreferrer"
        >
          View direct official source
        </a>
      ) : null}
      <div className="evidence-actions">
        <button className="secondary-action" type="button" onClick={onCopyShareUrl}>
          Copy share link
        </button>
        <button
          className="secondary-action"
          type="button"
          disabled={!evidenceReady}
          title={
            evidenceReady ? undefined : "Waiting for geology and resource evidence"
          }
          onClick={onExportEvidence}
        >
          Export evidence note
        </button>
      </div>
      <p className="share-status" role="status" aria-live="polite">
        {shareMessage}
      </p>
      <a className="share-url-preview" href={shareUrl}>
        Open this exact map state
      </a>
    </aside>
  );
}

const COASTAL_HAZARD_MAP_URL = "https://nsgi.novascotia.ca/chm";
const COASTAL_HAZARD_LICENCE_URL =
  "https://nsgiwa.novascotia.ca/documents/licenses/unrestricted/unrestrictedLicense.pdf";
const PUBLISHED_RIVER_FLOOD_URL =
  "https://fletcher.novascotia.ca/arcgis/rest/services/mrlu/flood_risk_areas/MapServer";

function FloodHazardDetails({ state }: { state: FloodHazardState }) {
  if (state.status !== "ready") {
    return (
      <section className="flood-hazard-evidence" aria-label="Flood hazard evidence">
        <h3>Flood hazard evidence</h3>
        <p className="mapped-context-status" role="status">
          Checking published river and coastal hazard mapping…
        </p>
      </section>
    );
  }

  const { river, coastal } = state.value;
  return (
    <section className="flood-hazard-evidence" aria-label="Flood hazard evidence">
      <h3>Flood hazard evidence</h3>
      <div className="flood-hazard-group">
        <h4>Published river mapping</h4>
        {river.status === "published-intersection" ? (
          <ul>
            {river.aep.map(({ annualExceedanceProbabilityPercent, relationship, places }) => (
              <li key={`${annualExceedanceProbabilityPercent}:${relationship}`}>
                {annualExceedanceProbabilityPercent}% annual-exceedance {relationship === "area" ? "flood area" : "boundary"} intersects the parcel ({places.join(", ")}).
              </li>
            ))}
          </ul>
        ) : river.status === "within-published-layer-extent" ? (
          <p>
            No published river flood geometry intersected. The parcel is within a
            published layer’s geographic extent, but the service has no study-coverage
            polygon; absence is not inferred.
          </p>
        ) : river.status === "outside-published-layer-extents" ? (
          <p>
            Outside the geographic extents of the four published river-flood study
            layers. River flood probability is not assessed.
          </p>
        ) : (
          <p className="error">Published river source unavailable; no absence is inferred.</p>
        )}
      </div>
      <div className="flood-hazard-group">
        <h4>Coastal scenarios</h4>
        <ul>
          {coastal.map((result) => {
            const label = result.scenario === "current" ? "Current" : result.scenario;
            if (result.status === "error") {
              return <li key={result.scenario}>{label} source unavailable; no absence is inferred.</li>;
            }
            if (result.status === "no-intersection") {
              return <li key={result.scenario}>No {result.scenario} map pixels intersected this parcel; this is not proof of no coastal hazard.</li>;
            }
            const area = result.approximateAffectedSquareMetres === null
              ? ""
              : ` (${Math.round(result.approximateAffectedSquareMetres).toLocaleString("en-CA")} m²)`;
            return (
              <li key={result.scenario}>
                {label}: approximately {result.approximateAffectedPercent}% of mapped parcel area{area} intersects the scenario.
              </li>
            );
          })}
        </ul>
      </div>
      <p className="flood-hazard-caveat">
        A 1% or 5% annual-exceedance probability describes the mapped flood event,
        not a universal probability for the whole PID. Coastal 2050 and 2100 values
        are sea-level scenarios, not additional probabilities. Raster area is an
        approximate screen, not a survey, elevation certificate, or insurance finding.
      </p>
      <p className="flood-hazard-sources">
        Sources: <a href={PUBLISHED_RIVER_FLOOD_URL} target="_blank" rel="noreferrer">published river layers</a>{" "}
        and <a href={COASTAL_HAZARD_MAP_URL} target="_blank" rel="noreferrer">Nova Scotia Coastal Hazard Map</a>.{" "}
        Coastal data <a href={COASTAL_HAZARD_LICENCE_URL} target="_blank" rel="noreferrer">licence and notices</a>.
      </p>
      <div className="flood-hazard-licence-notice">
        <p>Reproduced and distributed with the permission of the Department of Service Nova Scotia.</p>
        <p>
          This product has been produced by KinNoKi Labs and includes data provided
          by the Department of Service Nova Scotia. The incorporation of that data
          shall not be construed as constituting an endorsement by the Department
          of Service Nova Scotia of this product.
        </p>
        <p>
          Service Nova Scotia makes no representation and gives no warranty of any
          kind respecting the data’s accuracy, usefulness, novelty, validity, scope,
          completeness, or currency.
        </p>
      </div>
    </section>
  );
}

function CivicAddressDetails({ state }: { state: CivicAddressState }) {
  const heading =
    state.status === "ready" && state.value.length === 1
      ? "Mapped civic address"
      : "Mapped civic addresses";

  return (
    <section className="civic-addresses">
      <h3>{heading}</h3>
      <p className="civic-address-caveat prominent">
        <strong>Authoritative mapped civic points only.</strong>{" "}
        Mapped physical-address points are not proof of ownership, mailing
        address, access, occupancy, or legal parcel status.
      </p>
      {state.status === "idle" || state.status === "loading" ? (
        <p className="civic-address-status" role="status">
          Looking up mapped civic addresses…
        </p>
      ) : state.status === "error" ? (
        <p className="civic-address-status error" role="status">
          Civic address lookup is unavailable right now.
        </p>
      ) : state.value.length === 0 ? (
        <p className="civic-address-status">
          No civic address point is mapped inside this parcel.
        </p>
      ) : (
        <ul>
          {state.value.map(({ pntid, label, coordinates }) => {
            const plusCode = plusCodeForCoordinates(coordinates);

            return (
              <li key={pntid}>
                <span>{label}</span>
                <a
                  className="plus-code-link"
                  href={googleMapsDirectionsUrl(coordinates)}
                  target="_blank"
                  rel="noreferrer"
                  aria-label={`${plusCode} — Directions in Google Maps`}
                >
                  <span className="plus-code">{plusCode}</span>
                  <span>Directions in Google Maps</span>
                </a>
              </li>
            );
          })}
        </ul>
      )}
      <p className="civic-address-source">
        Source: {" "}
        <a href={CIVIC_ADDRESS_DATASET_URL} target="_blank" rel="noreferrer">
          Nova Scotia Civic Address File
        </a>
        .
      </p>
      <p className="civic-address-source">
        <span>{OPEN_GOVERNMENT_ATTRIBUTION}</span>{" "}
        <a
          href={OPEN_GOVERNMENT_LICENCE_URL}
          target="_blank"
          rel="noreferrer"
        >
          Open Government Licence – Nova Scotia
        </a>
      </p>
    </section>
  );
}

function MappedFeatureList({
  title,
  emptyMessage,
  features,
}: {
  title: string;
  emptyMessage: string;
  features: ParcelContext["roads"];
}) {
  const relationshipLabel = (
    relationship: ParcelContext["roads"][number]["relationship"],
  ) => {
    switch (relationship) {
      case "intersects":
        return "Intersects parcel";
      case "adjacent":
        return `Adjacent within ${ADJACENT_ROAD_DISTANCE_METRES} m`;
      case "civic-address":
        return "Named by civic address";
    }
  };

  return (
    <section className="mapped-context-group">
      <h3>{title}</h3>
      {features.length > 0 ? (
        <ul>
          {features.map(({ name, kind, relationship }) => (
            <li key={`${name}:${kind}:${relationship}`}>
              <strong>{name}</strong>
              <span>
                {name.toLocaleLowerCase() !== kind.toLocaleLowerCase()
                  ? `${kind} · `
                  : ""}
                {relationshipLabel(relationship)}
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p>{emptyMessage}</p>
      )}
    </section>
  );
}

function MappedContextDetails({
  state,
  civicAddresses,
}: {
  state: ParcelContextState;
  civicAddresses: CivicAddressState;
}) {
  if (state.status === "idle" || state.status === "loading") {
    return (
      <p className="mapped-context-status" role="status">
        Loading mapped road and water intersections…
      </p>
    );
  }

  if (state.status === "error") {
    return (
      <p className="mapped-context-status error" role="status">
        Mapped road and water intersections are unavailable right now.
      </p>
    );
  }

  const mappedRoadNames = new Set(
    state.value.roads.map(({ name }) => name.toLocaleLowerCase()),
  );
  const civicRoads =
    civicAddresses.status === "ready"
      ? Array.from(
          new Set(
            civicAddresses.value
              .map(({ properties }) => formatCivicRoadName(properties))
              .filter((name): name is string => name !== null),
          ),
        )
          .filter((name) => !mappedRoadNames.has(name.toLocaleLowerCase()))
          .map((name) => ({
            name,
            kind: "Civic Address File",
            relationship: "civic-address" as const,
          }))
      : [];
  const roads = [...state.value.roads, ...civicRoads];

  return (
    <div className="mapped-context">
      <MappedFeatureList
        title="Roads at or beside parcel"
        emptyMessage="No intersecting, adjacent, or civic-address road was found for this parcel."
        features={roads}
      />
      <p className="road-access-caveat">
        Adjacency and civic addressing are useful map context, not proof of legal
        access or road frontage.
      </p>
      <MappedFeatureList
        title="Intersecting water features"
        emptyMessage="No mapped water feature intersects this parcel."
        features={state.value.water}
      />
    </div>
  );
}

function ParcelResourceDetails({ state }: { state: ParcelResourceState }) {
  if (state.status === "idle" || state.status === "loading") {
    return (
      <section className="parcel-resources" aria-label="Geology & resource context">
        <h3>Geology &amp; resource context</h3>
        <p className="mapped-context-status" role="status">
          Checking official mapped resource sources against this parcel…
        </p>
      </section>
    );
  }

  return (
    <section className="parcel-resources" aria-label="Geology & resource context">
      <h3>Geology &amp; resource context</h3>
      {resourceLayerCatalog.map((layer) => {
        const result = state.value[layer.id];
        return (
          <div className="parcel-resource-group" key={layer.id}>
            <h4>{layer.name}</h4>
            {result.status === "error" ? (
              <p className="mapped-context-status error">
                Source unavailable; no absence is inferred.
              </p>
            ) : result.intersections.length === 0 ? (
              <p>
                {layer.id === "mineral-occurrences"
                  ? "No published mineral occurrence was returned on or within 1 km of this parcel."
                  : "No mapped intersection was returned for this parcel."}
              </p>
            ) : (
              <ul>
                {result.intersections.map(({ id, name, detail, relationship }) => (
                  <li key={`${layer.id}:${id}`}>
                    <strong>{name}</strong>
                    {layer.id === "mineral-occurrences" ? (
                      <span>
                        {id} · {relationship === "on-parcel" ? "On parcel" : "Within 1 km"}
                      </span>
                    ) : null}
                    {detail ? <span>{detail}</span> : null}
                  </li>
                ))}
              </ul>
            )}
            <a href={layer.sourceUrl} target="_blank" rel="noreferrer">
              {layer.name} source
            </a>
          </div>
        );
      })}
      <p className="resource-intersection-caveat">
        On-parcel and nearby published records are screening context only. This
        context does not prove mineralization, deposit extent, grade,
        recoverability, value, mineral rights, access, permission to explore, or
        source completeness.
      </p>
    </section>
  );
}

function RoadLegend() {
  return (
    <ul className="road-legend" aria-label="Road type legend">
      <li>
        <span className="road-swatch highway" />Highway
      </li>
      <li>
        <span className="road-swatch local" />Local road
      </li>
      <li>
        <span className="road-swatch resource" />Resource road
      </li>
      <li>
        <span className="road-swatch trail" />Trail / track
      </li>
      <li>
        <span className="road-swatch culvert" />Culvert
      </li>
    </ul>
  );
}

function LicenceDialog({
  onAccept,
  onContinueWithout,
}: {
  onAccept: () => void;
  onContinueWithout: () => void;
}) {
  return (
    <div className="dialog-backdrop">
      <section
        className="licence-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="licence-title"
      >
        <div className="licence-mark" aria-hidden="true">
          NS
        </div>
        <h2 id="licence-title">Use Nova Scotia map data</h2>
        <p>
          Aerial imagery, property boundaries, Crown lands, flood-risk areas,
          waterfalls, water features, and transportation features come from
          Province map services. Accept the Province’s restricted geographic
          services licence before these layers are loaded.
        </p>
        <blockquote>{PROVINCE_ATTRIBUTION}</blockquote>
        <p className="licence-caveat">
          Property boundaries are approximate and are not a legal survey.
        </p>
        <a href={PROVINCE_LICENSE_URL} target="_blank" rel="noreferrer">
          Read the Province licence
        </a>
        <div className="dialog-actions">
          <button className="primary-action" type="button" onClick={onAccept}>
            Accept and view map layers
          </button>
          <button
            className="secondary-action"
            type="button"
            onClick={onContinueWithout}
          >
            Continue without Province layers
          </button>
        </div>
      </section>
    </div>
  );
}

function layerRuntimeLabel(
  checked: boolean,
  status: MapLayerStatus,
): string {
  if (!checked) {
    return "Off";
  }
  switch (status.status) {
    case "loading":
      return "Loading visible area…";
    case "ready":
      return status.count === undefined
        ? "Ready"
        : `Ready · ${status.count.toLocaleString("en-CA")} loaded`;
    case "zoom":
      return `Zoom to ${status.minZoom}+ to load`;
    case "error":
      return "Source temporarily unavailable";
    case "idle":
      return "Ready to load";
  }
}

function LayerMetadata({
  sourceDate,
  scale,
  coverage,
  minZoom,
  maxZoom,
  checked,
  status,
}: {
  sourceDate: string;
  scale: string;
  coverage: string;
  minZoom: number;
  maxZoom: number;
  checked: boolean;
  status: MapLayerStatus;
}) {
  return (
    <span className="layer-metadata">
      <small className={`layer-runtime ${status.status}`}>
        {layerRuntimeLabel(checked, status)}
      </small>
      <small>Source date: {sourceDate}</small>
      <small>Scale: {scale}</small>
      <small>Coverage: {coverage}</small>
      <small>Zoom: {minZoom}–{maxZoom}</small>
    </span>
  );
}

function LayerToggle({
  layer,
  checked,
  licenceAccepted,
  status,
  onChange,
  onReviewLicence,
}: {
  layer: WebLayerDescriptor & { id: ProvinceLayerId };
  checked: boolean;
  licenceAccepted: boolean;
  status: MapLayerStatus;
  onChange: (checked: boolean) => void;
  onReviewLicence: () => void;
}) {
  return (
    <label className="layer-row">
      <input
        type="checkbox"
        aria-label={layer.name}
        checked={licenceAccepted && checked}
        disabled={!licenceAccepted}
        onChange={(event) => onChange(event.target.checked)}
      />
      <span className="switch" aria-hidden="true" />
      <span>
        <strong>{layer.name}</strong>
        <small>
          {licenceAccepted ? layer.webCaveat : "Province licence required"}
        </small>
        <LayerMetadata
          sourceDate={layer.sourceDate}
          scale={layer.scale}
          coverage={layer.coverage}
          minZoom={layer.minZoom}
          maxZoom={layer.maxZoom}
          checked={licenceAccepted && checked}
          status={status}
        />
      </span>
      {!licenceAccepted && layer.id === "nsprd" ? (
        <button className="text-button" type="button" onClick={onReviewLicence}>
          Review
        </button>
      ) : null}
    </label>
  );
}

function ResourceLayerToggle({
  layer,
  checked,
  licenceAccepted,
  status,
  onChange,
  onReviewLicence,
}: {
  layer: ResourceControlDescriptor;
  checked: boolean;
  licenceAccepted: boolean;
  status: MapLayerStatus;
  onChange: (checked: boolean) => void;
  onReviewLicence: () => void;
}) {
  const requiresProvinceLicence =
    "requiresProvinceLicence" in layer && layer.requiresProvinceLicence;
  const enabled = !requiresProvinceLicence || licenceAccepted;

  return (
    <>
      <label className="layer-row resource-layer-row">
        <input
          type="checkbox"
          aria-label={layer.name}
          checked={enabled && checked}
          disabled={!enabled}
          onChange={(event) => onChange(event.target.checked)}
        />
        <span className="switch" aria-hidden="true" />
        <span>
          <strong>{layer.name}</strong>
          <small>
            {enabled
              ? layer.webCaveat
              : "Province licence required for derived parcel geometry"}
          </small>
          <LayerMetadata
            sourceDate={layer.sourceDate}
            scale={layer.scale}
            coverage={layer.coverage}
            minZoom={layer.minZoom}
            maxZoom={layer.maxZoom}
            checked={enabled && checked}
            status={status}
          />
        </span>
        {!enabled ? (
          <button
            aria-label={`Review Province licence for ${layer.name}`}
            className="text-button"
            type="button"
            onClick={onReviewLicence}
          >
            Review
          </button>
        ) : null}
      </label>
      {layer.id === "mineral-proximity-parcels" ? (
        <a
          className="derived-resource-source"
          href={layer.sourceUrl}
          target="_blank"
          rel="noreferrer"
        >
          Mineral Occurrences source
        </a>
      ) : null}
    </>
  );
}

function HydroPilotLayerToggle({
  layer,
  checked,
  status,
  onChange,
}: {
  layer: HydroPilotLayerDescriptor;
  checked: boolean;
  status: MapLayerStatus;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="layer-row hydro-pilot-layer-row">
      <input
        type="checkbox"
        aria-label={layer.name}
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
      />
      <span className="switch" aria-hidden="true" />
      <span>
        <strong>{layer.name}</strong>
        <small>{layer.webCaveat}</small>
        <LayerMetadata
          sourceDate={layer.sourceDate}
          scale={layer.scale}
          coverage={layer.coverage}
          minZoom={layer.minZoom}
          maxZoom={layer.maxZoom}
          checked={checked}
          status={status}
        />
      </span>
    </label>
  );
}

function FloodHazardLayerToggle({
  layer,
  checked,
  licenceAccepted,
  status,
  onChange,
  onReviewLicence,
}: {
  layer: FloodHazardLayerDescriptor;
  checked: boolean;
  licenceAccepted: boolean;
  status: MapLayerStatus;
  onChange: (checked: boolean) => void;
  onReviewLicence: () => void;
}) {
  const enabled = layer.licence === "province-open" || licenceAccepted;
  return (
    <label className="layer-row flood-hazard-layer-row">
      <input
        type="checkbox"
        aria-label={layer.name}
        checked={enabled && checked}
        disabled={!enabled}
        onChange={(event) => onChange(event.target.checked)}
      />
      <span className="switch" aria-hidden="true" />
      <span>
        <strong>{layer.name}</strong>
        <small>{enabled ? layer.webCaveat : "Province licence required"}</small>
        <LayerMetadata
          sourceDate={layer.sourceDate}
          scale={layer.scale}
          coverage={layer.coverage}
          minZoom={layer.minZoom}
          maxZoom={layer.maxZoom}
          checked={enabled && checked}
          status={status}
        />
      </span>
      {!enabled ? (
        <button className="text-button" type="button" onClick={onReviewLicence}>Review</button>
      ) : null}
    </label>
  );
}

function HydroPotentialLegend() {
  return (
    <div className="hydro-potential-legend" aria-label="Micro-hydro symbology">
      <p><strong>Line width = modeled upstream area</strong></p>
      <div className="hydro-width-key" aria-hidden="true">
        <span className="hydro-line narrow" />
        <span>smaller</span>
        <span className="hydro-line wide" />
        <span>larger</span>
      </div>
      <p><strong>Colour = nominal micro-hydro scale</strong></p>
      <ul>
        <li><span className="hydro-swatch not-qualified" />No 5 m drop within 3 km</li>
        <li><span className="hydro-swatch below-1kw" />Below 1 kW scale</li>
        <li><span className="hydro-swatch kw-1-5" />1–5 kW scale</li>
        <li><span className="hydro-swatch kw-5-15" />5–15 kW scale</li>
        <li><span className="hydro-swatch kw-15-30" />15–30 kW scale</li>
        <li><span className="hydro-swatch kw-30-50" />30–50 kW scale</li>
        <li><span className="hydro-swatch over-50kw" />Above 50 kW scale</li>
      </ul>
    </div>
  );
}

export function App() {
  const initialUrl = useRef(new URL(window.location.href)).current;
  const initialShareState = useRef(
    parseMapShareState(initialUrl.toString()),
  ).current;
  const hasSharedLayers = initialUrl.searchParams.has("layers");
  const hasSharedEvents = initialUrl.searchParams.has("event");
  const [licenceAccepted, setLicenceAccepted] = useState(isLicenceAccepted);
  const [headerCollapsed, setHeaderCollapsed] = useState(
    () => window.matchMedia?.("(max-width: 560px)").matches ?? false,
  );
  const [mobileControlsOpen, setMobileControlsOpen] = useState(false);
  const [licenceDialogOpen, setLicenceDialogOpen] = useState(
    () => !isLicenceAccepted(),
  );
  const [parcels, setParcels] = useState<NsprdFeatureCollection>(EMPTY_FEATURES);
  const [parcelMessage, setParcelMessage] = useState<string | null>(null);
  const [query, setQuery] = useState(initialShareState.pid ?? "");
  const [searchError, setSearchError] = useState<string | null>(null);
  const [addressSearchResults, setAddressSearchResults] = useState<
    CivicAddress[]
  >([]);
  const [searchingAddresses, setSearchingAddresses] = useState(false);
  const [selectedPid, setSelectedPid] = useState<string | null>(
    initialShareState.pid,
  );
  const [parcelLookupMessage, setParcelLookupMessage] = useState<string | null>(
    null,
  );
  const [mappedContext, setMappedContext] = useState<ParcelContextState>({
    status: "idle",
    value: EMPTY_PARCEL_CONTEXT,
  });
  const [civicAddresses, setCivicAddresses] = useState<CivicAddressState>({
    status: initialShareState.pid ? "loading" : "idle",
    value: EMPTY_CIVIC_ADDRESSES,
  });
  const [resourceIntersections, setResourceIntersections] =
    useState<ParcelResourceState>({
      status: initialShareState.pid ? "loading" : "idle",
      value: EMPTY_RESOURCE_INTERSECTIONS,
    });
  const [floodHazard, setFloodHazard] = useState<FloodHazardState>({
    status: initialShareState.pid ? "loading" : "idle",
  });
  const [mapMode, setMapMode] = useState<MapMode>(initialShareState.mode);
  const [mapPosition, setMapPosition] = useState<MapPosition>(
    initialShareState.position,
  );
  const [showModernMap, setShowModernMap] = useState(
    hasSharedLayers ? initialShareState.layerIds.includes("modern") : false,
  );
  const intendedInitialProvinceLayers = useRef(
    hasSharedLayers
      ? Object.fromEntries(
          provinceLayerCatalog.map(({ id }) => [
            id,
            initialShareState.layerIds.includes(id),
          ]),
        ) as Record<ProvinceLayerId, boolean>
      : initialProvinceLayerVisibility,
  ).current;
  const [provinceLayers, setProvinceLayers] = useState(
    () => licenceAccepted
      ? intendedInitialProvinceLayers
      : disabledProvinceLayers(),
  );
  const [resourceLayers, setResourceLayers] = useState(
    () => hasSharedLayers
      ? Object.fromEntries(
          allResourceLayerCatalog.map(({ id }) => [
            id,
            initialShareState.layerIds.includes(id),
          ]),
        ) as Record<ResourceLayerId, boolean>
      : initialResourceLayerVisibility,
  );
  const [hydroPilotLayers, setHydroPilotLayers] = useState(
    () => hasSharedLayers
      ? Object.fromEntries(
          hydroPilotLayerCatalog.map(({ id }) => [
            id,
            initialShareState.layerIds.includes(id),
          ]),
        ) as Record<HydroPilotLayerId, boolean>
      : initialHydroPilotLayerVisibility,
  );
  const [floodHazardLayers, setFloodHazardLayers] = useState(
    () => hasSharedLayers
      ? Object.fromEntries(
          floodHazardLayerCatalog.map(({ id }) => [
            id,
            initialShareState.layerIds.includes(id),
          ]),
        ) as Record<FloodHazardLayerId, boolean>
      : initialFloodHazardLayerVisibility,
  );
  const effectiveResourceLayers = useMemo<Record<ResourceLayerId, boolean>>(
    () => ({
      ...resourceLayers,
      "mineral-proximity-parcels":
        licenceAccepted && resourceLayers["mineral-proximity-parcels"],
    }),
    [licenceAccepted, resourceLayers],
  );
  const [layerStatuses, setLayerStatuses] = useState(initialLayerStatuses);
  const [selectedEventIds, setSelectedEventIds] = useState(
    () => new Set(
      hasSharedEvents
        ? initialShareState.eventIds
        : upcomingTaxSaleEvents.map(({ id }) => id),
    ),
  );
  const [taxSaleFilter, setTaxSaleFilter] = useState<TaxSaleFilter>("all");
  const showHistoricalTaxSales = mapMode === "historical";
  const [historicalMunicipality, setHistoricalMunicipality] = useState("all");
  const [historicalYear, setHistoricalYear] = useState("all");
  const [historicalOutcome, setHistoricalOutcome] =
    useState<HistoricalOutcomeFilter>("all");
  const [historicalParcelMessage, setHistoricalParcelMessage] = useState<
    string | null
  >(null);
  const [currentTime, setCurrentTime] = useState(Date.now);
  const [shareMessage, setShareMessage] = useState<string | null>(null);
  const addressSearchController = useRef<AbortController | null>(null);
  const pointLookupController = useRef<AbortController | null>(null);
  const historicalLoadAttempted = useRef(false);

  useEffect(
    () => () => {
      addressSearchController.current?.abort();
      pointLookupController.current?.abort();
    },
    [],
  );

  useEffect(() => {
    const timer = window.setInterval(() => setCurrentTime(Date.now()), 60_000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!licenceAccepted) {
      return;
    }

    const controller = new AbortController();
    fetchParcels(upcomingTaxSalePids, controller.signal)
      .then((collection) => {
        setParcels((current) => mergeFeatureCollections(current, collection));
        setParcelMessage(
          `${new Set(collection.features.map(({ properties }) => properties.PID)).size} PIDs matched in NSPRD.`,
        );
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError") {
          return;
        }
        setParcelMessage(
          "The Province parcel service is temporarily unavailable. The official notices remain accessible.",
        );
      });

    return () => controller.abort();
  }, [licenceAccepted]);

  useEffect(() => {
    if (
      !licenceAccepted ||
      !selectedPid ||
      parcels.features.some(({ properties }) => properties.PID === selectedPid)
    ) {
      return;
    }

    const controller = new AbortController();
    fetchParcels([selectedPid], controller.signal)
      .then((collection) => {
        if (collection.features.length === 0) {
          setParcelLookupMessage(`No NSPRD parcel was found for PID ${selectedPid}.`);
          return;
        }
        setParcels((current) => mergeFeatureCollections(current, collection));
        setParcelLookupMessage(`PID ${selectedPid} selected from shared map state.`);
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError") {
          return;
        }
        setParcelLookupMessage("The shared PID could not be loaded right now.");
      });

    return () => controller.abort();
  }, [licenceAccepted, parcels.features, selectedPid]);

  useEffect(() => {
    if (!licenceAccepted || !showHistoricalTaxSales) {
      historicalLoadAttempted.current = false;
      setHistoricalParcelMessage(null);
      return;
    }

    if (historicalLoadAttempted.current) {
      return;
    }
    historicalLoadAttempted.current = true;

    const missingPids = allHistoricalTaxSalePids.filter(
      (pid) => !parcels.features.some(({ properties }) => properties.PID === pid),
    );
    if (missingPids.length === 0) {
      setHistoricalParcelMessage(
        `${allHistoricalTaxSalePids.length} historical PIDs matched in NSPRD.`,
      );
      return;
    }

    const controller = new AbortController();
    setHistoricalParcelMessage("Loading matched historical parcels…");
    fetchParcels(missingPids, controller.signal)
      .then((collection) => {
        const matchedPids = new Set([
          ...parcels.features.map(({ properties }) => properties.PID),
          ...collection.features.map(({ properties }) => properties.PID),
        ]);
        const matchedCount = allHistoricalTaxSalePids.filter((pid) =>
          matchedPids.has(pid),
        ).length;
        setParcels((current) => mergeFeatureCollections(current, collection));
        setHistoricalParcelMessage(
          matchedCount === allHistoricalTaxSalePids.length
            ? `${matchedCount} historical PIDs matched in NSPRD.`
            : `${matchedCount} of ${allHistoricalTaxSalePids.length} historical PIDs returned by NSPRD.`,
        );
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError") {
          return;
        }
        setHistoricalParcelMessage(
          "Historical records remain available, but matched parcel geometry is unavailable right now.",
        );
      });

    return () => controller.abort();
  }, [licenceAccepted, parcels.features, showHistoricalTaxSales]);

  useEffect(() => {
    if (!selectedPid || !licenceAccepted) {
      return;
    }

    const selectedFeatures = parcels.features.filter(
      ({ properties }) => properties.PID === selectedPid,
    );
    if (selectedFeatures.length === 0) {
      return;
    }

    const controller = new AbortController();
    fetchParcelContext(selectedFeatures, controller.signal)
      .then((value) => setMappedContext({ status: "ready", value }))
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError") {
          return;
        }
        setMappedContext({ status: "error", value: EMPTY_PARCEL_CONTEXT });
      });

    return () => controller.abort();
  }, [licenceAccepted, parcels, selectedPid]);

  useEffect(() => {
    if (!selectedPid || !licenceAccepted) return;
    const selectedFeatures = parcels.features.filter(
      ({ properties }) => properties.PID === selectedPid,
    );
    if (selectedFeatures.length === 0) return;

    const controller = new AbortController();
    const mappedArea = mappedAreaForPid(parcels, selectedPid);
    fetchParcelFloodHazardEvidence(
      selectedFeatures,
      mappedArea?.squareMetres ?? null,
      controller.signal,
    ).then((value) => setFloodHazard({ status: "ready", value }))
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setFloodHazard({
          status: "ready",
          value: {
            river: { status: "error", aep: [], message: "Flood evidence request failed." },
            coastal: ["current", "2050", "2100"].map((scenario) => ({
              scenario: scenario as "current" | "2050" | "2100",
              status: "error" as const,
              stormAnnualExceedanceProbabilityPercent: 1 as const,
              message: "Flood evidence request failed.",
            })),
          },
        });
      });
    return () => controller.abort();
  }, [licenceAccepted, parcels, selectedPid]);

  useEffect(() => {
    if (!selectedPid || !licenceAccepted) {
      return;
    }

    const selectedFeatures = parcels.features.filter(
      ({ properties }) => properties.PID === selectedPid,
    );
    if (selectedFeatures.length === 0) {
      return;
    }

    const controller = new AbortController();
    setResourceIntersections({
      status: "loading",
      value: EMPTY_RESOURCE_INTERSECTIONS,
    });
    fetchParcelResourceIntersections(selectedFeatures, controller.signal)
      .then((value) => setResourceIntersections({ status: "ready", value }))
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError") {
          return;
        }
      });

    return () => controller.abort();
  }, [licenceAccepted, parcels, selectedPid]);

  useEffect(() => {
    if (!selectedPid || !licenceAccepted) {
      return;
    }

    const selectedFeatures = parcels.features.filter(
      ({ properties }) => properties.PID === selectedPid,
    );
    if (selectedFeatures.length === 0) {
      return;
    }

    const controller = new AbortController();
    fetchCivicAddresses(selectedFeatures, controller.signal)
      .then((value) => setCivicAddresses({ status: "ready", value }))
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError") {
          return;
        }
        setCivicAddresses({ status: "error", value: EMPTY_CIVIC_ADDRESSES });
      });

    return () => controller.abort();
  }, [licenceAccepted, parcels, selectedPid]);

  const filteredTaxSalePids = useMemo(() => {
    const listings = taxSaleEvents
      .filter(({ id }) => selectedEventIds.has(id))
      .flatMap(({ listings }) => listings)
      .filter(({ listingStatus }) => listingStatus === "advertised")
      .filter((listing) =>
        listingMatchesTaxSaleFilter(listing, taxSaleFilter),
      );
    return new Set(listings.flatMap(({ pids }) => pids));
  }, [selectedEventIds, taxSaleFilter]);

  const selectedListings = useMemo(
    () =>
      taxSaleEvents
        .filter(({ id }) => selectedEventIds.has(id))
        .flatMap(({ listings }) => listings)
        .filter(({ listingStatus }) => listingStatus === "advertised"),
    [selectedEventIds],
  );

  const filterCounts = useMemo(
    () => ({
      all: selectedListings.length,
      redemption: selectedListings.filter(
        ({ redemptionCategory }) => redemptionCategory === "six-month",
      ).length,
      immediateOrNone: selectedListings.filter(
        ({ redemptionCategory }) =>
          redemptionCategory === "immediate-deed" ||
          redemptionCategory === "not-redeemable",
      ).length,
    }),
    [selectedListings],
  );

  const filteredHistoricalRecords = useMemo(
    () =>
      historicalTaxSaleRecords.filter((record) => {
        const event = historicalTaxSaleEvents.find(({ id }) => id === record.eventId);
        if (!event) {
          return false;
        }
        return (
          (historicalMunicipality === "all" ||
            event.municipalityId === historicalMunicipality) &&
          (historicalYear === "all" ||
            event.saleDate.startsWith(`${historicalYear}-`)) &&
          (historicalOutcome === "all" || record.outcome === historicalOutcome)
        );
      }),
    [historicalMunicipality, historicalOutcome, historicalYear],
  );

  const filteredHistoricalPids = useMemo(
    () => new Set(matchedHistoricalPids(filteredHistoricalRecords)),
    [filteredHistoricalRecords],
  );

  const acceptLicence = () => {
    localStorage.setItem(PROVINCE_LICENSE_ACCEPTANCE_KEY, "accepted");
    setProvinceLayers(intendedInitialProvinceLayers);
    setLicenceAccepted(true);
    setLicenceDialogOpen(false);
  };

  const continueWithoutProvinceLayers = () => {
    setProvinceLayers(disabledProvinceLayers());
    setShowModernMap(true);
    setLicenceDialogOpen(false);
  };

  const setEventVisibility = (id: string, visible: boolean) => {
    setSelectedEventIds((current) => {
      const next = new Set(current);
      if (visible) {
        next.add(id);
      } else {
        next.delete(id);
      }
      return next;
    });
  };

  const setProvinceLayerVisibility = (
    id: ProvinceLayerId,
    visible: boolean,
  ) => {
    setProvinceLayers((current) => ({ ...current, [id]: visible }));
  };

  const setResourceLayerVisibility = (
    id: ResourceLayerId,
    visible: boolean,
  ) => {
    setResourceLayers((current) => ({ ...current, [id]: visible }));
  };

  const setHydroPilotLayerVisibility = (
    id: HydroPilotLayerId,
    visible: boolean,
  ) => {
    setHydroPilotLayers((current) => ({ ...current, [id]: visible }));
  };

  const setFloodHazardLayerVisibility = (
    id: FloodHazardLayerId,
    visible: boolean,
  ) => {
    setFloodHazardLayers((current) => ({ ...current, [id]: visible }));
  };

  const setLayerStatus = useCallback(
    (id: MapLayerId, status: MapLayerStatus) => {
      setLayerStatuses((current) => ({ ...current, [id]: status }));
    },
    [],
  );

  const selectParcel = (pid: string) => {
    setMobileControlsOpen(false);
    setSelectedPid(pid);
    setMappedContext({ status: "loading", value: EMPTY_PARCEL_CONTEXT });
    setFloodHazard({ status: "loading" });
    setCivicAddresses({ status: "loading", value: EMPTY_CIVIC_ADDRESSES });
    setResourceIntersections({
      status: "loading",
      value: EMPTY_RESOURCE_INTERSECTIONS,
    });
    setShareMessage(null);
  };

  const changeMapMode = (mode: MapMode) => {
    if (mode === mapMode) {
      return;
    }
    setMapMode(mode);
    setSelectedPid(null);
    setQuery("");
    setMappedContext({ status: "idle", value: EMPTY_PARCEL_CONTEXT });
    setFloodHazard({ status: "idle" });
    setCivicAddresses({ status: "idle", value: EMPTY_CIVIC_ADDRESSES });
    setResourceIntersections({
      status: "idle",
      value: EMPTY_RESOURCE_INTERSECTIONS,
    });
    setShareMessage(null);
  };

  const cancelAddressSearch = () => {
    addressSearchController.current?.abort();
    addressSearchController.current = null;
    setSearchingAddresses(false);
  };

  const cancelPointLookup = () => {
    pointLookupController.current?.abort();
    pointLookupController.current = null;
    setParcelLookupMessage(null);
  };

  const identifyParcelAtPoint = async (
    latitude: number,
    longitude: number,
    addressLabel?: string,
  ) => {
    cancelAddressSearch();
    pointLookupController.current?.abort();
    const controller = new AbortController();
    pointLookupController.current = controller;
    setAddressSearchResults([]);
    setSearchError(null);
    setParcelLookupMessage(
      addressLabel
        ? `Finding the parcel for ${addressLabel}…`
        : "Finding the parcel at that map point…",
    );

    try {
      const collection = await fetchParcelAtPoint(
        latitude,
        longitude,
        controller.signal,
      );
      if (controller.signal.aborted) {
        return;
      }

      const pid = collection.features[0]?.properties.PID;
      if (!pid) {
        setParcelLookupMessage("No NSPRD parcel was found at that point.");
        return;
      }

      setParcels((current) => mergeFeatureCollections(current, collection));
      if (!addressLabel) {
        setQuery(pid);
      }
      selectParcel(pid);
      setParcelLookupMessage(`PID ${pid} selected.`);
    } catch (error: unknown) {
      if (error instanceof DOMException && error.name === "AbortError") {
        return;
      }
      setParcelLookupMessage(
        "The Province parcel lookup is unavailable right now.",
      );
    } finally {
      if (pointLookupController.current === controller) {
        pointLookupController.current = null;
      }
    }
  };

  const submitPidSearch = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    cancelAddressSearch();
    cancelPointLookup();
    setSearchError(null);
    setAddressSearchResults([]);
    const pid = normalizePid(query);

    if (!pid) {
      const normalizedQuery = query.trim().replace(/\s+/gu, " ");
      if (/^[\d\s-]+$/u.test(query) || normalizedQuery.length < 3) {
        setSearchError(
          /^[\d\s-]+$/u.test(query)
            ? "Enter an 8-digit Nova Scotia parcel ID."
            : "Enter at least three characters of a civic address.",
        );
        return;
      }

      const controller = new AbortController();
      addressSearchController.current = controller;
      setSearchingAddresses(true);

      try {
        const results = await searchCivicAddresses(
          normalizedQuery,
          controller.signal,
        );
        if (controller.signal.aborted) {
          return;
        }
        if (results.length === 0) {
          setSearchError("No mapped civic address matched that search.");
          return;
        }
        setAddressSearchResults(results);
      } catch (error: unknown) {
        if (error instanceof DOMException && error.name === "AbortError") {
          return;
        }
        setSearchError("Civic address search is unavailable right now.");
      } finally {
        if (addressSearchController.current === controller) {
          addressSearchController.current = null;
          setSearchingAddresses(false);
        }
      }
      return;
    }

    setQuery(pid);
    selectParcel(pid);

    if (parcels.features.some(({ properties }) => properties.PID === pid)) {
      return;
    }

    try {
      const collection = await fetchParcels([pid]);
      if (collection.features.length === 0) {
        setSearchError("No NSPRD parcel was found for that PID.");
        return;
      }
      setParcels((current) => mergeFeatureCollections(current, collection));
    } catch {
      setSearchError("The Province parcel search is unavailable right now.");
    }
  };

  const selectListedParcel = async (eventId: string, pid: string) => {
    cancelAddressSearch();
    cancelPointLookup();
    setEventVisibility(eventId, true);
    setAddressSearchResults([]);
    setSearchError(null);
    setQuery(pid);
    selectParcel(pid);

    if (parcels.features.some(({ properties }) => properties.PID === pid)) {
      setParcelLookupMessage(`PID ${pid} selected.`);
      return;
    }

    setParcelLookupMessage(`Loading parcel ${pid}…`);
    try {
      const collection = await fetchParcels([pid]);
      if (collection.features.length === 0) {
        setParcelLookupMessage(
          `PID ${pid} details opened, but its map geometry is unavailable.`,
        );
        return;
      }
      setParcels((current) => mergeFeatureCollections(current, collection));
      setParcelLookupMessage(`PID ${pid} selected.`);
    } catch {
      setParcelLookupMessage(
        `PID ${pid} details opened, but the Province parcel service is unavailable.`,
      );
    }
  };

  const selectedListingContext = selectedPid && mapMode === "current"
    ? listingContextForPid(selectedPid)
    : undefined;
  const selectedHistoricalContexts = useMemo(
    () => selectedPid && showHistoricalTaxSales
      ? historicalContextsForPid(selectedPid).filter(({ record }) =>
          filteredHistoricalRecords.some(
            ({ recordId }) => recordId === record.recordId,
          ),
        )
      : [],
    [filteredHistoricalRecords, selectedPid, showHistoricalTaxSales],
  );
  const selectedMappedArea = selectedPid
    ? mappedAreaForPid(parcels, selectedPid)
    : null;

  const activeLayerIds = useMemo<ShareLayerId[]>(() => [
    ...(showModernMap ? (["modern"] as const) : []),
    ...provinceLayerCatalog
      .filter(({ id }) => provinceLayers[id])
      .map(({ id }) => id),
    ...allResourceLayerCatalog
      .filter(({ id }) => resourceLayers[id])
      .map(({ id }) => id),
    ...hydroPilotLayerCatalog
      .filter(({ id }) => hydroPilotLayers[id])
      .map(({ id }) => id),
    ...floodHazardLayerCatalog
      .filter(({ id }) => floodHazardLayers[id])
      .map(({ id }) => id),
  ], [floodHazardLayers, hydroPilotLayers, provinceLayers, resourceLayers, showModernMap]);
  const shareUrl = useMemo(
    () => buildMapShareUrl(window.location.href, {
      mode: mapMode,
      pid: selectedPid,
      eventIds: mapMode === "current"
        ? Array.from(selectedEventIds)
        : Array.from(
            new Set(selectedHistoricalContexts.map(({ event }) => event.id)),
          ),
      layerIds: activeLayerIds,
      position: mapPosition,
    }),
    [
      activeLayerIds,
      mapMode,
      mapPosition,
      selectedEventIds,
      selectedHistoricalContexts,
      selectedPid,
    ],
  );

  useEffect(() => {
    window.history.replaceState(null, "", shareUrl);
  }, [shareUrl]);

  const copyShareUrl = () => {
    if (navigator.clipboard?.writeText) {
      void navigator.clipboard.writeText(shareUrl).then(
        () => setShareMessage("Share link copied."),
        () => setShareMessage("Copy failed; use the exact map-state link below."),
      );
      return;
    }
    setShareMessage("Use the exact map-state link below.");
  };

  const exportEvidence = () => {
    if (!selectedPid || resourceIntersections.status !== "ready") {
      return;
    }
    const activeLayers = [
      ...(showModernMap
        ? [{
            name: "Modern map",
            sourceUrl: "https://www.openstreetmap.org/copyright",
            sourceDate: "Live OpenStreetMap tiles",
          }]
        : []),
      ...provinceLayerCatalog
        .filter(({ id }) => provinceLayers[id])
        .map(({ name, serviceUrl, sourceDate }) => ({
          name,
          sourceUrl: serviceUrl,
          sourceDate,
        })),
      ...resourceLayerCatalog
        .filter(({ id }) => resourceLayers[id])
        .map(({ name, sourceUrl, sourceDate }) => ({
          name,
          sourceUrl,
          sourceDate,
        })),
      ...hydroPilotLayerCatalog
        .filter(({ id }) => hydroPilotLayers[id])
        .map(({ name, sourceUrl, sourceDate }) => ({
          name,
          sourceUrl,
          sourceDate,
        })),
      ...floodHazardLayerCatalog
        .filter(({ id }) => floodHazardLayers[id])
        .map(({ name, sourceUrl, sourceDate }) => ({
          name,
          sourceUrl,
          sourceDate,
        })),
      ...(effectiveResourceLayers["mineral-proximity-parcels"]
        ? [
            ...resourceLayerCatalog
              .filter(({ id }) => id === "mineral-occurrences")
              .map(({ sourceUrl, sourceDate }) => ({
                name: "Mineral occurrences — derived proximity input",
                sourceUrl,
                sourceDate,
              })),
            ...provinceLayerCatalog
              .filter(({ id }) => id === "nsprd")
              .map(({ sourceDate }) => ({
                name: "NSPRD parcel geometry — derived proximity input",
                sourceUrl: NSPRD_LAYER_URL,
                sourceDate,
              })),
          ]
        : []),
    ];
    const note = buildEvidenceNote({
      generatedAt: new Date(),
      pid: selectedPid,
      mode: mapMode,
      shareUrl,
      position: mapPosition,
      activeLayers,
      events: selectedListingContext
        ? [{
            name: `${selectedListingContext.event.shortMunicipality} — ${eventDateLabel(selectedListingContext.event)}`,
            sources: [{
              label: "Official notice",
              sourceUrl: selectedListingContext.event.sourceUrl,
            }],
          }]
        : selectedHistoricalContexts.map(({ event }) => ({
            name: `${event.shortMunicipality} — ${eventDate.format(new Date(`${event.saleDate}T12:00:00-03:00`))}`,
            sources: [
              { label: "Official notice", sourceUrl: event.noticeUrl },
              ...(event.resultUrl
                ? [{ label: "Official result", sourceUrl: event.resultUrl }]
                : event.landingPageUrl
                  ? [{
                      label: "Municipal results page",
                      sourceUrl: event.landingPageUrl,
                    }]
                  : []),
            ],
          })),
      civicAddresses: civicAddresses.status === "ready"
        ? civicAddresses.value.map(({ label }) => ({
            label,
            sourceUrl: CIVIC_ADDRESS_DATASET_URL,
          }))
        : [],
      resourceResults: resourceLayerCatalog.map((layer) => {
        const result = resourceIntersections.value[layer.id];
        return {
          name: layer.name,
          sourceUrl: layer.sourceUrl,
          status: result.status,
          results: result.intersections.map(({ id, name, detail, relationship }) =>
            layer.id === "mineral-occurrences"
              ? [
                  id,
                  name,
                  relationship === "on-parcel" ? "On parcel" : "Within 1 km",
                  detail,
                ].filter(Boolean).join(" · ")
              : [name, detail].filter(Boolean).join(" · "),
          ),
          emptyMessage: layer.id === "mineral-occurrences"
            ? "No published mineral occurrence was returned on or within 1 km of this parcel."
            : undefined,
        };
      }),
    });
    const objectUrl = URL.createObjectURL(
      new Blob([note.markdown], { type: "text/markdown;charset=utf-8" }),
    );
    const link = document.createElement("a");
    link.href = objectUrl;
    link.download = note.filename;
    link.click();
    URL.revokeObjectURL(objectUrl);
    setShareMessage(`Evidence note exported as ${note.filename}.`);
  };

  return (
    <div
      className={`app-shell${headerCollapsed ? " header-collapsed" : ""}`}
    >
      <header className="app-header">
        <a className="app-brand" href="../" aria-label="NS Marks The Spot home">
          <img src={appIconUrl} alt="" />
          <strong>NS Marks The Spot</strong>
          <span>Online</span>
        </a>
        <div className="offline-nav">
          <span>iPhone beta not open yet</span>
          <a className="header-action" href={BETA_SIGNUP_URL}>
            Sign up for the beta
          </a>
        </div>
        <button
          className="header-collapse"
          type="button"
          aria-label={headerCollapsed ? "Expand header" : "Collapse header"}
          aria-expanded={!headerCollapsed}
          onClick={() => setHeaderCollapsed((collapsed) => !collapsed)}
        >
          <span aria-hidden="true">{headerCollapsed ? "⌄" : "⌃"}</span>
        </button>
      </header>

      <main className="map-layout">
        <aside
          id="map-controls"
          className={`layer-rail mode-${mapMode}${mobileControlsOpen ? " mobile-open" : ""}`}
          aria-label="Map controls"
        >
          <div className="mobile-sheet-header">
            <strong>Search &amp; layers</strong>
            <button
              type="button"
              onClick={() => setMobileControlsOpen(false)}
              aria-label="Close map controls"
            >
              <span aria-hidden="true">×</span>
            </button>
          </div>
          <h1>Explore Nova Scotia</h1>
          <form className="pid-search" onSubmit={submitPidSearch}>
            <label htmlFor="pid-query">Search by PID or civic address</label>
            <div className="search-row">
              <input
                id="pid-query"
                type="search"
                value={query}
                onChange={(event) => {
                  cancelAddressSearch();
                  cancelPointLookup();
                  setQuery(event.target.value);
                  setAddressSearchResults([]);
                  setSearchError(null);
                }}
                placeholder="PID or 11064 Highway 19, Mabou"
                inputMode="search"
                autoComplete="off"
                disabled={!licenceAccepted}
              />
              <button
                className="primary-action"
                type="submit"
                disabled={!licenceAccepted}
              >
                Find parcel
              </button>
            </div>
            <p className="field-help" role={searchError ? "alert" : undefined}>
              {searchError ??
                (searchingAddresses
                  ? "Searching mapped civic addresses…"
                  : "Enter an 8-digit PID or a Nova Scotia civic address.")}
            </p>
            {addressSearchResults.length > 0 ? (
              <ul
                className="address-search-results"
                aria-label="Civic address results"
              >
                {addressSearchResults.map((address) => (
                  <li key={address.pntid}>
                    <button
                      type="button"
                      onClick={() => {
                        setQuery(address.label);
                        void identifyParcelAtPoint(
                          address.coordinates[1],
                          address.coordinates[0],
                          address.label,
                        );
                      }}
                    >
                      {address.label}
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}
          </form>

          <section className={`map-mode-switcher ${mapMode}`} aria-label="Map record mode">
            <div className="map-mode-buttons">
              <button
                type="button"
                className={mapMode === "current" ? "selected" : ""}
                aria-pressed={mapMode === "current"}
                onClick={() => changeMapMode("current")}
              >
                Current notices
              </button>
              <button
                type="button"
                className={mapMode === "historical" ? "selected" : ""}
                aria-pressed={mapMode === "historical"}
                onClick={() => changeMapMode("historical")}
              >
                Historical records
              </button>
            </div>
            <p>
              {mapMode === "current"
                ? "CURRENT · advertised notices that still require municipal verification"
                : "HISTORICAL · dated notices and verified outcomes, never current offerings"}
            </p>
          </section>

          <section className="rail-section" aria-labelledby="layers-heading">
            <h2 id="layers-heading">Map layers</h2>
            <label className="layer-row">
              <input
                type="checkbox"
                aria-label="Modern map"
                checked={showModernMap}
                onChange={(event) => setShowModernMap(event.target.checked)}
              />
              <span className="switch" aria-hidden="true" />
              <span>
                <strong>Modern map</strong>
                <small>OpenStreetMap</small>
                <LayerMetadata
                  sourceDate="Live tiles · checked July 20, 2026"
                  scale="Web map · native detail to zoom 19"
                  coverage="Worldwide"
                  minZoom={7}
                  maxZoom={23}
                  checked={showModernMap}
                  status={layerStatuses.modern}
                />
              </span>
            </label>
            {provinceLayerCatalog.map((layer) => (
              <div className="layer-control" key={layer.id}>
                <LayerToggle
                  layer={layer}
                  checked={provinceLayers[layer.id]}
                  licenceAccepted={licenceAccepted}
                  status={layerStatuses[layer.id]}
                  onChange={(checked) =>
                    setProvinceLayerVisibility(layer.id, checked)
                  }
                  onReviewLicence={() => setLicenceDialogOpen(true)}
                />
                {layer.id === "roads" && provinceLayers.roads ? (
                  <RoadLegend />
                ) : null}
              </div>
            ))}
            <details className="resource-layer-group flood-hazard-layer-group">
              <summary>
                <span>Flood hazard context</span>
                <small>4 optional published screens</small>
              </summary>
              <div className="resource-layer-controls">
                {floodHazardLayerCatalog.map((layer) => (
                  <FloodHazardLayerToggle
                    key={layer.id}
                    layer={layer}
                    checked={floodHazardLayers[layer.id]}
                    licenceAccepted={licenceAccepted}
                    status={layerStatuses[layer.id]}
                    onChange={(checked) => setFloodHazardLayerVisibility(layer.id, checked)}
                    onReviewLicence={() => setLicenceDialogOpen(true)}
                  />
                ))}
                <p className="resource-source-note">
                  Annual-exceedance percentages describe mapped events, not a whole-PID score.
                  Future coastal years are scenarios. Each layer is independently controlled.
                </p>
              </div>
            </details>
            <details className="resource-layer-group hydro-pilot-group">
              <summary>
                <span>Micro-hydro pilot</span>
                <small>1 optional Inverness screen</small>
              </summary>
              <div className="resource-layer-controls">
                {hydroPilotLayerCatalog.map((layer) => (
                  <HydroPilotLayerToggle
                    key={layer.id}
                    layer={layer}
                    checked={hydroPilotLayers[layer.id]}
                    status={layerStatuses[layer.id]}
                    onChange={(checked) =>
                      setHydroPilotLayerVisibility(layer.id, checked)
                    }
                  />
                ))}
                {hydroPilotLayers["inverness-hydro-potential"] ? (
                  <HydroPotentialLegend />
                ) : null}
                <p className="resource-source-note hydro-pilot-note">
                  Width uses routed official tertiary/sub-tertiary catchment area;
                  colour uses a fixed 8 L/s/km² regional flow scenario, mapped gross
                  drop, route distance, and 60% nominal efficiency. Values step at
                  catchment outlets and are not exact at every point. The kW scale is
                  for screening—not measured flow, net head, or predicted output. {" "}
                  <a
                    href={hydroPilotLayerCatalog[0].sourceUrl}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Watershed source
                  </a>{" "}
                  · {" "}
                  <a
                    href={hydroPilotLayerCatalog[0].serviceUrl}
                    target="_blank"
                    rel="noreferrer"
                  >
                    NSHN source
                  </a>
                  {" · "}
                  <a
                    href="https://wateroffice.ec.gc.ca/services/index_e.html"
                    target="_blank"
                    rel="noreferrer"
                  >
                    Flow calibration source
                  </a>
                  {" · "}
                  <a
                    href="https://natural-resources.canada.ca/maps-tools-publications/publications/micro-hydro-systems-buyer-s-guide"
                    target="_blank"
                    rel="noreferrer"
                  >
                    Micro-hydro method
                  </a>
                </p>
              </div>
            </details>
            <details className="resource-layer-group">
              <summary>
                <span>Geology &amp; Resources</span>
                <small>4 optional screening layers</small>
              </summary>
              <div className="resource-layer-controls">
                {allResourceLayerCatalog.map((layer) => (
                  <ResourceLayerToggle
                    key={layer.id}
                    layer={layer}
                    checked={resourceLayers[layer.id]}
                    licenceAccepted={licenceAccepted}
                    status={layerStatuses[layer.id]}
                    onChange={(checked) =>
                      setResourceLayerVisibility(layer.id, checked)
                    }
                    onReviewLicence={() => setLicenceDialogOpen(true)}
                  />
                ))}
                <p className="resource-source-note">
                  Three Province geoscience overlays use {" "}
                  <a
                    aria-label="Open data sources"
                    href="https://novascotia.ca/natr/meb/"
                    target="_blank"
                    rel="noreferrer"
                  >
                    open data
                  </a>
                  . The derived 1 km parcel layer combines the open Mineral
                  Occurrences inventory with restricted NSPRD geometry and
                  therefore requires Province licence acceptance. All results are
                  screening context, not mineral, legal, ownership, access,
                  safety, or economic conclusions.
                </p>
              </div>
            </details>
            <div className="layer-row unavailable">
              <span className="switch" aria-hidden="true" />
              <span>
                <strong>Fletcher historical map</strong>
                <small>{nativeLayerCatalog[0].webCaveat}</small>
                <LayerMetadata
                  sourceDate={nativeLayerCatalog[0].sourceDate}
                  scale={nativeLayerCatalog[0].scale}
                  coverage={nativeLayerCatalog[0].coverage}
                  minZoom={nativeLayerCatalog[0].minZoom}
                  maxZoom={nativeLayerCatalog[0].maxZoom}
                  checked={false}
                  status={{ status: "idle" }}
                />
              </span>
            </div>
          </section>

          {mapMode === "current" ? (
            <>
          <section
            className="rail-section tax-sale-events"
            role="region"
            aria-label="Current tax-sale notices"
          >
            <h2 id="events-heading">Tax-sale notices</h2>
            <p className="section-intro">
              Dated official notices. Past sale dates require municipal result
              verification.
            </p>
            {upcomingTaxSaleEvents.map((event) => {
              const pidCount = advertisedPidsForEvents([event]).length;
              const advertisedCount = event.listings.filter(
                ({ listingStatus }) => listingStatus === "advertised",
              ).length;
              const withdrawnCount = event.listings.length - advertisedCount;
              const filteredListings = event.listings.filter((listing) =>
                listingMatchesTaxSaleFilter(listing, taxSaleFilter),
              );
              return (
                <div className="tax-sale-event" key={event.id}>
                  <label className="layer-row event-row">
                    <input
                      type="checkbox"
                      aria-label={`${event.shortMunicipality} tax sale - ${eventDateLabel(event)} - ${eventLifecycleLabel(event, currentTime)}`}
                      checked={licenceAccepted && selectedEventIds.has(event.id)}
                      disabled={!licenceAccepted}
                      onChange={(change) =>
                        setEventVisibility(event.id, change.target.checked)
                      }
                    />
                    <span className="switch" aria-hidden="true" />
                    <span>
                      <strong>{event.shortMunicipality}</strong>
                      <small>{eventDateLabel(event)}</small>
                      <small>{eventLifecycleLabel(event, currentTime)}</small>
                      <small>
                        {advertisedCount} advertised · {withdrawnCount} withdrawn · {pidCount} active PIDs
                      </small>
                      <small>
                        Snapshot retrieved {snapshotDateLabel(event)}
                      </small>
                    </span>
                  </label>
                  <TaxSalePropertyList
                    eventId={event.id}
                    municipality={event.shortMunicipality}
                    listings={filteredListings}
                    selectedPid={selectedPid}
                    disabled={!licenceAccepted}
                    onSelectPid={(eventId, pid) => {
                      void selectListedParcel(eventId, pid);
                    }}
                  />
                </div>
              );
            })}
            <p className="parcel-message" role="status" aria-live="polite">
              {parcelMessage}
            </p>
          </section>

          <section
            className="rail-section tax-sale-controls"
            aria-labelledby="filter-heading"
          >
            <h2 id="filter-heading">Redemption category</h2>
            <div className="segmented-control" aria-label="Redemption category">
              <button
                type="button"
                className={taxSaleFilter === "all" ? "selected" : ""}
                aria-pressed={taxSaleFilter === "all"}
                onClick={() => setTaxSaleFilter("all")}
              >
                All {filterCounts.all}
              </button>
              <button
                type="button"
                className={taxSaleFilter === "redemption" ? "selected" : ""}
                aria-pressed={taxSaleFilter === "redemption"}
                onClick={() => setTaxSaleFilter("redemption")}
              >
                Redemption {filterCounts.redemption}
              </button>
              <button
                type="button"
                className={
                  taxSaleFilter === "immediate-or-none" ? "selected" : ""
                }
                aria-pressed={taxSaleFilter === "immediate-or-none"}
                onClick={() => setTaxSaleFilter("immediate-or-none")}
              >
                Immediate / none {filterCounts.immediateOrNone}
              </button>
            </div>

            {upcomingTaxSaleEvents.map((event) => (
              <div className="source-note" key={event.id}>
                <strong>
                  {event.shortMunicipality} · {eventDateLabel(event)}
                </strong>
                <span>{event.venue}</span>
                <span>{eventLifecycleLabel(event, currentTime)}</span>
                <a href={event.sourceUrl} target="_blank" rel="noreferrer">
                  Open direct official source
                </a>
              </div>
            ))}
          </section>

            </>
          ) : (

          <section
            className="rail-section historical-layer-controls"
            role="region"
            aria-label="Historical tax-sale records"
          >
            <h2 id="historical-heading">Historical tax-sale records</h2>
            <p className="section-intro">
              Dated notices and verified results. Recent events can remain outcome
              unknown while official results are pending. These are never current
              offerings.
            </p>
            <div className="historical-mode-summary">
              <strong>Historical records active</strong>
              <span>
                {historicalTaxSaleRecords.length} records ·{" "}
                {allHistoricalTaxSalePids.length} exact matched PIDs
              </span>
              <span>
                {historicalMunicipalities.map(([, label]) => label).join(" · ")} ·{" "}
                {historicalYears.at(-1)}–{historicalYears[0]}
              </span>
            </div>
            <div className="historical-filters" aria-label="Historical filters">
              <label>
                Municipality
                <select
                  aria-label="Historical municipality"
                  value={historicalMunicipality}
                  disabled={!licenceAccepted}
                  onChange={(event) => setHistoricalMunicipality(event.target.value)}
                >
                  <option value="all">All municipalities</option>
                  {historicalMunicipalities.map(([id, label]) => (
                    <option key={id} value={id}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Sale year
                <select
                  aria-label="Historical sale year"
                  value={historicalYear}
                  disabled={!licenceAccepted}
                  onChange={(event) => setHistoricalYear(event.target.value)}
                >
                  <option value="all">All years</option>
                  {historicalYears.map((year) => (
                    <option key={year} value={year}>
                      {year}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Outcome
                <select
                  aria-label="Historical outcome"
                  value={historicalOutcome}
                  disabled={!licenceAccepted}
                  onChange={(event) =>
                    setHistoricalOutcome(event.target.value as HistoricalOutcomeFilter)
                  }
                >
                  <option value="all">All outcomes</option>
                  {historicalOutcomes.map((outcome) => (
                    <option key={outcome} value={outcome}>
                      {historicalOutcomeLabel(outcome)}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <p className="historical-filter-count">
              {countLabel(filteredHistoricalRecords.length, "record")} ·{" "}
              {countLabel(filteredHistoricalPids.size, "PID")}
            </p>
            <p className="parcel-message" role="status" aria-live="polite">
              {historicalParcelMessage}
            </p>
          </section>
          )}

          <section className="offline-card" aria-labelledby="offline-heading">
            <img src={appIconUrl} alt="" />
            <div>
              <h2 id="offline-heading">Help shape the iPhone beta</h2>
              <p>
                The iPhone beta is not available in TestFlight yet. Join the
                list to hear when testing opens and help shape what comes next.
              </p>
              <a href={BETA_SIGNUP_URL}>Sign up for the beta</a>
            </div>
          </section>
        </aside>

        <section
          className={`map-region${selectedPid ? " has-inspector" : ""}`}
          aria-label="Map and parcel details"
        >
          <div className="mobile-map-chrome">
            <a
              className="mobile-map-brand"
              href="../"
              aria-label="NS Marks The Spot home"
            >
              <span aria-hidden="true">NS</span>
              <strong>NS Marks</strong>
            </a>
            <button
              className="mobile-controls-trigger"
              type="button"
              aria-controls="map-controls"
              aria-expanded={mobileControlsOpen}
              onClick={() => setMobileControlsOpen(true)}
            >
              <span aria-hidden="true">⌕</span>
              Search &amp; layers
            </button>
          </div>
          <MapCanvas
            parcels={parcels}
            taxSalePids={filteredTaxSalePids}
            historicalTaxSalePids={filteredHistoricalPids}
            selectedPid={selectedPid}
            provinceLayers={provinceLayers}
            resourceLayers={effectiveResourceLayers}
            hydroPilotLayers={hydroPilotLayers}
            floodHazardLayers={floodHazardLayers}
            showModernMap={showModernMap}
            showTaxSale={
              licenceAccepted && mapMode === "current" && selectedEventIds.size > 0
            }
            showHistoricalTaxSales={
              licenceAccepted && showHistoricalTaxSales
            }
            onSelectPid={selectParcel}
            onIdentifyParcel={(latitude, longitude) => {
              void identifyParcelAtPoint(latitude, longitude);
            }}
            initialPosition={initialShareState.position}
            onPositionChange={setMapPosition}
            onLayerStatusChange={setLayerStatus}
          />
          <p
            className="parcel-lookup-message"
            role="status"
            aria-live="polite"
          >
            {parcelLookupMessage}
          </p>
          {selectedPid ? (
            <ParcelInspector
              key={selectedPid}
              pid={selectedPid}
              context={selectedListingContext}
              historicalContexts={selectedHistoricalContexts}
              mappedArea={selectedMappedArea}
              mappedContext={mappedContext}
              civicAddresses={civicAddresses}
              resourceIntersections={resourceIntersections}
              floodHazard={floodHazard}
              mapMode={mapMode}
              shareUrl={shareUrl}
              shareMessage={shareMessage}
              onCopyShareUrl={copyShareUrl}
              onExportEvidence={exportEvidence}
              evidenceReady={resourceIntersections.status === "ready"}
              now={currentTime}
              onClose={() => {
                setSelectedPid(null);
                setMappedContext({
                  status: "idle",
                  value: EMPTY_PARCEL_CONTEXT,
                });
                setCivicAddresses({
                  status: "idle",
                  value: EMPTY_CIVIC_ADDRESSES,
                });
                setResourceIntersections({
                  status: "idle",
                  value: EMPTY_RESOURCE_INTERSECTIONS,
                });
                setFloodHazard({ status: "idle" });
                setShareMessage(null);
              }}
            />
          ) : null}
        </section>
      </main>

      <footer className="map-attribution">
        <a
          className="feedback-link"
          href="mailto:map@kinnokilabs.com?subject=NS%20Marks%20The%20Spot%20map%20feedback"
        >
          Feedback &amp; suggestions: map@kinnokilabs.com
        </a>
        <a
          href="https://www.openstreetmap.org/copyright"
          target="_blank"
          rel="noreferrer"
        >
          © OpenStreetMap contributors
        </a>
        <a
          href="https://github.com/dfakkeldy/ns-marks-the-spot"
          target="_blank"
          rel="noreferrer"
        >
          Open source · MIT · GitHub
        </a>
        <span className="province-attribution">{PROVINCE_ATTRIBUTION}</span>
        {Object.values(resourceLayers).some(Boolean) ? (
          <span>Geoscience data © Province of Nova Scotia</span>
        ) : null}
        <span>Boundaries are not a survey</span>
        <button type="button" onClick={() => setLicenceDialogOpen(true)}>
          Data &amp; licences
        </button>
      </footer>

      {licenceDialogOpen ? (
        <LicenceDialog
          onAccept={acceptLicence}
          onContinueWithout={continueWithoutProvinceLayers}
        />
      ) : null}
    </div>
  );
}
