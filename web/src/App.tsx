import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
} from "react";
import appIconUrl from "../../docs/assets/app-icon.svg";
import { useStablePerIdCallback } from "./components/useStablePerIdCallback";
import {
  MapCanvas,
  type MapLayerId,
  type MapLayerStatus,
  type ParcelFocusRequest,
} from "./components/MapCanvas";
import {
  MapThemePicker,
  type MapThemeStatus,
} from "./components/MapThemePicker";
import { ThemeManagerDialog } from "./components/ThemeManagerDialog";
import { LayerCategorySection } from "./components/LayerCategorySection";
import {
  EnvironmentalHealthLayerToggle,
  FloodHazardLayerToggle,
  ForestryLayerToggle,
  ZoningLayerToggle,
  HydroPilotLayerToggle,
  HydroPotentialLegend,
  WellLogAccuracyFilterControl,
  WellLogAccuracyLegend,
  WellLogLayerToggle,
  FletcherLayerControl,
  LayerMetadata,
  LayerToggle,
  LiveConditionsLayerToggle,
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
// Print preview and PDF export ride behind React.lazy: qrcode plus the print
// components on one, pdf-lib (~150 KB gzip, the largest dependency after the
// map stack) on the other — all export-only features every visitor was
// downloading before first map paint.
const PrintPreview = lazy(() =>
  import("./components/print/PrintPreview").then((module) => ({
    default: module.PrintPreview,
  })),
);
import { TaxSalePropertyList } from "./components/TaxSalePropertyList";
import {
  advertisedPidsForEvents,
  eventsForStatus,
  geometryExceptionPidsForEvents,
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
import {
  RUMSEY_ATTRIBUTION,
  RUMSEY_COLLECTION_TERMS_URL,
  RUMSEY_LICENCE_NAME,
  RUMSEY_LICENCE_URL,
} from "./licensing/rumseyLicense";
import {
  COASTAL_HAZARD_ATTRIBUTION,
  COASTAL_HAZARD_LICENCE_URL,
  allResourceLayerCatalog,
  churchLayerCatalog,
  environmentalHealthLayerCatalog,
  forestryLayerCatalog,
  floodHazardLayerCatalog,
  fletcherLayerCatalog,
  hydroPilotLayerCatalog,
  liveConditionsLayerCatalog,
  wellLogLayerCatalog,
  provinceLayerCatalog,
  resourceLayerCatalog,
  zoningLayerCatalog,
  type HydroPilotLayerId,
  type EnvironmentalHealthLayerId,
  type ForestryLayerId,
  type FloodHazardLayerId,
  type LiveConditionsLayerId,
  type ProvinceLayerId,
  type ResourceLayerId,
  type ZoningLayerId,
  type WellLogLayerId,
} from "./layers/layerCatalog";
import {
  layerCategories,
  layerCategoryByLayerId,
  type LayerCategoryId,
} from "./layers/layerCategories";
import {
  fletcherSourceReceiptUrl,
  normalizeFletcherTileBaseUrl,
} from "./layers/fletcherLayer";
import { downloadFile } from "./services/downloadFile";
import type { WellLogAccuracyFilter } from "./services/wellLogs";
import {
  CIVIC_ADDRESS_DATASET_URL,
  OPEN_GOVERNMENT_ATTRIBUTION,
  OPEN_GOVERNMENT_LICENCE_URL,
  fetchCivicAddresses,
  searchCivicAddresses,
  type CivicAddress,
  type CivicAddressReading,
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
  hasRecognizedMapShareState,
  parseMapShareState,
  type MapMode,
  type ShareLayerId,
} from "./services/mapShareState";
import {
  builtInMapThemes,
  type CustomMapThemeDefinition,
  type MapThemeDefinition,
} from "./themes/mapThemes";
import {
  createCustomTheme,
  deleteCustomTheme,
  duplicateCustomTheme,
  loadCustomThemes,
  renameCustomTheme,
  saveCustomThemes,
  updateCustomTheme,
} from "./themes/themeStorage";
import {
  matchTheme,
  normalizeLayerOpacityOverrides,
  resolveTheme,
  themeStatesMatch,
  visibilityRecordFor,
  type ResolvedTheme,
  type ThemeComparableState,
} from "./themes/themeState";
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
  type PrintMapBounds,
  type PrintMapViewport,
} from "./services/printSnapshot";
const ExportDialog = lazy(() =>
  import("./print/pdf/ExportDialog").then((module) => ({
    default: module.ExportDialog,
  })),
);
import { exportAttributionLines } from "./print/pdf/attributionLines";
import { buildExportLayers } from "./print/pdf/exportLayerSpecs";
import { DEFAULT_FRAME_STATE, type FrameState } from "./print/pdf/frameGeometry";
import type { PdfTemplateId } from "./print/pdf/templates/types";
import { useUserMaps } from "./userMaps/useUserMaps";
import { useGeoreferenceSession } from "./userMaps/useGeoreferenceSession";
import { UserMapControls } from "./userMaps/components/UserMapRows";
import { routeImportFiles } from "./userMaps/importRouting";
import { useUserVectorLayers } from "./userMaps/vector/useUserVectorLayers";
import { UserVectorControls } from "./userMaps/vector/components/UserVectorRows";
import { useVectorEditSession } from "./userMaps/vector/edit/useVectorEditSession";
import {
  browserLocationFailure,
  getBrowserLocation,
  type BrowserLocation,
} from "./services/browserLocation";
import { buildGpsMarkFeature } from "./location/markFeature";
import { FIELD_NOTES_LAYER_NAME } from "./location/captureSpec";
import {
  formatAccuracyM,
  markFailureMessage,
  oneShotMarkFix,
} from "./location/markFix";
import type { LiveFix } from "./location/liveLocation";
import {
  VectorEditPanel,
  type EditMode,
} from "./userMaps/vector/edit/VectorEditPanel";
// Type-only, so the Geoman bundle behind EditableVectorLayer stays lazy.
import type { VectorSnapTargets } from "./userMaps/vector/edit/EditableVectorLayer";
import type { ParcelSnapStatus } from "./userMaps/vector/edit/ParcelSnapTargetsLayer";
import {
  planPointsToPath,
  type ConvertShape,
} from "./userMaps/vector/convert/pointsToPath";
import { usePhotoManager } from "./userMaps/vector/photos/usePhotoManager";
import { PhotoLightbox } from "./userMaps/vector/photos/PhotoLightbox";
import { BulkPhotoImportDialog } from "./userMaps/vector/photos/BulkPhotoImportDialog";
import type { FeaturePhotoDescriptor } from "./userMaps/vector/photos/types";
import { GeoreferencePanel } from "./userMaps/components/GeoreferencePanel";
import { GeoPdfFrameChooser } from "./userMaps/components/GeoPdfFrameChooser";
import type { ReferenceLayerId } from "./userMaps/components/GeoreferencePanel";
import type {
  GeoreferenceBinding,
  MapFocusRequest,
} from "./userMaps/components/GeoreferenceMapLayer";
import type { Gcp } from "./userMaps/types";

const TRANSIENT_MESSAGE_DURATION_MS = 6_000;
/**
 * Trailing delay before the address bar is rewritten. Safari refuses more
 * than 100 history.replaceState calls per 30 seconds (~1 per 300 ms
 * sustained), and the map can emit two share-URL changes per zoom gesture, so
 * this sits comfortably under that ceiling while still feeling immediate.
 */
const SHARE_URL_WRITE_DELAY_MS = 500;

const BETA_SIGNUP_URL =
  "mailto:map@kinnokilabs.com?subject=NS%20Marks%20The%20Spot%20beta%20signup";

type TaxSaleFilter = "all" | "redemption" | "immediate-or-none";
type HistoricalOutcomeFilter = "all" | HistoricalOutcome;
type LicenceIntent =
  | { kind: "theme"; themeId: string }
  | { kind: "layer" }
  /** Parcel/civic search asked for licensed data before acceptance. */
  | { kind: "search"; query: string }
  /** The edit panel's parcel-snap toggle asked before acceptance. */
  | { kind: "snap" }
  /** "Data & licences" review — never a licence-state or layer-state change. */
  | { kind: "review" }
  | null;

const EMPTY_FEATURES: NsprdFeatureCollection = {
  type: "FeatureCollection",
  features: [],
};

/** Each edit session re-arms snapping from here (field-capture contract). */
const DEFAULT_SNAP_TARGETS: VectorSnapTargets = {
  enabled: true,
  myFeatures: true,
  parcels: false,
};
const EMPTY_PID_SET = new Set<string>();

/**
 * Stable identities for the idle session. Fresh literals here would give the
 * session a new `initialGcps`/`pixelSize` every render, and the mesh memo
 * downstream would rebuild on each one.
 */
const NO_GCPS: Gcp[] = [];
const IDLE_PIXEL_SIZE = { width: 1, height: 1 };

type SelectedEvidenceRequest = { pid: string; generation: number };

/**
 * The GeoPDF export flow's two phases: framing (dragging the paper-frame
 * overlay on the live map) and dialog (title/legend fields, then render +
 * download). Kept as one union rather than two independent booleans so the
 * frame overlay and the dialog can never both be mounted at once.
 */
type GeoPdfExportSession =
  | { stage: "framing"; frame: FrameState }
  | { stage: "dialog"; bounds: PrintMapBounds; orientation: PdfTemplateId };

function isCurrentEvidenceRequest(
  current: SelectedEvidenceRequest | null,
  expected: SelectedEvidenceRequest,
) {
  return current?.pid === expected.pid && current.generation === expected.generation;
}

const EMPTY_PARCEL_CONTEXT: ParcelContext = { roads: [], water: [] };
// A lookup that has not answered carries no addresses and no shortfall: zero
// unreadable rows here is the absence of a claim, not a claim of completeness.
const EMPTY_CIVIC_ADDRESSES: CivicAddressReading = {
  addresses: [],
  unreadableRows: 0,
};
const EMPTY_RESOURCE_INTERSECTIONS: ParcelResourceIntersections = {
  "mineral-occurrences": { status: "ready", intersections: [] },
  "mineral-tenure": { status: "ready", intersections: [] },
  "abandoned-mines": { status: "ready", intersections: [] },
};

const allMapLayerIds: MapLayerId[] = [
  "modern",
  "fletcher",
  ...provinceLayerCatalog.map(({ id }) => id),
  ...allResourceLayerCatalog.map(({ id }) => id),
  ...hydroPilotLayerCatalog.map(({ id }) => id),
  ...floodHazardLayerCatalog.map(({ id }) => id),
  ...environmentalHealthLayerCatalog.map(({ id }) => id),
  ...forestryLayerCatalog.map(({ id }) => id),
  ...zoningLayerCatalog.map(({ id }) => id),
  ...wellLogLayerCatalog.map(({ id }) => id),
  ...liveConditionsLayerCatalog.map(({ id }) => id),
];

const restrictedThemeLayerIds = new Set<ShareLayerId>([
  ...provinceLayerCatalog.map(({ id }) => id),
  ...allResourceLayerCatalog
    .filter(
      (layer) =>
        "requiresProvinceLicence" in layer && layer.requiresProvinceLicence,
    )
    .map(({ id }) => id),
  ...floodHazardLayerCatalog
    .filter(({ licence }) => licence === "province-restricted")
    .map(({ id }) => id),
  ...environmentalHealthLayerCatalog
    .filter(({ licence }) => licence === "province-restricted")
    .map(({ id }) => id),
]);

const themeLayerNames = new Map<ShareLayerId, string>([
  ["modern", "Modern map"],
  ["fletcher", "Fletcher historical map"],
  ...provinceLayerCatalog.map(({ id, name }) => [id, name] as const),
  ...allResourceLayerCatalog.map(({ id, name }) => [id, name] as const),
  ...hydroPilotLayerCatalog.map(({ id, name }) => [id, name] as const),
  ...floodHazardLayerCatalog.map(({ id, name }) => [id, name] as const),
  ...environmentalHealthLayerCatalog.map(({ id, name }) => [id, name] as const),
  ...forestryLayerCatalog.map(({ id, name }) => [id, name] as const),
  ...zoningLayerCatalog.map(({ id, name }) => [id, `${name} zoning`] as const),
  ...wellLogLayerCatalog.map(({ id, name }) => [id, name] as const),
  ...liveConditionsLayerCatalog.map(({ id, name }) => [id, name] as const),
]);

function themeResolutionNotice(resolved: ResolvedTheme): string | null {
  const notices: string[] = [];
  if (resolved.unavailableLayerIds.length > 0) {
    notices.push(
      `Unavailable: ${resolved.unavailableLayerIds
        .map((id) => themeLayerNames.get(id) ?? id)
        .join(", ")}.`,
    );
  }
  if (resolved.blockedLayerIds.length > 0) {
    notices.push(
      `Licence required: ${resolved.blockedLayerIds
        .map((id) => themeLayerNames.get(id) ?? id)
        .join(", ")}.`,
    );
  }
  return notices.length > 0 ? notices.join(" ") : null;
}

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

/**
 * Guarded because this runs on the RENDER path (a useRef initializer), and
 * Safari with "Block all cookies" — plus some in-app WebViews — throws
 * SecurityError from any `window.localStorage` touch. Unguarded, those users
 * got a permanent white page instead of a map. Treat an unreadable store as
 * "not yet accepted": the licence gate then asks again, which is the safe
 * direction to fail. themeStorage.ts guards its own reads the same way.
 */
function isLicenceAccepted(): boolean {
  try {
    return (
      localStorage.getItem(PROVINCE_LICENSE_ACCEPTANCE_KEY) === "accepted"
    );
  } catch {
    return false;
  }
}

// Exported for its focused test: the identity contract below is what keeps
// the evidence effects quiet through no-op merges, and only a test that holds
// both references can pin it.
// eslint-disable-next-line react-refresh/only-export-components -- test-only export of a pure helper.
export function mergeFeatureCollections(
  current: NsprdFeatureCollection,
  incoming: NsprdFeatureCollection,
): NsprdFeatureCollection {
  // PID plus a cheap geometry fingerprint, NOT JSON.stringify of the full
  // geometry: the historical loader merges ~10 batches in quick succession,
  // and re-stringifying every existing multi-KB geometry each time was
  // quadratic main-thread work holding several MB of transient key strings.
  // Vertex count plus the first and last positions distinguishes the real
  // duplicate case (the same NSPRD feature fetched twice) as reliably.
  const featureKey = (
    feature: NsprdFeatureCollection["features"][number],
  ) => {
    const positions: number[] = [];
    const visit = (coords: unknown): void => {
      if (!Array.isArray(coords)) return;
      if (typeof coords[0] === "number") {
        positions.push(coords[0] as number, coords[1] as number);
        return;
      }
      for (const inner of coords) visit(inner);
    };
    visit((feature.geometry as { coordinates?: unknown }).coordinates);
    const head = positions.slice(0, 2).join(",");
    const tail = positions.slice(-2).join(",");
    return `${feature.properties.PID}:${positions.length}:${head}:${tail}`;
  };
  const featureKeys = new Set(
    current.features.map(featureKey),
  );

  const added = incoming.features.filter((feature) => {
    const key = featureKey(feature);
    if (featureKeys.has(key)) {
      return false;
    }
    featureKeys.add(key);
    return true;
  });
  // Identity-stable when nothing was added: every selected-parcel evidence
  // effect keys off this collection, and a fresh object for a no-op merge
  // aborted and re-fired the whole ~30-request evidence fan-out.
  if (added.length === 0) {
    return current;
  }

  return {
    type: "FeatureCollection",
    features: [...current.features, ...added],
  };
}

function printState<T>(
  state:
    | { status: "idle" | "loading" }
    | { status: "ready"; value: T }
    | { status: "error" | "geometry-unavailable" },
): PrintLoadState<T> {
  if (state.status === "ready") return { status: "ready", value: state.value };
  if (state.status === "error") {
    return { status: "error", message: "Source unavailable at export time." };
  }
  if (state.status === "geometry-unavailable") {
    // Unreachable while canPrintExport requires resolved geometry, but the
    // honest message costs nothing if that gate ever loosens.
    return {
      status: "error",
      message: "Not evaluated — this PID's NSPRD geometry is unavailable.",
    };
  }
  return { status: "pending" };
}

function printStateForRequest<T>(
  state: { request: SelectedEvidenceRequest | null } & (
    | { status: "idle" | "loading" }
    | { status: "ready"; value: T }
    | { status: "error" | "geometry-unavailable" }
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

function printLayerSources(
  fletcherTileBaseUrl: string | null,
): Map<ShareLayerId, PrintLayerSource> {
  const sources = new Map<ShareLayerId, PrintLayerSource>();
  sources.set("modern", {
    id: "modern",
    name: "Modern map",
    sourceUrl: "https://www.openstreetmap.org/copyright",
    sourceDate: "Live OpenStreetMap tiles",
    attribution: "© OpenStreetMap contributors",
    licenceUrl: "https://www.openstreetmap.org/copyright",
  });
  sources.set("fletcher", {
    id: "fletcher",
    name: fletcherLayerCatalog.name,
    sourceUrl:
      fletcherSourceReceiptUrl(fletcherTileBaseUrl) ??
      RUMSEY_COLLECTION_TERMS_URL,
    sourceDate: fletcherLayerCatalog.sourceDate,
    attribution: RUMSEY_ATTRIBUTION,
    licenceUrl: RUMSEY_LICENCE_URL,
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
    // Three licences, not two: the coastal layers are "province-open" but
    // published under the Unrestricted Map Services licence, and the binary
    // restricted/open inference stamped the OGL-NS sentence on them.
    attribution: layer.licence === "province-restricted"
      ? PROVINCE_ATTRIBUTION
      : layer.licenceUrl === COASTAL_HAZARD_LICENCE_URL
        ? COASTAL_HAZARD_ATTRIBUTION
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
  forestryLayerCatalog.forEach((layer) => sources.set(layer.id, {
    id: layer.id,
    name: layer.name,
    sourceUrl: layer.sourceUrl,
    sourceDate: layer.sourceDate,
    attribution: OPEN_GOVERNMENT_ATTRIBUTION,
    licenceUrl: OPEN_GOVERNMENT_LICENCE_URL,
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
  // Listed for the Data & licences inventory; never captured into a print —
  // captureLayerIds excludes the live overlays, so these entries cannot reach
  // a sealed PDF.
  liveConditionsLayerCatalog.forEach((layer) => sources.set(layer.id, {
    id: layer.id,
    name: layer.name,
    sourceUrl: layer.sourceUrl,
    sourceDate: layer.sourceDate,
    attribution: layer.attribution,
    licenceUrl: layer.licenceUrl,
  }));
  return sources;
}

/**
 * Focus and keyboard chrome shared by the app-level dialogs, matching
 * ThemeManagerDialog: focus the dialog on mount, dismiss on Escape, and hand
 * focus back to the opener on unmount. The dismiss handler lives in a ref so
 * inline-arrow props don't re-run the mount effect (which would bounce focus
 * on every parent render).
 */
function useDialogChrome(onDismiss: () => void) {
  const dialogRef = useRef<HTMLElement | null>(null);
  const dismissRef = useRef(onDismiss);
  dismissRef.current = onDismiss;
  useEffect(() => {
    const opener =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    dialogRef.current?.focus();
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        dismissRef.current();
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      opener?.focus();
    };
  }, []);
  return dialogRef;
}

function LicenceDialog({
  onAccept,
  onContinueWithout,
  onClose,
}: {
  onAccept: () => void;
  onContinueWithout: () => void;
  /**
   * Present only when the licence is already accepted (the footer's review
   * path). Without it the dialog forced a choice between two layer-state
   * changes on a visit whose only purpose was reading the terms.
   */
  onClose?: () => void;
}) {
  // While acceptance is pending there is no close affordance, so Escape maps
  // to the explicit decline — never to a silent accept.
  const dialogRef = useDialogChrome(onClose ?? onContinueWithout);
  return (
    <div className="dialog-backdrop">
      <section
        ref={dialogRef}
        tabIndex={-1}
        className="licence-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="licence-title"
      >
        <div className="licence-mark" aria-hidden="true">
          NS
        </div>
        <h2 id="licence-title">Province data licence</h2>
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
          {onClose ? (
            <button className="secondary-action" type="button" onClick={onClose}>
              Close
            </button>
          ) : null}
        </div>
      </section>
    </div>
  );
}

function AboutDialog({ onClose }: { onClose: () => void }) {
  const dialogRef = useDialogChrome(onClose);
  return (
    <div className="dialog-backdrop">
      <section
        ref={dialogRef}
        tabIndex={-1}
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
        <h3>Keyboard access</h3>
        <p>
          The search box is the keyboard route into a parcel: map shapes and
          markers are pointer targets, so type a PID or civic address and the
          parcel sheet opens with full keyboard focus.
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
          <a href={BETA_SIGNUP_URL}>Get launch updates</a>
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

/**
 * The full per-layer source inventory, rendered from the same receipts the
 * print pipeline stamps on exported maps. Read-only by design: reviewing
 * sources never changes licence acceptance or layer state — the Province
 * licence itself opens through its own review path.
 */
function DataSourcesDialog({
  sources,
  onReviewProvinceLicence,
  onClose,
}: {
  sources: PrintLayerSource[];
  onReviewProvinceLicence: () => void;
  onClose: () => void;
}) {
  const dialogRef = useDialogChrome(onClose);
  return (
    <div className="dialog-backdrop">
      <section
        ref={dialogRef}
        tabIndex={-1}
        className="licence-dialog about-dialog data-sources-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="data-sources-title"
      >
        <div className="licence-mark" aria-hidden="true">
          NS
        </div>
        <h2 id="data-sources-title">Data &amp; licences</h2>
        <p>
          Every layer names its source, its published date, and its licence —
          the same receipts a printed export carries. Reviewing them changes
          nothing about what the map shows.
        </p>
        <ul className="data-sources-list">
          {sources.map((source) => (
            <li key={source.id}>
              <strong>{source.name}</strong>
              <span>{source.sourceDate}</span>
              <span>{source.attribution}</span>
              <span>
                <a href={source.sourceUrl} target="_blank" rel="noreferrer">
                  Official source
                </a>
                {source.licenceUrl ? (
                  <>
                    {" · "}
                    <a
                      href={source.licenceUrl}
                      target="_blank"
                      rel="noreferrer"
                    >
                      Licence
                    </a>
                  </>
                ) : null}
              </span>
            </li>
          ))}
        </ul>
        <div className="dialog-actions">
          <button
            className="secondary-action"
            type="button"
            onClick={onReviewProvinceLicence}
          >
            Review the Province licence
          </button>
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
  const [initialCustomThemeLibrary] = useState(
    () => loadCustomThemes(window.localStorage),
  );
  const [initialCustomThemes] = useState<CustomMapThemeDefinition[]>(
    () => initialCustomThemeLibrary.themes.filter(
      (theme): theme is CustomMapThemeDefinition => theme.kind === "custom",
    ),
  );
  const [initialMapThemes] = useState<MapThemeDefinition[]>(
    () => [...builtInMapThemes, ...initialCustomThemes],
  );
  const initialShareState = useRef(
    parseMapShareState(initialUrl.toString()),
  ).current;
  const hasRecognizedShareState = hasRecognizedMapShareState(initialUrl.href);
  const hasSharedLayers = initialUrl.searchParams.has("layers");
  const hasSharedEvents = initialUrl.searchParams.has("event");
  const hasSharedPosition = initialUrl.searchParams.has("position");
  const initialCatalogueLayerIds = useRef(new Set<ShareLayerId>(
    hasRecognizedShareState ? initialShareState.layerIds : ["modern"],
  )).current;
  const initialTaxSaleEnabled = hasRecognizedShareState
    ? initialShareState.taxSaleEnabled
    : false;
  const initialLicenceAccepted = useRef(isLicenceAccepted()).current;
  const initialNeedsLicence = hasRecognizedShareState
    && !initialLicenceAccepted
    && [...initialCatalogueLayerIds].some((id) =>
      restrictedThemeLayerIds.has(id),
    );
  const initialThemeMatch = useRef(matchTheme({
    layerIds: [...initialCatalogueLayerIds],
    opacityOverrides: {},
    taxSaleEnabled: initialTaxSaleEnabled,
    mapMode: initialShareState.mode,
  }, initialMapThemes)).current;
  const fletcherTileConfiguration = useMemo(() => {
    try {
      return {
        baseUrl: normalizeFletcherTileBaseUrl(),
        error: null as string | null,
      };
    } catch (error) {
      return {
        baseUrl: null,
        error:
          error instanceof Error
            ? error.message
            : "Fletcher tile hosting configuration is invalid.",
      };
    }
  }, []);
  const sourceInventory = useMemo(
    () => [...printLayerSources(fletcherTileConfiguration.baseUrl).values()],
    [fletcherTileConfiguration.baseUrl],
  );
  const availableThemeLayerIds = useMemo(() => {
    const ids = new Set<ShareLayerId>([
      "modern",
      "fletcher",
      ...provinceLayerCatalog.map(({ id }) => id),
      ...allResourceLayerCatalog.map(({ id }) => id),
      ...hydroPilotLayerCatalog.map(({ id }) => id),
      ...floodHazardLayerCatalog.map(({ id }) => id),
      ...environmentalHealthLayerCatalog.map(({ id }) => id),
      ...forestryLayerCatalog.map(({ id }) => id),
      ...zoningLayerCatalog.map(({ id }) => id),
      ...wellLogLayerCatalog.map(({ id }) => id),
      ...liveConditionsLayerCatalog.map(({ id }) => id),
    ]);
    if (!fletcherTileConfiguration.baseUrl) {
      ids.delete("fletcher");
    }
    return ids;
  }, [fletcherTileConfiguration.baseUrl]);
  const [licenceAccepted, setLicenceAccepted] = useState(
    initialLicenceAccepted,
  );
  const [licenceIntent, setLicenceIntent] = useState<LicenceIntent>(
    initialNeedsLicence ? { kind: "layer" } : null,
  );
  const [selectedThemeId, setSelectedThemeId] = useState<string | null>(
    hasRecognizedShareState
      ? initialThemeMatch?.id ?? null
      : "explore-nova-scotia",
  );
  const [themeResult, setThemeResult] = useState<ResolvedTheme | null>(null);
  const [customThemes, setCustomThemes] = useState<CustomMapThemeDefinition[]>(
    initialCustomThemes,
  );
  const [themeLibraryNotice, setThemeLibraryNotice] = useState<string | null>(
    () => initialCustomThemeLibrary.status === "fatal"
      ? hasRecognizedShareState
        ? `${initialCustomThemeLibrary.warning} Custom themes are unavailable for this session.`
        : `${initialCustomThemeLibrary.warning} Explore Nova Scotia is being used for this session.`
      : initialCustomThemeLibrary.warning,
  );
  const [themeManagerOpen, setThemeManagerOpen] = useState(false);
  const openThemeManager = useCallback(() => setThemeManagerOpen(true), []);
  const closeThemeManager = useCallback(() => setThemeManagerOpen(false), []);
  const mapThemes = useMemo<MapThemeDefinition[]>(
    () => [...builtInMapThemes, ...customThemes],
    [customThemes],
  );
  const mapSetupSelectRef = useRef<HTMLSelectElement>(null);
  const [headerCollapsed, setHeaderCollapsed] = useState(
    () => window.matchMedia?.("(max-width: 560px)").matches ?? false,
  );
  const [mobileControlsOpen, setMobileControlsOpen] = useState(false);
  const [phoneCategoryLayout, setPhoneCategoryLayout] = useState(
    () => window.matchMedia?.("(max-width: 860px)").matches ?? false,
  );
  const [focusedCategoryId, setFocusedCategoryId] =
    useState<LayerCategoryId | null>(null);
  const categoryButtonRefs = useRef(
    new Map<LayerCategoryId, HTMLButtonElement>(),
  );
  const categoryBackButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!window.matchMedia) return;
    const query = window.matchMedia("(max-width: 860px)");
    const update = () => {
      setPhoneCategoryLayout(query.matches);
      if (!query.matches) {
        setFocusedCategoryId(null);
      }
    };
    update();
    query.addEventListener?.("change", update);
    return () => query.removeEventListener?.("change", update);
  }, []);

  useEffect(() => {
    if (focusedCategoryId !== null) {
      categoryBackButtonRef.current?.focus();
    }
  }, [focusedCategoryId]);
  const [licenceDialogOpen, setLicenceDialogOpen] = useState(
    initialNeedsLicence,
  );
  const [aboutOpen, setAboutOpen] = useState(false);
  const [dataSourcesOpen, setDataSourcesOpen] = useState(false);
  // Escape closes the mobile controls sheet, matching the dialogs — but only
  // while no dialog sits above it, so one keypress never closes two layers.
  useEffect(() => {
    if (
      !mobileControlsOpen ||
      aboutOpen ||
      dataSourcesOpen ||
      licenceDialogOpen ||
      themeManagerOpen
    ) {
      return;
    }
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setMobileControlsOpen(false);
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [
    mobileControlsOpen,
    aboutOpen,
    dataSourcesOpen,
    licenceDialogOpen,
    themeManagerOpen,
  ]);
  const [parcels, setParcels] = useState<NsprdFeatureCollection>(EMPTY_FEATURES);
  const parcelsRef = useRef(parcels);
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
  // Name the tab after the open parcel: multi-tab research otherwise produces
  // indistinguishable tabs and identical history entries. The PID is already
  // in the share URL, so this discloses nothing new.
  useEffect(() => {
    if (!selectedPid) return;
    const previousTitle = document.title;
    document.title = `PID ${selectedPid} — NS Marks The Spot`;
    return () => {
      document.title = previousTitle;
    };
  }, [selectedPid]);
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
  const [taxSaleEnabled, setTaxSaleEnabled] = useState(
    initialTaxSaleEnabled,
  );
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
    initialCatalogueLayerIds.has("modern") ||
    (
      initialCatalogueLayerIds.has("ns-aerial") &&
      initialShareState.position.zoom >=
        (provinceLayerCatalog.find(({ id }) => id === "ns-aerial")?.minZoom ??
          Number.POSITIVE_INFINITY)
    );
  const [showModernMap, setShowModernMap] = useState(
    () => initialCatalogueLayerIds.has("modern") || (
      hasSharedLayers && !sharedLayersIncludeUsableBasemap
    ),
  );
  const [fletcherVisible, setFletcherVisible] = useState(
    () =>
      Boolean(fletcherTileConfiguration.baseUrl) &&
      initialCatalogueLayerIds.has("fletcher"),
  );
  const [fletcherOpacity, setFletcherOpacity] = useState(
    fletcherLayerCatalog.opacity,
  );
  const [fletcherRetryToken, setFletcherRetryToken] = useState(0);
  const intendedInitialProvinceLayers = useRef(
    visibilityRecordFor(
      provinceLayerCatalog.map(({ id }) => id),
      initialCatalogueLayerIds,
    ),
  ).current;
  const [provinceLayers, setProvinceLayers] = useState(
    () => licenceAccepted
      ? intendedInitialProvinceLayers
      : disabledProvinceLayers(),
  );
  const [resourceLayers, setResourceLayers] = useState(
    () => visibilityRecordFor(
      allResourceLayerCatalog.map(({ id }) => id),
      initialCatalogueLayerIds,
    ),
  );
  const [hydroPilotLayers, setHydroPilotLayers] = useState(
    () => visibilityRecordFor(
      hydroPilotLayerCatalog.map(({ id }) => id),
      initialCatalogueLayerIds,
    ),
  );
  const [floodHazardLayers, setFloodHazardLayers] = useState(
    () => visibilityRecordFor(
      floodHazardLayerCatalog.map(({ id }) => id),
      initialCatalogueLayerIds,
    ),
  );
  const [environmentalHealthLayers, setEnvironmentalHealthLayers] = useState(
    () => visibilityRecordFor(
      environmentalHealthLayerCatalog.map(({ id }) => id),
      initialCatalogueLayerIds,
    ),
  );
  const [forestryLayers, setForestryLayers] = useState(
    () => visibilityRecordFor(
      forestryLayerCatalog.map(({ id }) => id),
      initialCatalogueLayerIds,
    ),
  );
  const [zoningLayers, setZoningLayers] = useState(
    () => visibilityRecordFor(
      zoningLayerCatalog.map(({ id }) => id),
      initialCatalogueLayerIds,
    ),
  );
  const [wellLogLayers, setWellLogLayers] = useState(
    () => visibilityRecordFor(
      wellLogLayerCatalog.map(({ id }) => id),
      initialCatalogueLayerIds,
    ),
  );
  const [liveConditionsLayers, setLiveConditionsLayers] = useState(
    () => visibilityRecordFor(
      liveConditionsLayerCatalog.map(({ id }) => id),
      initialCatalogueLayerIds,
    ),
  );
  const [expandedCategoryIds, setExpandedCategoryIds] = useState<Set<LayerCategoryId>>(
    () => new Set(
      hasRecognizedShareState
        ? initialThemeMatch?.preferredCategoryIds ?? []
        : ["background-maps"],
    ),
  );
  const setCategoryExpanded = useCallback(
    (categoryId: LayerCategoryId, expanded: boolean) => {
      setExpandedCategoryIds((current) => {
        const next = new Set(current);
        if (expanded) {
          next.add(categoryId);
        } else {
          next.delete(categoryId);
        }
        return next;
      });
    },
    [],
  );
  const focusCategory = useCallback((categoryId: LayerCategoryId) => {
    setFocusedCategoryId(categoryId);
  }, []);
  const returnToCategories = useCallback(() => {
    const previousId = focusedCategoryId;
    setFocusedCategoryId(null);
    if (previousId !== null) {
      window.requestAnimationFrame(() => {
        categoryButtonRefs.current.get(previousId)?.focus();
      });
    }
  }, [focusedCategoryId]);
  const [wellLogAccuracyFilter, setWellLogAccuracyFilter] =
    useState<WellLogAccuracyFilter>("surveyed");
  const userMapsApi = useUserMaps();
  const userVectorApi = useUserVectorLayers();

  // The one drop zone serves both pipelines: files route by sniffed content,
  // and BOTH importFiles run every batch — the empty side clears its stale
  // outcomes, so the merged list below is always exactly this batch's.
  const rasterImportFiles = userMapsApi.importFiles;
  const vectorImportFiles = userVectorApi.importFiles;
  const handleImportFiles = useCallback(
    async (files: ArrayLike<File>) => {
      const routed = await routeImportFiles(files);
      await Promise.all([
        rasterImportFiles(routed.raster),
        vectorImportFiles(routed.vector),
      ]);
    },
    [rasterImportFiles, vectorImportFiles],
  );
  const mergedImportOutcomes = useMemo(
    () => [...userMapsApi.outcomes, ...userVectorApi.outcomes],
    [userMapsApi.outcomes, userVectorApi.outcomes],
  );

  const vectorEdit = useVectorEditSession({
    records: userVectorApi.records,
    geometries: userVectorApi.geometries,
    putVectorLayer: userVectorApi.putVectorLayer,
    onLayerChanged: userVectorApi.applyLayerEdit,
  });
  // The session as it is now, for handlers that resume after an await.
  const vectorEditRef = useRef(vectorEdit);
  vectorEditRef.current = vectorEdit;

  const [drawMode, setDrawMode] = useState<EditMode | null>(null);
  const [selectedFeatureId, setSelectedFeatureId] = useState<string | null>(null);
  // Session-scoped on purpose (the field-capture contract): every edit
  // session re-arms snapping from the defaults, so the licence-gated parcels
  // toggle is a fresh, deliberate choice each time.
  const [snapTargets, setSnapTargets] = useState<VectorSnapTargets>(
    DEFAULT_SNAP_TARGETS,
  );
  const [parcelSnapStatus, setParcelSnapStatus] = useState<ParcelSnapStatus>({
    status: "idle",
  });
  const [convertShape, setConvertShape] = useState<ConvertShape | null>(null);
  const photoManager = usePhotoManager();
  const [openPhoto, setOpenPhoto] = useState<FeaturePhotoDescriptor | null>(
    null,
  );
  const [bulkPhotosOpen, setBulkPhotosOpen] = useState(false);
  const photoPopupUi = useMemo(
    () => ({ loadThumbUrl: photoManager.loadThumbUrl, onOpen: setOpenPhoto }),
    [photoManager.loadThumbUrl],
  );

  const beginVectorEdit = useCallback(
    (id: string) => {
      setDrawMode(null);
      setSelectedFeatureId(null);
      setSnapTargets(DEFAULT_SNAP_TARGETS);
      setParcelSnapStatus({ status: "idle" });
      setConvertShape(null);
      vectorEdit.beginEdit(id);
    },
    [vectorEdit],
  );
  const endVectorEdit = useCallback(() => {
    setDrawMode(null);
    setSelectedFeatureId(null);
    setSnapTargets(DEFAULT_SNAP_TARGETS);
    setParcelSnapStatus({ status: "idle" });
    setConvertShape(null);
    vectorEdit.endEdit();
  }, [vectorEdit]);

  const requestParcelSnapLicence = useCallback(() => {
    setLicenceIntent({ kind: "snap" });
    setLicenceDialogOpen(true);
  }, []);

  const conversionPlan = useMemo(
    () =>
      vectorEdit.editingLayer && convertShape
        ? planPointsToPath(vectorEdit.editingLayer.data, convertShape)
        : null,
    [convertShape, vectorEdit.editingLayer],
  );
  const handleConvertShape = useCallback((shape: ConvertShape | null) => {
    setConvertShape(shape);
    if (shape) {
      // The preview owns the map's attention; an armed draw tool would
      // fight it for meaning.
      setDrawMode(null);
    }
  }, []);
  const handleConvertCreate = useCallback(
    (keepSourcePoints: boolean) => {
      if (!convertShape) {
        return;
      }
      const createdId = vectorEdit.convertPoints({
        shape: convertShape,
        keepSourcePoints,
      });
      if (createdId) {
        setSelectedFeatureId(createdId);
      }
      setConvertShape(null);
    },
    [convertShape, vectorEdit],
  );
  // A new drawing layer opens straight into edit mode with the point tool
  // armed: the only reason to create one is to start drawing.
  const createAndEditVectorLayer = useCallback(async () => {
    const id = await userVectorApi.createDrawnLayer();
    beginVectorEdit(id);
    setDrawMode("Marker");
  }, [beginVectorEdit, userVectorApi]);

  /**
   * Mark-my-location, per the field-capture contract: an open edit session
   * receives the point through its own commit path (so the draft never
   * forks), and otherwise the point lands in the auto-created "Field notes"
   * drawn layer. The fix argument is MapCanvas's live watch fix when fresh
   * and accurate enough; null means request one here.
   */
  const markCurrentLocation = useCallback(
    async (fix: LiveFix | null): Promise<string | null> => {
      // The layer this mark was aimed at, read at the tap. Finding a fix can
      // take seconds, and Done, or opening another layer, must not have the
      // point land somewhere the reader did not aim it — nor revive a panel
      // they closed.
      const destinationId = vectorEdit.editingLayer?.record.id ?? null;
      const destinationGeneration = vectorEdit.editGeneration;
      let resolved = fix;
      if (!resolved) {
        let oneShot: BrowserLocation;
        try {
          oneShot = await getBrowserLocation();
        } catch (error) {
          // Each of the browser's failures says something different, and
          // only one of them is a refusal.
          return markFailureMessage(browserLocationFailure(error));
        }
        // The one-shot is held to the same rule as the watch fix that sent
        // it here: a mark is saved only from a position fresh and tight
        // enough, and a refusal says which half failed.
        const outcome = oneShotMarkFix(oneShot, Date.now());
        if (outcome.kind === "refused") {
          return outcome.message;
        }
        resolved = outcome.fix;
      }
      // Read again, after the wait: `vectorEdit` in this closure is the
      // session as it was at the tap.
      const session = vectorEditRef.current;
      if (
        (session.editingLayer?.record.id ?? null) !== destinationId ||
        session.editGeneration !== destinationGeneration
      ) {
        return "The layer being edited changed while your position was being found. Nothing was saved.";
      }
      const feature = buildGpsMarkFeature(resolved);
      // Never rounded down: a ±0.4 m fix is not "±0 m", and a ±49.4 m one is
      // not tighter than the device said.
      const accuracy = formatAccuracyM(resolved.accuracyM);
      if (session.editingLayer) {
        session.commitGeometry({
          type: "FeatureCollection",
          features: [...session.editingLayer.data.features, feature],
        });
        // "Added", not "saved": the edit session writes on its own debounce,
        // so the point is on the map and its write has not answered yet. The
        // panel carries the storage error if that write fails.
        return `Point added to ${session.editingLayer.record.name} (±${accuracy} m).`;
      }
      const layerId = await userVectorApi.ensureFieldNotesLayer();
      const appended = await userVectorApi.appendFeatures(layerId, [feature]);
      // Silence here read as a mark that landed, and so did "saved" for a
      // point the device refused to write: it is on the map, and gone with
      // the tab. Each outcome says which it is.
      if (!appended) {
        return `The point couldn't be added to ${FIELD_NOTES_LAYER_NAME}. Try again.`;
      }
      return appended.persisted
        ? `Point saved to ${FIELD_NOTES_LAYER_NAME} (±${accuracy} m).`
        : `Point added to ${FIELD_NOTES_LAYER_NAME} (±${accuracy} m), but it couldn't be ` +
          `written to this device — it stays until you close the tab.`;
    },
    [userVectorApi, vectorEdit],
  );

  /** Every recording becomes its own layer, raw GPX riding as its original. */
  const saveRecordedTrack = useCallback(
    async (input: {
      name: string;
      collection: GeoJSON.FeatureCollection;
      rawGpx: Blob;
      startedAt: string;
      endedAt: string;
    }): Promise<string | null> => {
      const record = await userVectorApi.createRecordedLayer(input);
      return `Track saved as "${record.name}".`;
    },
    [userVectorApi],
  );

  // The layer under edit is drawn by the Geoman bridge, so the read-only
  // list must drop it or every feature would render twice — once editable,
  // once not, with the stale copy on top.
  const readOnlyVectorLayers = useMemo(
    () =>
      userVectorApi.visibleLayers.filter(
        (layer) => layer.record.id !== vectorEdit.editingId,
      ),
    [userVectorApi.visibleLayers, vectorEdit.editingId],
  );

  const editingMap = userMapsApi.editingMap;
  const editingGeoref = editingMap?.record.georef;
  const georeferenceSession = useGeoreferenceSession({
    mapId: editingMap?.record.id ?? null,
    initialGcps:
      editingGeoref?.kind === "gcp" ? editingGeoref.gcps : NO_GCPS,
    pixelSize: editingMap?.record.pixelSize ?? IDLE_PIXEL_SIZE,
    sourceRect: editingMap?.record.sourceRect,
    // The record picks the solver, and it is the SAME expression the panel's
    // warp toggle reads for its checked state. Two derivations of "which warp
    // is on" — one for the drape, one for the control — could disagree, and
    // the user would have no way to tell which of the two was lying.
    method: editingGeoref?.kind === "gcp" ? editingGeoref.method : undefined,
    // Recreated every render on purpose: the hook keeps it in a ref, so its
    // identity is free, and pinning it with useCallback would only add a
    // dependency list to get wrong.
    // `onPersist` is typed `=> void` but `saveGcps` returns `Promise<void>`,
    // so this floats the promise — a deliberate choice, not an oversight.
    // `saveGcps` wraps its IndexedDB write in try/catch and never rejects
    // (a failure sets `storageError` instead), so there is no rejection here
    // to lose; `void` just tells the linter and the next reader the same.
    onPersist: (id, gcps) => {
      void userMapsApi.saveGcps(id, gcps);
    },
  });

  const {
    gcps: georeferenceGcps,
    pending: georeferencePending,
    mesh: georeferenceMesh,
    pickMapPoint,
    beginDragGcp,
    endDragGcp,
    moveGcpOnMap,
  } = georeferenceSession;

  // The panel can move its own scan pane, but only App can move the live map,
  // so the GCP list's zoom-to control comes up here and goes back down through
  // the binding. The monotonic id makes a repeat request a new object, so
  // asking twice for the same point still recentres.
  const [georeferenceFocus, setGeoreferenceFocus] =
    useState<MapFocusRequest | null>(null);
  const georeferenceFocusId = useRef(0);
  const focusGcpOnMap = useCallback((gcp: Gcp) => {
    georeferenceFocusId.current += 1;
    setGeoreferenceFocus({
      lat: gcp.map.lat,
      lng: gcp.map.lng,
      requestId: georeferenceFocusId.current,
    });
  }, []);

  // Focus belongs to ONE session. `userMapsApi.endGeoreference` only clears
  // the map id, so closing without clearing this leaves the next map's layer
  // mounting with the previous map's focus and recentring on a point that is
  // not its own. Every close path goes through here — the panel's onClose and
  // its Delete both.
  const { endGeoreference } = userMapsApi;
  const endGeoreferencing = useCallback(() => {
    setGeoreferenceFocus(null);
    endGeoreference();
  }, [endGeoreference]);

  // A new `draft` object on every mesh change is the intended hot path:
  // UserMapLayers keys its layer build on `previewUrl` and pushes geometry
  // through `setLatLngMesh`, so this never re-decodes the bitmap (Task 6).
  // The memo is only worth having because `editingMap` is itself memoized in
  // useUserMaps (Task 5) — a fresh literal there would bust this every render.
  const georeferenceBinding = useMemo<GeoreferenceBinding | null>(
    () =>
      editingMap
        ? {
            gcps: georeferenceGcps,
            pending: georeferencePending,
            draft: { ...editingMap, mesh: georeferenceMesh },
            focus: georeferenceFocus,
            onPickMapPoint: pickMapPoint,
            onDragStartGcp: beginDragGcp,
            onDragEndGcp: endDragGcp,
            onMoveGcpOnMap: moveGcpOnMap,
          }
        : null,
    [
      editingMap,
      georeferenceGcps,
      georeferencePending,
      georeferenceMesh,
      georeferenceFocus,
      pickMapPoint,
      beginDragGcp,
      endDragGcp,
      moveGcpOnMap,
    ],
  );

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
      taxSaleEnabled
        ? hasSharedEvents
          ? initialShareState.eventIds
          : upcomingTaxSaleEvents.map(({ id }) => id)
        : [],
    ),
  );
  const [taxSaleFilter, setTaxSaleFilter] = useState<TaxSaleFilter>("all");
  const showHistoricalTaxSales =
    taxSaleEnabled && mapMode === "historical";
  const [historicalMunicipality, setHistoricalMunicipality] = useState("all");
  const [historicalYear, setHistoricalYear] = useState("all");
  const [historicalOutcome, setHistoricalOutcome] =
    useState<HistoricalOutcomeFilter>("all");
  const [historicalParcelMessage, setHistoricalParcelMessage] = useState<
    string | null
  >(null);
  const disableTaxSale = useCallback(() => {
    setTaxSaleEnabled(false);
    setSelectedEventIds(new Set());
    setTaxSaleFilter("all");
    setHistoricalMunicipality("all");
    setHistoricalYear("all");
    setHistoricalOutcome("all");
    setHistoricalParcelMessage(null);
  }, []);

  /** Any visible layer whose licence mandates the OGL–NS statement. */
  const oglLayerVisible = useMemo(
    () =>
      Object.values(forestryLayers).some(Boolean) ||
      Object.values(wellLogLayers).some(Boolean) ||
      environmentalHealthLayerCatalog.some(
        (layer) =>
          layer.licence !== "province-restricted" &&
          effectiveEnvironmentalHealthLayers[layer.id],
      ) ||
      floodHazardLayerCatalog.some(
        (layer) =>
          layer.licence !== "province-restricted" &&
          layer.licenceUrl !== COASTAL_HAZARD_LICENCE_URL &&
          effectiveFloodHazardLayers[layer.id],
      ),
    [
      effectiveEnvironmentalHealthLayers,
      effectiveFloodHazardLayers,
      forestryLayers,
      wellLogLayers,
    ],
  );

  /** The distinct mandated statements of the zoning layers now on screen. */
  const visibleZoningAttributions = useMemo(
    () =>
      Array.from(
        new Set(
          zoningLayerCatalog
            .filter(({ id }) => zoningLayers[id])
            .map(({ attribution }) => attribution),
        ),
      ),
    [zoningLayers],
  );
  const enableTaxSale = useCallback(() => {
    setTaxSaleEnabled(true);
    setSelectedEventIds(new Set(upcomingTaxSaleEvents.map(({ id }) => id)));
  }, []);
  const [currentTime, setCurrentTime] = useState(Date.now);
  const [shareMessage, setShareMessage] = useState<string | null>(null);
  const printCaptureSequence = useRef(0);
  const [printCapture, setPrintCapture] = useState<PrintCapture | null>(null);
  const [exportSession, setExportSession] =
    useState<GeoPdfExportSession | null>(null);
  const addressSearchController = useRef<AbortController | null>(null);
  const pointLookupController = useRef<AbortController | null>(null);
  const historicalLoadAttempted = useRef(false);
  /** Timestamp of the last address-bar write; see the throttle below. */
  const lastShareUrlWriteRef = useRef(0);

  useEffect(
    () => () => {
      addressSearchController.current?.abort();
      pointLookupController.current?.abort();
    },
    [],
  );

  useEffect(() => {
    parcelsRef.current = parcels;
  }, [parcels]);

  useEffect(() => {
    const timer = window.setInterval(() => setCurrentTime(Date.now()), 60_000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!licenceAccepted || !taxSaleEnabled) {
      return;
    }

    const controller = new AbortController();
    fetchParcels(upcomingTaxSalePids, controller.signal)
      .then((collection) => {
        setParcels((current) => mergeFeatureCollections(current, collection));
        setParcelMessage(
          // "PIDs", explicitly related to listings: a listing can carry
          // several PIDs (and a PID can sit outside the redemption
          // categories), so this figure sitting beside the listing-count
          // chips read as an off-by-one error.
          `${new Set(collection.features.map(({ properties }) => properties.PID)).size} PIDs matched in NSPRD; a listing can carry several PIDs.`,
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
  }, [licenceAccepted, taxSaleEnabled]);

  /**
   * Move every geometry-dependent evidence state to a TERMINAL status once
   * the selected PID's geometry is known not to resolve. selectParcel puts
   * them all on "loading", and each evidence effect bails while there are no
   * features — so without this, a PID with no NSPRD geometry (or a failed
   * geometry fetch, which nothing retries) showed "Checking…" forever: a
   * known condition presented as indefinite progress. "geometry-unavailable"
   * and "error" stay distinct — empty is not the same evidence as a fetch
   * that failed.
   */
  const pendingGeometryFetchPidRef = useRef<string | null>(null);
  const taxSaleEnabledRef = useRef(taxSaleEnabled);
  const mapModeRef = useRef(mapMode);
  useEffect(() => {
    taxSaleEnabledRef.current = taxSaleEnabled;
    mapModeRef.current = mapMode;
  }, [mapMode, taxSaleEnabled]);

  const markGeometryEvidenceTerminal = useCallback(
    (
      request: SelectedEvidenceRequest,
      status: "geometry-unavailable" | "error",
    ) => {
      setMappedContext((current) =>
        isCurrentEvidenceRequest(current.request, request)
          ? { status, value: EMPTY_PARCEL_CONTEXT, request }
          : current);
      setBuildingCount((current) =>
        isCurrentEvidenceRequest(current.request, request)
          ? { status, request }
          : current);
      setFloodHazard((current) =>
        isCurrentEvidenceRequest(current.request, request)
          ? { status, request }
          : current);
      setCivicAddresses((current) =>
        isCurrentEvidenceRequest(current.request, request)
          ? { status, value: EMPTY_CIVIC_ADDRESSES, request }
          : current);
      setResourceIntersections((current) =>
        isCurrentEvidenceRequest(current.request, request)
          ? { status, value: EMPTY_RESOURCE_INTERSECTIONS, request }
          : current);
      // Assessments (and dwellings behind them) resolve WITHOUT geometry
      // when a municipal notice supplies an AAN — their own effect owns them
      // in that case. Without one, nothing will ever settle them.
      const noticeAan = taxSaleEnabledRef.current && mapModeRef.current === "current"
        ? listingContextForPid(request.pid)?.listing.aan
        : undefined;
      if (!noticeAan) {
        // Dwellings follow automatically: the mirror effect maps a non-ready
        // assessment into the blocked dwelling state.
        setAssessmentState((current) =>
          isCurrentEvidenceRequest(current.request, request) &&
          current.status !== "ready"
            ? { status: "geometry-unavailable", request }
            : current);
      }
    },
    [],
  );

  useEffect(() => {
    if (
      !licenceAccepted ||
      !selectedPid ||
      // A search or listing click fetches this pid itself and owns the
      // terminal marking; a second identical request here raced it — and in
      // tests, consumed its mock.
      pendingGeometryFetchPidRef.current === selectedPid ||
      parcels.features.some(({ properties }) => properties.PID === selectedPid)
    ) {
      return;
    }
    const request = selectedEvidenceRequest;

    const controller = new AbortController();
    fetchParcels([selectedPid], controller.signal)
      .then((collection) => {
        if (collection.features.length === 0) {
          setParcelLookupMessage(`No NSPRD parcel was found for PID ${selectedPid}.`);
          if (request) {
            markGeometryEvidenceTerminal(request, "geometry-unavailable");
          }
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
        if (request) {
          markGeometryEvidenceTerminal(request, "error");
        }
      });

    return () => controller.abort();
  }, [
    licenceAccepted,
    markGeometryEvidenceTerminal,
    parcels.features,
    selectedEvidenceRequest,
    selectedPid,
  ]);

  useEffect(() => {
    if (!licenceAccepted || !taxSaleEnabled || !showHistoricalTaxSales) {
      historicalLoadAttempted.current = false;
      setHistoricalParcelMessage(null);
      return;
    }

    if (historicalLoadAttempted.current) {
      return;
    }
    historicalLoadAttempted.current = true;

    const existingFeatures = parcelsRef.current.features;
    const matchedPids = new Set(
      existingFeatures.map(({ properties }) => properties.PID),
    );
    const missingPids = allHistoricalTaxSalePids.filter(
      (pid) => !matchedPids.has(pid),
    );
    if (missingPids.length === 0) {
      setHistoricalParcelMessage(
        `${allHistoricalTaxSalePids.length} historical PIDs matched in NSPRD.`,
      );
      return;
    }

    const controller = new AbortController();
    setHistoricalParcelMessage(
      "Historical records loaded. Loading matched map parcels…",
    );
    fetchParcels(missingPids, controller.signal, (collection) => {
      if (controller.signal.aborted) {
        return;
      }
      collection.features.forEach(({ properties }) => {
        matchedPids.add(properties.PID);
      });
      const matchedCount = allHistoricalTaxSalePids.filter((pid) =>
        matchedPids.has(pid),
      ).length;
      setParcels((current) => mergeFeatureCollections(current, collection));
      setHistoricalParcelMessage(
        `${matchedCount} of ${allHistoricalTaxSalePids.length} historical PIDs shown on the map…`,
      );
    })
      .then((collection) => {
        collection.features.forEach(({ properties }) => {
          matchedPids.add(properties.PID);
        });
        const matchedCount = allHistoricalTaxSalePids.filter((pid) =>
          matchedPids.has(pid),
        ).length;
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
        const matchedCount = allHistoricalTaxSalePids.filter((pid) =>
          matchedPids.has(pid),
        ).length;
        setHistoricalParcelMessage(
          matchedCount > 0
            ? `${matchedCount} of ${allHistoricalTaxSalePids.length} historical PIDs are shown. Remaining matched parcel geometry is unavailable right now.`
            : "Historical records remain available, but matched parcel geometry is unavailable right now.",
        );
      });

    return () => controller.abort();
  }, [licenceAccepted, showHistoricalTaxSales, taxSaleEnabled]);

  /**
   * The selected parcel's own features, IDENTITY-STABLE across unrelated
   * parcel merges. All six selected-parcel evidence effects key off this
   * instead of the whole `parcels` collection: keyed on `parcels`, every
   * merge (each 40-PID historical batch, any tax-sale bulk load) aborted the
   * in-flight evidence fan-out — ~22 road/water queries, flood rasters,
   * assessments, civic addresses — and re-issued it identically. The merge
   * itself reuses existing feature objects, so element-wise identity is the
   * honest "did MY parcel change" test.
   */
  const selectedFeaturesRef = useRef<NsprdFeatureCollection["features"]>([]);
  const selectedParcelFeatures = useMemo(() => {
    const next = selectedPid
      ? parcels.features.filter(
          ({ properties }) => properties.PID === selectedPid,
        )
      : [];
    const previous = selectedFeaturesRef.current;
    if (
      next.length === previous.length &&
      next.every((feature, index) => feature === previous[index])
    ) {
      return previous;
    }
    selectedFeaturesRef.current = next;
    return next;
  }, [parcels, selectedPid]);

  useEffect(() => {
    if (!selectedPid || !licenceAccepted || !selectedEvidenceRequest) {
      return;
    }
    const request = selectedEvidenceRequest;

    const selectedFeatures = selectedParcelFeatures;
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
  }, [licenceAccepted, selectedParcelFeatures, selectedEvidenceRequest, selectedPid]);

  useEffect(() => {
    if (!selectedPid || !licenceAccepted || !selectedEvidenceRequest) {
      return;
    }
    const request = selectedEvidenceRequest;

    const selectedFeatures = selectedParcelFeatures;
    const noticeAan = taxSaleEnabled && mapMode === "current"
      ? listingContextForPid(selectedPid)?.listing.aan
      : undefined;
    if (selectedFeatures.length === 0 && !noticeAan) {
      return;
    }

    const controller = new AbortController();
    setAssessmentState({ status: "loading", request });
    fetchParcelAssessments(selectedFeatures, noticeAan, controller.signal)
      .then((value) => {
        if (controller.signal.aborted) {
          return;
        }
        setAssessmentState((current) =>
          isCurrentEvidenceRequest(current.request, request)
            ? { status: "ready", value, request }
            : current,
        );
      })
      .catch((error: unknown) => {
        if (
          controller.signal.aborted ||
          (error instanceof DOMException && error.name === "AbortError")
        ) {
          return;
        }
        setAssessmentState((current) =>
          isCurrentEvidenceRequest(current.request, request)
            ? { status: "error", request }
            : current,
        );
      });

    return () => controller.abort();
  }, [licenceAccepted, mapMode, selectedParcelFeatures, selectedEvidenceRequest, selectedPid, taxSaleEnabled]);

  useEffect(() => {
    if (assessmentState.status !== "ready") {
      setDwellingState({
        status:
          assessmentState.status === "error" ||
          assessmentState.status === "geometry-unavailable"
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
    const selectedFeatures = selectedParcelFeatures;
    if (selectedFeatures.length === 0) return;

    const controller = new AbortController();
    // From the stable selected features, not the whole collection — the whole
    // collection is exactly the dependency this effect must not have.
    const mappedArea = mappedAreaForPid(
      { type: "FeatureCollection", features: selectedFeatures },
      selectedPid,
    );
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
  }, [licenceAccepted, selectedParcelFeatures, selectedEvidenceRequest, selectedPid]);

  useEffect(() => {
    if (!selectedPid || !licenceAccepted || !selectedEvidenceRequest) {
      return;
    }
    const request = selectedEvidenceRequest;

    const selectedFeatures = selectedParcelFeatures;
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
  }, [licenceAccepted, selectedParcelFeatures, selectedEvidenceRequest, selectedPid]);

  useEffect(() => {
    if (!selectedPid || !licenceAccepted || !selectedEvidenceRequest) {
      return;
    }
    const request = selectedEvidenceRequest;

    const selectedFeatures = selectedParcelFeatures;
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
  }, [licenceAccepted, selectedParcelFeatures, selectedEvidenceRequest, selectedPid]);

  useEffect(() => {
    if (!selectedPid || !licenceAccepted || !selectedEvidenceRequest) {
      return;
    }
    const request = selectedEvidenceRequest;

    const selectedFeatures = selectedParcelFeatures;
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
  }, [licenceAccepted, selectedParcelFeatures, selectedEvidenceRequest, selectedPid]);

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
  const effectiveTaxSalePids = taxSaleEnabled
    ? filteredTaxSalePids
    : EMPTY_PID_SET;
  const effectiveHistoricalTaxSalePids = taxSaleEnabled
    ? filteredHistoricalPids
    : EMPTY_PID_SET;

  const applyResolvedTheme = useCallback((resolved: ResolvedTheme) => {
    const visible = new Set(resolved.target.layerIds);
    setShowModernMap(visible.has("modern"));
    setFletcherVisible(visible.has("fletcher"));
    setProvinceLayers(visibilityRecordFor(
      provinceLayerCatalog.map(({ id }) => id),
      visible,
    ));
    setResourceLayers(visibilityRecordFor(
      allResourceLayerCatalog.map(({ id }) => id),
      visible,
    ));
    setHydroPilotLayers(visibilityRecordFor(
      hydroPilotLayerCatalog.map(({ id }) => id),
      visible,
    ));
    setFloodHazardLayers(visibilityRecordFor(
      floodHazardLayerCatalog.map(({ id }) => id),
      visible,
    ));
    setEnvironmentalHealthLayers(visibilityRecordFor(
      environmentalHealthLayerCatalog.map(({ id }) => id),
      visible,
    ));
    setForestryLayers(visibilityRecordFor(
      forestryLayerCatalog.map(({ id }) => id),
      visible,
    ));
    setZoningLayers(visibilityRecordFor(
      zoningLayerCatalog.map(({ id }) => id),
      visible,
    ));
    setWellLogLayers(visibilityRecordFor(
      wellLogLayerCatalog.map(({ id }) => id),
      visible,
    ));
    setFletcherOpacity(
      resolved.target.opacityOverrides.fletcher ?? fletcherLayerCatalog.opacity,
    );
    setExpandedCategoryIds(new Set(resolved.target.preferredCategoryIds));
    setTaxSaleEnabled(resolved.target.taxSaleEnabled);
    setMapMode(resolved.target.mapMode);
    setSelectedEventIds(
      resolved.target.taxSaleEnabled && resolved.target.mapMode === "current"
        ? new Set(upcomingTaxSaleEvents.map(({ id }) => id))
        : new Set(),
    );
    if (!resolved.target.taxSaleEnabled) {
      setTaxSaleFilter("all");
      setHistoricalMunicipality("all");
      setHistoricalYear("all");
      setHistoricalOutcome("all");
      setHistoricalParcelMessage(null);
    }
    setThemeResult(resolved);
  }, []);

  const selectTheme = useCallback((themeId: string) => {
    const theme = mapThemes.find(({ id }) => id === themeId);
    if (!theme) return;

    const requiresLicence = theme.layerIds.some(
      (id) => availableThemeLayerIds.has(id) && restrictedThemeLayerIds.has(id),
    );
    if (!licenceAccepted && requiresLicence) {
      setLicenceIntent({ kind: "theme", themeId });
      setLicenceDialogOpen(true);
      return;
    }

    setSelectedThemeId(themeId);
    applyResolvedTheme(resolveTheme(theme, {
      licenceAccepted,
      availableLayerIds: availableThemeLayerIds,
      restrictedLayerIds: restrictedThemeLayerIds,
    }));
  }, [applyResolvedTheme, availableThemeLayerIds, licenceAccepted, mapThemes]);

  const reviewProvinceLicence = useCallback(() => {
    setLicenceIntent({ kind: "review" });
    setLicenceDialogOpen(true);
  }, []);

  const closeLicenceDialog = () => {
    setLicenceDialogOpen(false);
    setLicenceIntent(null);
    restoreMapSetupFocus();
  };

  const restoreMapSetupFocus = () => {
    mapSetupSelectRef.current?.focus();
  };

  const acceptLicence = () => {
    try {
      localStorage.setItem(PROVINCE_LICENSE_ACCEPTANCE_KEY, "accepted");
    } catch {
      // Blocked or full storage must not cost the user the acceptance they
      // just gave: honour it for this session and let the gate ask again next
      // visit, rather than throwing out of a click handler.
    }
    setLicenceAccepted(true);
    if (licenceIntent?.kind === "theme") {
      const theme = mapThemes.find(
        ({ id }) => id === licenceIntent.themeId,
      );
      if (theme) {
        setSelectedThemeId(theme.id);
        applyResolvedTheme(resolveTheme(theme, {
          licenceAccepted: true,
          availableLayerIds: availableThemeLayerIds,
          restrictedLayerIds: restrictedThemeLayerIds,
        }));
      }
    } else if (licenceIntent?.kind === "search") {
      // The search that opened this dialog runs now, with the gate bypassed:
      // `licenceAccepted` in this closure is still the pre-accept value.
      void runSearch(licenceIntent.query, { licenceJustAccepted: true });
    } else if (licenceIntent?.kind === "layer") {
      setProvinceLayers(intendedInitialProvinceLayers);
    } else if (licenceIntent?.kind === "snap") {
      // Acceptance completes the parcels toggle the edit panel refused to
      // flip before the licence; declining leaves snapping to own features.
      setSnapTargets((current) => ({ ...current, parcels: true }));
    }
    // "review" (and any other intent): accepting again is a pure dismiss.
    // This used to fall into the layer branch, so a user re-reading the
    // licence from the footer had every province layer they had switched on
    // silently reset to the page-load set.
    setLicenceDialogOpen(false);
    setLicenceIntent(null);
    restoreMapSetupFocus();
  };

  const continueWithoutProvinceLayers = () => {
    if (licenceIntent?.kind === "theme") {
      const theme = mapThemes.find(
        ({ id }) => id === licenceIntent.themeId,
      );
      if (theme) {
        setSelectedThemeId(theme.id);
        applyResolvedTheme(resolveTheme(theme, {
          licenceAccepted: false,
          availableLayerIds: availableThemeLayerIds,
          restrictedLayerIds: restrictedThemeLayerIds,
        }));
      }
    } else {
      setProvinceLayers(disabledProvinceLayers());
      setResourceLayers((current) => ({
        ...current,
        "mineral-proximity-parcels": false,
      }));
      setFloodHazardLayers((current) => Object.fromEntries(
        floodHazardLayerCatalog.map((layer) => [
          layer.id,
          layer.licence === "province-restricted" ? false : current[layer.id],
        ]),
      ) as Record<FloodHazardLayerId, boolean>);
      setEnvironmentalHealthLayers((current) => Object.fromEntries(
        environmentalHealthLayerCatalog.map((layer) => [
          layer.id,
          layer.licence === "province-restricted" ? false : current[layer.id],
        ]),
      ) as Record<EnvironmentalHealthLayerId, boolean>);
      setShowModernMap(true);
    }
    setLicenceDialogOpen(false);
    setLicenceIntent(null);
    restoreMapSetupFocus();
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

  const setProvinceLayerVisibility = useCallback(
    (id: ProvinceLayerId, visible: boolean) => {
    setProvinceLayers((current) => ({ ...current, [id]: visible }));
    },
    [],
  );

  const setResourceLayerVisibility = useCallback(
    (id: ResourceLayerId, visible: boolean) => {
    setResourceLayers((current) => ({ ...current, [id]: visible }));
    },
    [],
  );

  const setHydroPilotLayerVisibility = useCallback(
    (id: HydroPilotLayerId, visible: boolean) => {
    setHydroPilotLayers((current) => ({ ...current, [id]: visible }));
    },
    [],
  );

  const setWellLogLayerVisibility = useCallback(
    (id: WellLogLayerId, visible: boolean) => {
    setWellLogLayers((current) => ({ ...current, [id]: visible }));
    },
    [],
  );

  const setFloodHazardLayerVisibility = useCallback(
    (id: FloodHazardLayerId, visible: boolean) => {
    setFloodHazardLayers((current) => ({ ...current, [id]: visible }));
    },
    [],
  );
  const setEnvironmentalHealthLayerVisibility = useCallback(
    (id: EnvironmentalHealthLayerId, visible: boolean) => {
    setEnvironmentalHealthLayers((current) => ({ ...current, [id]: visible }));
    },
    [],
  );
  const setForestryLayerVisibility = useCallback(
    (id: ForestryLayerId, visible: boolean) => {
    setForestryLayers((current) => ({ ...current, [id]: visible }));
    },
    [],
  );

  const setZoningLayerVisibility = useCallback(
    (id: ZoningLayerId, visible: boolean) => {
    setZoningLayers((current) => ({ ...current, [id]: visible }));
    },
    [],
  );

  const setLiveConditionsLayerVisibility = useCallback(
    (id: LiveConditionsLayerId, visible: boolean) => {
    setLiveConditionsLayers((current) => ({ ...current, [id]: visible }));
    },
    [],
  );

  const provinceToggleFor = useStablePerIdCallback(setProvinceLayerVisibility);
  const resourceToggleFor = useStablePerIdCallback(setResourceLayerVisibility);
  const hydroToggleFor = useStablePerIdCallback(setHydroPilotLayerVisibility);
  const wellLogToggleFor = useStablePerIdCallback(setWellLogLayerVisibility);
  const floodToggleFor = useStablePerIdCallback(setFloodHazardLayerVisibility);
  const environmentalToggleFor = useStablePerIdCallback(setEnvironmentalHealthLayerVisibility);
  const forestryToggleFor = useStablePerIdCallback(setForestryLayerVisibility);
  const zoningToggleFor = useStablePerIdCallback(setZoningLayerVisibility);
  const liveConditionsToggleFor = useStablePerIdCallback(
    setLiveConditionsLayerVisibility,
  );

  const setLayerStatus = useCallback(
    (id: MapLayerId, status: MapLayerStatus) => {
      setLayerStatuses((current) => {
        // Tile layers report loading/load cycles on every pan, and each
        // report used to build a fresh record — re-rendering the entire App
        // per tile event even when nothing changed. Bail on equal status.
        const previous = current[id];
        if (
          previous &&
          previous.status === status.status &&
          ("minZoom" in previous ? previous.minZoom : undefined) ===
            ("minZoom" in status ? status.minZoom : undefined) &&
          ("count" in previous ? previous.count : undefined) ===
            ("count" in status ? status.count : undefined) &&
          ("observedAt" in previous ? previous.observedAt : undefined) ===
            ("observedAt" in status ? status.observedAt : undefined)
        ) {
          return current;
        }
        return { ...current, [id]: status };
      });
    },
    [],
  );

  const selectParcel = (pid: string): SelectedEvidenceRequest => {
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
    return request;
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

  const runSearch = async (
    rawQuery: string,
    { licenceJustAccepted = false }: { licenceJustAccepted?: boolean } = {},
  ) => {
    if (!licenceAccepted && !licenceJustAccepted) {
      // Search reads NSPRD and the civic address file — licensed Province
      // data — so it is itself the licence trigger. The old blanket
      // `disabled={!licenceAccepted}` gave a first-time visitor a silently
      // dead primary action, with the only unlock a 14 px footer link.
      setLicenceIntent({ kind: "search", query: rawQuery });
      setLicenceDialogOpen(true);
      return;
    }
    cancelAddressSearch();
    cancelPointLookup();
    setSearchError(null);
    setAddressSearchResults([]);
    const pid = normalizePid(rawQuery);

    if (!pid) {
      const normalizedQuery = rawQuery.trim().replace(/\s+/gu, " ");
      if (/^[\d\s-]+$/u.test(rawQuery) || normalizedQuery.length < 3) {
        setSearchError(
          /^[\d\s-]+$/u.test(rawQuery)
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
    const request = selectParcel(pid);
    requestParcelFocus(pid);

    if (parcels.features.some(({ properties }) => properties.PID === pid)) {
      return;
    }

    pendingGeometryFetchPidRef.current = pid;
    try {
      const collection = await fetchParcels([pid]);
      if (collection.features.length === 0) {
        setSearchError("No NSPRD parcel was found for that PID.");
        markGeometryEvidenceTerminal(request, "geometry-unavailable");
        return;
      }
      setParcels((current) => mergeFeatureCollections(current, collection));
    } catch {
      setSearchError("The Province parcel search is unavailable right now.");
      markGeometryEvidenceTerminal(request, "error");
    } finally {
      if (pendingGeometryFetchPidRef.current === pid) {
        pendingGeometryFetchPidRef.current = null;
      }
    }
  };

  const submitPidSearch = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    void runSearch(query);
  };

  const selectListedParcel = async (eventId: string, pid: string) => {
    cancelAddressSearch();
    cancelPointLookup();
    setEventVisibility(eventId, true);
    setAddressSearchResults([]);
    setSearchError(null);
    setQuery(pid);
    const request = selectParcel(pid);
    requestParcelFocus(pid);

    if (parcels.features.some(({ properties }) => properties.PID === pid)) {
      setParcelLookupMessage(`PID ${pid} selected.`);
      return;
    }

    setParcelLookupMessage(`Loading parcel ${pid}…`);
    pendingGeometryFetchPidRef.current = pid;
    try {
      const collection = await fetchParcels([pid]);
      if (collection.features.length === 0) {
        setParcelLookupMessage(
          `PID ${pid} details opened, but its map geometry is unavailable.`,
        );
        markGeometryEvidenceTerminal(request, "geometry-unavailable");
        return;
      }
      setParcels((current) => mergeFeatureCollections(current, collection));
      setParcelLookupMessage(`PID ${pid} selected.`);
    } catch {
      setParcelLookupMessage(
        `PID ${pid} details opened, but the Province parcel service is unavailable.`,
      );
      markGeometryEvidenceTerminal(request, "error");
    } finally {
      if (pendingGeometryFetchPidRef.current === pid) {
        pendingGeometryFetchPidRef.current = null;
      }
    }
  };

  const selectedListingContext = taxSaleEnabled && selectedPid && mapMode === "current"
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
  const selectedPidAllHistoricalContexts = useMemo(
    () => (selectedPid ? historicalContextsForPid(selectedPid) : []),
    [selectedPid],
  );
  // Membership in ANY included notice, ignoring the active mode and filters —
  // the inspector must never claim "not listed" for a PID whose record is
  // merely hidden by the current mode, a filter, or a geometry exception.
  const selectedPidInAnyIncludedNotice = useMemo(
    () =>
      selectedPid !== null &&
      (listingContextForPid(selectedPid) !== undefined ||
        geometryExceptionPidsForEvents(taxSaleEvents).includes(selectedPid) ||
        historicalContextsForPid(selectedPid).length > 0),
    [selectedPid],
  );
  const selectedMappedArea = useMemo(
    () => selectedPid ? mappedAreaForPid(parcels, selectedPid) : null,
    [parcels, selectedPid],
  );
  const selectedParcelGeometry = useMemo<NsprdFeatureCollection>(() => ({
    type: "FeatureCollection",
    features: selectedParcelFeatures,
  }), [selectedParcelFeatures]);
  const canPrintExport = Boolean(
    selectedPid && selectedParcelGeometry.features.length > 0 && selectedEvidenceRequest,
  );

  const activeLayerIds = useMemo<ShareLayerId[]>(() => {
    const active = new Set<ShareLayerId>([
      ...(showModernMap ? (["modern"] as const) : []),
      ...(fletcherVisible ? (["fletcher"] as const) : []),
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
      ...forestryLayerCatalog
        .filter(({ id }) => forestryLayers[id])
        .map(({ id }) => id),
      ...zoningLayerCatalog
        .filter(({ id }) => zoningLayers[id])
        .map(({ id }) => id),
      ...wellLogLayerCatalog
        .filter(({ id }) => wellLogLayers[id])
        .map(({ id }) => id),
      ...liveConditionsLayerCatalog
        .filter(({ id }) => liveConditionsLayers[id])
        .map(({ id }) => id),
    ]);
    if (!licenceAccepted && licenceIntent?.kind === "layer") {
      initialCatalogueLayerIds.forEach((id) => {
        if (restrictedThemeLayerIds.has(id)) active.add(id);
      });
    }
    return allMapLayerIds.filter((id): id is ShareLayerId => active.has(id));
  }, [
    effectiveEnvironmentalHealthLayers,
    effectiveFloodHazardLayers,
    fletcherVisible,
    forestryLayers,
    hydroPilotLayers,
    initialCatalogueLayerIds,
    licenceAccepted,
    licenceIntent,
    liveConditionsLayers,
    provinceLayers,
    resourceLayers,
    showModernMap,
    zoningLayers,
    wellLogLayers,
  ]);
  const categorySummary = (categoryId: LayerCategoryId): string => {
    if (categoryId === "my-maps") {
      const count = userMapsApi.records.length + userVectorApi.records.length;
      return count === 0 ? "Add" : `${count} added`;
    }

    if (categoryId === "tax-sale") {
      const summary = taxSaleEnabled ? "On" : "Off";
      return licenceAccepted ? summary : `${summary} · Province licence required`;
    }

    const activeCount = activeLayerIds.filter(
      (layerId) =>
        layerCategoryByLayerId[layerId] === categoryId &&
        (licenceAccepted || !restrictedThemeLayerIds.has(layerId)),
    ).length;
    const summary = activeCount === 0 ? "Off" : `${activeCount} on`;
    const notices: string[] = [];

    if (categoryId === "historical-maps") {
      if (!fletcherTileConfiguration.baseUrl) {
        notices.push("Fletcher unavailable");
      }
      notices.push(`${churchLayerCatalog.length} Church maps unavailable`);
    }

    if (
      !licenceAccepted &&
      Array.from(restrictedThemeLayerIds).some(
        (layerId) => layerCategoryByLayerId[layerId] === categoryId,
      )
    ) {
      notices.push("Province licence required");
    }

    return [summary, ...notices].join(" · ");
  };
  const themeComparableState = useMemo<ThemeComparableState>(() => ({
    layerIds: activeLayerIds,
    opacityOverrides: normalizeLayerOpacityOverrides(
      activeLayerIds,
      fletcherOpacity === fletcherLayerCatalog.opacity
        ? {}
        : { fletcher: fletcherOpacity },
    ),
    taxSaleEnabled,
    mapMode,
  }), [activeLayerIds, fletcherOpacity, mapMode, taxSaleEnabled]);
  const persistCustomThemes = useCallback((nextThemes: CustomMapThemeDefinition[]) => {
    const result = saveCustomThemes(nextThemes, window.localStorage);
    if (!result.ok) {
      setThemeLibraryNotice(result.message);
      return false;
    }
    setCustomThemes(nextThemes);
    setThemeLibraryNotice(null);
    return true;
  }, []);
  const reportThemeRepositoryError = useCallback((error: unknown) => {
    setThemeLibraryNotice(
      error instanceof Error
        ? error.message
        : "Your custom themes could not be changed.",
    );
  }, []);
  const saveCurrentTheme = useCallback((name: string) => {
    try {
      return persistCustomThemes([
        ...customThemes,
        createCustomTheme(
          name,
          themeComparableState,
          Array.from(expandedCategoryIds),
        ),
      ]);
    } catch (error) {
      reportThemeRepositoryError(error);
      return false;
    }
  }, [
    customThemes,
    expandedCategoryIds,
    persistCustomThemes,
    reportThemeRepositoryError,
    themeComparableState,
  ]);
  const renameSavedTheme = useCallback((themeId: string, name: string) => {
    try {
      return persistCustomThemes(
        renameCustomTheme(customThemes, themeId, name),
      );
    } catch (error) {
      reportThemeRepositoryError(error);
      return false;
    }
  }, [customThemes, persistCustomThemes, reportThemeRepositoryError]);
  const updateSavedTheme = useCallback((
    themeId: string,
    state: ThemeComparableState,
    preferredCategoryIds: readonly LayerCategoryId[],
  ) => {
    try {
      return persistCustomThemes(
        updateCustomTheme(
          customThemes,
          themeId,
          state,
          preferredCategoryIds,
        ),
      );
    } catch (error) {
      reportThemeRepositoryError(error);
      return false;
    }
  }, [customThemes, persistCustomThemes, reportThemeRepositoryError]);
  const duplicateSavedTheme = useCallback((themeId: string) => {
    try {
      return persistCustomThemes(
        duplicateCustomTheme(customThemes, themeId),
      );
    } catch (error) {
      reportThemeRepositoryError(error);
      return false;
    }
  }, [customThemes, persistCustomThemes, reportThemeRepositoryError]);
  const deleteSavedTheme = useCallback((themeId: string) => {
    try {
      const persisted = persistCustomThemes(
        deleteCustomTheme(customThemes, themeId),
      );
      if (persisted && selectedThemeId === themeId) {
        setSelectedThemeId(null);
        setThemeResult(null);
      }
      return persisted;
    } catch (error) {
      reportThemeRepositoryError(error);
      return false;
    }
  }, [
    customThemes,
    persistCustomThemes,
    reportThemeRepositoryError,
    selectedThemeId,
  ]);
  const selectedTheme = mapThemes.find(({ id }) => id === selectedThemeId);
  const matchedTheme = useMemo(
    () => selectedTheme && themeStatesMatch(themeComparableState, selectedTheme)
      ? selectedTheme
      : matchTheme(themeComparableState, mapThemes),
    [mapThemes, selectedTheme, themeComparableState],
  );
  const activeThemeId = selectedTheme?.id ?? matchedTheme?.id ?? null;
  const themeResultMatches = themeResult !== null
    && themeStatesMatch(themeComparableState, themeResult.target);
  const themeStatus: MapThemeStatus = themeResult?.status === "partial"
      && themeResultMatches
    ? "partial"
    : activeThemeId === null
      ? "shared"
      : matchedTheme?.id === activeThemeId
        ? "exact"
        : "modified";
  const themeResolution = themeStatus === "partial" && themeResult !== null
    ? themeResolutionNotice(themeResult)
    : null;
  const themeNotice = [themeLibraryNotice, themeResolution]
    .filter((notice): notice is string => notice !== null)
    .join(" ") || null;
  const printEventIds = useMemo(
    () => !taxSaleEnabled
      ? []
      : mapMode === "current"
        ? Array.from(selectedEventIds)
        : Array.from(new Set(selectedHistoricalContexts.map(({ event }) => event.id))),
    [mapMode, selectedEventIds, selectedHistoricalContexts, taxSaleEnabled],
  );
  const printEvents = useMemo(
    () => !taxSaleEnabled
      ? []
      : mapMode === "current"
      ? taxSaleEvents
        .filter(({ id }) => selectedEventIds.has(id))
        .map((event) => printEventForCurrent(event, currentTime))
      : historicalTaxSaleEvents
        .filter(({ id }) => printEventIds.includes(id))
        .map(printEventForHistorical),
    [currentTime, mapMode, printEventIds, selectedEventIds, taxSaleEnabled],
  );
  const captureLayerIds = useMemo<ShareLayerId[]>(() => [
    ...(showModernMap ? (["modern"] as const) : []),
    ...(fletcherVisible ? (["fletcher"] as const) : []),
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
    ...forestryLayerCatalog
      .filter(({ id }) => forestryLayers[id])
      .map(({ id }) => id),
    ...zoningLayerCatalog
      .filter(({ id }) => zoningLayers[id])
      .map(({ id }) => id),
    ...wellLogLayerCatalog
      .filter(({ id }) => wellLogLayers[id])
      .map(({ id }) => id),
    // Live-conditions overlays (highway cameras, weather radar) are
    // deliberately absent: the print flow captures and seals evidence, and a
    // live frame's content cannot be re-derived from any stated source date.
  ], [
    effectiveEnvironmentalHealthLayers,
    effectiveFloodHazardLayers,
    effectiveResourceLayers,
    fletcherVisible,
    forestryLayers,
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
    const sources = printLayerSources(fletcherTileConfiguration.baseUrl);
    return captureLayerIds.flatMap((id) => {
      const source = sources.get(id);
      return source ? [source] : [];
    });
  }, [captureLayerIds, fletcherTileConfiguration.baseUrl]);
  /**
   * The layer ids `buildExportLayers` actually carries into the PDF. Kept as
   * an explicit mirror of that function's own filters rather than inferred
   * from its output, because a compositor layer's id is not always the
   * catalog id (Fletcher fans out into one `fletcher-NN` layer per sheet).
   */
  const exportedLayerIds = useMemo(() => {
    const ids = new Set<ShareLayerId>();
    if (showModernMap) ids.add("modern");
    if (fletcherVisible && fletcherTileConfiguration.baseUrl) {
      ids.add("fletcher");
    }
    for (const layer of provinceLayerCatalog) {
      if (licenceAccepted && provinceLayers[layer.id] && layer.exportOptions) {
        ids.add(layer.id);
      }
    }
    return ids;
  }, [
    fletcherTileConfiguration.baseUrl,
    fletcherVisible,
    licenceAccepted,
    provinceLayers,
    showModernMap,
  ]);
  /**
   * Everything on screen that the PDF will NOT contain, by name.
   *
   * `MapCanvas` renders seven layer families beyond OSM/Fletcher/Province —
   * resources, hydro pilot, flood hazard, environmental health, forestry,
   * zoning, well logs — and `buildExportLayers` carries none of them (nor a
   * visible Province layer that has no `exportOptions`). Wiring those into
   * the compositor is follow-up work; what cannot wait is that the omission
   * be visible. Turning on zoning and exporting used to produce a page with
   * no zoning on it and no hint that anything was missing, which is exactly
   * the "silently incomplete map" the spec rules out.
   *
   * User-imported maps join the same list: same omission, same notice. So do
   * user vector layers (KML/GPX/KMZ/shapefile import) — `UserVectorLayers`
   * renders them in `MapCanvas`, but `buildExportLayers` does not composite
   * them either, and a visible-but-unexported layer with no notice is exactly
   * this list's reason to exist.
   */
  const omittedLayerNames = useMemo(() => [
    ...captureLayerSources
      .filter(({ id }) => !exportedLayerIds.has(id))
      .map(({ name }) => name),
    ...userMapsApi.visibleMaps.map(({ record }) => record.name),
    ...userVectorApi.visibleLayers.map(({ record }) => record.name),
  ], [
    captureLayerSources,
    exportedLayerIds,
    userMapsApi.visibleMaps,
    userVectorApi.visibleLayers,
  ]);
  const shareUrl = useMemo(
    () => buildMapShareUrl(window.location.href, {
      taxSaleEnabled,
      mode: mapMode,
      pid: selectedPid,
      eventIds: taxSaleEnabled
        ? mapMode === "current"
          ? Array.from(selectedEventIds)
          : Array.from(
              new Set(selectedHistoricalContexts.map(({ event }) => event.id)),
            )
        : [],
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
      taxSaleEnabled,
    ],
  );

  useEffect(() => {
    // Throttled on BOTH edges, and never allowed to throw.
    //
    // shareUrl changes at least once per moveend AND once per zoomend (one
    // zoom fires both), so writing on every change blew past Safari's hard
    // limit of 100 history.replaceState calls per 30 seconds during ordinary
    // wheel-zooming or panning. Safari raises SecurityError at that ceiling,
    // and thrown from inside an effect it unmounted the whole app.
    //
    // Leading edge, not trailing-only: a discrete action (toggling a layer,
    // switching mode, selecting a parcel) must put its state in the address
    // bar immediately, because the user may copy the link right away. Only a
    // burst defers, which keeps successive writes at least
    // SHARE_URL_WRITE_DELAY_MS apart — 2 per second at worst, well under the
    // ceiling — and the URL still settles on the final viewport.
    const write = () => {
      lastShareUrlWriteRef.current = Date.now();
      try {
        window.history.replaceState(null, "", shareUrl);
      } catch {
        // Rate-limited or otherwise refused: the map keeps working and the
        // address bar catches up on the next change.
      }
    };
    const sinceLastWrite = Date.now() - lastShareUrlWriteRef.current;
    if (sinceLastWrite >= SHARE_URL_WRITE_DELAY_MS) {
      write();
      return;
    }
    const timer = window.setTimeout(
      write,
      SHARE_URL_WRITE_DELAY_MS - sinceLastWrite,
    );
    return () => window.clearTimeout(timer);
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
      taxSaleEnabled,
      mode: mapMode,
      eventIds: printEventIds,
      events: printEvents,
      selectedParcelGeometry,
      mapParcels: parcels,
      taxSalePids: Array.from(effectiveTaxSalePids),
      historicalTaxSalePids: Array.from(effectiveHistoricalTaxSalePids),
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
    const terminalResource =
      resourceIntersections.status === "ready" ||
      resourceIntersections.status === "error" ||
      resourceIntersections.status === "geometry-unavailable";
    const terminalCivic =
      civicAddresses.status === "ready" ||
      civicAddresses.status === "error" ||
      civicAddresses.status === "geometry-unavailable";
    if (
      !selectedPid ||
      !terminalResource ||
      !terminalCivic ||
      (assessmentState.status !== "ready" &&
        assessmentState.status !== "error" &&
        assessmentState.status !== "geometry-unavailable") ||
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
      ...(fletcherVisible
        ? [{
            name: fletcherLayerCatalog.name,
            sourceUrl:
              fletcherSourceReceiptUrl(fletcherTileConfiguration.baseUrl) ??
              RUMSEY_COLLECTION_TERMS_URL,
            sourceDate: fletcherLayerCatalog.sourceDate,
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
      ...forestryLayerCatalog
        .filter(({ id }) => forestryLayers[id])
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
      taxSaleEnabled,
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
        : (showHistoricalTaxSales
            ? selectedPidAllHistoricalContexts
            : []
          ).map(({ event }) => ({
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
        ? {
            status: "ready",
            points: civicAddresses.value.addresses.map(({ label }) => ({
              label,
              sourceUrl: CIVIC_ADDRESS_DATASET_URL,
            })),
            unreadableRows: civicAddresses.value.unreadableRows,
          }
        : civicAddresses.status === "geometry-unavailable"
          ? { status: "geometry-unavailable" }
          : { status: "error" },
      assessmentEvidence: assessmentState.status === "ready"
        ? { status: "ready", result: assessmentState.value }
        : assessmentState.status === "geometry-unavailable"
          ? { status: "geometry-unavailable" }
          : { status: "error" },
      dwellingEvidence: dwellingState.status === "ready"
        ? { status: "ready", accounts: dwellingState.value }
        : dwellingState.status === "blocked"
          ? { status: "blocked" }
          : { status: "error" },
      resourceResults: resourceLayerCatalog.map((layer) => {
        if (resourceIntersections.status !== "ready") {
          // Terminal but not evaluated: the note records the condition per
          // layer rather than silently omitting the section.
          return {
            name: layer.name,
            sourceUrl: layer.sourceUrl,
            status: resourceIntersections.status === "geometry-unavailable"
              ? ("geometry-unavailable" as const)
              : ("error" as const),
            results: [],
          };
        }
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
    downloadFile(
      note.filename,
      new Blob([note.markdown], { type: "text/markdown;charset=utf-8" }),
    );
    setShareMessage(`Evidence note exported as ${note.filename}.`);
  };

  return (
    <>
    <div
      className={`app-shell${headerCollapsed ? " header-collapsed" : ""}${
        editingMap ? " georeferencing" : ""
      }`}
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
          <a
            className="header-action"
            href={BETA_SIGNUP_URL}
            title="map@kinnokilabs.com"
          >
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
              />
              <button className="primary-action" type="submit">
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

          {/* Deliberately NOT gated on `licenceAccepted`. Declining the
              Province licence runs `continueWithoutProvinceLayers`, which
              never sets that flag — so gating here locked the export out
              permanently for exactly the user the feature was written for:
              the one taking OSM + a Fletcher sheet into the field with live
              GPS, which needs no Province data at all. Province layers are
              already excluded from the export by the same mechanism that
              excludes them from `captureLayerIds` — they are only visible,
              and therefore only composited, once the licence is accepted. */}
          <button
            type="button"
            className="secondary-action export-map-trigger"
            onClick={() =>
              setExportSession({ stage: "framing", frame: DEFAULT_FRAME_STATE })}
          >
            Export map (PDF)
          </button>

          <MapThemePicker
            themes={mapThemes}
            activeThemeId={activeThemeId}
            status={themeStatus}
            notice={themeNotice}
            selectRef={mapSetupSelectRef}
            onSelect={selectTheme}
            onSave={openThemeManager}
            onManage={openThemeManager}
            onReset={() => {
              if (activeThemeId) selectTheme(activeThemeId);
            }}
          />

          <section className="rail-section" aria-labelledby="layers-heading">
            <h2 id="layers-heading">Map layers</h2>
            {phoneCategoryLayout && focusedCategoryId !== null ? (
              <button
                ref={categoryBackButtonRef}
                type="button"
                className="layer-category-back"
                onClick={returnToCategories}
              >
                Back to categories
              </button>
            ) : null}
            <div className={
              phoneCategoryLayout && focusedCategoryId !== null
                ? "layer-category-list layer-category-list--focused"
                : "layer-category-list"
            }>
            {layerCategories
              .filter((category) =>
                !phoneCategoryLayout || focusedCategoryId === null ||
                  category.id === focusedCategoryId)
              .map((category) => {
              const provinceCategoryLayers = provinceLayerCatalog.filter(
                ({ id }) => layerCategoryByLayerId[id] === category.id,
              );
              const zoningCategoryLayers = zoningLayerCatalog.filter(
                ({ id }) => layerCategoryByLayerId[id] === category.id,
              );
              const hydroCategoryLayers = hydroPilotLayerCatalog.filter(
                ({ id }) => layerCategoryByLayerId[id] === category.id,
              );
              const floodCategoryLayers = floodHazardLayerCatalog.filter(
                ({ id }) => layerCategoryByLayerId[id] === category.id,
              );
              const environmentalCategoryLayers =
                environmentalHealthLayerCatalog.filter(
                  ({ id }) => layerCategoryByLayerId[id] === category.id,
                );
              const forestryCategoryLayers = forestryLayerCatalog.filter(
                ({ id }) => layerCategoryByLayerId[id] === category.id,
              );
              const resourceCategoryLayers = allResourceLayerCatalog.filter(
                ({ id }) => layerCategoryByLayerId[id] === category.id,
              );
              const wellCategoryLayers = wellLogLayerCatalog.filter(
                ({ id }) => layerCategoryByLayerId[id] === category.id,
              );
              const liveConditionsCategoryLayers =
                liveConditionsLayerCatalog.filter(
                  ({ id }) => layerCategoryByLayerId[id] === category.id,
                );
              const churchCategoryLayers = churchLayerCatalog.filter(
                ({ id }) => layerCategoryByLayerId[id] === category.id,
              );

              return (
                <LayerCategorySection
                  key={category.id}
                  id={category.id}
                  name={category.name}
                  description={category.description}
                  summary={categorySummary(category.id)}
                  expanded={
                    phoneCategoryLayout && focusedCategoryId === category.id
                      ? true
                      : expandedCategoryIds.has(category.id)
                  }
                  onExpandedChange={(expanded) =>
                    phoneCategoryLayout
                      ? focusedCategoryId === category.id && !expanded
                        ? returnToCategories()
                        : focusedCategoryId === null
                        ? focusCategory(category.id)
                        : undefined
                      : setCategoryExpanded(category.id, expanded)}
                  buttonRef={(button) => {
                    if (button) {
                      categoryButtonRefs.current.set(category.id, button);
                    } else {
                      categoryButtonRefs.current.delete(category.id);
                    }
                  }}
                >
                  {layerCategoryByLayerId.modern === category.id ? (
                    <label className="layer-row">
                      <input
                        type="checkbox"
                        aria-label="Modern map"
                        checked={showModernMap}
                        onChange={(event) =>
                          setShowModernMap(event.target.checked)}
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
                  ) : null}

                  {provinceCategoryLayers.map((layer) => (
                    <div className="layer-control" key={layer.id}>
                      <LayerToggle
                        layer={layer}
                        checked={provinceLayers[layer.id]}
                        licenceAccepted={licenceAccepted}
                        status={layerStatuses[layer.id]}
                        onChange={provinceToggleFor(layer.id)}
                        onReviewLicence={reviewProvinceLicence}
                      />
                      {layer.id === "roads" && provinceLayers.roads ? (
                        <RoadLegend />
                      ) : null}
                    </div>
                  ))}

                  {provinceCategoryLayers.some(({ id }) => id === "contours") ? (
                    <p className="resource-source-note">
                      Contours show mapped elevation shape and depressions. They
                      do not establish surveyed grade, drainage, stability,
                      access, flood exposure, or buildability. {" "}
                      <a
                        href="https://data.novascotia.ca/d/j63u-5nkj"
                        target="_blank"
                        rel="noreferrer"
                      >
                        Official Landforms source
                      </a>
                    </p>
                  ) : null}

                  {zoningCategoryLayers.map((layer) => (
                    <ZoningLayerToggle
                      key={layer.id}
                      layer={layer}
                      checked={zoningLayers[layer.id]}
                      status={layerStatuses[layer.id]}
                      onChange={zoningToggleFor(layer.id)}
                    />
                  ))}
                  {zoningCategoryLayers.length > 0 ? (
                    <>
                      <p className="resource-source-note">
                        Unofficial renderings of municipal map services — not
                        for legal use. Confirm every zone against the linked
                        land use by-law and with the municipality.
                      </p>
                      <details className="evidence-caveat">
                        <summary>Zoning coverage limits</summary>
                        <p className="resource-source-note">
                          Nova Scotia publishes no provincial zoning layer, and
                          most municipalities publish no zoning GIS at all. An
                          area with no polygon is an area this map has no data
                          for &mdash; it is not evidence that no zoning
                          applies. Towns inside a county are separate zoning
                          jurisdictions, so a county layer does not cover town
                          parcels.
                        </p>
                      </details>
                    </>
                  ) : null}

                  {hydroCategoryLayers.map((layer) => (
                    <HydroPilotLayerToggle
                      key={layer.id}
                      layer={layer}
                      checked={hydroPilotLayers[layer.id]}
                      status={layerStatuses[layer.id]}
                      onChange={hydroToggleFor(layer.id)}
                    />
                  ))}
                  {hydroCategoryLayers.length > 0 ? (
                    <>
                      {hydroPilotLayers["inverness-hydro-potential"] ? (
                        <HydroPotentialLegend />
                      ) : null}
                      <p className="resource-source-note hydro-pilot-note">
                        Width uses routed official tertiary/sub-tertiary
                        catchment area; colour uses a fixed 8 L/s/km² regional
                        flow scenario, mapped gross drop, route distance, and
                        60% nominal efficiency. Values step at catchment outlets
                        and are not exact at every point. The kW scale is for
                        screening—not measured flow, net head, or predicted
                        output. {" "}
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
                    </>
                  ) : null}

                  {floodCategoryLayers.map((layer) => (
                    <FloodHazardLayerToggle
                      key={layer.id}
                      layer={layer}
                      checked={floodHazardLayers[layer.id]}
                      licenceAccepted={licenceAccepted}
                      status={layerStatuses[layer.id]}
                      onChange={floodToggleFor(layer.id)}
                      onReviewLicence={reviewProvinceLicence}
                    />
                  ))}
                  {floodCategoryLayers.length > 0 ? (
                    <p className="resource-source-note">
                      Annual-exceedance percentages describe mapped events, not
                      a whole-PID score. Future coastal years are scenarios.
                      Each layer is independently controlled.
                    </p>
                  ) : null}

                  {environmentalCategoryLayers.map((layer) => (
                    <EnvironmentalHealthLayerToggle
                      key={layer.id}
                      layer={layer}
                      checked={environmentalHealthLayers[layer.id]}
                      licenceAccepted={licenceAccepted}
                      status={layerStatuses[layer.id]}
                      onChange={environmentalToggleFor(layer.id)}
                      onReviewLicence={reviewProvinceLicence}
                    />
                  ))}
                  {environmentalCategoryLayers.length > 0 ? (
                    <p className="resource-source-note">
                      These are relative risk zones mapped by bedrock unit, not
                      test results for any property. A parcel takes the band of
                      the rock beneath it, and wells in any band can exceed a
                      guideline. Testing your well water is the only way to know
                      what is in it.
                    </p>
                  ) : null}

                  {wellCategoryLayers.map((layer) => (
                    <WellLogLayerToggle
                      key={layer.id}
                      layer={layer}
                      checked={wellLogLayers[layer.id]}
                      status={layerStatuses[layer.id]}
                      onChange={wellLogToggleFor(layer.id)}
                    />
                  ))}
                  {wellCategoryLayers.length > 0 ? (
                    <>
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
                        The Province records an estimated location accuracy for
                        every well. Only records accurate to ±50 m — mostly
                        wells drilled after 2004, positioned with a driller's
                        GPS — are drawn as solid points. Older records were
                        placed from map books, NTS sheets, or community
                        centroids and can be off by 800 m to 8 km; they stay
                        hidden until you ask for them, and then draw hollow to
                        show a well was reported nearby rather than where it
                        sits. Depths and yields are the driller's report, not a
                        survey or a guarantee of water. {" "}
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
                    </>
                  ) : null}

                  {liveConditionsCategoryLayers.map((layer) => (
                    <div className="layer-control" key={layer.id}>
                      <LiveConditionsLayerToggle
                        layer={layer}
                        checked={liveConditionsLayers[layer.id]}
                        status={layerStatuses[layer.id]}
                        onChange={liveConditionsToggleFor(layer.id)}
                      />
                      <p className="resource-source-note">
                        {layer.id === "highway-cameras" ? (
                          <>
                            Camera images load in your browser directly from
                            511 Nova Scotia when you tap a camera; this map
                            stores nothing. The camera list is a project
                            catalogue of the public 511 map and can lag 511's
                            own. {" "}
                          </>
                        ) : (
                          <>
                            Radar shows observed precipitation only — not a
                            forecast. A gap or missing frame is missing data,
                            not clear sky. {" "}
                          </>
                        )}
                        <a
                          href={layer.sourceUrl}
                          target="_blank"
                          rel="noreferrer"
                        >
                          {layer.id === "highway-cameras"
                            ? "511 Nova Scotia map"
                            : "MSC GeoMet service"}
                        </a>
                      </p>
                    </div>
                  ))}

                  {forestryCategoryLayers.map((layer) => (
                    <ForestryLayerToggle
                      key={layer.id}
                      layer={layer}
                      checked={forestryLayers[layer.id]}
                      status={layerStatuses[layer.id]}
                      onChange={forestryToggleFor(layer.id)}
                    />
                  ))}
                  {forestryCategoryLayers.length > 0 ? (
                    <p className="resource-source-note">
                      The Province says the locations of all old-growth forest
                      are not known. This layer maps policy areas on publicly
                      owned land outside protected areas; a viewport with no
                      mapped policy polygon is not evidence that no old growth
                      exists. Policy protections apply to Crown-land
                      management. {" "}
                      <a
                        aria-label="Official old-growth policy source"
                        href={forestryLayerCatalog[0].sourceUrl}
                        target="_blank"
                        rel="noreferrer"
                      >
                        Official source
                      </a>
                    </p>
                  ) : null}

                  {resourceCategoryLayers.map((layer) => (
                    <ResourceLayerToggle
                      key={layer.id}
                      layer={layer}
                      checked={resourceLayers[layer.id]}
                      licenceAccepted={licenceAccepted}
                      status={layerStatuses[layer.id]}
                      onChange={resourceToggleFor(layer.id)}
                      onReviewLicence={reviewProvinceLicence}
                    />
                  ))}
                  {resourceCategoryLayers.length > 0 ? (
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
                      therefore requires Province licence acceptance. All
                      results are screening context, not mineral, legal,
                      ownership, access, safety, or economic conclusions.
                    </p>
                  ) : null}

                  {churchCategoryLayers.map((layer) => (
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
                  {churchCategoryLayers.length > 0 ? (
                    <p className="resource-source-note">
                      A.F. Church topographical township maps name the residents
                      of each building, and the occupations of prominent
                      townsfolk. Scans courtesy of the {" "}
                      <a
                        href={RUMSEY_COLLECTION_TERMS_URL}
                        target="_blank"
                        rel="noreferrer"
                      >
                        David Rumsey Map Collection
                      </a>
                      . {RUMSEY_ATTRIBUTION}. Web tiles are not produced yet.
                    </p>
                  ) : null}

                  {layerCategoryByLayerId.fletcher === category.id ? (
                    <>
                      <FletcherLayerControl
                        layer={fletcherLayerCatalog}
                        checked={fletcherVisible}
                        enabled={Boolean(fletcherTileConfiguration.baseUrl)}
                        opacity={fletcherOpacity}
                        status={
                          fletcherTileConfiguration.error
                            ? { status: "error" }
                            : layerStatuses.fletcher
                        }
                        onChange={setFletcherVisible}
                        onOpacityChange={setFletcherOpacity}
                        onRetry={() =>
                          setFletcherRetryToken((token) => token + 1)}
                      />
                      <p className="resource-source-note fletcher-source-note">
                        {RUMSEY_ATTRIBUTION}. Licensed {" "}
                        <a
                          href={RUMSEY_LICENCE_URL}
                          target="_blank"
                          rel="noreferrer"
                        >
                          {RUMSEY_LICENCE_NAME}
                        </a>
                        : noncommercial use only; project georeferencing,
                        clipping, and tiling changes are identified as
                        derivatives and remain within the licence’s ShareAlike
                        boundary. The MIT software licence does not cover the
                        imagery. This historical layer is context only: it is
                        not a survey and does not establish current parcels,
                        title, legal access, roads, shoreline, flood conditions,
                        value, permissions, or services.
                      </p>
                    </>
                  ) : null}

                  {category.id === "tax-sale" ? (
                    <>
                      <label className="tax-sale-master">
                        <input
                          type="checkbox"
                          checked={taxSaleEnabled}
                          aria-controls="tax-sale-dependent-controls"
                          onChange={(event) => event.target.checked
                            ? enableTaxSale()
                            : disableTaxSale()}
                        />
                        <span>Show tax-sale information</span>
                      </label>

                      {taxSaleEnabled ? (
                        <div id="tax-sale-dependent-controls">
                          <section
                            className={`map-mode-switcher ${mapMode}`}
                            role="group"
                            aria-label="Current notices or historical records"
                          >
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

                          {mapMode === "current" ? (
                        <>
                          <section
                            className="rail-section tax-sale-events"
                            role="region"
                            aria-label="Current tax-sale notices"
                          >
                            <h4 id="events-heading" className="nested-rail-heading">
                              Tax-sale notices
                            </h4>
                            <p className="section-intro">
                              Dated official notices. Past sale dates require
                              municipal result verification.
                            </p>
                            {upcomingTaxSaleEvents.map((event) => {
                              const pidCount = advertisedPidsForEvents([event]).length;
                              const mappedAdvertisedCount = event.listings.filter(
                                ({ listingStatus }) => listingStatus === "advertised",
                              ).length;
                              const geometryExceptions = event.geometryExceptions ?? [];
                              const advertisedCount =
                                mappedAdvertisedCount + geometryExceptions.length;
                              const withdrawnCount =
                                event.listings.length - mappedAdvertisedCount;
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
                                        setEventVisibility(event.id, change.target.checked)}
                                    />
                                    <span className="switch" aria-hidden="true" />
                                    <span>
                                      <strong>{event.shortMunicipality}</strong>
                                      <small>{eventDateLabel(event)}</small>
                                      <small>{eventLifecycleLabel(event, currentTime)}</small>
                                      <small>
                                        {geometryExceptions.length > 0
                                          ? `${advertisedCount} advertised · ${event.listings.length} mapped · ${geometryExceptions.length} unavailable in NSPRD`
                                          : `${advertisedCount} advertised · ${withdrawnCount} withdrawn · ${pidCount} active PIDs`}
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
                                    geometryExceptions={geometryExceptions}
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
                            <h4 id="filter-heading" className="nested-rail-heading">
                              Redemption category
                            </h4>
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
                          <h4 id="historical-heading" className="nested-rail-heading">
                            Historical tax-sale records
                          </h4>
                          <p className="section-intro">
                            Dated notices and verified results. Recent events can
                            remain outcome unknown while official results are
                            pending. These are never current offerings.
                          </p>
                          <div className="historical-mode-summary">
                            <strong>Historical records active</strong>
                            <span>
                              {historicalTaxSaleRecords.length} records · {" "}
                              {allHistoricalTaxSalePids.length} exact matched PIDs
                            </span>
                            <span>
                              {historicalMunicipalities.map(([, label]) => label).join(" · ")} · {" "}
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
                                onChange={(event) =>
                                  setHistoricalMunicipality(event.target.value)}
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
                                  setHistoricalOutcome(
                                    event.target.value as HistoricalOutcomeFilter,
                                  )}
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
                            {countLabel(filteredHistoricalRecords.length, "record")} · {" "}
                            {countLabel(filteredHistoricalPids.size, "PID")}
                          </p>
                          <p className="parcel-message" role="status" aria-live="polite">
                            {historicalParcelMessage}
                          </p>
                        </section>
                          )}
                        </div>
                      ) : null}
                    </>
                  ) : null}

                  {category.id === "my-maps" ? (
                    <>
                      <UserMapControls
                        api={userMapsApi}
                        onImportFiles={(files) => void handleImportFiles(files)}
                        outcomes={mergedImportOutcomes}
                        importing={userMapsApi.importing || userVectorApi.importing}
                        importingLabel={
                          userMapsApi.importingLabel ?? userVectorApi.importingLabel
                        }
                      />
                      <UserVectorControls
                        api={userVectorApi}
                        onEdit={(id) =>
                          vectorEdit.editingId === id
                            ? endVectorEdit()
                            : beginVectorEdit(id)}
                        onNewLayer={() => void createAndEditVectorLayer()}
                        onBulkPhotos={() => setBulkPhotosOpen(true)}
                        editingId={vectorEdit.editingId}
                      />
                    </>
                  ) : null}
                </LayerCategorySection>
              );
            })}
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
            taxSalePids={effectiveTaxSalePids}
            historicalTaxSalePids={effectiveHistoricalTaxSalePids}
            selectedPid={selectedPid}
            provinceLayers={provinceLayers}
            resourceLayers={effectiveResourceLayers}
            hydroPilotLayers={hydroPilotLayers}
            floodHazardLayers={effectiveFloodHazardLayers}
            environmentalHealthLayers={effectiveEnvironmentalHealthLayers}
            forestryLayers={forestryLayers}
            zoningLayers={zoningLayers}
            wellLogLayers={wellLogLayers}
            liveConditionsLayers={liveConditionsLayers}
            wellLogAccuracyFilter={wellLogAccuracyFilter}
            fletcherVisible={fletcherVisible}
            fletcherOpacity={fletcherOpacity}
            fletcherTileBaseUrl={fletcherTileConfiguration.baseUrl}
            fletcherRetryToken={fletcherRetryToken}
            userMaps={userMapsApi.visibleMaps}
            userMapFitRequest={userMapsApi.fitRequest}
            userVectorLayers={readOnlyVectorLayers}
            userVectorFitRequest={userVectorApi.fitRequest}
            userVectorPhotoUi={photoPopupUi}
            userVectorEdit={
              vectorEdit.editingLayer
                ? {
                    record: vectorEdit.editingLayer.record,
                    data: vectorEdit.editingLayer.data,
                    mode: drawMode,
                    snap: {
                      enabled: snapTargets.enabled,
                      myFeatures: snapTargets.myFeatures,
                      // Belt to the panel's braces: parcels never arm
                      // without the accepted province licence.
                      parcels: snapTargets.parcels && licenceAccepted,
                    },
                    onGeometryChange: vectorEdit.commitGeometry,
                    onSelectFeature: setSelectedFeatureId,
                    onParcelSnapStatus: setParcelSnapStatus,
                    conversionPreview:
                      convertShape && conversionPlan?.viable
                        ? {
                            positions: conversionPlan.positions,
                            closed: convertShape === "area",
                          }
                        : null,
                  }
                : null
            }
            georeference={georeferenceBinding}
            showModernMap={showModernMap}
            showTaxSale={
              taxSaleEnabled &&
              licenceAccepted &&
              mapMode === "current" &&
              selectedEventIds.size > 0
            }
            showHistoricalTaxSales={
              taxSaleEnabled && licenceAccepted && showHistoricalTaxSales
            }
            onSelectPid={selectParcel}
            onIdentifyParcel={(latitude, longitude) => {
              void identifyParcelAtPoint(latitude, longitude);
            }}
            focusRequest={parcelFocusRequest}
            initialPosition={initialShareState.position}
            preserveInitialPosition={hasSharedPosition}
            onViewportChange={setMapViewport}
            onMarkLocation={markCurrentLocation}
            onSaveTrack={saveRecordedTrack}
            onLayerStatusChange={setLayerStatus}
            exportFrame={
              exportSession?.stage === "framing" ? exportSession.frame : null
            }
            onExportFrameChange={(frame) =>
              setExportSession({ stage: "framing", frame })}
            onExportFrameCancel={() => setExportSession(null)}
            onExportFrameContinue={(bounds, orientation) =>
              setExportSession({ stage: "dialog", bounds, orientation })}
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
              pidInAnyIncludedNotice={selectedPidInAnyIncludedNotice}
              mappedArea={selectedMappedArea}
              buildingCount={buildingCount}
              assessmentState={assessmentState}
              dwellingState={dwellingState}
              mappedContext={mappedContext}
              civicAddresses={civicAddresses}
              resourceIntersections={resourceIntersections}
              floodHazard={floodHazard}
              taxSaleEnabled={taxSaleEnabled}
              mapMode={mapMode}
              shareUrl={shareUrl}
              shareMessage={shareMessage}
              onCopyShareUrl={copyShareUrl}
              onExportEvidence={exportEvidence}
              onPrintExport={openPrintExport}
              canPrintExport={canPrintExport}
              evidenceReady={
                (resourceIntersections.status === "ready" ||
                  resourceIntersections.status === "error" ||
                  resourceIntersections.status === "geometry-unavailable") &&
                (civicAddresses.status === "ready" ||
                  civicAddresses.status === "error" ||
                  civicAddresses.status === "geometry-unavailable") &&
                (assessmentState.status === "ready" ||
                  assessmentState.status === "error" ||
                  assessmentState.status === "geometry-unavailable") &&
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
        {/* Licence-mandated statements for what is actually on screen. The
            catalog carried these strings precisely because the licences
            require them in products using the data, but nothing rendered
            them live: zoning's OGL–Halifax/EDPC lines, the OGL–NS sentence
            for open layers beyond forestry, and Rumsey's CC BY-NC-SA line
            for the Fletcher sheets. */}
        {oglLayerVisible ? (
          <span>{OPEN_GOVERNMENT_ATTRIBUTION}</span>
        ) : null}
        {visibleZoningAttributions.map((attribution) => (
          <span key={attribution}>{attribution}</span>
        ))}
        {liveConditionsLayerCatalog
          .filter(({ id }) => liveConditionsLayers[id])
          .map(({ id, attribution }) => (
            <span key={id}>{attribution}</span>
          ))}
        {fletcherVisible ? <span>{RUMSEY_ATTRIBUTION}</span> : null}
        <span>Boundaries are not a survey</span>
        <button type="button" onClick={() => setDataSourcesOpen(true)}>
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
          onClose={licenceAccepted ? closeLicenceDialog : undefined}
        />
      ) : null}
      {aboutOpen ? <AboutDialog onClose={() => setAboutOpen(false)} /> : null}
      {dataSourcesOpen ? (
        <DataSourcesDialog
          sources={sourceInventory}
          onReviewProvinceLicence={() => {
            setDataSourcesOpen(false);
            reviewProvinceLicence();
          }}
          onClose={() => setDataSourcesOpen(false)}
        />
      ) : null}
      {themeManagerOpen ? (
        <ThemeManagerDialog
          themes={mapThemes}
          currentState={themeComparableState}
          preferredCategoryIds={Array.from(expandedCategoryIds)}
          notice={themeLibraryNotice}
          onSave={saveCurrentTheme}
          onRename={renameSavedTheme}
          onUpdate={updateSavedTheme}
          onDuplicate={duplicateSavedTheme}
          onDelete={deleteSavedTheme}
          onClose={closeThemeManager}
        />
      ) : null}
    </div>
    {printCapture ? (
      <Suspense fallback={null}>
        <PrintPreview
          capture={printCapture}
          baseUrl={window.location.href}
          onClose={() => setPrintCapture(null)}
        />
      </Suspense>
    ) : null}
    {exportSession?.stage === "dialog" ? (
      <Suspense fallback={null}>
      <ExportDialog
        orientation={exportSession.orientation}
        bounds={exportSession.bounds}
        layers={buildExportLayers({
          bounds: exportSession.bounds,
          showModernMap,
          fletcher: {
            visible: fletcherVisible,
            opacity: fletcherOpacity,
            // The already-resolved value, not a fresh normalize() call: that
            // function THROWS on invalid VITE_FLETCHER_TILE_BASE_URL, and
            // here the throw happened during App's render — blanking the app
            // the moment a user opened the export dialog. The memo above
            // catches it once and degrades to null, which buildExportLayers
            // reads as "skip the Fletcher layer".
            tileBaseUrl: fletcherTileConfiguration.baseUrl,
            // The EXPORT fetches real tiles, so it clamps at native depth —
            // upscaling is a screen behavior, not something to bake into a
            // PDF's raster.
            maxNativeZoom:
              fletcherLayerCatalog.maxNativeZoom ?? fletcherLayerCatalog.maxZoom,
          },
          arcgisLayers: provinceLayerCatalog
            .filter((layer) =>
              licenceAccepted && provinceLayers[layer.id] && layer.exportOptions)
            .map((layer) => ({
              id: layer.id,
              name: layer.name,
              serviceUrl: layer.serviceUrl,
              exportOptions: layer.exportOptions!,
              opacity: layer.opacity,
            })),
          // v1 scope cut: user-imported maps are not extracted into a
          // CanvasImageSource + mesh yet. They are named in
          // `omittedLayerNames` below, alongside every other visible layer
          // this export will not contain, rather than silently dropped.
          userMaps: [],
          selectedParcelRings: selectedParcelGeometry.features.flatMap(
            ({ geometry }) =>
              geometry.type === "Polygon"
                ? geometry.coordinates.map((ring) =>
                    ring.map(([lng, lat]) => ({ lat, lng })))
                : geometry.type === "MultiPolygon"
                  ? geometry.coordinates.flatMap((polygon) =>
                      polygon.map((ring) =>
                        ring.map(([lng, lat]) => ({ lat, lng }))))
                  : [],
          ),
        })}
        defaultTitle={selectedPid ? `Parcel ${selectedPid}` : "Nova Scotia map"}
        defaultSubtitle={`NS Marks The Spot — ${
          taxSaleEnabled
            ? mapMode === "historical"
              ? "historical tax-sale research export"
              : "tax-sale research export"
            : fletcherVisible
              ? "historical map export"
              : "map export"
        }`}
        attributionLines={exportAttributionLines([
          // Credit exactly what the PDF contains: `captureLayerSources` is
          // every visible source, but the compositor only carries the subset
          // in `exportedLayerIds` (OSM, Fletcher, and Province layers with
          // `exportOptions`). Passing the unfiltered list asserted licence
          // obligations — coastal-flood, zoning, well-log, etc. — over data
          // the page never contained. The omitted layers stay named in
          // `omittedLayerNames` below; they must not also appear credited
          // here.
          ...captureLayerSources.filter(({ id }) => exportedLayerIds.has(id)),
          // The selected-parcel ring is NSPRD-derived geometry and exports
          // whenever a parcel is selected, INDEPENDENT of the NSPRD layer
          // toggle — so with no Province layer visible the page carried
          // licensed geometry with no attribution, licence URL, or survey
          // caveat. Its distinct text keeps it a separate strip line.
          ...(selectedParcelGeometry.features.length > 0
            ? [{
                id: "nsprd" as const,
                name: "Selected parcel boundary",
                sourceUrl: NSPRD_LAYER_URL,
                sourceDate: "NSPRD parcel geometry at export time",
                attribution: `${PROVINCE_ATTRIBUTION} The selected parcel boundary is approximate and is not a legal survey.`,
                licenceUrl: PROVINCE_LICENSE_URL,
              }]
            : []),
        ])}
        omittedLayerNames={omittedLayerNames}
        shareUrl={window.location.href}
        onClose={() => setExportSession(null)}
      />
      </Suspense>
    ) : null}
    {userMapsApi.frameChoosingMap ? (
      <GeoPdfFrameChooser
        map={userMapsApi.frameChoosingMap}
        onCancel={userMapsApi.endFrameSelection}
        onUseFrame={(candidateId, options) =>
          userMapsApi.selectPdfFrame(
            userMapsApi.frameChoosingMap!.record.id,
            candidateId,
            options,
          )
        }
      />
    ) : null}
    {openPhoto ? (
      <PhotoLightbox
        descriptor={openPhoto}
        manager={photoManager}
        onClose={() => setOpenPhoto(null)}
      />
    ) : null}
    {bulkPhotosOpen ? (
      <BulkPhotoImportDialog
        bounds={mapViewport.bounds}
        onCreate={userVectorApi.createPhotoLayer}
        onClose={() => setBulkPhotosOpen(false)}
      />
    ) : null}
    {vectorEdit.editingLayer ? (
      <VectorEditPanel
        record={vectorEdit.editingLayer.record}
        data={vectorEdit.editingLayer.data}
        selectedFeatureId={selectedFeatureId}
        drawMode={drawMode}
        storageError={vectorEdit.storageError}
        snap={snapTargets}
        parcelSnapStatus={parcelSnapStatus}
        licenceAccepted={licenceAccepted}
        onSnapChange={setSnapTargets}
        onRequestParcelSnapLicence={requestParcelSnapLicence}
        convertShape={convertShape}
        conversionPlan={conversionPlan}
        onConvertShape={handleConvertShape}
        onConvertCreate={handleConvertCreate}
        lastConversion={vectorEdit.lastConversion}
        onUndoConversion={vectorEdit.undoConversion}
        onDrawMode={setDrawMode}
        onRename={vectorEdit.renameLayer}
        onUpdateFeature={vectorEdit.updateFeatureDetails}
        onPatchAttributes={vectorEdit.updateFeatureProperties}
        photoManager={photoManager}
        onSetFeaturePhotos={vectorEdit.setFeaturePhotos}
        onMoveFeaturePoint={vectorEdit.moveFeaturePoint}
        onOpenPhoto={setOpenPhoto}
        onDeleteFeature={(featureId) => {
          vectorEdit.deleteFeature(featureId);
          setSelectedFeatureId(null);
        }}
        onDone={endVectorEdit}
      />
    ) : null}
    {editingMap ? (
      <GeoreferencePanel
        // Keyed on the record id so a switch between two maps under edit
        // unmounts and remounts the panel instead of reusing it: the panel
        // holds `tab`, `selectedGcpId`, and `scanFocus` in local state, none
        // of which belongs to the next map.
        key={editingMap.record.id}
        record={editingMap.record}
        previewUrl={editingMap.previewUrl}
        opacity={editingMap.opacity}
        session={georeferenceSession}
        onOpacityChange={(opacity) =>
          userMapsApi.setOpacity(editingMap.record.id, opacity)
        }
        onClose={endGeoreferencing}
        onDelete={() => {
          // NO window.confirm here. The panel's Delete map button already
          // asks, and wrapping it again produced two prompts for one click —
          // which reads to the user as a dialog that does not work.
          //
          // The discard is not optional. Writes are debounced 400 ms, and
          // `removeMap` AWAITS the IndexedDB delete before dropping the
          // record from state — so a timer that fires inside that await still
          // finds the record in `recordsRef` and queues a metadata `put`
          // behind the deletion, resurrecting a record whose raster and
          // preview blobs are gone. Cancel first, then delete.
          const id = editingMap.record.id;
          georeferenceSession.discardPendingWrite(id);
          endGeoreferencing();
          void userMapsApi.removeMap(id);
        }}
        onFocusGcpOnMap={focusGcpOnMap}
        onMethodChange={(method) => {
          // Floated like saveGcps above, and for the same reason:
          // setGeorefMethod never rejects — a storage failure sets
          // `storageError` and keeps the choice for the session.
          void userMapsApi.setGeorefMethod(editingMap.record.id, method);
        }}
        referenceLayers={{
          aerial: provinceLayers["ns-aerial"],
          parcels: provinceLayers.nsprd,
        }}
        referenceLayersLocked={!licenceAccepted}
        onToggleReferenceLayer={(id: ReferenceLayerId, enabled) =>
          setProvinceLayerVisibility(
            id === "aerial" ? "ns-aerial" : "nsprd",
            enabled,
          )
        }
      />
    ) : null}
    </>
  );
}
