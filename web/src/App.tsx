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
  type ParcelFocusRequest,
} from "./components/MapCanvas";
import {
  EnvironmentalHealthLayerToggle,
  FloodHazardLayerToggle,
  ZoningLayerToggle,
  HydroPilotLayerToggle,
  HydroPotentialLegend,
  WellLogAccuracyFilterControl,
  WellLogAccuracyLegend,
  WellLogLayerToggle,
  LayerMetadata,
  LayerToggle,
  ResourceLayerToggle,
  RoadLegend,
} from "./components/LayerRows";
import {
  ParcelInspector,
  type AssessmentState,
  type BuildingCountState,
  type CivicAddressState,
  type DwellingState,
  type FloodHazardState,
  type ParcelContextState,
  type ParcelResourceState,
} from "./components/ParcelInspector";
import { PrintPreview } from "./components/print/PrintPreview";
import { TaxSalePropertyList } from "./components/TaxSalePropertyList";
import {
  advertisedPidsForEvents,
  eventsForStatus,
  listingContextForPid,
  taxSaleEvents,
  type TaxSaleEvent,
  type TaxSaleListing,
} from "./data/taxSaleCatalog";
import {
  historicalContextsForPid,
  historicalOutcomeLabel,
  historicalTaxSaleEvents,
  historicalTaxSaleRecords,
  matchedHistoricalPids,
  type HistoricalOutcome,
} from "./data/historicalTaxSales";
import {
  PROVINCE_ATTRIBUTION,
  PROVINCE_LICENSE_ACCEPTANCE_KEY,
  PROVINCE_LICENSE_URL,
} from "./licensing/provinceLicense";
import { RUMSEY_ATTRIBUTION, RUMSEY_LICENCE_URL } from "./licensing/rumseyLicense";
import {
  allResourceLayerCatalog,
  churchLayerCatalog,
  environmentalHealthLayerCatalog,
  floodHazardLayerCatalog,
  hydroPilotLayerCatalog,
  initialHydroPilotLayerVisibility,
  initialEnvironmentalHealthLayerVisibility,
  wellLogLayerCatalog,
  initialWellLogLayerVisibility,
  initialFloodHazardLayerVisibility,
  initialProvinceLayerVisibility,
  initialResourceLayerVisibility,
  nativeLayerCatalog,
  provinceLayerCatalog,
  resourceLayerCatalog,
  topographyLayerCatalog,
  initialZoningLayerVisibility,
  zoningLayerCatalog,
  type HydroPilotLayerId,
  type EnvironmentalHealthLayerId,
  type FloodHazardLayerId,
  type ProvinceLayerId,
  type ResourceLayerId,
  type ZoningLayerId,
  type WellLogLayerId,
} from "./layers/layerCatalog";
import type { WellLogAccuracyFilter } from "./services/wellLogs";
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
  NSPRD_LAYER_URL,
  type NsprdFeatureCollection,
} from "./services/nsprd";
import {
  fetchParcelContext,
  mappedAreaForPid,
  type ParcelContext,
} from "./services/parcelContext";
import { buildEvidenceNote } from "./services/evidenceNote";
import { fetchParcelFloodHazardEvidence } from "./services/floodHazard";
import {
  buildMapShareUrl,
  parseMapShareState,
  type MapMode,
  type ShareLayerId,
} from "./services/mapShareState";
import {
  fetchParcelResourceIntersections,
  type ParcelResourceIntersections,
} from "./services/parcelResources";
import {
  fetchParcelBuildingCount,
} from "./services/buildings";
import {
  fetchParcelAssessments,
} from "./services/pvscAssessments";
import {
  fetchDwellingCharacteristics,
  type PvscDwellingAccount,
} from "./services/pvscDwellings";
import {
  eventDate,
  eventDateLabel,
  eventLifecycleLabel,
  historicalSaleMethodLabel,
} from "./services/taxSaleFormat";
import {
  startPrintCapture,
  updatePrintCaptureEvidence,
  type PrintCapture,
  type PrintEvidence,
  type PrintEvent,
  type PrintLayerSource,
  type PrintLoadState,
  type PrintMapViewport,
} from "./services/printSnapshot";

const TRANSIENT_MESSAGE_DURATION_MS = 6_000;

const BETA_SIGNUP_URL =
  "mailto:map@kinnokilabs.com?subject=NS%20Marks%20The%20Spot%20beta%20signup";

type TaxSaleFilter = "all" | "redemption" | "immediate-or-none";
type HistoricalOutcomeFilter = "all" | HistoricalOutcome;

const EMPTY_FEATURES: NsprdFeatureCollection = {
  type: "FeatureCollection",
  features: [],
};

type SelectedEvidenceRequest = { pid: string; generation: number };

function isCurrentEvidenceRequest(
  current: SelectedEvidenceRequest | null,
  expected: SelectedEvidenceRequest,
) {
  return current?.pid === expected.pid && current.generation === expected.generation;
}

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
  ...environmentalHealthLayerCatalog.map(({ id }) => id),
  ...zoningLayerCatalog.map(({ id }) => id),
  ...wellLogLayerCatalog.map(({ id }) => id),
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

function countLabel(count: number, singular: string): string {
  return `${count} ${count === 1 ? singular : `${singular}s`}`;
}

function snapshotDateLabel(event: TaxSaleEvent): string {
  return eventDate.format(
    new Date(`${event.retrievedOn}T12:00:00-03:00`),
  );
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

function printState<T>(
  state:
    | { status: "idle" | "loading" }
    | { status: "ready"; value: T }
    | { status: "error" },
): PrintLoadState<T> {
  if (state.status === "ready") return { status: "ready", value: state.value };
  if (state.status === "error") {
    return { status: "error", message: "Source unavailable at export time." };
  }
  return { status: "pending" };
}

function printStateForRequest<T>(
  state: { request: SelectedEvidenceRequest | null } & (
    | { status: "idle" | "loading" }
    | { status: "ready"; value: T }
    | { status: "error" }
  ),
  request: SelectedEvidenceRequest | null,
): PrintLoadState<T> {
  return request && isCurrentEvidenceRequest(state.request, request)
    ? printState(state)
    : { status: "pending" };
}

function printDwellingStateForRequest(
  state: DwellingState,
  request: SelectedEvidenceRequest | null,
): PrintLoadState<PvscDwellingAccount[]> {
  if (!request || !isCurrentEvidenceRequest(state.request, request)) {
    return { status: "pending" };
  }
  if (state.status === "ready") {
    return { status: "ready", value: state.value };
  }
  if (state.status === "blocked") {
    return {
      status: "error",
      message:
        "Dwelling lookup was not run because assessment account evidence was unavailable.",
    };
  }
  if (state.status === "error") {
    return {
      status: "error",
      message: "PVSC dwelling source unavailable at export time.",
    };
  }
  return { status: "pending" };
}

function printEventForCurrent(event: TaxSaleEvent, now: number): PrintEvent {
  return {
    id: event.id,
    name: `${event.shortMunicipality} — ${eventDateLabel(event)}`,
    status: eventLifecycleLabel(event, now),
    facts: [
      { label: "Sale method", value: event.eventType === "sealed-tender" ? "Sealed tender" : "Public auction" },
      { label: "Notice retrieved", value: event.retrievedOn },
    ],
    sources: [
      { label: event.sourceLabel, sourceUrl: event.sourceUrl },
      ...(event.secondarySourceUrl
        ? [{ label: "Official supporting source", sourceUrl: event.secondarySourceUrl }]
        : []),
    ],
    limitation:
      "Official notice evidence only; it does not establish current availability, title, access, condition, value, possession, or buildability.",
  };
}

function printEventForHistorical(
  event: (typeof historicalTaxSaleEvents)[number],
): PrintEvent {
  return {
    id: event.id,
    name: `${event.shortMunicipality} — ${eventDate.format(new Date(`${event.saleDate}T12:00:00-03:00`))}`,
    status: event.resultStatus === "verified" ? "Official result verified" : "Official results pending",
    facts: [
      { label: "Sale method", value: historicalSaleMethodLabel(event.saleMethod) },
      { label: "Notice retrieved", value: event.retrievedOn },
    ],
    sources: [
      { label: "Official notice", sourceUrl: event.noticeUrl },
      ...(event.resultUrl
        ? [{ label: "Official result", sourceUrl: event.resultUrl }]
        : event.landingPageUrl
          ? [{ label: "Municipal results page", sourceUrl: event.landingPageUrl }]
          : []),
    ],
    limitation:
      "Dated historical evidence only; it does not establish present ownership, title, redemption, legal access, condition, value, or parcel status.",
  };
}

function printLayerSources(): Map<ShareLayerId, PrintLayerSource> {
  const sources = new Map<ShareLayerId, PrintLayerSource>();
  sources.set("modern", {
    id: "modern",
    name: "Modern map",
    sourceUrl: "https://www.openstreetmap.org/copyright",
    sourceDate: "Live OpenStreetMap tiles",
    attribution: "© OpenStreetMap contributors",
    licenceUrl: "https://www.openstreetmap.org/copyright",
  });
  provinceLayerCatalog.forEach((layer) => sources.set(layer.id, {
    id: layer.id,
    name: layer.name,
    sourceUrl: layer.serviceUrl,
    sourceDate: layer.sourceDate,
    attribution: PROVINCE_ATTRIBUTION,
    licenceUrl: PROVINCE_LICENSE_URL,
  }));
  allResourceLayerCatalog.forEach((layer) => sources.set(layer.id, {
    id: layer.id,
    name: layer.name,
    sourceUrl: layer.sourceUrl,
    sourceDate: layer.sourceDate,
    attribution: layer.id === "mineral-proximity-parcels"
      ? PROVINCE_ATTRIBUTION
      : OPEN_GOVERNMENT_ATTRIBUTION,
    licenceUrl: layer.id === "mineral-proximity-parcels"
      ? PROVINCE_LICENSE_URL
      : OPEN_GOVERNMENT_LICENCE_URL,
  }));
  hydroPilotLayerCatalog.forEach((layer) => sources.set(layer.id, {
    id: layer.id,
    name: layer.name,
    sourceUrl: layer.sourceUrl,
    sourceDate: layer.sourceDate,
    attribution: OPEN_GOVERNMENT_ATTRIBUTION,
    licenceUrl: OPEN_GOVERNMENT_LICENCE_URL,
  }));
  floodHazardLayerCatalog.forEach((layer) => sources.set(layer.id, {
    id: layer.id,
    name: layer.name,
    sourceUrl: layer.sourceUrl,
    sourceDate: layer.sourceDate,
    attribution: layer.licence === "province-restricted"
      ? PROVINCE_ATTRIBUTION
      : OPEN_GOVERNMENT_ATTRIBUTION,
    licenceUrl: layer.licenceUrl,
  }));
  environmentalHealthLayerCatalog.forEach((layer) => sources.set(layer.id, {
    id: layer.id,
    name: layer.name,
    sourceUrl: layer.sourceUrl,
    sourceDate: layer.sourceDate,
    attribution: layer.licence === "province-restricted"
      ? PROVINCE_ATTRIBUTION
      : OPEN_GOVERNMENT_ATTRIBUTION,
    licenceUrl: layer.licenceUrl,
  }));
  zoningLayerCatalog.forEach((layer) => sources.set(layer.id, {
    id: layer.id,
    name: `${layer.name} zoning`,
    sourceUrl: layer.sourceUrl,
    sourceDate: layer.sourceDate,
    attribution: layer.attribution,
    licenceUrl: layer.licenceUrl,
  }));
  wellLogLayerCatalog.forEach((layer) => sources.set(layer.id, {
    id: layer.id,
    name: layer.name,
    sourceUrl: layer.sourceUrl,
    sourceDate: layer.sourceDate,
    attribution: OPEN_GOVERNMENT_ATTRIBUTION,
    licenceUrl: OPEN_GOVERNMENT_LICENCE_URL,
  }));
  return sources;
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

function AboutDialog({ onClose }: { onClose: () => void }) {
  return (
    <div className="dialog-backdrop">
      <section
        className="licence-dialog about-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="about-title"
      >
        <div className="licence-mark" aria-hidden="true">
          NS
        </div>
        <h2 id="about-title">About NS Marks The Spot</h2>
        <p>
          An open-source map for screening Nova Scotia parcels: search by PID
          or civic address, see municipal tax-sale notices on live parcel
          geometry, and read the mapped evidence for any property. It is the
          online companion to a native iPhone app in development.
        </p>
        <h3>How it treats data</h3>
        <ul className="about-method">
          <li>
            Every official notice is pinned by a SHA-256 receipt; datasets
            cannot drift silently.
          </li>
          <li>
            Unknown outcomes stay unknown. Results are never inferred, so a
            dated record cannot masquerade as a current offering.
          </li>
          <li>
            An empty result and a failed source are reported differently —
            absence of evidence is never presented as evidence of absence.
          </li>
          <li>
            Assessed-owner names are never ingested, and browser location
            never leaves the browser.
          </li>
        </ul>
        <h3>Who makes it</h3>
        <p>
          I have made maps for twenty years, mostly for forestry in Nova
          Scotia. This app is where that practice meets modern web
          engineering: every layer names its source, scale, and licence, the
          way a printed map sheet carries its legend and survey notes.
        </p>
        <h3>Use it full screen on iPhone</h3>
        <p>
          In Safari, tap Share, then Add to Home Screen. The installed map
          opens without Safari&apos;s address bar or toolbar.
        </p>
        <p className="about-links">
          <a
            href="https://github.com/dfakkeldy/ns-marks-the-spot"
            target="_blank"
            rel="noreferrer"
          >
            Source on GitHub
          </a>
          {" · "}
          <a href="mailto:map@kinnokilabs.com?subject=NS%20Marks%20The%20Spot">
            Email the maker
          </a>
        </p>
        <div className="dialog-actions">
          <button className="primary-action" type="button" onClick={onClose}>
            Close
          </button>
        </div>
      </section>
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
  const [aboutOpen, setAboutOpen] = useState(false);
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
  const selectionGeneration = useRef(initialShareState.pid ? 1 : 0);
  const [selectedEvidenceRequest, setSelectedEvidenceRequest] = useState<
    SelectedEvidenceRequest | null
  >(() => initialShareState.pid
    ? { pid: initialShareState.pid, generation: selectionGeneration.current }
    : null);
  const [parcelFocusRequest, setParcelFocusRequest] =
    useState<ParcelFocusRequest | null>(null);
  const [parcelLookupMessage, setParcelLookupMessage] = useState<string | null>(
    null,
  );

  useEffect(() => {
    if (!parcelLookupMessage || !/^PID \d+ selected/.test(parcelLookupMessage)) {
      return;
    }
    const timer = window.setTimeout(
      () => setParcelLookupMessage(null),
      TRANSIENT_MESSAGE_DURATION_MS,
    );
    return () => window.clearTimeout(timer);
  }, [parcelLookupMessage]);
  const [mappedContext, setMappedContext] = useState<ParcelContextState>({
    status: "idle",
    value: EMPTY_PARCEL_CONTEXT,
    request: initialShareState.pid
      ? { pid: initialShareState.pid, generation: selectionGeneration.current }
      : null,
  });
  const [civicAddresses, setCivicAddresses] = useState<CivicAddressState>({
    status: initialShareState.pid ? "loading" : "idle",
    value: EMPTY_CIVIC_ADDRESSES,
    request: initialShareState.pid
      ? { pid: initialShareState.pid, generation: selectionGeneration.current }
      : null,
  });
  const [resourceIntersections, setResourceIntersections] =
    useState<ParcelResourceState>({
      status: initialShareState.pid ? "loading" : "idle",
      value: EMPTY_RESOURCE_INTERSECTIONS,
      request: initialShareState.pid
        ? { pid: initialShareState.pid, generation: selectionGeneration.current }
        : null,
    });
  const [floodHazard, setFloodHazard] = useState<FloodHazardState>({
    status: initialShareState.pid ? "loading" : "idle",
    request: initialShareState.pid
      ? { pid: initialShareState.pid, generation: selectionGeneration.current }
      : null,
  });
  const [buildingCount, setBuildingCount] = useState<BuildingCountState>({
    status: initialShareState.pid ? "loading" : "idle",
    request: initialShareState.pid
      ? { pid: initialShareState.pid, generation: selectionGeneration.current }
      : null,
  });
  const [dwellingState, setDwellingState] = useState<DwellingState>({
    status: initialShareState.pid ? "loading" : "idle",
    request: initialShareState.pid
      ? { pid: initialShareState.pid, generation: selectionGeneration.current }
      : null,
  });
  const [assessmentState, setAssessmentState] = useState<AssessmentState>({
    status: initialShareState.pid ? "loading" : "idle",
    request: initialShareState.pid
      ? { pid: initialShareState.pid, generation: selectionGeneration.current }
      : null,
  });
  const [mapMode, setMapMode] = useState<MapMode>(initialShareState.mode);
  const [mapViewport, setMapViewport] = useState<PrintMapViewport>({
    position: initialShareState.position,
    bounds: {
      north: initialShareState.position.latitude,
      east: initialShareState.position.longitude,
      south: initialShareState.position.latitude,
      west: initialShareState.position.longitude,
    },
  });
  const sharedLayersIncludeUsableBasemap =
    initialShareState.layerIds.includes("modern") ||
    (
      initialShareState.layerIds.includes("ns-aerial") &&
      initialShareState.position.zoom >=
        (provinceLayerCatalog.find(({ id }) => id === "ns-aerial")?.minZoom ??
          Number.POSITIVE_INFINITY)
    );
  const [showModernMap, setShowModernMap] = useState(
    hasSharedLayers
      ? initialShareState.layerIds.includes("modern") ||
          !sharedLayersIncludeUsableBasemap
      : true,
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
  const [environmentalHealthLayers, setEnvironmentalHealthLayers] = useState(
    () => hasSharedLayers
      ? Object.fromEntries(
          environmentalHealthLayerCatalog.map(({ id }) => [
            id,
            initialShareState.layerIds.includes(id),
          ]),
        ) as Record<EnvironmentalHealthLayerId, boolean>
      : initialEnvironmentalHealthLayerVisibility,
  );
  const [zoningLayers, setZoningLayers] = useState(
    () => hasSharedLayers
      ? Object.fromEntries(
          zoningLayerCatalog.map(({ id }) => [
            id,
            initialShareState.layerIds.includes(id),
          ]),
        ) as Record<ZoningLayerId, boolean>
      : initialZoningLayerVisibility,
  );
  const [wellLogLayers, setWellLogLayers] = useState(
    () => hasSharedLayers
      ? Object.fromEntries(
          wellLogLayerCatalog.map(({ id }) => [
            id,
            initialShareState.layerIds.includes(id),
          ]),
        ) as Record<WellLogLayerId, boolean>
      : initialWellLogLayerVisibility,
  );
  const [wellLogAccuracyFilter, setWellLogAccuracyFilter] =
    useState<WellLogAccuracyFilter>("surveyed");

  useEffect(() => {
    const visualViewport = window.visualViewport;
    const updateViewportHeight = () => {
      const height = visualViewport?.height ?? window.innerHeight;
      document.documentElement.style.setProperty(
        "--app-viewport-height",
        `${Math.round(height)}px`,
      );
    };

    updateViewportHeight();
    visualViewport?.addEventListener("resize", updateViewportHeight);
    window.addEventListener("resize", updateViewportHeight);

    return () => {
      visualViewport?.removeEventListener("resize", updateViewportHeight);
      window.removeEventListener("resize", updateViewportHeight);
      document.documentElement.style.removeProperty("--app-viewport-height");
    };
  }, []);
  const effectiveResourceLayers = useMemo<Record<ResourceLayerId, boolean>>(
    () => ({
      ...resourceLayers,
      "mineral-proximity-parcels":
        licenceAccepted && resourceLayers["mineral-proximity-parcels"],
    }),
    [licenceAccepted, resourceLayers],
  );
  // A share URL can name any layer id, so the restricted rasters in this group
  // are gated here rather than only in the checkbox UI.
  const effectiveEnvironmentalHealthLayers = useMemo<
    Record<EnvironmentalHealthLayerId, boolean>
  >(
    () => Object.fromEntries(
      environmentalHealthLayerCatalog.map((layer) => [
        layer.id,
        environmentalHealthLayers[layer.id] &&
          (layer.licence === "province-open" || licenceAccepted),
      ]),
    ) as Record<EnvironmentalHealthLayerId, boolean>,
    [environmentalHealthLayers, licenceAccepted],
  );
  const effectiveFloodHazardLayers = useMemo<Record<FloodHazardLayerId, boolean>>(
    () => Object.fromEntries(
      floodHazardLayerCatalog.map((layer) => [
        layer.id,
        floodHazardLayers[layer.id] &&
          (layer.licence === "province-open" || licenceAccepted),
      ]),
    ) as Record<FloodHazardLayerId, boolean>,
    [floodHazardLayers, licenceAccepted],
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
  const printCaptureSequence = useRef(0);
  const [printCapture, setPrintCapture] = useState<PrintCapture | null>(null);
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
    if (!selectedPid || !licenceAccepted || !selectedEvidenceRequest) {
      return;
    }
    const request = selectedEvidenceRequest;

    const selectedFeatures = parcels.features.filter(
      ({ properties }) => properties.PID === selectedPid,
    );
    if (selectedFeatures.length === 0) {
      return;
    }

    const controller = new AbortController();
    fetchParcelContext(selectedFeatures, controller.signal)
      .then((value) => setMappedContext((current) =>
        isCurrentEvidenceRequest(current.request, request)
          ? { status: "ready", value, request }
          : current,
      ))
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError") {
          return;
        }
        setMappedContext((current) =>
          isCurrentEvidenceRequest(current.request, request)
            ? { status: "error", value: EMPTY_PARCEL_CONTEXT, request }
            : current,
        );
      });

    return () => controller.abort();
  }, [licenceAccepted, parcels, selectedEvidenceRequest, selectedPid]);

  useEffect(() => {
    if (!selectedPid || !licenceAccepted || !selectedEvidenceRequest) {
      return;
    }
    const request = selectedEvidenceRequest;

    const selectedFeatures = parcels.features.filter(
      ({ properties }) => properties.PID === selectedPid,
    );
    const noticeAan = mapMode === "current"
      ? listingContextForPid(selectedPid)?.listing.aan
      : undefined;
    if (selectedFeatures.length === 0 && !noticeAan) {
      return;
    }

    const controller = new AbortController();
    setAssessmentState({ status: "loading", request });
    fetchParcelAssessments(selectedFeatures, noticeAan, controller.signal)
      .then((value) => setAssessmentState((current) =>
        isCurrentEvidenceRequest(current.request, request)
          ? { status: "ready", value, request }
          : current,
      ))
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError") {
          return;
        }
        setAssessmentState((current) =>
          isCurrentEvidenceRequest(current.request, request)
            ? { status: "error", request }
            : current,
        );
      });

    return () => controller.abort();
  }, [licenceAccepted, mapMode, parcels, selectedEvidenceRequest, selectedPid]);

  useEffect(() => {
    if (assessmentState.status !== "ready") {
      setDwellingState({
        status: assessmentState.status === "error"
          ? "blocked"
          : assessmentState.status,
        request: assessmentState.request,
      });
      return;
    }

    const request = assessmentState.request;
    const aans = assessmentState.value.accounts.map(({ aan }) => aan);
    if (aans.length === 0) {
      setDwellingState({ status: "ready", value: [], request });
      return;
    }

    const controller = new AbortController();
    setDwellingState({ status: "loading", request });
    fetchDwellingCharacteristics(aans, controller.signal)
      .then((value) => setDwellingState((current) =>
        isCurrentEvidenceRequest(current.request, request)
          ? { status: "ready", value, request }
          : current,
      ))
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError") {
          return;
        }
        setDwellingState((current) =>
          isCurrentEvidenceRequest(current.request, request)
            ? { status: "error", request }
            : current,
        );
      });

    return () => controller.abort();
  }, [assessmentState]);

  useEffect(() => {
    if (!selectedPid || !licenceAccepted || !selectedEvidenceRequest) return;
    const request = selectedEvidenceRequest;
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
    ).then((value) => setFloodHazard((current) =>
      isCurrentEvidenceRequest(current.request, request)
        ? { status: "ready", value, request }
        : current,
    ))
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setFloodHazard((current) =>
          isCurrentEvidenceRequest(current.request, request)
            ? { status: "ready", request, value: {
            river: { status: "error", aep: [], message: "Flood evidence request failed." },
            coastal: ["current", "2050", "2100"].map((scenario) => ({
              scenario: scenario as "current" | "2050" | "2100",
              status: "error" as const,
              stormAnnualExceedanceProbabilityPercent: 1 as const,
              message: "Flood evidence request failed.",
            })),
            } }
            : current,
        );
      });
    return () => controller.abort();
  }, [licenceAccepted, parcels, selectedEvidenceRequest, selectedPid]);

  useEffect(() => {
    if (!selectedPid || !licenceAccepted || !selectedEvidenceRequest) {
      return;
    }
    const request = selectedEvidenceRequest;

    const selectedFeatures = parcels.features.filter(
      ({ properties }) => properties.PID === selectedPid,
    );
    if (selectedFeatures.length === 0) {
      return;
    }

    const controller = new AbortController();
    fetchParcelBuildingCount(selectedFeatures, controller.signal)
      .then((value) => setBuildingCount((current) =>
        isCurrentEvidenceRequest(current.request, request)
          ? { status: "ready", value, request }
          : current,
      ))
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError") {
          return;
        }
        setBuildingCount((current) =>
          isCurrentEvidenceRequest(current.request, request)
            ? { status: "error", request }
            : current,
        );
      });

    return () => controller.abort();
  }, [licenceAccepted, parcels, selectedEvidenceRequest, selectedPid]);

  useEffect(() => {
    if (!selectedPid || !licenceAccepted || !selectedEvidenceRequest) {
      return;
    }
    const request = selectedEvidenceRequest;

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
      request,
    });
    fetchParcelResourceIntersections(selectedFeatures, controller.signal)
      .then((value) => setResourceIntersections((current) =>
        isCurrentEvidenceRequest(current.request, request)
          ? { status: "ready", value, request }
          : current,
      ))
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError") {
          return;
        }
      });

    return () => controller.abort();
  }, [licenceAccepted, parcels, selectedEvidenceRequest, selectedPid]);

  useEffect(() => {
    if (!selectedPid || !licenceAccepted || !selectedEvidenceRequest) {
      return;
    }
    const request = selectedEvidenceRequest;

    const selectedFeatures = parcels.features.filter(
      ({ properties }) => properties.PID === selectedPid,
    );
    if (selectedFeatures.length === 0) {
      return;
    }

    const controller = new AbortController();
    fetchCivicAddresses(selectedFeatures, controller.signal)
      .then((value) => setCivicAddresses((current) =>
        isCurrentEvidenceRequest(current.request, request)
          ? { status: "ready", value, request }
          : current,
      ))
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError") {
          return;
        }
        setCivicAddresses((current) =>
          isCurrentEvidenceRequest(current.request, request)
            ? { status: "error", value: EMPTY_CIVIC_ADDRESSES, request }
            : current,
        );
      });

    return () => controller.abort();
  }, [licenceAccepted, parcels, selectedEvidenceRequest, selectedPid]);

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

  const setWellLogLayerVisibility = (
    id: WellLogLayerId,
    visible: boolean,
  ) => {
    setWellLogLayers((current) => ({ ...current, [id]: visible }));
  };

  const setFloodHazardLayerVisibility = (
    id: FloodHazardLayerId,
    visible: boolean,
  ) => {
    setFloodHazardLayers((current) => ({ ...current, [id]: visible }));
  };
  const setEnvironmentalHealthLayerVisibility = (
    id: EnvironmentalHealthLayerId,
    visible: boolean,
  ) => {
    setEnvironmentalHealthLayers((current) => ({ ...current, [id]: visible }));
  };

  const setZoningLayerVisibility = (id: ZoningLayerId, visible: boolean) => {
    setZoningLayers((current) => ({ ...current, [id]: visible }));
  };

  const setLayerStatus = useCallback(
    (id: MapLayerId, status: MapLayerStatus) => {
      setLayerStatuses((current) => ({ ...current, [id]: status }));
    },
    [],
  );

  const selectParcel = (pid: string) => {
    setMobileControlsOpen(false);
    const request = { pid, generation: selectionGeneration.current + 1 };
    selectionGeneration.current = request.generation;
    setSelectedPid(pid);
    setSelectedEvidenceRequest(request);
    setMappedContext({ status: "loading", value: EMPTY_PARCEL_CONTEXT, request });
    setBuildingCount({ status: "loading", request });
    setAssessmentState({ status: "loading", request });
    setDwellingState({ status: "loading", request });
    setFloodHazard({ status: "loading", request });
    setCivicAddresses({ status: "loading", value: EMPTY_CIVIC_ADDRESSES, request });
    setResourceIntersections({
      status: "loading",
      value: EMPTY_RESOURCE_INTERSECTIONS,
      request,
    });
    setShareMessage(null);
  };

  const changeMapMode = (mode: MapMode) => {
    if (mode === mapMode) {
      return;
    }
    setMapMode(mode);
    setSelectedPid(null);
    setSelectedEvidenceRequest(null);
    setQuery("");
    setMappedContext({ status: "idle", value: EMPTY_PARCEL_CONTEXT, request: null });
    setBuildingCount({ status: "idle", request: null });
    setAssessmentState({ status: "idle", request: null });
    setFloodHazard({ status: "idle", request: null });
    setCivicAddresses({ status: "idle", value: EMPTY_CIVIC_ADDRESSES, request: null });
    setResourceIntersections({
      status: "idle",
      value: EMPTY_RESOURCE_INTERSECTIONS,
      request: null,
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

  const requestParcelFocus = (pid: string) => {
    setParcelFocusRequest((current) => ({
      pid,
      requestId: (current?.requestId ?? 0) + 1,
    }));
  };

  const identifyParcelAtPoint = async (
    latitude: number,
    longitude: number,
    options?: { addressLabel?: string; focusOnSelect?: boolean },
  ) => {
    const { addressLabel, focusOnSelect = false } = options ?? {};
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
      if (focusOnSelect) {
        requestParcelFocus(pid);
      }
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
    requestParcelFocus(pid);

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
    requestParcelFocus(pid);

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
  const selectedMappedArea = useMemo(
    () => selectedPid ? mappedAreaForPid(parcels, selectedPid) : null,
    [parcels, selectedPid],
  );
  const selectedParcelGeometry = useMemo<NsprdFeatureCollection>(() => ({
    type: "FeatureCollection",
    features: selectedPid
      ? parcels.features.filter(({ properties }) => properties.PID === selectedPid)
      : [],
  }), [parcels, selectedPid]);
  const canPrintExport = Boolean(
    selectedPid && selectedParcelGeometry.features.length > 0 && selectedEvidenceRequest,
  );

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
      .filter(({ id }) => effectiveFloodHazardLayers[id])
      .map(({ id }) => id),
    ...environmentalHealthLayerCatalog
      .filter(({ id }) => effectiveEnvironmentalHealthLayers[id])
      .map(({ id }) => id),
    ...zoningLayerCatalog
      .filter(({ id }) => zoningLayers[id])
      .map(({ id }) => id),
    ...wellLogLayerCatalog
      .filter(({ id }) => wellLogLayers[id])
      .map(({ id }) => id),
  ], [
    effectiveEnvironmentalHealthLayers,
    effectiveFloodHazardLayers,
    hydroPilotLayers,
    provinceLayers,
    resourceLayers,
    showModernMap,
    zoningLayers,
    wellLogLayers,
  ]);
  const printEventIds = useMemo(
    () => mapMode === "current"
      ? Array.from(selectedEventIds)
      : Array.from(new Set(selectedHistoricalContexts.map(({ event }) => event.id))),
    [mapMode, selectedEventIds, selectedHistoricalContexts],
  );
  const printEvents = useMemo(
    () => mapMode === "current"
      ? taxSaleEvents
        .filter(({ id }) => selectedEventIds.has(id))
        .map((event) => printEventForCurrent(event, currentTime))
      : historicalTaxSaleEvents
        .filter(({ id }) => printEventIds.includes(id))
        .map(printEventForHistorical),
    [currentTime, mapMode, printEventIds, selectedEventIds],
  );
  const captureLayerIds = useMemo<ShareLayerId[]>(() => [
    ...(showModernMap ? (["modern"] as const) : []),
    ...provinceLayerCatalog
      .filter(({ id }) => licenceAccepted && provinceLayers[id])
      .map(({ id }) => id),
    ...allResourceLayerCatalog
      .filter(({ id }) => effectiveResourceLayers[id])
      .map(({ id }) => id),
    ...hydroPilotLayerCatalog
      .filter(({ id }) => hydroPilotLayers[id])
      .map(({ id }) => id),
    ...floodHazardLayerCatalog
      .filter(({ id }) => effectiveFloodHazardLayers[id])
      .map(({ id }) => id),
    ...environmentalHealthLayerCatalog
      .filter(({ id }) => effectiveEnvironmentalHealthLayers[id])
      .map(({ id }) => id),
    ...zoningLayerCatalog
      .filter(({ id }) => zoningLayers[id])
      .map(({ id }) => id),
    ...wellLogLayerCatalog
      .filter(({ id }) => wellLogLayers[id])
      .map(({ id }) => id),
  ], [
    effectiveEnvironmentalHealthLayers,
    effectiveFloodHazardLayers,
    effectiveResourceLayers,
    hydroPilotLayers,
    licenceAccepted,
    provinceLayers,
    showModernMap,
    zoningLayers,
    wellLogLayers,
  ]);
  const currentPrintEvidence = useMemo<PrintEvidence>(() => ({
    mappedArea: selectedMappedArea,
    buildings: printStateForRequest(buildingCount, selectedEvidenceRequest),
    assessments: printStateForRequest(assessmentState, selectedEvidenceRequest),
    dwellings: printDwellingStateForRequest(
      dwellingState,
      selectedEvidenceRequest,
    ),
    civicAddresses: printStateForRequest(civicAddresses, selectedEvidenceRequest),
    mappedContext: printStateForRequest(mappedContext, selectedEvidenceRequest),
    floodHazard: printStateForRequest(floodHazard, selectedEvidenceRequest),
    resources: printStateForRequest(resourceIntersections, selectedEvidenceRequest),
  }), [
    assessmentState,
    buildingCount,
    civicAddresses,
    dwellingState,
    floodHazard,
    mappedContext,
    resourceIntersections,
    selectedEvidenceRequest,
    selectedMappedArea,
  ]);
  const captureLayerSources = useMemo(() => {
    const sources = printLayerSources();
    return captureLayerIds.flatMap((id) => {
      const source = sources.get(id);
      return source ? [source] : [];
    });
  }, [captureLayerIds]);
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
      position: mapViewport.position,
    }),
    [
      activeLayerIds,
      mapMode,
      mapViewport.position,
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

  const openPrintExport = () => {
    if (!selectedPid || !selectedEvidenceRequest || !canPrintExport) return;

    printCaptureSequence.current += 1;
    setPrintCapture(startPrintCapture({
      token: `print-${printCaptureSequence.current}`,
      capturedAt: new Date().toISOString(),
      pid: selectedPid,
      evidenceRequest: selectedEvidenceRequest,
      mode: mapMode,
      eventIds: printEventIds,
      events: printEvents,
      selectedParcelGeometry,
      mapParcels: parcels,
      taxSalePids: Array.from(filteredTaxSalePids),
      historicalTaxSalePids: Array.from(filteredHistoricalPids),
      viewport: mapViewport,
      layerIds: captureLayerIds,
      wellLogAccuracyFilter,
      layerSources: captureLayerSources,
      licenceAccepted,
    }, currentPrintEvidence));
  };

  const printCapturePid = printCapture?.pid;
  const printCaptureToken = printCapture?.token;
  const printCaptureEvidenceRequestPid = printCapture?.evidenceRequest.pid;
  const printCaptureEvidenceGeneration = printCapture?.evidenceRequest.generation;
  useEffect(() => {
    if (
      !printCapturePid ||
      !printCaptureEvidenceRequestPid ||
      printCaptureEvidenceGeneration === undefined ||
      selectedPid !== printCapturePid ||
      !isCurrentEvidenceRequest(selectedEvidenceRequest, {
        pid: printCaptureEvidenceRequestPid,
        generation: printCaptureEvidenceGeneration,
      })
    ) return;
    setPrintCapture((current) => current
      ? updatePrintCaptureEvidence(current, {
          token: current.token,
          pid: current.pid,
          evidenceRequest: current.evidenceRequest,
          evidence: currentPrintEvidence,
        })
      : null);
  }, [
    currentPrintEvidence,
    printCaptureEvidenceGeneration,
    printCaptureEvidenceRequestPid,
    printCapturePid,
    printCaptureToken,
    selectedEvidenceRequest,
    selectedPid,
  ]);

  useEffect(() => {
    if (
      printCapture && (
        !licenceAccepted ||
        selectedPid !== printCapture.pid ||
        !isCurrentEvidenceRequest(selectedEvidenceRequest, printCapture.evidenceRequest)
      )
    ) {
      setPrintCapture(null);
    }
  }, [licenceAccepted, printCapture, selectedEvidenceRequest, selectedPid]);

  const exportEvidence = () => {
    if (
      !selectedPid ||
      resourceIntersections.status !== "ready" ||
      (assessmentState.status !== "ready" && assessmentState.status !== "error") ||
      (dwellingState.status !== "ready" &&
        dwellingState.status !== "error" &&
        dwellingState.status !== "blocked")
    ) {
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
      ...wellLogLayerCatalog
        .filter(({ id }) => wellLogLayers[id])
        .map(({ name, sourceUrl, sourceDate }) => ({
          name,
          sourceUrl,
          sourceDate,
        })),
      ...floodHazardLayerCatalog
        .filter(({ id }) => effectiveFloodHazardLayers[id])
        .map(({ name, sourceUrl, sourceDate }) => ({
          name,
          sourceUrl,
          sourceDate,
        })),
      ...environmentalHealthLayerCatalog
        .filter(({ id }) => effectiveEnvironmentalHealthLayers[id])
        .map(({ name, sourceUrl, sourceDate }) => ({
          name,
          sourceUrl,
          sourceDate,
        })),
      ...zoningLayerCatalog
        .filter(({ id }) => zoningLayers[id])
        .map(({ name, sourceUrl, sourceDate }) => ({
          name: `${name} zoning (unofficial)`,
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
      position: mapViewport.position,
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
      assessmentEvidence: assessmentState.status === "ready"
        ? { status: "ready", result: assessmentState.value }
        : { status: "error" },
      dwellingEvidence: dwellingState.status === "ready"
        ? { status: "ready", accounts: dwellingState.value }
        : dwellingState.status === "blocked"
          ? { status: "blocked" }
          : { status: "error" },
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
    <>
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
          <button
            className="text-button header-about"
            type="button"
            onClick={() => setAboutOpen(true)}
          >
            About this map
          </button>
          <span>iPhone app in development</span>
          <a className="header-action" href={BETA_SIGNUP_URL}>
            Get launch updates
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
                          { addressLabel: address.label, focusOnSelect: true },
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
            {provinceLayerCatalog
              .filter(({ id }) => id !== "contours")
              .map((layer) => (
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
            <details className="resource-layer-group topography-layer-group">
              <summary>
                <span>Topography</span>
                <small>1 optional terrain layer</small>
              </summary>
              <div className="resource-layer-controls">
                {topographyLayerCatalog.map((layer) => (
                  <LayerToggle
                    key={layer.id}
                    layer={layer}
                    checked={provinceLayers[layer.id]}
                    licenceAccepted={licenceAccepted}
                    status={layerStatuses[layer.id]}
                    onChange={(checked) =>
                      setProvinceLayerVisibility(layer.id, checked)
                    }
                    onReviewLicence={() => setLicenceDialogOpen(true)}
                  />
                ))}
                <p className="resource-source-note">
                  Contours show mapped elevation shape and depressions. They do
                  not establish surveyed grade, drainage, stability, access,
                  flood exposure, or buildability. {" "}
                  <a
                    href="https://data.novascotia.ca/d/j63u-5nkj"
                    target="_blank"
                    rel="noreferrer"
                  >
                    Official Landforms source
                  </a>
                </p>
              </div>
            </details>
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
            <details className="resource-layer-group environmental-health-layer-group">
              <summary>
                <span>Environmental health screens</span>
                <small>4 optional well-water &amp; aquifer screens</small>
              </summary>
              <div className="resource-layer-controls">
                {environmentalHealthLayerCatalog.map((layer) => (
                  <EnvironmentalHealthLayerToggle
                    key={layer.id}
                    layer={layer}
                    checked={environmentalHealthLayers[layer.id]}
                    licenceAccepted={licenceAccepted}
                    status={layerStatuses[layer.id]}
                    onChange={(checked) =>
                      setEnvironmentalHealthLayerVisibility(layer.id, checked)
                    }
                    onReviewLicence={() => setLicenceDialogOpen(true)}
                  />
                ))}
                <p className="resource-source-note">
                  These are relative risk zones mapped by bedrock unit, not test
                  results for any property. A parcel takes the band of the rock
                  beneath it, and wells in any band can exceed a guideline.
                  Testing your well water is the only way to know what is in it.
                </p>
              </div>
            </details>
            <details className="resource-layer-group zoning-layer-group">
              <summary>
                <span>Municipal zoning</span>
                <small>5 optional unofficial layers</small>
              </summary>
              <div className="resource-layer-controls">
                {zoningLayerCatalog.map((layer) => (
                  <ZoningLayerToggle
                    key={layer.id}
                    layer={layer}
                    checked={zoningLayers[layer.id]}
                    status={layerStatuses[layer.id]}
                    onChange={(checked) =>
                      setZoningLayerVisibility(layer.id, checked)
                    }
                  />
                ))}
                <p className="resource-source-note">
                  These are unofficial renderings of municipal map services, not
                  the municipalities&rsquo; official copies, and are not to be
                  used for legal purposes. Always confirm a zone and its rules
                  against the linked land use by-law and with the municipality.
                </p>
                <p className="resource-source-note">
                  Nova Scotia publishes no provincial zoning layer, and most
                  municipalities publish no zoning GIS at all. An area with no
                  polygon is an area this map has no data for &mdash; it is not
                  evidence that no zoning applies. Towns inside a county are
                  separate zoning jurisdictions, so a county layer does not
                  cover town parcels.
                </p>
              </div>
            </details>
            <details className="resource-layer-group well-log-group">
              <summary>
                <span>Groundwater</span>
                <small>1 optional well-log overlay</small>
              </summary>
              <div className="resource-layer-controls">
                {wellLogLayerCatalog.map((layer) => (
                  <WellLogLayerToggle
                    key={layer.id}
                    layer={layer}
                    checked={wellLogLayers[layer.id]}
                    status={layerStatuses[layer.id]}
                    onChange={(checked) =>
                      setWellLogLayerVisibility(layer.id, checked)
                    }
                  />
                ))}
                {wellLogLayers["ns-well-logs"] ? (
                  <>
                    <WellLogAccuracyFilterControl
                      value={wellLogAccuracyFilter}
                      onChange={setWellLogAccuracyFilter}
                    />
                    <WellLogAccuracyLegend />
                  </>
                ) : null}
                <p className="resource-source-note well-log-note">
                  The Province records an estimated location accuracy for every
                  well. Only records accurate to ±50 m — mostly wells drilled
                  after 2004, positioned with a driller's GPS — are drawn as
                  solid points. Older records were placed from map books, NTS
                  sheets, or community centroids and can be off by 800 m to 8 km;
                  they stay hidden until you ask for them, and then draw hollow
                  to show a well was reported nearby rather than where it sits.
                  Depths and yields are the driller's report, not a survey or a
                  guarantee of water. {" "}
                  <a
                    href={wellLogLayerCatalog[0].sourceUrl}
                    target="_blank"
                    rel="noreferrer"
                  >
                    DP ME 430 source
                  </a>
                  {" · "}
                  <a
                    href={wellLogLayerCatalog[0].manualUrl}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Accuracy definitions
                  </a>
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
            <details className="resource-layer-group church-layer-group">
              <summary>
                <span>Church (1860s–80s)</span>
                <small>4 Cape Breton counties · tiles pending</small>
              </summary>
              <div className="resource-layer-controls">
                {churchLayerCatalog.map((layer) => (
                  <div className="layer-row unavailable" key={layer.id}>
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
                        checked={false}
                        status={{ status: "idle" }}
                      />
                    </span>
                  </div>
                ))}
                <p className="resource-source-note">
                  A.F. Church topographical township maps name the residents of
                  each building, and the occupations of prominent townsfolk.
                  Scans courtesy of the{" "}
                  <a href={RUMSEY_LICENCE_URL} target="_blank" rel="noreferrer">
                    David Rumsey Map Collection
                  </a>
                  . {RUMSEY_ATTRIBUTION}. Web tiles are not produced yet.
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
              <h2 id="offline-heading">The iPhone app is coming</h2>
              <p>
                NS Marks The Spot for iPhone is in development, with offline
                Fletcher sheets as the marquee feature. Join the list to hear
                when TestFlight opens and help shape what ships.
              </p>
              <a href={BETA_SIGNUP_URL}>Get launch updates</a>
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
            floodHazardLayers={effectiveFloodHazardLayers}
            environmentalHealthLayers={effectiveEnvironmentalHealthLayers}
            zoningLayers={zoningLayers}
            wellLogLayers={wellLogLayers}
            wellLogAccuracyFilter={wellLogAccuracyFilter}
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
            focusRequest={parcelFocusRequest}
            initialPosition={initialShareState.position}
            onViewportChange={setMapViewport}
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
              buildingCount={buildingCount}
              assessmentState={assessmentState}
              dwellingState={dwellingState}
              mappedContext={mappedContext}
              civicAddresses={civicAddresses}
              resourceIntersections={resourceIntersections}
              floodHazard={floodHazard}
              mapMode={mapMode}
              shareUrl={shareUrl}
              shareMessage={shareMessage}
              onCopyShareUrl={copyShareUrl}
              onExportEvidence={exportEvidence}
              onPrintExport={openPrintExport}
              canPrintExport={canPrintExport}
              evidenceReady={
                resourceIntersections.status === "ready" &&
                (assessmentState.status === "ready" || assessmentState.status === "error") &&
                (dwellingState.status === "ready" ||
                  dwellingState.status === "error" ||
                  dwellingState.status === "blocked")
              }
              now={currentTime}
              onClose={() => {
                setSelectedPid(null);
                setSelectedEvidenceRequest(null);
                setPrintCapture(null);
                setMappedContext({
                  status: "idle",
                  value: EMPTY_PARCEL_CONTEXT,
                  request: null,
                });
                setBuildingCount({ status: "idle", request: null });
                setAssessmentState({ status: "idle", request: null });
                setDwellingState({ status: "idle", request: null });
                setCivicAddresses({
                  status: "idle",
                  value: EMPTY_CIVIC_ADDRESSES,
                  request: null,
                });
                setResourceIntersections({
                  status: "idle",
                  value: EMPTY_RESOURCE_INTERSECTIONS,
                  request: null,
                });
                setFloodHazard({ status: "idle", request: null });
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
        <button type="button" onClick={() => setAboutOpen(true)}>
          About this map
        </button>
      </footer>

      {licenceDialogOpen ? (
        <LicenceDialog
          onAccept={acceptLicence}
          onContinueWithout={continueWithoutProvinceLayers}
        />
      ) : null}
      {aboutOpen ? <AboutDialog onClose={() => setAboutOpen(false)} /> : null}
    </div>
    {printCapture ? (
      <PrintPreview
        capture={printCapture}
        baseUrl={window.location.href}
        onClose={() => setPrintCapture(null)}
      />
    ) : null}
    </>
  );
}
