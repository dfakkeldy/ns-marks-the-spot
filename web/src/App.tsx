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
  fetchParcelContext,
  mappedAreaForPid,
  type MappedArea,
  type ParcelContext,
} from "./services/parcelContext";

type TaxSaleFilter = "all" | "redemption" | "immediate-or-none";

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

function ParcelInspector({
  pid,
  context,
  mappedArea,
  mappedContext,
  civicAddresses,
  now,
  onClose,
}: {
  pid: string;
  context?: { event: TaxSaleEvent; listing: TaxSaleListing };
  mappedArea: MappedArea | null;
  mappedContext: ParcelContextState;
  civicAddresses: CivicAddressState;
  now: number;
  onClose: () => void;
}) {
  const listing = context?.listing;
  const event = context?.event;
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
        {listing?.addressOrDescription ?? listing?.location ?? `PID ${pid}`}
      </h2>
      <p className={listing ? "notice-status" : "parcel-status"}>
        {listing
          ? historical
            ? "Historical result - not available"
            : needsResultVerification
              ? "Past sale date — verify results with the municipality."
            : "Listed in official notice"
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
      <CivicAddressDetails state={civicAddresses} />
      <MappedContextDetails state={mappedContext} />
      {listing ? (
        <p className="sale-warning">
          <span aria-hidden="true">!</span>
          {historical
            ? "This is a dated historical result, not a currently available property."
            : needsResultVerification
              ? `The advertised sale date has passed. Verify results and current status with ${event?.shortMunicipality}. This map does not imply access, clear title, possession or buildability.`
            : `Properties may be paid, removed or deferred. Verify current status with ${event?.shortMunicipality}. This map does not imply access, clear title, possession or buildability.`}
        </p>
      ) : (
        <p className="sale-warning neutral">
          This PID is not listed in any municipal notice included by this map.
        </p>
      )}
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
  return (
    <section className="mapped-context-group">
      <h3>{title}</h3>
      {features.length > 0 ? (
        <ul>
          {features.map(({ name, kind }) => (
            <li key={`${name}:${kind}`}>
              <strong>{name}</strong>
              {name.toLocaleLowerCase() !== kind.toLocaleLowerCase() ? (
                <span>{kind}</span>
              ) : null}
            </li>
          ))}
        </ul>
      ) : (
        <p>{emptyMessage}</p>
      )}
    </section>
  );
}

function MappedContextDetails({ state }: { state: ParcelContextState }) {
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

  return (
    <div className="mapped-context">
      <MappedFeatureList
        title="Intersecting roads & trails"
        emptyMessage="No mapped road or trail feature intersects this parcel."
        features={state.value.roads}
      />
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
  const [currentTime, setCurrentTime] = useState(Date.now);
  const addressSearchController = useRef<AbortController | null>(null);
  const pointLookupController = useRef<AbortController | null>(null);

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
            selectedPid={selectedPid}
            provinceLayers={provinceLayers}
            showModernMap={showModernMap}
            showTaxSale={licenceAccepted && selectedEventIds.size > 0}
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
