import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import appIconUrl from "../../docs/assets/app-icon.svg";
import { MapCanvas } from "./components/MapCanvas";
import {
  eventLifecycleStatus,
  eventsForStatus,
  listingContextForPid,
  pidsForEvents,
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
  initialProvinceLayerVisibility,
  nativeLayerCatalog,
  provinceLayerCatalog,
  type ProvinceLayerId,
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
  type NsprdFeatureCollection,
} from "./services/nsprd";
import {
  ADJACENT_ROAD_DISTANCE_METRES,
  fetchParcelContext,
  mappedAreaForPid,
  type MappedArea,
  type ParcelContext,
} from "./services/parcelContext";

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

const EMPTY_PARCEL_CONTEXT: ParcelContext = { roads: [], water: [] };
const EMPTY_CIVIC_ADDRESSES: CivicAddress[] = [];

const currency = new Intl.NumberFormat("en-CA", {
  style: "currency",
  currency: "CAD",
});

const eventDate = new Intl.DateTimeFormat("en-CA", {
  dateStyle: "long",
  timeZone: "America/Halifax",
});

const upcomingTaxSaleEvents = eventsForStatus("upcoming");
const upcomingTaxSalePids = pidsForEvents(upcomingTaxSaleEvents);
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

function eventDateLabel(event: TaxSaleEvent): string {
  const timestamp = event.saleStartsAt ?? event.closedAt;
  return timestamp ? eventDate.format(new Date(timestamp)) : "Date not listed";
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
      return "Withdrawn from historical event";
    case "sold":
      return "Historical sold result - not available";
    case "unsold":
      return "Historical unsold result - not available";
  }
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
  const winningBidLabel =
    record.winningBidCents !== null
      ? currency.format(record.winningBidCents / 100)
      : record.outcome === "unsold"
        ? "No winning bid - official result says no bids"
        : "Not published in verified sources";

  return (
    <article className="historical-outcome-card">
      <header>
        <div>
          <strong>{historicalOutcomeLabel(record.outcome)}</strong>
          <span>{eventDate.format(new Date(`${event.saleDate}T12:00:00-03:00`))}</span>
        </div>
        <span className={`outcome-marker ${record.outcome}`}>
          Historical
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
            Notice {event.noticeSnapshotDate} · result {event.resultSnapshotDate}
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
        <a href={event.resultUrl} target="_blank" rel="noreferrer">
          Official result
        </a>
      </div>
      <p className="historical-limit">
        Dated outcome only. It is not a current offering and does not prove present
        ownership, title, redemption, legal access, or parcel status.
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
  now,
  onClose,
}: {
  pid: string;
  context?: { event: TaxSaleEvent; listing: TaxSaleListing };
  mappedArea: MappedArea | null;
  mappedContext: ParcelContextState;
  civicAddresses: CivicAddressState;
  historicalContexts: HistoricalRecordContext[];
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
            ? `${historicalContexts.length} verified historical tax-sale ${historicalContexts.length === 1 ? "record" : "records"}`
            : "NSPRD parcel"}
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
        <section className="historical-outcomes" aria-label="Historical tax-sale outcomes">
          <h3>Historical tax-sale outcomes</h3>
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
      {listing ? (
        <p className="sale-warning">
          <span aria-hidden="true">!</span>
          {historical
            ? "This is a dated historical result, not a currently available property."
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
    </aside>
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
          {state.value.map(({ pntid, label }) => (
            <li key={pntid}>{label}</li>
          ))}
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
      <p className="civic-address-caveat">
        Mapped physical-address points are not proof of ownership, mailing
        address, access, occupancy, or legal parcel status.
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

function LayerToggle({
  layer,
  checked,
  licenceAccepted,
  onChange,
  onReviewLicence,
}: {
  layer: WebLayerDescriptor & { id: ProvinceLayerId };
  checked: boolean;
  licenceAccepted: boolean;
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
      </span>
      {!licenceAccepted && layer.id === "nsprd" ? (
        <button className="text-button" type="button" onClick={onReviewLicence}>
          Review
        </button>
      ) : null}
    </label>
  );
}

export function App() {
  const [licenceAccepted, setLicenceAccepted] = useState(isLicenceAccepted);
  const [headerCollapsed, setHeaderCollapsed] = useState(
    () => window.matchMedia?.("(max-width: 560px)").matches ?? false,
  );
  const [licenceDialogOpen, setLicenceDialogOpen] = useState(
    () => !isLicenceAccepted(),
  );
  const [parcels, setParcels] = useState<NsprdFeatureCollection>(EMPTY_FEATURES);
  const [parcelMessage, setParcelMessage] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [searchError, setSearchError] = useState<string | null>(null);
  const [addressSearchResults, setAddressSearchResults] = useState<
    CivicAddress[]
  >([]);
  const [searchingAddresses, setSearchingAddresses] = useState(false);
  const [selectedPid, setSelectedPid] = useState<string | null>(null);
  const [parcelLookupMessage, setParcelLookupMessage] = useState<string | null>(
    null,
  );
  const [mappedContext, setMappedContext] = useState<ParcelContextState>({
    status: "idle",
    value: EMPTY_PARCEL_CONTEXT,
  });
  const [civicAddresses, setCivicAddresses] = useState<CivicAddressState>({
    status: "idle",
    value: EMPTY_CIVIC_ADDRESSES,
  });
  const [showModernMap, setShowModernMap] = useState(false);
  const [provinceLayers, setProvinceLayers] = useState(
    initialProvinceLayerVisibility,
  );
  const [selectedEventIds, setSelectedEventIds] = useState(
    () => new Set(upcomingTaxSaleEvents.map(({ id }) => id)),
  );
  const [taxSaleFilter, setTaxSaleFilter] = useState<TaxSaleFilter>("all");
  const [showHistoricalTaxSales, setShowHistoricalTaxSales] = useState(false);
  const [historicalMunicipality, setHistoricalMunicipality] = useState("all");
  const [historicalYear, setHistoricalYear] = useState("all");
  const [historicalOutcome, setHistoricalOutcome] =
    useState<HistoricalOutcomeFilter>("all");
  const [historicalParcelMessage, setHistoricalParcelMessage] = useState<
    string | null
  >(null);
  const [currentTime, setCurrentTime] = useState(Date.now);
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
      .filter((listing) => {
      if (taxSaleFilter === "redemption") {
        return listing.redemptionCategory === "six-month";
      }
      if (taxSaleFilter === "immediate-or-none") {
        return (
          listing.redemptionCategory === "immediate-deed" ||
          listing.redemptionCategory === "not-redeemable"
        );
      }
      return true;
    });
    return new Set(listings.flatMap(({ pids }) => pids));
  }, [selectedEventIds, taxSaleFilter]);

  const selectedListings = useMemo(
    () =>
      taxSaleEvents
        .filter(({ id }) => selectedEventIds.has(id))
        .flatMap(({ listings }) => listings),
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
    setLicenceAccepted(true);
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

  const selectParcel = (pid: string) => {
    setSelectedPid(pid);
    setMappedContext({ status: "loading", value: EMPTY_PARCEL_CONTEXT });
    setCivicAddresses({ status: "loading", value: EMPTY_CIVIC_ADDRESSES });
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

  const selectedListingContext = selectedPid
    ? listingContextForPid(selectedPid)
    : undefined;
  const selectedHistoricalContexts =
    selectedPid && showHistoricalTaxSales
      ? historicalContextsForPid(selectedPid).filter(({ record }) =>
          filteredHistoricalRecords.some(
            ({ recordId }) => recordId === record.recordId,
          ),
        )
      : [];
  const selectedMappedArea = selectedPid
    ? mappedAreaForPid(parcels, selectedPid)
    : null;

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
          <span>Need offline maps?</span>
          <a className="header-action" href="../#top">
            Get the iPhone app
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
        <aside className="layer-rail" aria-label="Map controls">
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
              </span>
            </label>
            {provinceLayerCatalog.map((layer) => (
              <div className="layer-control" key={layer.id}>
                <LayerToggle
                  layer={layer}
                  checked={provinceLayers[layer.id]}
                  licenceAccepted={licenceAccepted}
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
            <div className="layer-row unavailable">
              <span className="switch" aria-hidden="true" />
              <span>
                <strong>Fletcher historical map</strong>
                <small>{nativeLayerCatalog[0].webCaveat}</small>
              </span>
            </div>
          </section>

          <section
            className="rail-section tax-sale-events"
            aria-labelledby="events-heading"
          >
            <h2 id="events-heading">Tax-sale notices</h2>
            <p className="section-intro">
              Dated official notices. Past sale dates require municipal result
              verification.
            </p>
            {upcomingTaxSaleEvents.map((event) => {
              const pidCount = pidsForEvents([event]).length;
              return (
                <label className="layer-row event-row" key={event.id}>
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
                      {event.listings.length} notice entries · {pidCount} PIDs
                    </small>
                    <small>
                      Snapshot retrieved {snapshotDateLabel(event)}
                    </small>
                  </span>
                </label>
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

          <section
            className="rail-section historical-layer-controls"
            aria-labelledby="historical-heading"
          >
            <h2 id="historical-heading">Historical tax-sale outcomes</h2>
            <p className="section-intro">
              Verified dated results. This layer starts off and does not show
              currently available property.
            </p>
            <label className="layer-row historical-layer-row">
              <input
                type="checkbox"
                aria-label="Historical tax-sale outcomes"
                checked={licenceAccepted && showHistoricalTaxSales}
                disabled={!licenceAccepted}
                onChange={(event) =>
                  setShowHistoricalTaxSales(event.target.checked)
                }
              />
              <span className="switch" aria-hidden="true" />
              <span>
                <strong>Show historical outcomes</strong>
                <small>48 records · 49 exact matched PIDs</small>
                <small>Halifax · 2022 and 2025</small>
              </span>
            </label>
            <div className="historical-filters" aria-label="Historical filters">
              <label>
                Municipality
                <select
                  aria-label="Historical municipality"
                  value={historicalMunicipality}
                  disabled={!showHistoricalTaxSales}
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
                  disabled={!showHistoricalTaxSales}
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
                  disabled={!showHistoricalTaxSales}
                  onChange={(event) =>
                    setHistoricalOutcome(event.target.value as HistoricalOutcomeFilter)
                  }
                >
                  <option value="all">All outcomes</option>
                  <option value="sold">Sold</option>
                  <option value="unsold">Unsold - no bids</option>
                </select>
              </label>
            </div>
            <p className="historical-filter-count">
              {filteredHistoricalRecords.length} records · {filteredHistoricalPids.size} PIDs
            </p>
            <p className="parcel-message" role="status" aria-live="polite">
              {showHistoricalTaxSales ? historicalParcelMessage : null}
            </p>
          </section>

          <section className="offline-card" aria-labelledby="offline-heading">
            <img src={appIconUrl} alt="" />
            <div>
              <h2 id="offline-heading">Heading offline?</h2>
              <p>
                Get detailed maps, GPS tracking, and saved field areas in the
                NS Marks The Spot iPhone app.
              </p>
              <a href="../#top">Get the iPhone app</a>
            </div>
          </section>
        </aside>

        <section
          className={`map-region${selectedPid ? " has-inspector" : ""}`}
          aria-label="Map and parcel details"
        >
          <MapCanvas
            parcels={parcels}
            taxSalePids={filteredTaxSalePids}
            historicalTaxSalePids={filteredHistoricalPids}
            selectedPid={selectedPid}
            provinceLayers={provinceLayers}
            showModernMap={showModernMap}
            showTaxSale={licenceAccepted && selectedEventIds.size > 0}
            showHistoricalTaxSales={
              licenceAccepted && showHistoricalTaxSales
            }
            onSelectPid={selectParcel}
            onIdentifyParcel={(latitude, longitude) => {
              void identifyParcelAtPoint(latitude, longitude);
            }}
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
              }}
            />
          ) : null}
        </section>
      </main>

      <footer className="map-attribution">
        <span>Map data © OpenStreetMap contributors</span>
        <span className="province-attribution">{PROVINCE_ATTRIBUTION}</span>
        <span>Boundaries are not a survey</span>
        <button type="button" onClick={() => setLicenceDialogOpen(true)}>
          Data &amp; licences
        </button>
      </footer>

      {licenceDialogOpen ? (
        <LicenceDialog
          onAccept={acceptLicence}
          onContinueWithout={() => setLicenceDialogOpen(false)}
        />
      ) : null}
    </div>
  );
}
