import { LicensingLockDialog } from "./components/LicensingLockDialog";
import { PARCEL_REPRODUCTION_LOCK_REASON, PROPERTY_RECORD_REPRODUCTION_ALLOWED, reproductionLockReason } from "./licensing/layerUse";
import { RhodenaOverview } from "./rhodena/RhodenaOverview";
import {
  EMPTY_FOCUS_PAGE_STATE,
  filterFocusLayerIds,
  focusHides,
  focusOffersLayer,
  type FocusChromeContext,
  type FocusDefinition,
  type FocusBounds,
  type FocusFitRequest,
  type FocusPageState,
} from "./focus/focusDefinition";
import { focusDefinitions, focusForTheme, type FocusId } from "./focus/registry";
import { themeCameraFor, themeOpeningPosition, type ThemeCameraRequest } from "./themes/themeCameras";
import { ElectoralLayerControls, ElectoralLegend } from "./components/ElectoralLayerControls";
import { electoralWashNote } from "./elections/electoralData";
import { DistrictInspector } from "./components/DistrictInspector";
import { initialElectoralModes, withElectoralMode, type ElectoralLayerId } from "./layers/electoralLayers";
import type { ElectoralSelection } from "./elections/electoralData";
import { openDataPrintCredit } from "./layers/openDataSources";
import { contextLayerCatalog, type ContextLayerId } from "./layers/contextLayerCatalog";
import { ContextLayerToggle } from "./components/ContextLayerToggle";
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
import { useWholeRowList } from "./components/useWholeRowList";
import { BasemapRooms } from "./components/BasemapRooms";
import { splitCaveat } from "./components/layerCaveat";
import { parcelOutlineColor } from "./components/parcelStyle";
import type { LayerSwatchSpec } from "./components/layerSwatchSpec";
import { LayerCategorySection } from "./components/LayerCategorySection";
import { UnavailableLayers } from "./components/UnavailableLayers";
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
  type CoastalFloodState,
  type DwellingState,
  type ParcelContextState,
  type ParcelResourceState,
  type RiverFloodState,
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
import { TaxSaleDateDot, TaxSaleDateLegend } from "./components/TaxSaleDateLegend";
import { taxSaleEventsByUrgency, taxSaleDateBand, taxSaleDateBandsByPid } from "./services/taxSaleDateBands";
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
import { groupAttributions, OPEN_LICENCE_NOVA_SCOTIA } from "./licensing/attributionGroups";
import {
  RUMSEY_ATTRIBUTION,
  RUMSEY_COLLECTION_TERMS_URL,
  RUMSEY_LICENCE_NAME,
  RUMSEY_LICENCE_URL,
} from "./licensing/rumseyLicense";
import {
  COASTAL_HAZARD_ATTRIBUTION,
  COASTAL_HAZARD_LICENCE_URL,
  COASTAL_HAZARD_NOTICES,
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
  CivicAddressGeometryError,
  fetchCivicAddresses,
  type CivicAddress,
  type CivicAddressReading,
} from "./services/civicAddresses";
import { searchAddressesWithMailing, mailingLabel, type MailingCivicAddress } from "./services/mailingAddresses";
import { MailingSource } from "./components/MailingAddressDetails";
import {
  fetchParcelAtPoint,
  fetchParcels,
  hasQueryablePolygon,
  identifyParcelsAtPoint,
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
import {
  fetchCoastalFloodEvidence,
  fetchPublishedRiverFloodEvidence,
} from "./services/floodHazard";
import {
  buildMapShareUrl,
  FLETCHER_OPACITY_MIN,
  FLETCHER_OPACITY_STEP,
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
  describeThemeChanges,
  matchTheme,
  normalizeLayerOpacityOverrides,
  presentationOpacityOverrides,
  resolveTheme,
  themeStatesMatch,
  visibilityRecordFor,
  type ResolvedTheme,
  type ThemeComparableState,
} from "./themes/themeState";
import { ReturnNote } from "./components/ReturnNote";
import { SetupFirstStep } from "./components/SetupFirstStep";
import { fletcherSheets } from "./layers/fletcherLayer";
import { clearLastView, classifyOpening, offersReturn, readLastView, writeLastView, writeTabView, type LastView, type OpeningKind } from "./themes/returnMemory";
import { CURRENT_MONTH_NAMES, geometryBounds, nearestSheet, nextDatedTaxSale, shortSaleDate } from "./themes/setupFirstSteps";
import { FishingMapKey, PointTupperSetupKey, RhodenaMapKey, TaxSaleMapKey } from "./themes/setupMapKeys";
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
import type { ExportFields } from "./print/pdf/ExportDialog";

const ExportDialog = lazy(() =>
  import("./print/pdf/ExportDialog").then((module) => ({
    default: module.ExportDialog,
  })),
);
import { exportAttributionLines } from "./print/pdf/attributionLines";
import { buildExportLayers, contextExportOmission } from "./print/pdf/exportLayerSpecs";
import { basemapSource, type BasemapPreference, type BasemapStyle } from "./atlas/basemap";
import { atlasPalettes } from "./atlas/palette";
import { CROWN_SOURCE_URL, CROWN_NOTE, crownReceipt, crownReceiptUrl } from "./atlas/crown";
import { provincialReceipt, provincialReceiptUrl, provincialSourceDates, PROVINCIAL_ATTRIBUTION, PROVINCIAL_LICENCE_URL } from "./atlas/provincial";
import { LinkedText } from "./components/LinkedText";
import { useBasemapPreference } from "./atlas/useBasemapPreference";
import { DEFAULT_FRAME_STATE, type FrameState } from "./print/pdf/frameGeometry";
import type { PdfTemplateId } from "./print/pdf/templates/types";
import { useUserMaps } from "./userMaps/useUserMaps";
import { useGeoreferenceSession } from "./userMaps/useGeoreferenceSession";
import { UserMapControls } from "./userMaps/components/UserMapRows";
import { useUserLayers } from "./userLayers/useUserLayers";
import { UserLayerCredits } from "./userLayers/components/UserLayerCredits";
import { UserLayerControls } from "./userLayers/components/UserLayerControls";
import { userLayerUse } from "./userLayers/sourceMatch";
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

/**
 * The full map at the same view. A focus page's own filter and selection
 * (`month`, `spot`) mean nothing there, so they are left behind.
 */
function fullMapUrl(shareUrl: string): string {
  // Filtered as text so the rest of the query keeps its exact spelling.
  const query = new URL(shareUrl).search.replace(/^\?/u, "").split("&")
    .filter((part) => part !== "" && !/^(?:month|spot)=/u.test(part))
    .join("&");
  return new URL(`./${query ? `?${query}` : ""}`, document.baseURI).href;
}

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
  /** The map's Map/Aerial switch asked for the licensed aerial imagery. */
  | { kind: "aerial" }
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
  | { stage: "dialog"; bounds: PrintMapBounds; orientation: PdfTemplateId; frame: FrameState };

import { useDialogChrome } from "./components/useDialogChrome";

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
  ...contextLayerCatalog.map(({ id }) => id),
  ...forestryLayerCatalog.map(({ id }) => id),
  ...zoningLayerCatalog.map(({ id }) => id),
  ...wellLogLayerCatalog.map(({ id }) => id),
  ...liveConditionsLayerCatalog.map(({ id }) => id),
];

const restrictedThemeLayerIds = new Set<ShareLayerId>([
  ...provinceLayerCatalog.filter(({ licence }) => licence === "province-restricted").map(({ id }) => id),
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
  ...contextLayerCatalog
    .filter(({ licence }) => licence === "province-restricted")
    .map(({ id }) => id),
]);

/**
 * Searches that returned nothing, each with its next step. The wording of the
 * result stays exact: neither says the address or parcel does not exist.
 */
const SEARCH_EMPTY_NEXT_STEP: Readonly<Record<string, string>> = {
  "No mapped civic address matched that search.": "Try the road name alone, or an 8-digit PID.",
  "No NSPRD parcel was found for that PID.": "Check that it has 8 digits, or try the civic address.",
};

const themeLayerNames = new Map<ShareLayerId, string>([
  ["modern", "Base map"],
  ["fletcher", "Fletcher historical map"],
  ...provinceLayerCatalog.map(({ id, name }) => [id, name] as const),
  ...allResourceLayerCatalog.map(({ id, name }) => [id, name] as const),
  ...hydroPilotLayerCatalog.map(({ id, name }) => [id, name] as const),
  ...floodHazardLayerCatalog.map(({ id, name }) => [id, name] as const),
  ...environmentalHealthLayerCatalog.map(({ id, name }) => [id, name] as const),
  ...contextLayerCatalog.map(({ id, name }) => [id, name] as const),
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

/**
 * The same guard as above, one step earlier.
 *
 * `loadCustomThemes` and `saveCustomThemes` catch whatever their `getItem` and
 * `setItem` throw, but `window.localStorage` passed as an argument is
 * evaluated at the CALL SITE, outside that try — and in the browsers named
 * above the property access is itself what throws. Unguarded, the theme
 * library's first read threw out of App's render on every load, so those
 * readers met "The map stopped responding" and a Reload button that
 * reproduced it.
 *
 * A store that cannot be reached is reported as a store that could not be
 * read, never as an empty library: "you have saved nothing" and "your saved
 * setups could not be read" are different sentences to the reader.
 */
function reachableLocalStorage(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function reachableSessionStorage(): Storage | null {
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}

/** How much of the map the open phone sheet covers, so a setup's fit lands in the band above it. */
function phoneSheetCover(): number | undefined {
  if (!(window.matchMedia?.("(max-width: 860px)").matches ?? false)) return undefined;
  const sheet = document.querySelector(".layer-rail.mobile-open");
  return sheet ? Math.max(0, Math.round(window.innerHeight - sheet.getBoundingClientRect().top)) : undefined;
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
    // Optional: NSPRD can send "geometry": null, and the declared type says
    // what a stored parcel may be assumed to carry, not what the wire sends.
    visit((feature.geometry as { coordinates?: unknown } | null)?.coordinates);
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
    // honest state costs nothing if that gate ever loosens: nothing was asked
    // of the source, so the receipt must not call it unavailable.
    return {
      status: "not-asked",
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
  assessmentReady: boolean,
): PrintLoadState<PvscDwellingAccount[]> {
  if (!request || !isCurrentEvidenceRequest(state.request, request)) {
    return { status: "pending" };
  }
  if (state.status === "ready") {
    return { status: "ready", value: state.value };
  }
  // Three ways the dwelling dataset goes unasked, and none of them is the
  // source failing. Printing them as errors put "unavailable" on the receipt
  // for a lookup that was never run.
  if (state.status === "blocked") {
    return {
      status: "not-asked",
      message:
        "Dwelling lookup was not run because assessment account evidence was unavailable.",
    };
  }
  if (state.status === "no-account") {
    return {
      status: "not-asked",
      message:
        "No PVSC assessment account was matched to this parcel, so the dwelling dataset could not be asked about it.",
    };
  }
  if (state.status === "no-record-for-notice-aan") {
    return {
      status: "not-asked",
      message:
        "The municipal notice supplied an AAN, but PVSC returned no assessment record for it, so the dwelling dataset was not asked.",
    };
  }
  if (state.status === "geometry-unavailable") {
    return {
      status: "not-asked",
      message:
        "Not evaluated — this PID's NSPRD geometry is unavailable, so no assessment account could be matched and the dwelling dataset was not asked.",
    };
  }
  if (state.status === "error") {
    return {
      status: "error",
      message: "PVSC dwelling source unavailable at export time.",
    };
  }
  // Idle or loading. The dwelling request cannot start until the assessment
  // lookup supplies an account number, so while that is still out this slot
  // is not a source going quiet, and a capture that times out here must not
  // print it as one.
  return assessmentReady
    ? { status: "pending" }
    : {
        status: "pending",
        message:
          "The PVSC dwelling lookup had not started when this page was made: the assessment account lookup had not answered, so there was no account to ask with.",
      };
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
  basemapStyle: BasemapStyle = "osm",
): Map<ShareLayerId, PrintLayerSource> {
  const sources = new Map<ShareLayerId, PrintLayerSource>();
  sources.set("modern", basemapSource(basemapStyle));
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
    sourceUrl: layer.sourceUrl ?? layer.serviceUrl,
    sourceDate: layer.sourceDate,
    attribution: (layer.attribution ?? PROVINCE_ATTRIBUTION) + openDataPrintCredit(layer.openData),
    licenceUrl: layer.licenceUrl ?? PROVINCE_LICENSE_URL,
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
  contextLayerCatalog.forEach((layer) => sources.set(layer.id, {
    id: layer.id,
    name: layer.name,
    sourceUrl: layer.sourceUrl,
    sourceDate: layer.sourceDate,
    attribution: `${layer.attribution ?? (layer.licence === "province-restricted" ? PROVINCE_ATTRIBUTION : OPEN_GOVERNMENT_ATTRIBUTION)} ${layer.scale}. ${layer.webCaveat}${openDataPrintCredit(layer.openData)}`,
    licenceUrl: layer.licenceUrl,
    ...(layer.provenance ? { provenance: layer.provenance } : {}),
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
<h2 id="licence-title">Province data licence</h2>
        <p>
          NS Aerial, property boundaries and other marked provincial services
          need the Province’s restricted geographic services licence. Open-data
          layers, including Crown Land and Sentinel-2, stay available without it.
        </p>
        <p className="licence-caveat">
          Property boundaries are approximate and are not a legal survey.
        </p>
        <blockquote>{PROVINCE_ATTRIBUTION}</blockquote>
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
            <button className="text-button dialog-quiet-action" type="button" onClick={onClose}>
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
      {/* No tabIndex on the card: useDialogChrome then puts first focus on
          the × close, the first control, instead of ringing the whole card. */}
      <section
        ref={dialogRef}
        className="licence-dialog about-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="about-title"
      >
        <div className="dialog-header-row">
          <h2 id="about-title">About NS Marks The Spot</h2>
          <button className="dialog-close" type="button" aria-label="Close dialog" onClick={onClose}>
            <span aria-hidden="true">×</span>
          </button>
        </div>
        <p className="about-start">
          <strong>Start here:</strong> type a PID or civic address into the search box.
        </p>
        <p>
          An open-source map for screening Nova Scotia parcels: search by PID
          or civic address, see municipal tax-sale notices on live parcel
          geometry, and read the mapped evidence for any property. It is the
          online companion to a native iPhone app in development.
        </p>
        <h3>Nova Scotia’s public data, made useful</h3>
        <p>
          Atlas puts provincial roads, official place names, water features,
          woodland and municipal boundaries together in one readable map.
          It gives the public data we fund a practical home. OpenStreetMap
          supplies supplemental ocean context, land use and building footprints.
          Source dates and licences are available under Data &amp; licences.
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
        <h3>Who makes it</h3>
        <p>
          I have made maps for twenty years, mostly for forestry in Nova
          Scotia. This app is where that practice meets modern web
          engineering: every layer names its source, scale, and licence, the
          way a printed map sheet carries its legend and survey notes.
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
          <button className="secondary-action" type="button" onClick={onClose}>
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
const CREDIT_FOLD_LENGTH = 180;

/** Within the dialog, so the jump never touches the page's share URL. */
function jumpInDialog(event: { preventDefault: () => void }, id: string) {
  event.preventDefault();
  const target = document.getElementById(id);
  target?.scrollIntoView?.({ block: "start" });
  target?.focus?.({ preventScroll: true });
}

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
        className="licence-dialog about-dialog data-sources-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="data-sources-title"
      >
        <div className="dialog-header-row">
          <h2 id="data-sources-title">Data &amp; licences</h2>
          <button className="dialog-close" type="button" aria-label="Close dialog" onClick={onClose}>
            <span aria-hidden="true">×</span>
          </button>
        </div>
        <p>
          Every layer names its source, its published date, and its licence —
          the same receipts a printed export carries. Reviewing them changes
          nothing about what the map shows.
        </p>
        <details className="evidence-caveat data-sources-jump">
          <summary>Jump to a layer ({sources.length})</summary>
          <nav aria-label="Jump to a source">
            <a href="#atlas-sources-heading" onClick={(event) => jumpInDialog(event, "atlas-sources-heading")}>Atlas sources</a>
            {sources.map((source) => (
              <a key={source.id} href={`#data-source-${source.id}`} onClick={(event) => jumpInDialog(event, `data-source-${source.id}`)}>{source.name}</a>
            ))}
          </nav>
        </details>
        <section className="data-sources-section" aria-labelledby="atlas-sources-heading">
          <h3 id="atlas-sources-heading" tabIndex={-1} className="data-sources-kicker">Provincial-first Atlas sources</h3>
          <table className="data-sources-dates">
            <caption className="sr-only">Atlas source layers and their release dates</caption>
            <thead>
              <tr><th scope="col">Layer</th><th scope="col">Released</th></tr>
            </thead>
            <tbody>
              {provincialReceipt.sources.map(source => (
                <tr key={source.id}>
                  <th scope="row"><a href={source.url} target="_blank" rel="noreferrer">{source.name}</a></th>
                  <td>
                    {source.released.slice(0, 10)}
                    {source.frequency ? <small className="data-sources-cadence">{source.frequency === 'Annually' ? 'annual' : source.frequency.toLowerCase()} releases</small> : null}
                  </td>
                </tr>
              ))}
              <tr>
                <th scope="row"><a href={CROWN_SOURCE_URL} target="_blank" rel="noreferrer">Crown Land</a></th>
                <td>{crownReceipt.source.released.slice(0, 10)}</td>
              </tr>
            </tbody>
          </table>
          <p>{provincialReceipt.supplemental}</p>
          <p>Coverage: Nova Scotia. Use the OpenStreetMap basemap for worldwide detail.
            Release dates describe these downloads, not when every feature was surveyed.
            Provincial buildings remain an optional overlay; smaller buildings in that source are points.
            Woodland is generalized to at most two metres, and more coarsely below zoom 12.
            Source polygons with invalid rings are repaired and counted in the tile receipt.
            Records with missing source geometry are omitted and identified there too.</p>
          <p>{PROVINCIAL_ATTRIBUTION}. <a href={PROVINCIAL_LICENCE_URL} target="_blank" rel="noreferrer">Open-data licence</a>
            {" · "}<a href={provincialReceiptUrl()} target="_blank" rel="noreferrer">Generated tile receipt</a></p>
        </section>
        <h3 className="data-sources-kicker">Each map layer</h3>
        <ul className="data-sources-list">
          {sources.map((source) => {
            // The Atlas row's per-layer dates are the table above; its export
            // text repeats them (and its style note) a second time.
            const atlas = source.id === "modern" && source.sourceUrl === provincialReceiptUrl();
            const sourceDate = atlas
              ? source.sourceDate.replace(`${provincialSourceDates}. `, "").replace(/ Crown Land: \d{4}-\d{2}-\d{2}\./u, "").replace(/(Supplemental OSM context is live\.).*$/u, "$1 Layer dates: see the Atlas table above.")
              : source.sourceDate;
            const attribution = atlas
              ? source.attribution.replace(`${provincialSourceDates}. `, "")
              : source.attribution;
            return (
              <li key={source.id} id={`data-source-${source.id}`} tabIndex={-1}>
                <strong>{source.name}</strong>
                <dl className="data-source-fields">
                  <dt>Date</dt>
                  <dd><LinkedText text={sourceDate} /></dd>
                  <dt>Credit</dt>
                  <dd>
                    {/* A short credit reads in place. A long one is a whole
                        provenance receipt: the words are all kept, one tap on. */}
                    {attribution.length > CREDIT_FOLD_LENGTH ? (
                      <details className="evidence-caveat data-source-credit">
                        <summary>Full credit and method</summary>
                        <LinkedText text={attribution} />
                      </details>
                    ) : <LinkedText text={attribution} />}
                  </dd>
                  <dt>Links</dt>
                  <dd>
                    <a href={source.sourceUrl} target="_blank" rel="noreferrer">
                      {source.provenance === "project-derived" ? "Project source" : "Official source"}
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
                  </dd>
                </dl>
              </li>
            );
          })}
        </ul>
        <div className="dialog-actions">
          <button
            className="secondary-action"
            type="button"
            onClick={onReviewProvinceLicence}
          >
            Review the Province licence
          </button>
          <button className="secondary-action" type="button" onClick={onClose}>
            Close
          </button>
        </div>
      </section>
    </div>
  );
}

/**
 * `focus` opens the map as a single-purpose page (/rhodena, /fishing): its setup is
 * fixed, and the panel offers only the layers its definition names. Every
 * page-specific choice comes from `focusDefinitions` (src/focus/registry.ts).
 *
 * `onRestart` opens the map afresh on the address it has just been given, so
 * returning to a remembered view needs no page load and sends nothing anywhere.
 * `licencesPresented` says the licence strip has already opened by itself in
 * this page load, so a restart opens the map with it folded.
 */
export function App({ focus, onRestart, licencesPresented = false }: {
  focus?: FocusId;
  onRestart?: () => void;
  licencesPresented?: boolean;
} = {}) {
  const focusDef: FocusDefinition | undefined = focus ? focusDefinitions[focus] : undefined;
  const initialUrl = useRef(new URL(window.location.href)).current;
  const [initialCustomThemeLibrary] = useState(
    () => loadCustomThemes(reachableLocalStorage()),
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
  const { preference: basemapPreference, setPreference: setBasemapPreference, style: basemapStyle, appearance, setAppearance } =
    useBasemapPreference(initialShareState.basemapStyle);
  const hasRecognizedShareState = hasRecognizedMapShareState(initialUrl.href);
  const hasSharedLayers = initialUrl.searchParams.has("layers");
  const hasSharedEvents = initialUrl.searchParams.has("event");
  const hasSharedPosition = initialUrl.searchParams.has("position");
  /**
   * `?theme=` opens a built-in setup directly, including Poker's driveway
   * tools. Explicit layer state still takes precedence over the named setup.
   */
  const requestedTheme = builtInMapThemes.find(
    ({ id }) => id === (focusDef?.themeId ?? initialShareState.themeId),
  );
  // A camera bookmark does not override the layers of a named setup.
  const hasSharedSetupState = requestedTheme
    ? ["layers", "taxSale", "mode", "event"].some(key => initialUrl.searchParams.has(key))
    : hasRecognizedShareState;
  const initialCatalogueLayerIds = useRef(new Set<ShareLayerId>(
    hasSharedSetupState
      ? filterFocusLayerIds(focusDef, initialShareState.layerIds)
      : requestedTheme?.layerIds ?? ["modern"],
  )).current;
  // A page without tax sale also keeps the current (not historical) mode.
  const focusHidesTaxSale = focusHides(focusDef, "tax-sale");
  const initialTaxSaleEnabled = hasSharedSetupState && !focusHidesTaxSale
    ? initialShareState.taxSaleEnabled
    : requestedTheme?.taxSaleEnabled ?? false;
  const initialMapMode = focusHidesTaxSale ? "current" : hasSharedSetupState
    ? initialShareState.mode
    : requestedTheme?.mapMode ?? initialShareState.mode;
  const initialLicenceAccepted = useRef(isLicenceAccepted()).current;
  const initialNeedsLicence = (hasRecognizedShareState || requestedTheme !== undefined)
    && !initialLicenceAccepted
    && [...initialCatalogueLayerIds].some((id) =>
      restrictedThemeLayerIds.has(id),
    );
  const initialComparableState: ThemeComparableState = {
    layerIds: [...initialCatalogueLayerIds],
    opacityOverrides: {},
    taxSaleEnabled: initialTaxSaleEnabled,
    mapMode: initialMapMode,
  };
  const initialThemeMatch = useRef(
    matchTheme(initialComparableState, initialMapThemes),
  ).current;
  const initialRequestedTheme = useRef(
    requestedTheme && themeStatesMatch(initialComparableState, requestedTheme)
      ? requestedTheme
      : undefined,
  ).current;
  // The camera a link without `position` opens on: the focus page's own, or
  // on the full map, the requested setup's own camera (themes/themeCameras.ts),
  // else that of the focus page built on the setup.
  const initialThemeCamera = focusDef || hasSharedPosition ? undefined : themeCameraFor(initialRequestedTheme?.id);
  const cameraFocus = focusDef ?? (initialThemeCamera ? undefined : focusForTheme(initialRequestedTheme?.id));
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
    () => [...printLayerSources(fletcherTileConfiguration.baseUrl, basemapStyle).values()],
    [fletcherTileConfiguration.baseUrl, basemapStyle],
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
      ...contextLayerCatalog.map(({ id }) => id),
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
    initialRequestedTheme?.id
      ?? (hasRecognizedShareState
        ? initialThemeMatch?.id ?? null
        : "explore-nova-scotia"),
  );
  // A page whose area is wider than its opening zoom shows on a phone fits
  // that area on open, unless the link brings its own camera. The full map
  // opening that page's setup borrows its camera, so it fits the same way.
  const [focusFit, setFocusFit] = useState<FocusFitRequest>(() => {
    if (initialThemeCamera?.kind === "fit") return { revision: 1, bounds: initialThemeCamera.bounds };
    // A focus page's sheet opens on arrival on a phone (below); frame the area
    // in the map left above it. 80px is the attribution strip and the sheet's gap.
    const sheetShare = focusDef?.phoneSheetShare;
    const opensOnSheet = Boolean(focusDef) && sheetShare !== undefined
      && (window.matchMedia?.("(max-width: 860px)").matches ?? false);
    // A page with its own phone frame fits there even if a desktop opens on its position.
    if (!cameraFocus || (!cameraFocus.fitOnOpen && !(opensOnSheet && focusDef?.phoneFitBounds)) || hasSharedPosition) return { revision: 0, bounds: null };
    return {
      revision: 1,
      bounds: opensOnSheet ? focusDef?.phoneFitBounds ?? cameraFocus.fitBounds : cameraFocus.fitBounds,
      insetRight: cameraFocus.mapOverlayInset,
      insetBottom: opensOnSheet && sheetShare !== undefined ? Math.round(window.innerHeight * sheetShare) + 80 : undefined,
    };
  });
  // The full map borrowing a page's camera shows the same key, so it clears the same width.
  const requestFocusFit = useCallback((definition: FocusDefinition, insetBottom?: number) => {
    setFocusFit(({ revision }) => ({ revision: revision + 1, bounds: definition.fitBounds, insetRight: definition.mapOverlayInset, insetBottom }));
  }, []);
  // A setup's own opening camera. Its revision also tells MapCanvas's
  // LayerZoomController to leave the layer change that came with it alone.
  const [themeCamera, setThemeCamera] = useState<ThemeCameraRequest>(() =>
    initialThemeCamera ? { revision: 1, camera: initialThemeCamera } : { revision: 0, camera: null });
  const openThemeCamera = useCallback((themeId: string) => {
    const camera = focusDef ? undefined : themeCameraFor(themeId);
    if (!camera) {
      const themeFocus = focusForTheme(themeId);
      if (themeFocus) requestFocusFit(themeFocus, phoneSheetCover());
      return;
    }
    setThemeCamera(({ revision }) => ({ revision: revision + 1, camera }));
    if (camera.kind === "fit") setFocusFit(({ revision }) => ({ revision: revision + 1, bounds: camera.bounds, insetBottom: phoneSheetCover() }));
  }, [focusDef, requestFocusFit]);
  // A focus page's own filter and selection; only the parameters the page
  // shares are read from, and written back to, its links.
  const [focusPage, setFocusPage] = useState<FocusPageState>(() => ({
    ...EMPTY_FOCUS_PAGE_STATE,
    month: focusDef?.shareParams?.has("month") ? initialShareState.month ?? null : null,
    spotId: focusDef?.shareParams?.has("spot") ? initialShareState.spot ?? null : null,
  }));
  const updateFocusPage = useCallback((update: Partial<FocusPageState>) => {
    setFocusPage((current) => ({ ...current, ...update }));
  }, []);
  const [rhodenaPickPending, setRhodenaPickPending] = useState(false);
  const pokerMode = selectedThemeId === "poker";
  // The main map's memory of the reader's last view (themes/returnMemory.ts).
  // A focus page keeps its own state and stays out of it.
  const [lastViewAtOpen] = useState<LastView | null>(() => focusDef ? null : readLastView(reachableLocalStorage()));
  const [openingKind] = useState<OpeningKind>(() => focusDef
    ? "own"
    // A bare `?theme=` is a door into a setup, not someone's view: it neither says "link" nor offers anything back.
    : !hasRecognizedShareState && initialUrl.searchParams.has("theme")
      ? "own"
      : classifyOpening(initialUrl.search, hasRecognizedShareState, lastViewAtOpen, reachableSessionStorage()));
  const [returnNoteOpen, setReturnNoteOpen] = useState(
    () => openingKind === "link" || (openingKind === "plain" && offersReturn(lastViewAtOpen)),
  );
  const [openingThemeId] = useState(selectedThemeId);
  // A link's view never overwrites the reader's own until they keep it.
  const fromLinkRef = useRef(openingKind === "link");
  // The address the map writes before the reader has done anything is not worth remembering.
  const firstShareSearchRef = useRef<string | null>(null);
  const [pokerAddress, setPokerAddress] = useState<CivicAddress | null>(null);
  const [pokerRevision, setPokerRevision] = useState(0);
  const [pokerCivicStatus, setPokerCivicStatus] = useState("Zoom in to see civic numbers.");
  const pokerSearchRef = useRef<HTMLInputElement>(null);
  const selectPokerQueryOnClick = useRef(false);
  const [themeResult, setThemeResult] = useState<ResolvedTheme | null>(null);
  const [customThemes, setCustomThemes] = useState<CustomMapThemeDefinition[]>(
    initialCustomThemes,
  );
  const [themeLibraryNotice, setThemeLibraryNotice] = useState<string | null>(
    () => initialCustomThemeLibrary.status === "fatal"
      ? hasRecognizedShareState
        ? `${initialCustomThemeLibrary.warning} Saved setups are unavailable for this session.`
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
  // A fresh focus-page link on a phone opens on the page's summary; a shared
  // view goes straight to its map.
  const [mobileControlsOpen, setMobileControlsOpen] = useState(
    () => Boolean(focusDef) && !hasRecognizedShareState
      && (window.matchMedia?.("(max-width: 860px)").matches ?? false),
  );
  // The phone sheet opens at half height, so the map it changes stays in
  // view; dragging or tapping its grabber, typing, or scrolling the list
  // takes it to full height. Point Tupper's page keeps its own sheet.
  const [sheetDetent, setSheetDetent] = useState<"half" | "full">("half");
  const sheetDetents = focusDef?.id !== "pointtupper";
  const sheetDragRef = useRef<{ y: number; pointerId: number } | null>(null);
  // A drag that starts on the grabber ends in a click on it; that click is not a tap.
  const sheetDraggedRef = useRef(false);
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
        // The sheet and its trigger are display:none above this width, so a
        // sheet left open is an open dialog nobody can see or close, holding
        // focus on a hidden button. Closing it here also means the opening
        // effect runs again — and hands focus over again — if the reader
        // comes back below the breakpoint.
        if (mobileControlsRef.current?.contains(document.activeElement)) {
          mapRegionRef.current?.focus({ preventScroll: true });
        }
        setMobileControlsOpen(false);
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
  // The sheet is a disclosure, not a dialog: the trigger carries
  // aria-controls and aria-expanded, the rail keeps its complementary role and
  // its "Map controls" name at every width, nothing behind it is inerted, and
  // the attribution strip is deliberately left reachable while it is open. So
  // focus travels with the sheet and is never trapped inside it.
  const mobileControlsRef = useRef<HTMLElement | null>(null);
  const mobileControlsTriggerRef = useRef<HTMLButtonElement>(null);
  const mobileSheetCloseRef = useRef<HTMLButtonElement>(null);
  // Opening the sheet without moving focus leaves a keyboard reader behind it,
  // with the next Tab restarting at the top of the document, and leaves a
  // screen reader on the map the sheet now covers. The Close button is the
  // first control inside and the way back out, so it is where focus lands; the
  // sheet header is sticky, so landing there scrolls nothing.
  // A focus page's sheet that is already open on load is the first thing in
  // the document, so the first Tab reaches its Close button anyway; moving
  // focus there unasked would only draw a focus ring over the summary. Focus
  // moves once the sheet has been closed and is opened again.
  const sheetHasClosedRef = useRef(false);
  useEffect(() => {
    if (!mobileControlsOpen) {
      sheetHasClosedRef.current = true;
      setSheetDetent("half");
      return;
    }
    if (!sheetHasClosedRef.current) return;
    mobileSheetCloseRef.current?.focus({ preventScroll: true });
  }, [mobileControlsOpen]);
  const closeMobileControls = useCallback(() => {
    // Only reclaim focus that was still inside the sheet, and read that before
    // the state change, because closing is what takes the sheet off screen. A
    // close that came from elsewhere has already put focus where it belongs.
    // Above the sheet's 860px breakpoint CSS alone stops rendering the rail as
    // a sheet and hides the trigger again, and nothing here closes the sheet
    // for a viewport change, so a window that grows past that breakpoint
    // leaves the reader's focus exactly where it was.
    const returnFocus =
      mobileControlsRef.current?.contains(document.activeElement) ?? false;
    setMobileControlsOpen(false);
    if (returnFocus) mobileControlsTriggerRef.current?.focus();
  }, []);
  // Above the sheet's breakpoint the rail is always on screen, and an "open"
  // sheet there would be one nobody can see or close, so this does nothing.
  const openMobileControls = useCallback(() => {
    if (window.matchMedia?.("(max-width: 860px)").matches) setMobileControlsOpen(true);
  }, []);
  const selectFocusSpot = useCallback((spotId: string | null) => {
    setFocusPage((current) => current.spotId === spotId ? current : { ...current, spotId });
  }, []);
  const openFocusSpotCard = useCallback((spotId: string) => {
    setFocusPage((current) => ({ ...current, spotId, panelReveal: current.panelReveal + 1 }));
    openMobileControls();
  }, [openMobileControls]);
  // Choosing a parcel from inside the sheet closes it too, and focus cannot
  // go back to the trigger: the parcel is what the screen is now about. It
  // goes where the parcel panel's own close hands it, the map region that
  // contains the panel and the map both.
  const handOffSheetFocus = useCallback(() => {
    if (mobileControlsRef.current?.contains(document.activeElement)) {
      mapRegionRef.current?.focus({ preventScroll: true });
    }
  }, []);
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
      if (event.key !== "Escape") {
        return;
      }
      // Asked of the document rather than of this component's state: the
      // sheet is App's, but the photo lightbox, the save-track dialog and the
      // export dialog belong to the map, and App cannot name what it does not
      // hold. A modal is open or it is not, and while one is, Escape is its.
      if (document.querySelector('[role="dialog"][aria-modal="true"]')) {
        return;
      }
      closeMobileControls();
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [
    closeMobileControls,
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
  const [mailingSearchNotice, setMailingSearchNotice] = useState<string | null>(null);
  const [addressSearchResults, setAddressSearchResults] = useState<
    MailingCivicAddress[]
  >([]);
  const [searchingAddresses, setSearchingAddresses] = useState(false);
  const [activeAddressIndex, setActiveAddressIndex] = useState(-1);
  const [selectedPid, setSelectedPid] = useState<string | null>(
    initialShareState.pid,
  );
  const selectionGeneration = useRef(initialShareState.pid ? 1 : 0);
  // Closing the parcel inspector unmounts it, and focus would otherwise fall
  // to <body> — the next Tab would restart at the top of the document. The
  // map region is the panel's own container, so it is where focus goes back
  // to. A programmatic landing spot only, never a tab stop.
  const mapRegionRef = useRef<HTMLElement | null>(null);
  const attributionRef = useRef<HTMLElement | null>(null);
  // The electoral legend shares the lower-left slot with the readouts and the
  // measure hint. Its height varies with the mode, so it is measured, and what
  // sits above it rises by that much.
  const mapLegendsRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const legends = mapLegendsRef.current;
    const region = mapRegionRef.current;
    if (!legends || !region) return;
    const measure = () => {
      const height = Math.ceil(legends.getBoundingClientRect().height);
      region.style.setProperty("--lower-left-legend", height > 0 ? `${height + 8}px` : "0px");
    };
    measure();
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(measure);
    observer?.observe(legends, { box: "border-box" });
    return () => observer?.disconnect();
  }, []);
  useEffect(() => {
    const footer = attributionRef.current;
    const shell = footer?.parentElement;
    if (!footer || !shell) return;
    const measure = () => shell.style.setProperty(
      "--map-attribution-height", `${Math.ceil(footer.getBoundingClientRect().height)}px`,
    );
    measure();
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(measure);
    observer?.observe(footer, { box: "border-box" });
    return () => {
      observer?.disconnect();
      shell.style.removeProperty("--map-attribution-height");
    };
  }, []);
  // Present source credits when the page opens, then give the map its space
  // back. Once the strip has folded or the reader has used it, later setup
  // changes leave it as the reader left it: on a phone the open strip covers
  // up to 38% of the screen. A setup that settles while the page is still
  // opening restarts the timer, as before. Reading or reopening the footer
  // cancels automatic folding.
  const [attributionCollapsed, setAttributionFolded] = useState(licencesPresented);
  const cancelAttributionFold = useRef<() => void>(() => {});
  const attributionPresented = useRef(licencesPresented);
  useEffect(() => {
    if (attributionPresented.current) return;
    const region = mapRegionRef.current;
    const footer = attributionRef.current;
    const cancel = () => {
      window.clearTimeout(timer);
      region?.removeEventListener("pointerdown", fold);
      footer?.removeEventListener("focusin", read);
      footer?.removeEventListener("pointerdown", read);
    };
    // Reading the strip ends the automatic presentation as surely as folding.
    const read = () => {
      cancel();
      attributionPresented.current = true;
    };
    const fold = () => {
      cancel();
      attributionPresented.current = true;
      setAttributionFolded(true);
    };
    const timer = window.setTimeout(fold, 5000);
    cancelAttributionFold.current = cancel;
    region?.addEventListener("pointerdown", fold, { once: true, passive: true });
    footer?.addEventListener("focusin", read);
    footer?.addEventListener("pointerdown", read, { passive: true });
    return cancel;
  }, [selectedThemeId]);
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
  const [storedEvidenceRequest, setSelectedEvidenceRequest] = useState<
    SelectedEvidenceRequest | null
  >(() => initialShareState.pid
    ? { pid: initialShareState.pid, generation: selectionGeneration.current }
    : null);
  // Retain the request for a return to research; Poker does not fetch inspector evidence.
  const selectedEvidenceRequest = pokerMode ? null : storedEvidenceRequest;
  const [parcelFocusRequest, setParcelFocusRequest] =
    useState<ParcelFocusRequest | null>(null);
  const [parcelLookupMessage, setParcelLookupMessage] = useState<string | null>(
    null,
  );

  useEffect(() => {
    // Good news dismisses itself; a caution stays until the state changes.
    // "PID 50251750 selected." is the whole of the good news, so the rule
    // matches the whole sentence: the shared-boundary notice starts the same
    // way and then says the choice was not a determination, and a reader who
    // looked away for six seconds would be left with only the good half.
    if (
      !parcelLookupMessage ||
      !/^PID \d+ selected( from shared map state)?\.$/.test(parcelLookupMessage)
    ) {
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
  const [riverFlood, setRiverFlood] = useState<RiverFloodState>({
    status: initialShareState.pid ? "loading" : "idle",
    request: initialShareState.pid
      ? { pid: initialShareState.pid, generation: selectionGeneration.current }
      : null,
  });
  const [coastalFlood, setCoastalFlood] = useState<CoastalFloodState>({
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
  const [mapMode, setMapMode] = useState<MapMode>(initialMapMode);
  const [taxSaleEnabled, setTaxSaleEnabled] = useState(
    initialTaxSaleEnabled,
  );
  /**
   * Where the map is aimed, [lon, lat], for the vector panel's corner mover.
   * Separate from `mapViewport` on purpose: that one is suppressed while a
   * printable-viewport request is in flight, which is right for printing and
   * wrong for a control whose whole job is to say where a corner would land.
   */
  const [mapCentre, setMapCentre] = useState<[number, number] | null>(null);
  /**
   * Stable, and identity-stable in what it stores. `MapPositionController`
   * re-subscribes whenever this callback's identity changes and reports the
   * position as it does — so an inline arrow storing a fresh array would
   * render, re-subscribe, store, and render again without end.
   */
  const reportMapCentre = useCallback(
    (position: { latitude: number; longitude: number } | null) => {
      setMapCentre((current) => {
        if (!position) {
          // Moving. The centre is somewhere between where it was and where it
          // is going, and a control that puts a corner AT the centre is
          // better told there is no answer than given the wrong one.
          return null;
        }
        return current &&
          current[0] === position.longitude &&
          current[1] === position.latitude
          ? current
          : [position.longitude, position.latitude];
      });
    },
    [],
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
    initialCatalogueLayerIds.has("sentinel-2") ||
    (licenceAccepted && initialCatalogueLayerIds.has("ns-topographic")) ||
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
  // A shared link may carry the fade it was made with (`opacity=fletcher:40`).
  const [fletcherOpacity, setFletcherOpacity] = useState(
    () => initialShareState.fletcherOpacity ?? fletcherLayerCatalog.opacity,
  );
  // A setup's opacity for a context layer (Fishing quiets the park fills).
  // Set only by applying a setup; the layer's own catalogue opacity otherwise.
  const [contextOpacityOverrides, setContextOpacityOverrides] = useState<
    Partial<Record<ContextLayerId, number>>
  >(() => presentationOpacityOverrides(
    initialRequestedTheme ?? (initialThemeMatch?.kind === "built-in" ? initialThemeMatch : undefined),
  ) as Partial<Record<ContextLayerId, number>>);
  const [fletcherRetryToken, setFletcherRetryToken] = useState(0);
  const [fletcherFeaturesVisible, setFletcherFeaturesVisible] = useState(true);
  const [fletcherFeaturesStatus, setFletcherFeaturesStatus] = useState('Reviewed historical annotations');
  const intendedInitialProvinceLayers = useRef(
    visibilityRecordFor(
      provinceLayerCatalog.map(({ id }) => id),
      initialCatalogueLayerIds,
    ),
  ).current;
  const [provinceLayers, setProvinceLayers] = useState(
    () => Object.fromEntries(provinceLayerCatalog.map((layer) => [layer.id, intendedInitialProvinceLayers[layer.id] && (layer.licence === "province-open" || licenceAccepted)])) as Record<ProvinceLayerId, boolean>,
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
  const [electoralModes, setElectoralModes] = useState(() => Object.entries(initialShareState.electoralModes ?? {}).reduce((modes,[id,mode]) => withElectoralMode(modes,id as ElectoralLayerId,mode), initialElectoralModes));
  const [electoralSelection, setElectoralSelection] = useState<ElectoralSelection | null>(null);
  const [contextLayers, setContextLayers] = useState(
    () => visibilityRecordFor(
      contextLayerCatalog.map(({ id }) => id),
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
      initialRequestedTheme?.preferredCategoryIds
        ?? (hasRecognizedShareState
          ? initialThemeMatch?.preferredCategoryIds ?? []
          : ["background-maps"]),
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
  const userLayersApi = useUserLayers();
  const [userLayerStatuses, setUserLayerStatuses] = useState<Record<string, string>>({});
  const onUserLayerStatus = useCallback((id: string, status: string) => setUserLayerStatuses(current => current[id] === status ? current : { ...current, [id]: status }), []);
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

  // Refuses while a photo is still being added: a photo that finishes after
  // its session has closed is deleted. The controls that call this are held
  // for the same reason, so this is for the one caller that is not a click —
  // "New drawing layer" opens its layer only after the store has answered,
  // and an attach can start in between. Checked here, before any reset,
  // rather than in the session: refusing there would leave the selection
  // cleared over a session still open. Read through the ref, because that
  // caller resumes after an await.
  const beginVectorEdit = useCallback(
    (id: string): boolean => {
      if (vectorEditRef.current.photoAttachRunning) {
        return false;
      }
      setDrawMode(null);
      setSelectedFeatureId(null);
      setSnapTargets(DEFAULT_SNAP_TARGETS);
      setParcelSnapStatus({ status: "idle" });
      setConvertShape(null);
      vectorEdit.beginEdit(id);
      return true;
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
  // Remove is not Done. Done flushes the debounce so the last edit lands;
  // Remove asks for the layer to be gone, and flushing would start a write
  // that reaches the store after the delete and report the user's own
  // removal as another tab's. The panel state only needs re-arming when the
  // layer going is the one under edit.
  const abandonVectorLayer = useCallback(
    (layerId: string) => {
      if (vectorEdit.editingId === layerId) {
        setDrawMode(null);
        setSelectedFeatureId(null);
        setSnapTargets(DEFAULT_SNAP_TARGETS);
        setParcelSnapStatus({ status: "idle" });
        setConvertShape(null);
      }
      vectorEdit.abandonLayer(layerId);
    },
    [vectorEdit],
  );

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
    // Refused only when a photo attach started while the layer was being
    // created. The new layer stays in the list to open once it has finished,
    // and the open session's tools are left as they were.
    if (beginVectorEdit(id)) {
      setDrawMode("Marker");
    }
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
        // so the point is on the map and its write has not answered yet. If
        // that write fails, the panel says so while this session is open, and
        // the map's write-failure notice says so — naming the layer — if the
        // write answers after it closed.
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
      /** True only for a walk recovered from an interrupted session. */
      interrupted: boolean;
      /** Set when this is a retry of a save the device already refused. */
      replaceLayerId?: string;
    }): Promise<{ message: string; persisted: boolean; layerId: string }> => {
      const { record, persisted } = await userVectorApi.createRecordedLayer(input);
      // "Saved" only when it was: a track the device refused is on the map and
      // nowhere else, and the map must not say otherwise.
      return {
        message: persisted
          ? `Track saved as "${record.name}".`
          : `Track "${record.name}" is on the map, but it couldn't be written ` +
            `to this device — it stays until you close the tab.`,
        persisted,
        // The layer this walk is on, so a retry can be aimed at it instead of
        // adding a second copy.
        layerId: record.id,
      };
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
  const effectiveContextLayers = useMemo<
    Record<ContextLayerId, boolean>
  >(
    () => Object.fromEntries(
      contextLayerCatalog.map((layer) => [
        layer.id,
        contextLayers[layer.id] &&
          !layer.unavailableReason &&
          (layer.licence !== "province-restricted" || licenceAccepted),
      ]),
    ) as Record<ContextLayerId, boolean>,
    [contextLayers, licenceAccepted],
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

  /**
   * Whether a coastal projection is on screen, which the OGL–NS test below
   * deliberately excludes. Excluding them stopped the wrong licence being
   * claimed but left the right one unsaid: section 4.1 of the unrestricted
   * licence asks for its notices on every reproduction, and a layer drawn on
   * the map is one.
   */
  const coastalLayerVisible = useMemo(
    () =>
      floodHazardLayerCatalog.some(
        (layer) =>
          layer.licenceUrl === COASTAL_HAZARD_LICENCE_URL &&
          effectiveFloodHazardLayers[layer.id],
      ),
    [effectiveFloodHazardLayers],
  );

  /** Any visible layer whose licence mandates the OGL–NS statement. */
  const oglLayerVisible = useMemo(
    () =>
      provinceLayerCatalog.some((layer) => layer.licence === "province-open" && provinceLayers[layer.id]) ||
      Object.values(forestryLayers).some(Boolean) ||
      Object.values(wellLogLayers).some(Boolean) ||
      environmentalHealthLayerCatalog.some(
        (layer) =>
          layer.licence !== "province-restricted" &&
          effectiveEnvironmentalHealthLayers[layer.id],
      ) ||
      contextLayerCatalog.some(
        (layer) =>
          layer.licence !== "province-restricted" && !layer.attribution &&
          effectiveContextLayers[layer.id],
      ) ||
      floodHazardLayerCatalog.some(
        (layer) =>
          layer.licence !== "province-restricted" &&
          layer.licenceUrl !== COASTAL_HAZARD_LICENCE_URL &&
          effectiveFloodHazardLayers[layer.id],
      ),
    [
      provinceLayers,
      effectiveEnvironmentalHealthLayers,
      effectiveContextLayers,
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
  const shareCopySequence = useRef(0);
  const printCaptureSequence = useRef(0);
  const [printCapture, setPrintCapture] = useState<PrintCapture | null>(null);
  const [exportSession, setExportSession] =
    useState<GeoPdfExportSession | null>(null);
  // Typed words survive going back to the frame, or a Cancel and a return.
  const exportDraft = useRef<Partial<ExportFields> | null>(null);
  const addressSearchController = useRef<AbortController | null>(null);
  const addressSearchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pointLookupController = useRef<AbortController | null>(null);
  const historicalLoadAttempted = useRef(false);
  /** Timestamp of the last address-bar write; see the throttle below. */
  const lastShareUrlWriteRef = useRef(0);

  useEffect(
    () => () => {
      if (addressSearchTimer.current !== null) clearTimeout(addressSearchTimer.current);
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
  const pendingGeometryFetchRef = useRef<SelectedEvidenceRequest | null>(null);
  const taxSaleEnabledRef = useRef(taxSaleEnabled);
  const mapModeRef = useRef(mapMode);
  useEffect(() => {
    taxSaleEnabledRef.current = taxSaleEnabled;
    mapModeRef.current = mapMode;
  }, [mapMode, taxSaleEnabled]);

  /**
   * How the parcel's own geometry resolved, for the note.
   *
   * "The geometry is unavailable" is what every dependent source can say;
   * WHY it is unavailable is a fact about NSPRD, and the two outcomes are
   * different evidence: a service that answered with no parcel for this PID,
   * and a service that did not answer. The live message says which, and the
   * exported note used to carry neither.
   */
  const [geometryOutcome, setGeometryOutcome] = useState<
    "returned-empty" | "source-error" | "unusable-geometry" | null
  >(null);

  const markGeometryEvidenceTerminal = useCallback(
    (
      request: SelectedEvidenceRequest,
      status: "geometry-unavailable" | "error",
    ) => {
      // `status` is what happened to the GEOMETRY, and every source below
      // depends on it. "error" therefore belongs to a source that answered
      // badly — never to one this never asked because the outline never
      // arrived. The call sites pass "geometry-unavailable" for a failed
      // NSPRD fetch and report that outage once, in the lookup message.
      setMappedContext((current) =>
        isCurrentEvidenceRequest(current.request, request)
          ? { status, value: EMPTY_PARCEL_CONTEXT, request }
          : current);
      setBuildingCount((current) =>
        isCurrentEvidenceRequest(current.request, request)
          ? { status, request }
          : current);
      setRiverFlood((current) =>
        isCurrentEvidenceRequest(current.request, request)
          ? { status, request }
          : current);
      setCoastalFlood((current) =>
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
        // Including a ready one: with no geometry and no notice, a ready
        // assessment can only be one a notice supplied before the reader
        // turned tax-sale information off, and it would go on claiming a
        // match from a notice the panel no longer shows.
        setAssessmentState((current) =>
          isCurrentEvidenceRequest(current.request, request)
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
      (pendingGeometryFetchRef.current?.pid === selectedPid
        && pendingGeometryFetchRef.current.generation === selectionGeneration.current) ||
      parcels.features.some(({ properties }) => properties.PID === selectedPid)
    ) {
      return;
    }
    const request = selectedEvidenceRequest;

    const controller = new AbortController();
    fetchParcels([selectedPid], controller.signal)
      .then((collection) => {
        if (controller.signal.aborted || request?.generation !== selectionGeneration.current) return;
        if (collection.features.length === 0) {
          setParcelLookupMessage(`No NSPRD parcel was found for PID ${selectedPid}.`);
          setGeometryOutcome("returned-empty");
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
        if (controller.signal.aborted || request?.generation !== selectionGeneration.current) return;
        setParcelLookupMessage("The shared PID could not be loaded right now.");
        setGeometryOutcome("source-error");
        if (request) {
          markGeometryEvidenceTerminal(request, "geometry-unavailable");
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
  // Only the parts with a polygon to ask against. A feature NSPRD returns
  // with an unusable geometry cannot be queried, drawn or measured, and every
  // spatial lookup would answer emptily for it — a panel of clean negatives
  // about a parcel nothing was asked about.
  const selectedParcelFeatures = useMemo(() => {
    const next = selectedPid
      ? parcels.features.filter(
          ({ properties }) => properties.PID === selectedPid,
        ).filter(hasQueryablePolygon)
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

  /**
   * The parcels with a polygon to draw, which is also the set that can be
   * asked about.
   *
   * `parcels` keeps every feature NSPRD answered with, because the terminal
   * geometry-unavailable decision below has to know the PID was answered for
   * at all. What reaches Leaflet and the print map is this: `L.geoJSON` reads
   * `coordinates.length` and throws on a null geometry, taking the map down
   * before the panel could say the geometry was unusable.
   */
  const drawableParcels = useMemo(
    () => ({
      type: "FeatureCollection" as const,
      features: parcels.features.filter(hasQueryablePolygon),
    }),
    [parcels],
  );

  // NSPRD answered for the PID, but with nothing this build can query
  // against. Every evidence effect below bails on an empty feature list, so
  // without this the panel would sit on "Checking…" for a condition already
  // known — and the sources that do answer without geometry would leave the
  // rest reading as clean negatives.
  useEffect(() => {
    if (!selectedPid || !selectedEvidenceRequest) return;
    if (selectedParcelFeatures.length > 0) return;
    if (!parcels.features.some(({ properties }) => properties.PID === selectedPid)) {
      return;
    }
    setGeometryOutcome("unusable-geometry");
    markGeometryEvidenceTerminal(selectedEvidenceRequest, "geometry-unavailable");
  }, [
    // mapMode and taxSaleEnabled are inputs, not noise: they decide whether a
    // notice AAN is still standing in for the missing geometry.
    mapMode,
    markGeometryEvidenceTerminal,
    parcels,
    selectedEvidenceRequest,
    selectedParcelFeatures,
    selectedPid,
    taxSaleEnabled,
  ]);

  // A caution belongs to the selection it was raised for. The shared-boundary
  // notice deliberately outlives the success toast, so without this it would
  // outlive the parcel too and name a PID nothing has selected.
  useEffect(() => {
    setParcelLookupMessage((current) => {
      if (!current) return current;
      const named = /^PID (\d+) /u.exec(current)?.[1];
      if (!named) return current;
      return named === selectedPid ? current : null;
    });
  }, [selectedPid]);

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
      // A failed assessment lookup and a missing outline are different
      // reasons the dwelling dataset went unasked. "blocked" claims a source
      // outage, which never happened on the geometry path.
      setDwellingState({
        status: assessmentState.status === "error" ? "blocked" : assessmentState.status,
        request: assessmentState.request,
      });
      return;
    }

    const request = assessmentState.request;
    const aans = assessmentState.value.accounts.map(({ aan }) => aan);
    if (aans.length === 0) {
      // No account is no question, not a dataset that answered no — and a
      // notice that supplied an AAN PVSC has no record for is a third thing
      // again: an account WAS available, and the assessment dataset answered.
      setDwellingState({
        status:
          assessmentState.value.matchMethod === "notice-aan"
            ? "no-record-for-notice-aan"
            : "no-account",
        request,
      });
      return;
    }

    const controller = new AbortController();
    setDwellingState({ status: "loading", request });
    fetchDwellingCharacteristics(aans, controller.signal)
      .then((value) => {
        if (controller.signal.aborted) return;
        // Only a state still waiting for THIS request may be answered. The
        // generation alone is not enough: a geometry-unavailable transition
        // keeps it, so a late answer to a question the app stopped asking
        // could put a notice-derived result back after the reader had turned
        // tax-sale information off.
        setDwellingState((current) =>
          isCurrentEvidenceRequest(current.request, request) &&
          current.status === "loading"
            ? { status: "ready", value, request }
            : current,
        );
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        if (error instanceof DOMException && error.name === "AbortError") {
          return;
        }
        setDwellingState((current) =>
          isCurrentEvidenceRequest(current.request, request) &&
          current.status === "loading"
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
    // Asked apart, settled apart. Joined in one promise, a coastal raster that
    // never came back kept an answered river result off the panel, and the
    // print capture's fifteen-second timeout sealed it as a source that had
    // not answered. The reverse held too: a hanging river query sank three
    // answered coastal scenarios.
    fetchPublishedRiverFloodEvidence(selectedFeatures, controller.signal)
      .then((value) => {
        // Same reason as the coastal answer below: the abort is what says
        // this was measured against an outline the map has moved on from.
        if (controller.signal.aborted) return;
        setRiverFlood((current) =>
          isCurrentEvidenceRequest(current.request, request)
            ? { status: "ready", value, request }
            : current,
        );
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setRiverFlood((current) =>
          isCurrentEvidenceRequest(current.request, request)
            ? { status: "error", request }
            : current,
        );
      });
    fetchCoastalFloodEvidence(
      selectedFeatures,
      mappedArea?.squareMetres ?? null,
      controller.signal,
    )
      .then((value) => {
        // The generation moves with the selection, not with the geometry: a
        // second polygon arriving for the same PID restarts this effect
        // without changing it. The abort is what says this answer was
        // measured against an outline the map has moved on from.
        if (controller.signal.aborted) return;
        setCoastalFlood((current) =>
          isCurrentEvidenceRequest(current.request, request)
            ? { status: "ready", value, request }
            : current,
        );
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setCoastalFlood((current) =>
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
        // A parcel with no polygon to ask inside was never asked; calling
        // that a source error would blame a service that was never reached.
        const status =
          error instanceof CivicAddressGeometryError
            ? ("geometry-unavailable" as const)
            : ("error" as const);
        setCivicAddresses((current) =>
          isCurrentEvidenceRequest(current.request, request)
            ? { status, value: EMPTY_CIVIC_ADDRESSES, request }
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
  // Same notices and filter as filteredTaxSalePids; bands follow the clock.
  const taxSaleDateBands = useMemo(
    () =>
      taxSaleDateBandsByPid(
        taxSaleEvents.filter(({ id }) => selectedEventIds.has(id)),
        currentTime,
        (listing) => listingMatchesTaxSaleFilter(listing, taxSaleFilter),
      ),
    [currentTime, selectedEventIds, taxSaleFilter],
  );

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
    setContextLayers(visibilityRecordFor(
      contextLayerCatalog.map(({ id }) => id),
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
    setContextOpacityOverrides(
      presentationOpacityOverrides(resolved.target) as Partial<Record<ContextLayerId, number>>,
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

    if (themeId === "poker" || selectedThemeId === "poker") {
      addressSearchController.current?.abort();
      pointLookupController.current?.abort();
      if (addressSearchTimer.current !== null) clearTimeout(addressSearchTimer.current);
      setAddressSearchResults([]);
      setSearchingAddresses(false);
      setParcelLookupMessage(null);
      setSelectedPid(null);
      setPokerAddress(null);
      setPokerRevision((value) => value + 1);
    }
    setSelectedThemeId(themeId);
    openThemeCamera(themeId);
    if (themeId === "poker") setMobileControlsOpen(false);
    applyResolvedTheme(resolveTheme(theme, {
      licenceAccepted,
      availableLayerIds: availableThemeLayerIds,
      restrictedLayerIds: restrictedThemeLayerIds,
    }));
  }, [applyResolvedTheme, availableThemeLayerIds, licenceAccepted, mapThemes, openThemeCamera, selectedThemeId]);

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
        openThemeCamera(theme.id);
        if (theme.id === "poker") setMobileControlsOpen(false);
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
      // The page-load setup's licensed layers arrive now, after its camera
      // has landed; re-issue that camera so it, not the layers, frames the map.
      if (initialThemeCamera && selectedThemeId === initialRequestedTheme?.id) {
        openThemeCamera(selectedThemeId);
      }
    } else if (licenceIntent?.kind === "aerial") {
      showAerialBackground(true);
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
        openThemeCamera(theme.id);
        if (theme.id === "poker") setMobileControlsOpen(false);
        applyResolvedTheme(resolveTheme(theme, {
          licenceAccepted: false,
          availableLayerIds: availableThemeLayerIds,
          restrictedLayerIds: restrictedThemeLayerIds,
        }));
      }
    } else {
      setProvinceLayers((current) => Object.fromEntries(provinceLayerCatalog.map((layer) => [layer.id, layer.licence === "province-open" && current[layer.id]])) as Record<ProvinceLayerId, boolean>);
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
      setContextLayers((current) => Object.fromEntries(
        contextLayerCatalog.map((layer) => [
          layer.id,
          layer.licence === "province-restricted" ? false : current[layer.id],
        ]),
      ) as Record<ContextLayerId, boolean>);
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
    if (id === "ns-aerial" && visible) setContextLayers((current) => ({ ...current, "ns-topographic": false, "sentinel-2": false }));
    setProvinceLayers((current) => ({ ...current, [id]: visible }));
    },
    [],
  );

  // The Rhodena page's Map/Aerial switch swaps the opaque background.
  const showAerialBackground = useCallback((aerial: boolean) => {
    setProvinceLayerVisibility("ns-aerial", aerial);
    setShowModernMap(!aerial);
    if (!aerial) setContextLayers((current) => ({ ...current, "ns-topographic": false, "sentinel-2": false }));
  }, [setProvinceLayerVisibility]);

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
  const setContextLayerVisibility = useCallback(
    (id: ContextLayerId, visible: boolean) => {
    if (!visible) setElectoralSelection(current => current?.layer.id === id ? null : current);
    if (!visible && id === "rhodena-visibility") setRhodenaPickPending(false);
    setContextLayers((current) => ({ ...current, [id]: visible }));
    if ((id === "ns-topographic" || id === "sentinel-2") && visible) {
      setContextLayers((current) => ({ ...current, "ns-topographic": id === "ns-topographic", "sentinel-2": id === "sentinel-2" }));
      setShowModernMap(false);
      setProvinceLayers((current) => ({ ...current, "ns-aerial": false }));
    }
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
  const contextToggleFor = useStablePerIdCallback(setContextLayerVisibility);
  const forestryToggleFor = useStablePerIdCallback(setForestryLayerVisibility);
  const zoningToggleFor = useStablePerIdCallback(setZoningLayerVisibility);
  const liveConditionsToggleFor = useStablePerIdCallback(
    setLiveConditionsLayerVisibility,
  );

  const setLayerStatus = useCallback(
    (id: MapLayerId, status: MapLayerStatus) => {
      if (status.status !== "ready") setElectoralSelection(current => current?.layer.id === id ? null : current);
      setLayerStatuses((current) => {
        // Tile layers report loading/load cycles on every pan, and each
        // report used to build a fresh record — re-rendering the entire App
        // per tile event even when nothing changed. Bail on equal status.
        const previous = current[id];
        if (
          previous &&
          previous.status === status.status &&
          ("message" in previous ? previous.message : undefined) === ("message" in status ? status.message : undefined) &&
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
    // Before the state change, while the sheet is still in the DOM to be
    // asked whether it holds focus.
    handOffSheetFocus();
    setMobileControlsOpen(false);
    setGeometryOutcome(null);
    // A caution belongs to the selection it was raised for, and re-selecting
    // the same PID unambiguously is a new selection: without this the
    // shared-boundary notice would stand over a tap that had no ambiguity.
    setParcelLookupMessage(null);
    const request = { pid, generation: selectionGeneration.current + 1 };
    selectionGeneration.current = request.generation;
    setSelectedPid(pid);
    setSelectedEvidenceRequest(request);
    setMappedContext({ status: "loading", value: EMPTY_PARCEL_CONTEXT, request });
    setBuildingCount({ status: "loading", request });
    setAssessmentState({ status: "loading", request });
    setDwellingState({ status: "loading", request });
    setRiverFlood({ status: "loading", request });
    setCoastalFlood({ status: "loading", request });
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
    selectionGeneration.current += 1;
    setSelectedPid(null);
    setSelectedEvidenceRequest(null);
    setQuery("");
    setMappedContext({ status: "idle", value: EMPTY_PARCEL_CONTEXT, request: null });
    setBuildingCount({ status: "idle", request: null });
    setAssessmentState({ status: "idle", request: null });
    setRiverFlood({ status: "idle", request: null });
    setCoastalFlood({ status: "idle", request: null });
    setCivicAddresses({ status: "idle", value: EMPTY_CIVIC_ADDRESSES, request: null });
    setResourceIntersections({
      status: "idle",
      value: EMPTY_RESOURCE_INTERSECTIONS,
      request: null,
    });
    setShareMessage(null);
  };

  const cancelAddressSearch = () => {
    setMailingSearchNotice(null);
    if (addressSearchTimer.current !== null) {
      clearTimeout(addressSearchTimer.current);
      addressSearchTimer.current = null;
    }
    setActiveAddressIndex(-1);
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

      const { identified, pids, unidentifiedCount } =
        identifyParcelsAtPoint(collection);
      const pid = pids[0];
      if (!pid) {
        // Two different nothings. A reply with no features at all is the
        // service looking and finding no parcel, and that is the only
        // sentence here allowed to say anything about the ground. Shapes that
        // arrived carrying no readable PID are the service finding something
        // this build cannot name, which is neither "there is no parcel" nor
        // "the lookup failed".
        setParcelLookupMessage(
          unidentifiedCount === 0
            ? "No NSPRD parcel was found at that point."
            : unidentifiedCount === 1
              ? "NSPRD returned a boundary at that point with no readable PID."
              : `NSPRD returned ${unidentifiedCount} boundaries at that point with no readable PID.`,
        );
        return;
      }

      setParcels((current) => mergeFeatureCollections(current, identified));
      if (!addressLabel) {
        setQuery(pid);
      }
      selectParcel(pid);
      if (focusOnSelect) {
        requestParcelFocus(pid);
      }
      // More than one PID under one point: the parcels meet there, and the
      // order NSPRD listed them in is not evidence of which one the point
      // belongs to. "PID … selected." on its own would let a reader
      // researching a boundary act on the first-listed parcel as a finding.
      //
      // A boundary with no readable PID is reported separately rather than
      // added to the count. Two unnamed records may be two parcels or one
      // parcel in two pieces, and this build cannot tell which — a count that
      // included them would state a number nothing established.
      const meeting =
        pids.length > 1
          ? `PID ${pid} selected. ${pids.length} parcels meet at that point; this is the first ${
              // "the first NSPRD listed" is only true when nothing ahead of it
              // was dropped. With an unnamed boundary in the reply it may have
              // been listed second, and the sentence has to say which first.
              unidentifiedCount > 0 ? "NSPRD named" : "NSPRD listed"
            }, not a determination of which one it is.`
          : `PID ${pid} selected.`;
      setParcelLookupMessage(
        unidentifiedCount === 0
          ? meeting
          : unidentifiedCount === 1
            ? `${meeting} NSPRD also returned a boundary at that point with no readable PID.`
            : `${meeting} NSPRD also returned ${unidentifiedCount} boundaries at that point with no readable PID.`,
      );
    } catch (error: unknown) {
      if (controller.signal.aborted || (error instanceof DOMException && error.name === "AbortError")) {
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
    { licenceJustAccepted = false, suggest = false }: { licenceJustAccepted?: boolean; suggest?: boolean } = {},
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
    if (pokerMode && pid) {
      setSearchError("Search a civic address in Poker mode.");
      return;
    }

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
        const reading = await searchAddressesWithMailing(
          normalizedQuery,
          controller.signal,
          ...(suggest ? [{ suggest: true }] : []),
        );
        if (controller.signal.aborted) {
          return;
        }
        const results = reading.addresses;
        setMailingSearchNotice(reading.notice);
        if (results.length === 0) {
          setSearchError(reading.notice ? "No verified civic matches were returned; see the lookup status below." : "No mapped civic address matched that search.");
          return;
        }
        setAddressSearchResults(results);
      } catch (error: unknown) {
        if (controller.signal.aborted || (error instanceof DOMException && error.name === "AbortError")) {
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

    pendingGeometryFetchRef.current = request;
    try {
      const collection = await fetchParcels([pid]);
      if (request.generation !== selectionGeneration.current) return;
      if (collection.features.length === 0) {
        setSearchError("No NSPRD parcel was found for that PID.");
        setGeometryOutcome("returned-empty");
        markGeometryEvidenceTerminal(request, "geometry-unavailable");
        return;
      }
      setParcels((current) => mergeFeatureCollections(current, collection));
    } catch {
      if (request.generation !== selectionGeneration.current) return;
      setSearchError("The Province parcel search is unavailable right now.");
      setGeometryOutcome("source-error");
      markGeometryEvidenceTerminal(request, "geometry-unavailable");
    } finally {
      if (pendingGeometryFetchRef.current === request) {
        pendingGeometryFetchRef.current = null;
      }
    }
  };

  const scheduleAddressSuggestions = (value: string) => {
    const normalized = value.trim().replace(/\s+/gu, " ");
    // Typing never opens the licence dialog or selects a PID. Both still
    // require an explicit submission; address candidates require a choice.
    if (!licenceAccepted || normalized.length < 3 || /^[\d\s-]+$/u.test(value)) return;
    addressSearchTimer.current = setTimeout(() => {
      addressSearchTimer.current = null;
      void runSearch(value, { suggest: true });
    }, 300);
  };

  const chooseAddress = (address: CivicAddress) => {
    setQuery(address.label);
    if (pokerMode) {
      cancelAddressSearch();
      cancelPointLookup();
      setAddressSearchResults([]);
      setParcelLookupMessage(null);
      setSelectedPid(null);
      setPokerAddress(address);
      setPokerRevision((value) => value + 1);
      mapRegionRef.current?.focus({ preventScroll: true });
      setMobileControlsOpen(false);
      return;
    }
    void identifyParcelAtPoint(
      address.coordinates[1],
      address.coordinates[0],
      { addressLabel: address.label, focusOnSelect: !pokerMode },
    );
  };

  const submitPidSearch = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    // No hand-off here. Submitting is not the same as choosing a parcel: an
    // eight-digit typo and an address both leave the sheet open, one to show
    // the error and the other to show its results, and moving focus to the
    // map behind an open sheet would strand the reader outside the thing they
    // were reading. `selectParcel` is where the sheet actually closes.
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
    pendingGeometryFetchRef.current = request;
    try {
      const collection = await fetchParcels([pid]);
      if (request.generation !== selectionGeneration.current) return;
      if (collection.features.length === 0) {
        setParcelLookupMessage(
          `PID ${pid} details opened, but its map geometry is unavailable.`,
        );
        setGeometryOutcome("returned-empty");
        markGeometryEvidenceTerminal(request, "geometry-unavailable");
        return;
      }
      setParcels((current) => mergeFeatureCollections(current, collection));
      setParcelLookupMessage(`PID ${pid} selected.`);
    } catch {
      if (request.generation !== selectionGeneration.current) return;
      setParcelLookupMessage(
        `PID ${pid} details opened, but the Province parcel service is unavailable.`,
      );
      setGeometryOutcome("source-error");
      markGeometryEvidenceTerminal(request, "geometry-unavailable");
    } finally {
      if (pendingGeometryFetchRef.current === request) {
        pendingGeometryFetchRef.current = null;
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
      ...contextLayerCatalog
        .filter(({ id }) => effectiveContextLayers[id])
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
    effectiveContextLayers,
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
      return licenceAccepted ? summary : `${summary} · Province licence needed`;
    }

    const activeCount = activeLayerIds.filter(
      (layerId) =>
        layerCategoryByLayerId[layerId] === categoryId &&
        (licenceAccepted || !restrictedThemeLayerIds.has(layerId)),
    ).length;
    const summary = activeCount === 0 ? "Off" : `${activeCount} on`;
    const notices: string[] = [];

    // The same source-error state the banner on the map reports, so the rail
    // does not say "1 on" over a base map that did not load.
    if (layerCategoryByLayerId.modern === categoryId && showModernMap && layerStatuses.modern?.status === "error") {
      notices.push("Base map failed to load");
    }

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
      notices.push("Province licence needed for some");
    }

    return [summary, ...notices].join(" · ");
  };
  const themeComparableState = useMemo<ThemeComparableState>(() => ({
    layerIds: activeLayerIds,
    opacityOverrides: normalizeLayerOpacityOverrides(
      activeLayerIds,
      {
        ...contextOpacityOverrides,
        ...(fletcherOpacity === fletcherLayerCatalog.opacity
          ? {}
          : { fletcher: fletcherOpacity }),
      },
    ),
    taxSaleEnabled,
    mapMode,
  }), [activeLayerIds, contextOpacityOverrides, fletcherOpacity, mapMode, taxSaleEnabled]);
  const persistCustomThemes = useCallback((nextThemes: CustomMapThemeDefinition[]) => {
    const result = saveCustomThemes(nextThemes, reachableLocalStorage());
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
        : "Your saved setups could not be changed.",
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
  /**
   * Preserve Poker's workflow identity in its URL, and any other built-in
   * selection that layers alone cannot identify. Custom names stay local.
   */
  const shareThemeId = selectedTheme?.kind === "built-in"
    && themeStatesMatch(themeComparableState, selectedTheme)
    && (selectedTheme.id === "poker" || matchTheme(themeComparableState, mapThemes)?.id !== selectedTheme.id)
    ? selectedTheme.id
    : undefined;
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
  const themeChangeSummary = themeStatus === "modified" && selectedTheme
    ? describeThemeChanges(themeResult?.target ?? selectedTheme, themeComparableState, (id) => themeLayerNames.get(id) ?? id)
    : null;
  const activeThemeName = mapThemes.find(({ id }) => id === activeThemeId)?.name ?? "Shared setup";
  const activeThemeNameRef = useRef(activeThemeName);
  activeThemeNameRef.current = activeThemeName;
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
      .filter(({ id, licence }) => (licence === "province-open" || licenceAccepted) && provinceLayers[id])
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
    ...contextLayerCatalog
      .filter(({ id }) => effectiveContextLayers[id])
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
    effectiveContextLayers,
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
      assessmentState.status === "ready",
    ),
    civicAddresses: printStateForRequest(civicAddresses, selectedEvidenceRequest),
    mappedContext: printStateForRequest(mappedContext, selectedEvidenceRequest),
    riverFlood: printStateForRequest(riverFlood, selectedEvidenceRequest),
    coastalFlood: printStateForRequest(coastalFlood, selectedEvidenceRequest),
    resources: printStateForRequest(resourceIntersections, selectedEvidenceRequest),
  }), [
    assessmentState,
    buildingCount,
    civicAddresses,
    coastalFlood,
    dwellingState,
    mappedContext,
    resourceIntersections,
    riverFlood,
    selectedEvidenceRequest,
    selectedMappedArea,
  ]);
  const captureLayerSources = useMemo(() => {
    const sources = printLayerSources(fletcherTileConfiguration.baseUrl, basemapStyle);
    return captureLayerIds.flatMap((id) => {
      const source = sources.get(id);
      return source ? [source] : [];
    });
  }, [captureLayerIds, fletcherTileConfiguration.baseUrl, basemapStyle]);
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
      if ((layer.licence === "province-open" || licenceAccepted) && provinceLayers[layer.id] && layer.exportOptions) {
        ids.add(layer.id);
      }
    }
    for (const layer of contextLayerCatalog) {
      if (effectiveContextLayers[layer.id] && contextExportOmission(layer, mapViewport.position.zoom) === null) ids.add(layer.id);
    }
    return ids;
  }, [
    fletcherTileConfiguration.baseUrl,
    fletcherVisible,
    licenceAccepted,
    provinceLayers,
    effectiveContextLayers,
    mapViewport.position.zoom,
    showModernMap,
  ]);
  const exportReproductionLock = selectedPid || selectedParcelGeometry.features.length
    ? PARCEL_REPRODUCTION_LOCK_REASON
    : [...exportedLayerIds].map(id => reproductionLockReason(id, provinceLayerCatalog.find(layer => layer.id === id)?.openData)).find(reason => reason !== null) ?? null;
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
      .map(({ id, name }) => {
        const layer = contextLayerCatalog.find((candidate) => candidate.id === id);
        const reason = layer ? contextExportOmission(layer, mapViewport.position.zoom) : null;
        return reason ? `${name} — ${reason}` : name;
      }),
    ...userLayersApi.visibleLayers.map(({ record }) => `${record.name} — user layer is not included`),
    ...userMapsApi.visibleMaps.map(({ record }) => record.name),
    ...userVectorApi.visibleLayers.map(({ record }) => record.name),
  ], [
    captureLayerSources,
    exportedLayerIds,
    mapViewport.position.zoom,
    userLayersApi.visibleLayers,
    userMapsApi.visibleMaps,
    userVectorApi.visibleLayers,
  ]);
  const shareUrl = useMemo(
    () => buildMapShareUrl(window.location.href, {
      basemapStyle,
      electoralModes,
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
      themeId: shareThemeId,
      ...(fletcherVisible && fletcherOpacity !== fletcherLayerCatalog.opacity ? { fletcherOpacity } : {}),
      ...(focusDef?.shareParams?.has("month") && focusPage.month !== null ? { month: focusPage.month } : {}),
      ...(focusDef?.shareParams?.has("spot") && focusPage.spotId !== null ? { spot: focusPage.spotId } : {}),
    }),
    [
      activeLayerIds,
      basemapStyle,
      electoralModes,
      fletcherOpacity,
      fletcherVisible,
      focusDef,
      focusPage.month,
      focusPage.spotId,
      mapMode,
      mapViewport.position,
      selectedEventIds,
      selectedHistoricalContexts,
      selectedPid,
      shareThemeId,
      taxSaleEnabled,
    ],
  );

  // Runs with each address-bar write. It stays in this browser.
  const rememberView = useCallback((search: string) => {
    firstShareSearchRef.current ??= search;
    writeTabView(reachableSessionStorage(), search, fromLinkRef.current);
    if (!fromLinkRef.current && search !== firstShareSearchRef.current) {
      writeLastView(reachableLocalStorage(), { search, setupName: activeThemeNameRef.current });
    }
  }, []);
  /** Open the reader's own view again, through the same path as any link. */
  const returnToView = useCallback((view: LastView) => {
    writeLastView(reachableLocalStorage(), view);
    writeTabView(reachableSessionStorage(), view.search, false);
    window.history.replaceState(null, "", `${window.location.pathname}${view.search}`);
    if (onRestart) onRestart();
    else window.location.reload();
  }, [onRestart]);
  const dismissReturnNote = useCallback(() => {
    setReturnNoteOpen(false);
    if (openingKind === "plain") {
      clearLastView(reachableLocalStorage());
      return;
    }
    // The reader keeps the linked view: from here on it is their own.
    fromLinkRef.current = false;
    rememberView(window.location.search);
  }, [openingKind, rememberView]);

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
        if (!focusDef) rememberView(new URL(shareUrl).search);
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
  }, [focusDef, rememberView, shareUrl]);

  useEffect(() => {
    // Feedback belongs to the state that was copied. Ignore a clipboard
    // completion after the map changes or this view unmounts.
    setShareMessage(null);
    shareCopySequence.current += 1;
    return () => { shareCopySequence.current += 1; };
  }, [shareUrl]);

  const copyShareUrl = async () => {
    const sequence = ++shareCopySequence.current;
    setShareMessage(null);
    try {
      if (!navigator.clipboard?.writeText) {
        setShareMessage("Use the exact map-state link below.");
        return;
      }
      await navigator.clipboard.writeText(shareUrl);
      if (sequence === shareCopySequence.current) setShareMessage("Share link copied.");
    } catch {
      if (sequence === shareCopySequence.current) {
        setShareMessage("Copy failed; use the exact map-state link below.");
      }
    }
  };

  const openPrintExport = () => {
    if (!selectedPid || !selectedEvidenceRequest || !canPrintExport) return;

    printCaptureSequence.current += 1;
    setPrintCapture(startPrintCapture({
      basemapStyle,
      electoralModes,
      token: `print-${printCaptureSequence.current}`,
      capturedAt: new Date().toISOString(),
      pid: selectedPid,
      evidenceRequest: selectedEvidenceRequest,
      taxSaleEnabled,
      mode: mapMode,
      eventIds: printEventIds,
      events: printEvents,
      selectedParcelGeometry,
      mapParcels: drawableParcels,
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
    if (!PROPERTY_RECORD_REPRODUCTION_ALLOWED) {
      setShareMessage(PARCEL_REPRODUCTION_LOCK_REASON);
      return;
    }
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
        dwellingState.status !== "blocked" &&
        dwellingState.status !== "no-account" &&
        dwellingState.status !== "no-record-for-notice-aan" &&
        dwellingState.status !== "geometry-unavailable")
    ) {
      return;
    }
    const activeLayers = [
      ...(showModernMap
        ? [basemapSource(basemapStyle)]
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
      ...contextLayerCatalog
        .filter(({ id }) => effectiveContextLayers[id])
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
      parcelGeometry: geometryOutcome,
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
          : dwellingState.status === "no-account"
            ? { status: "no-account" }
            : dwellingState.status === "no-record-for-notice-aan"
              ? { status: "no-record-for-notice-aan" }
              : dwellingState.status === "geometry-unavailable"
                ? { status: "geometry-unavailable" }
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

  // The property row's key: the outline the parcel styler draws on this
  // basemap (parcelStyle.ts), with no fill, as on the map.
  const parcelImagery = Boolean(contextLayers["sentinel-2"] || provinceLayers["ns-aerial"]);
  const parcelSymbol = useMemo<LayerSwatchSpec>(() => {
    const color = parcelOutlineColor(basemapStyle, parcelImagery);
    return { shape: "area", color, fill: color, fillOpacity: 0, outline: true };
  }, [basemapStyle, parcelImagery]);
  // Whole result rows only, with a fade while more wait below.
  const railTitle = pokerMode ? "Poker" : mapThemes.find(({ id }) => id === activeThemeId)?.name ?? "NS Marks The Spot";
  // The same licence rule as a category's own "n on" count.
  const layersOnCount = activeLayerIds.filter((layerId) => licenceAccepted || !restrictedThemeLayerIds.has(layerId)).length;
  const layerSummary = `${layersOnCount} ${layersOnCount === 1 ? "layer" : "layers"} on${taxSaleEnabled ? " · tax sale on" : ""}`;
  // A setup's own categories lead the rail, so entering a task opens on its work.
  const railPreferredCategoryIds = mapThemes.find(({ id }) => id === activeThemeId)?.preferredCategoryIds ?? [];
  const railCategories = [
    ...railPreferredCategoryIds.flatMap((id) => layerCategories.filter((category) => category.id === id)),
    ...layerCategories.filter(({ id }) => !railPreferredCategoryIds.includes(id)),
  ];
  const taxSaleRailEvents = taxSaleEventsByUrgency(upcomingTaxSaleEvents, currentTime);
  const addressResultsRef = useWholeRowList<HTMLUListElement>(3, [addressSearchResults]);
  const searchEmptyNextStep = searchError ? SEARCH_EMPTY_NEXT_STEP[searchError] : undefined;
  const mailingNotice = mailingSearchNotice ? splitCaveat(mailingSearchNotice) : null;
  const searchForm = (
    <form className={`pid-search${pokerMode ? " poker-search" : ""}`} onSubmit={submitPidSearch}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) {
          cancelAddressSearch();
          setAddressSearchResults([]);
        }
      }}
    >
      <label className={pokerMode ? "sr-only" : undefined} htmlFor="pid-query">Search by PID or civic address</label>
      <div className="search-row">
        <input
          ref={pokerSearchRef}
          id="pid-query"
          type="search"
          value={query}
          onChange={(event) => {
            cancelAddressSearch();
            cancelPointLookup();
            setQuery(event.target.value);
            setAddressSearchResults([]);
            setSearchError(null);
            if (!(event.nativeEvent as InputEvent).isComposing) {
              scheduleAddressSuggestions(event.target.value);
            }
          }}
          onCompositionStart={cancelAddressSearch}
          onCompositionEnd={(event) => {
            cancelAddressSearch();
            scheduleAddressSuggestions(event.currentTarget.value);
          }}
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={addressSearchResults.length > 0}
          aria-controls={addressSearchResults.length > 0 ? "address-search-results" : undefined}
          aria-activedescendant={activeAddressIndex >= 0 ? `address-option-${activeAddressIndex}` : undefined}
          onKeyDown={(event) => {
            if (event.nativeEvent.isComposing) return;
            if (event.key === "Escape") {
              if (addressSearchResults.length || searchingAddresses || addressSearchTimer.current !== null) {
                event.preventDefault();
                event.stopPropagation();
                cancelAddressSearch();
                setAddressSearchResults([]);
                setSearchError(null);
              }
            } else if (addressSearchResults.length && (event.key === "ArrowDown" || event.key === "ArrowUp")) {
              event.preventDefault();
              const next = event.key === "ArrowDown"
                ? (activeAddressIndex + 1) % addressSearchResults.length
                : (activeAddressIndex <= 0 ? addressSearchResults.length : activeAddressIndex) - 1;
              setActiveAddressIndex(next);
              document.getElementById(`address-option-${next}`)?.scrollIntoView?.({ block: "nearest" });
            } else if (event.key === "Enter" && activeAddressIndex >= 0) {
              event.preventDefault();
              chooseAddress(addressSearchResults[activeAddressIndex]);
            }
          }}
          onPointerDown={(event) => {
            selectPokerQueryOnClick.current = pokerMode && document.activeElement !== event.currentTarget;
          }}
          onFocus={(event) => { if (pokerMode) event.currentTarget.select(); }}
          onClick={(event) => {
            // Safari positions its caret after focus; select after that first tap.
            if (selectPokerQueryOnClick.current) {
              const input = event.currentTarget;
              requestAnimationFrame(() => {
                if (document.activeElement === input) input.select();
              });
            }
            selectPokerQueryOnClick.current = false;
          }}
          placeholder={pokerMode ? "Search civic address" : "8-digit PID or address"}
          aria-describedby="pid-search-help"
          inputMode="search"
          autoComplete="off"
        />
        <button className="primary-action" type="submit" aria-label="Find parcel" title="Find parcel">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
            <circle cx="10.5" cy="10.5" r="6.5" />
            <path d="m16 16 5 5" />
          </svg>
        </button>
      </div>
      {/* The label and placeholder state the format at rest; this line speaks
          only when there is something to say. A returned-empty search is a
          result, not a fault: plain text, with the next thing to try. */}
      <p id="pid-search-help" className={`field-help${!searchError && !searchingAddresses ? " sr-only" : ""}${searchEmptyNextStep ? " field-help--empty" : ""}`} role={searchEmptyNextStep ? "status" : searchError ? "alert" : undefined}>
        {searchError ??
          (searchingAddresses
            ? "Searching mapped civic addresses…"
            : "Type an 8-digit PID or a civic address.")}
        {searchEmptyNextStep ? <span className="field-help-next">{searchEmptyNextStep}</span> : null}
      </p>
      <span className="sr-only" role="status">
        {addressSearchResults.length > 0
          ? `${addressSearchResults.length} civic address matches. Use up and down arrows, then Enter to choose.`
          : searchingAddresses ? "Searching mapped civic addresses…" : ""}
      </span>
      {addressSearchResults.length > 0 ? (
        <ul
          ref={addressResultsRef}
          id="address-search-results"
          role="listbox"
          className="address-search-results"
          aria-label="Civic address results"
        >
          {addressSearchResults.map((address, index) => (
            <li key={address.pntid} role="presentation">
              <button
                id={`address-option-${index}`}
                role="option"
                aria-selected={activeAddressIndex === index}
                tabIndex={-1}
                type="button"
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => chooseAddress(address)}
              >
                <span>{address.label}</span>
                {address.mailing?.status === "matched" ? <span className="mailing-search-label">Mailing: {mailingLabel(address.mailing.record)}</span> : null}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      {addressSearchResults.length > 3 ? (
        <p className="address-results-more" aria-hidden="true">{addressSearchResults.length} matches. Scroll the list for more.</p>
      ) : null}
      {mailingNotice ? <>
        <p className="field-help" role="status">{mailingNotice.lead}</p>
        {mailingNotice.full ? <details className="mailing-notice-more"><summary>More about this lookup</summary><p>{mailingNotice.full}</p></details> : null}
      </> : null}
      {addressSearchResults.some(a => a.mailing?.status === "matched") ? <MailingSource /> : null}
    </form>
  );

  // Four short choices read better as one segmented row than as a menu.
  // Native radios share a name, so arrow keys move the choice for free.
  const appearanceControl = (
    <div className="basemap-style-control interface-appearance-control">
      <span aria-hidden="true">Interface appearance</span>
      <small>Colours of these menus, not the map.</small>
      <div className="appearance-segments" role="radiogroup" aria-label="Interface appearance">
        {([["map", "Match map"], ["system", "System"], ["day", "Light"], ["night", "Dark"]] as const).map(([value, label]) => (
          <label key={value} className={appearance === value ? "selected" : undefined}>
            <input type="radio" name="interface-appearance" value={value}
              checked={appearance === value} onChange={() => setAppearance(value)} />
            <span>{label}</span>
          </label>
        ))}
      </div>
    </div>
  );
  // Deliberately NOT gated on `licenceAccepted`. Declining the Province
  // licence runs `continueWithoutProvinceLayers`, which never sets that flag —
  // so gating here locked the export out permanently for exactly the user the
  // feature was written for: the one taking OSM + a Fletcher sheet into the
  // field with live GPS, which needs no Province data at all. Province layers
  // are already excluded from the export by the same mechanism that excludes
  // them from `captureLayerIds` — they are only visible, and therefore only
  // composited, once the licence is accepted.
  // Words typed for one parcel or setup do not belong on the next one's sheet.
  useEffect(() => { exportDraft.current = null; }, [selectedPid, selectedThemeId]);
  // NS Aerial below its zoom floor draws the Atlas under it (MapCanvas's
  // AerialGapUnderlay), so it needs the Atlas credit too.
  const atlasCreditVisible = (showModernMap || Boolean(provinceLayers["ns-aerial"])) && basemapStyle !== "osm";
  // The licence strip's credits for what is on screen, a shared licence stated
  // once. The Province line comes first: a phone must reach it first.
  const collarCredits = groupAttributions([
    ...(focusHides(focusDef, "my-maps") ? [] : userLayersApi.visibleLayers.filter(({ record }) => userLayerUse(record, undefined, licenceAccepted).view === "allowed").flatMap(({ record }) => userLayerUse(record, undefined, licenceAccepted).matched.flatMap(match => match.attribution ? [match.attribution] : []))),
    ...(oglLayerVisible || pokerMode ? [OPEN_GOVERNMENT_ATTRIBUTION] : []),
    ...(coastalLayerVisible ? COASTAL_HAZARD_NOTICES : []),
    ...contextLayerCatalog.filter((layer) => effectiveContextLayers[layer.id] && layer.attribution).map((layer) => layer.attribution!),
    ...visibleZoningAttributions,
    ...liveConditionsLayerCatalog.filter(({ id }) => liveConditionsLayers[id]).map(({ attribution }) => attribution),
    ...(fletcherVisible ? [RUMSEY_ATTRIBUTION] : []),
  ], [PROVINCE_ATTRIBUTION, ...(atlasCreditVisible ? [OPEN_LICENCE_NOVA_SCOTIA] : [])]);
  const exportMapButton = (
    <button
      type="button"
      className="secondary-action export-map-trigger"
      onClick={() => {
        // Framing happens on the map, so the phone sheet steps out of the way
        // and the licence strip folds to its pill: either one otherwise sits
        // over the frame and its Continue button.
        closeMobileControls();
        cancelAttributionFold.current();
        setAttributionFolded(true);
        setExportSession({ stage: "framing", frame: DEFAULT_FRAME_STATE });
      }}
    >
      <svg viewBox="0 0 20 20" aria-hidden="true" focusable="false">
        <path d="M5 2.5h6.5L15 6v11.5H5Z" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
        <path d="M11.5 2.5V6H15M10 9v5.5m-2.5-2.5L10 14.5l2.5-2.5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      Export map (PDF)
    </button>
  );
  const offered = (id: string) => focusOffersLayer(focusDef, id);
  const focusChromeContext: FocusChromeContext = {
    contextLayers,
    setContextLayerVisibility,
    pageState: focusPage,
    setPageState: updateFocusPage,
    openMobileControls,
    closeMobileControls,
    fitToFocus: () => { if (focusDef) requestFocusFit(focusDef); },
    fitToBounds: (bounds: FocusBounds, options?: { readonly insetBottom?: number }) => {
      setFocusFit(({ revision }) => ({ revision: revision + 1, bounds, insetRight: focusDef?.mapOverlayInset, insetBottom: options?.insetBottom }));
    },
    startViewpointPick: () => setRhodenaPickPending(true),
    layerStatuses,
    provinceLayers,
    setProvinceLayerVisibility,
    licenceAccepted,
    reviewProvinceLicence,
  };
  const FocusPanel = focusDef?.chrome.Panel;
  const FocusMapOverlay = focusDef?.chrome.MapOverlay;
  // A setup's one visible first step, named for its task, from data the map
  // really holds. Electoral's chip and Historical Maps' sheet step sit with
  // their own controls above.
  const showTaxSaleKey = !focusDef && !selectedPid && activeThemeId === "tax-sale-research" && taxSaleEnabled && mapMode === "current" && licenceAccepted;
  const goToBounds = (bounds: FocusBounds) => {
    setFocusFit(({ revision }) => ({ revision: revision + 1, bounds, insetRight: showTaxSaleKey ? 264 : undefined }));
    closeMobileControls();
  };
  // Open a layer category from outside the list and bring it into view.
  const revealCategory = (categoryId: LayerCategoryId) => {
    if (phoneCategoryLayout) {
      focusCategory(categoryId);
      setSheetDetent("full");
    } else {
      setCategoryExpanded(categoryId, true);
    }
    window.requestAnimationFrame(() => {
      const button = categoryButtonRefs.current.get(categoryId);
      const still = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
      button?.scrollIntoView?.({ block: "start", behavior: still ? "auto" : "smooth" });
      button?.focus({ preventScroll: true });
    });
  };
  const firstStep = (() => {
    switch (activeThemeId) {
      case "tax-sale-research": {
        if (!taxSaleEnabled || mapMode !== "current") return undefined;
        const next = nextDatedTaxSale(taxSaleEvents, currentTime);
        if (!next) return <SetupFirstStep note="No current notice records a future sale date. Tap a dot for its notice." />;
        const pids = new Set(advertisedPidsForEvents([next]));
        const bounds = geometryBounds(drawableParcels.features.filter(({ properties }) => pids.has(properties.PID)).map(({ geometry }) => geometry));
        return (
          <SetupFirstStep
            label={`Go to next sale: ${next.shortMunicipality}, ${shortSaleDate(next.saleStartsAt ?? "")}`}
            note="From the municipality’s notice. Confirm the date with them."
            onClick={() => {
              if (bounds) goToBounds(bounds);
              else revealCategory("tax-sale");
            }}
          />
        );
      }
      case "forestry-field-access":
        return (
          <SetupFirstStep
            label="Go to my location"
            note="Your location stays in this browser."
            onClick={() => {
              // The map's own locate control, with its permission and failure messages.
              const locate = document.querySelector<HTMLButtonElement>(".location-button");
              if (locate?.getAttribute("aria-pressed") !== "true") locate?.click();
              closeMobileControls();
            }}
          />
        );
      case "georeferencing":
        return (
          <SetupFirstStep
            label="Load a scan"
            note={userMapsApi.records.length > 0
              ? `${userMapsApi.records.length} saved in this browser. Next: match its points, then check the fit.`
              : "Next: match its points, then check the fit. Scans stay in this browser."}
            onClick={() => revealCategory("my-maps")}
          />
        );
      case "poker":
        return <SetupFirstStep note="Search a civic number, or tap the map at the house to start a trace." />;
      case "fishing": {
        const month = new Date(currentTime).getMonth() + 1;
        return (
          <SetupFirstStep
            label={`Spots for ${CURRENT_MONTH_NAMES[month - 1]}`}
            href={new URL(`fishing?month=${month}`, document.baseURI).href}
            note="Opens the Fishing page, filtered to this month."
          />
        );
      }
      case "rhodena":
        return (
          <SetupFirstStep
            label={effectiveContextLayers["rhodena-visibility"] ? "Hide turbine visibility" : "Show turbine visibility"}
            note={<>Terrain only; trees and buildings are not modelled. <a href={new URL("rhodena", document.baseURI).href}>Open the Rhodena page</a></>}
            onClick={() => {
              setContextLayerVisibility("rhodena-visibility", !effectiveContextLayers["rhodena-visibility"]);
              closeMobileControls();
            }}
          />
        );
      case "point-tupper":
        return (
          <SetupFirstStep
            label="Open the Point Tupper page"
            href={new URL("pointtupper", document.baseURI).href}
            note="The site brief, with each source and date."
          />
        );
      default:
        return undefined;
    }
  })();
  // The key belongs to the setup's marks; a parcel's own panel takes that corner.
  const SetupKey = focusDef || pokerMode || selectedPid
    ? null
    : activeThemeId === "fishing"
      ? FishingMapKey
      : activeThemeId === "rhodena"
        ? RhodenaMapKey
        : activeThemeId === "point-tupper"
          ? PointTupperSetupKey
          : null;
  const showReturnNote = returnNoteOpen && !focusDef && (openingKind === "link" || selectedThemeId === openingThemeId);
  // The note yields once the reader starts work on the map. It never sits over a tool, and it does
  // not count as an answer: the last view stays saved, and a link's view is not kept by this.
  useEffect(() => {
    if (!showReturnNote) return;
    const leave = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Element) || target.closest(".return-note") || !target.closest(".map-region")) return;
      setReturnNoteOpen(false);
    };
    window.addEventListener("pointerdown", leave, true);
    return () => window.removeEventListener("pointerdown", leave, true);
  }, [showReturnNote]);

  return (
    <>
    <div
      className={`app-shell${
        editingMap ? " georeferencing" : ""
      }${focusDef ? ` ${focusDef.id}-focus` : ""}`}
    >
      {/* Keep the page heading available to assistive technology. */}
      <h1 className="visually-hidden">
        {focusDef
          ? focusDef.pageTitle
          : <>NS Marks The Spot — Nova Scotia parcel &amp; tax-sale map</>}
      </h1>
      <main className="map-layout">
        <aside
          ref={mobileControlsRef}
          id="map-controls"
          className={`layer-rail mode-${mapMode}${mobileControlsOpen ? " mobile-open" : ""}`}
          aria-label="Map controls"
          data-sheet-detent={sheetDetents ? sheetDetent : undefined}
          onFocus={sheetDetents ? (event) => {
            if (event.target instanceof HTMLElement && event.target.matches('input:not([type]), input[type="search"], input[type="text"], textarea')) setSheetDetent("full");
          } : undefined}
          onScroll={sheetDetents && sheetDetent === "half" ? (event) => {
            if (event.currentTarget.scrollTop > 24) setSheetDetent("full");
          } : undefined}
        >
          <div
            className="mobile-sheet-header"
            onPointerDown={sheetDetents ? (event) => {
              if ((event.target as HTMLElement).closest("button:not(.mobile-sheet-grabber)")) return;
              sheetDragRef.current = { y: event.clientY, pointerId: event.pointerId };
            } : undefined}
            onPointerUp={sheetDetents ? (event) => {
              const start = sheetDragRef.current;
              sheetDragRef.current = null;
              if (!start || start.pointerId !== event.pointerId) return;
              const moved = event.clientY - start.y;
              sheetDraggedRef.current = Math.abs(moved) > 32;
              if (moved < -32) setSheetDetent("full");
              else if (moved > 32) {
                if (sheetDetent === "full") setSheetDetent("half");
                else closeMobileControls();
              }
            } : undefined}
            onPointerCancel={() => { sheetDragRef.current = null; }}
          >
            {sheetDetents ? (
              <button
                type="button"
                className="mobile-sheet-grabber"
                aria-label={sheetDetent === "half" ? "Show more of the controls" : "Show more of the map"}
                aria-expanded={sheetDetent === "full"}
                aria-controls="map-controls"
                onClick={() => {
                  if (sheetDraggedRef.current) { sheetDraggedRef.current = false; return; }
                  setSheetDetent((current) => current === "half" ? "full" : "half");
                }}
              >
                <span aria-hidden="true" />
              </button>
            ) : null}
            {focusDef ? <strong>{focusDef.chrome.sheetTitle}</strong> : (
              // Where you are, at any scroll: the setup and what it has on.
              <span className="mobile-sheet-title">
                <strong>{railTitle}</strong>
                {!pokerMode ? <small>{layerSummary}</small> : null}
              </span>
            )}
            <button
              ref={mobileSheetCloseRef}
              type="button"
              onClick={closeMobileControls}
              aria-label="Close map controls"
            >
              <span aria-hidden="true">×</span>
            </button>
          </div>
          {/* The page heading is the hidden h1 at the top of the shell. This
              one names the controls rail, which is a part of the page, and
              the rail's own child-combinator rule carries its former h1
              typography over unchanged. */}
          {focusDef ? (
            <focusDef.chrome.Hero {...focusChromeContext} />
          ) : (
            // The rail is the room the reader is in, so it carries the
            // active setup's name; a shared link that matches no setup falls
            // back to the product's own name rather than another setup's.
            <h2 className="rail-title">{railTitle}</h2>
          )}
          {!pokerMode && searchForm}
          {/* A focus page carries these in its footer instead. */}
          {!focusHides(focusDef, "setup-picker") ? <MapThemePicker
            themes={mapThemes}
            activeThemeId={activeThemeId}
            status={themeStatus}
            changeSummary={themeChangeSummary}
            notice={themeNotice}
            selectRef={mapSetupSelectRef}
            onSelect={selectTheme}
            layerSummary={layerSummary}
            onSave={openThemeManager}
            onManage={openThemeManager}
            onReset={() => {
              if (activeThemeId) selectTheme(activeThemeId);
            }}
            shortcuts={activeThemeId === "electoral-districts" ? (() => {
              // One tap from the boundaries to the 2024 result: the results
              // layer on, washed by winning party. Its own 55-district
              // geometry and date stay on the layer row and the map legend.
              const on = effectiveContextLayers["provincial-results-2024"] && electoralModes["provincial-results-2024"] !== "boundaries";
              // The service can take about 9 seconds: the chip says so, or says why nothing came.
              const washNote = on ? electoralWashNote(layerStatuses["provincial-results-2024"]) : null;
              return (
                <div className="setup-chips" role="group" aria-label="Election results">
                  <button
                    type="button"
                    className="setup-chip"
                    aria-pressed={on}
                    aria-busy={on && layerStatuses["provincial-results-2024"]?.status === "loading"}
                    onClick={() => {
                      setElectoralModes((current) => withElectoralMode(current, "provincial-results-2024", on ? "boundaries" : "winner"));
                      setContextLayerVisibility("provincial-results-2024", !on);
                      if (!on && !licenceAccepted) reviewProvinceLicence();
                    }}
                  >
                    Show 2024 winners
                  </button>
                  {on ? <span className="setup-chip-note" aria-live="polite">{washNote ?? "Winning party · Elections Nova Scotia, November 26, 2024"}</span> : null}
                </div>
              );
            })() : activeThemeId === "historical-maps" && fletcherVisible && fletcherTileConfiguration.baseUrl ? (() => {
              // Fade the 1880s sheets against today's map without the layer
              // rail. Same state as the Fletcher row's slider, so the two
              // move together; a fade is viewing, not a setup change
              // (themes/themeState.ts), and a share link carries it.
              const percent = Math.round(fletcherOpacity * 100);
              const center = mapViewport.position;
              const sheet = nearestSheet(fletcherSheets, center);
              return (
                <>
                {sheet ? (
                  <SetupFirstStep
                    label={`Go to Sheet ${sheet.sheet}`}
                    note="Zoom in, where the 1880s lettering can be read."
                    onClick={() => goToBounds(sheet.bounds as FocusBounds)}
                  />
                ) : null}
                <div className="setup-fade">
                  <label htmlFor="setup-fletcher-opacity">Sheet opacity</label>
                  <input
                    id="setup-fletcher-opacity"
                    type="range"
                    min={FLETCHER_OPACITY_MIN}
                    max="1"
                    step={FLETCHER_OPACITY_STEP}
                    value={fletcherOpacity}
                    aria-valuetext={`${percent}% opaque`}
                    onChange={(event) => setFletcherOpacity(Number(event.target.value))}
                  />
                  <output htmlFor="setup-fletcher-opacity" aria-hidden="true">{percent}%</output>
                  <span className="setup-fade-ends" aria-hidden="true"><span>Today</span><span>1880s</span></span>
                  <span className="setup-chip-note">David Rumsey Map Collection · <span className="setup-fade-licence">{RUMSEY_LICENCE_NAME}</span></span>
                </div>
                </>
              );
            })() : firstStep}
          /> : null}

          {/* An output of the map as set up, so it follows the setup rather
              than competing with search for the first look. */}
          {!focusDef ? exportMapButton : null}

          {FocusPanel ? <FocusPanel {...focusChromeContext} /> : null}

          <section className="rail-section" aria-labelledby="layers-heading">
            {/* Focusable by script, so a page's own chrome can bring a reader here. */}
            <h2 id="layers-heading" tabIndex={-1}>Map layers</h2>
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
            {(focusDef
              ? focusDef.categoryIds.map((id) =>
                layerCategories.find((category) => category.id === id)!)
              : railCategories)
              .filter((category) =>
                !phoneCategoryLayout || focusedCategoryId === null ||
                  category.id === focusedCategoryId)
              .map((category) => {
              const provinceCategoryLayers = provinceLayerCatalog.filter(
                ({ id }) => layerCategoryByLayerId[id] === category.id && offered(id),
              );
              const zoningCategoryLayers = zoningLayerCatalog.filter(
                ({ id }) => layerCategoryByLayerId[id] === category.id && offered(id),
              );
              const hydroCategoryLayers = hydroPilotLayerCatalog.filter(
                ({ id }) => layerCategoryByLayerId[id] === category.id && offered(id),
              );
              const floodCategoryLayers = floodHazardLayerCatalog.filter(
                ({ id }) => layerCategoryByLayerId[id] === category.id && offered(id),
              );
              const contextCategoryLayers = contextLayerCatalog.filter(
                ({ id, category: assigned }) => assigned === category.id && offered(id),
              );
              const environmentalCategoryLayers =
                environmentalHealthLayerCatalog.filter(
                  ({ id }) => layerCategoryByLayerId[id] === category.id && offered(id),
                );
              const forestryCategoryLayers = forestryLayerCatalog.filter(
                ({ id }) => layerCategoryByLayerId[id] === category.id && offered(id),
              );
              const resourceCategoryLayers = allResourceLayerCatalog.filter(
                ({ id }) => layerCategoryByLayerId[id] === category.id && offered(id),
              );
              const wellCategoryLayers = wellLogLayerCatalog.filter(
                ({ id }) => layerCategoryByLayerId[id] === category.id && offered(id),
              );
              const liveConditionsCategoryLayers =
                liveConditionsLayerCatalog.filter(
                  ({ id }) => layerCategoryByLayerId[id] === category.id && offered(id),
                );
              const churchCategoryLayers = churchLayerCatalog.filter(
                ({ id }) => layerCategoryByLayerId[id] === category.id && offered(id),
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
                  {category.id === "rhodena-project" ? <RhodenaOverview compact={Boolean(focusDef)} onFit={() => { requestFocusFit(focusDefinitions.rhodena); setMobileControlsOpen(false); }} /> : null}
                  {layerCategoryByLayerId.modern === category.id ? (
                    <div className="layer-control">
                    <label className="layer-row">
                      <input
                        type="checkbox"
                        aria-label="Base map"
                        checked={showModernMap}
                        onChange={(event) =>
                          { setShowModernMap(event.target.checked);
                            if (event.target.checked) setContextLayers((current) => ({ ...current, "ns-topographic": false, "sentinel-2": false })); }}
                      />
                      <span className="switch" aria-hidden="true" />
                      <span>
                        <strong>Base map</strong>
                        <small>{basemapStyle === "osm" ? "OpenStreetMap" : basemapSource(basemapStyle).name}</small>
                        {/* MapCanvas's AerialGapUnderlay draws this map under NS
                            Aerial until the photograph can; the switch stays off
                            because the setup did not ask for it, so the row says
                            why the map is showing anyway. */}
                        {!showModernMap && provinceLayers["ns-aerial"] ? (
                          <small className="modern-map-standin">Shown on screen under NS Aerial until it loads (zoom 10+); not in exports</small>
                        ) : null}
                        <LayerMetadata
                          sourceDate={basemapSource(basemapStyle).sourceDate}
                          scale={basemapStyle === "osm" ? "Web map · native detail to zoom 19" : "Provincial-first · NSTDB 1:10,000 detail; closer zoom magnifies the data. Roads and paths do not establish access permission."}
                          coverage={basemapStyle === "osm" ? "Worldwide" : "Nova Scotia · supplemental OSM context"}
                          minZoom={7}
                          maxZoom={23}
                          checked={showModernMap}
                          status={layerStatuses.modern}
                        />
                      </span>
                    </label>
                    <div className="basemap-settings">
                    {/* A room is a choice to see that map, so picking one with
                        the base map off turns it on, as its switch does. */}
                    <BasemapRooms
                      preference={basemapPreference}
                      style={basemapStyle}
                      onChange={(preference: BasemapPreference) => {
                        setBasemapPreference(preference);
                        if (!showModernMap) {
                          setShowModernMap(true);
                          setContextLayers((current) => ({ ...current, "ns-topographic": false, "sentinel-2": false }));
                        }
                      }}
                    />
                    {basemapStyle !== "osm" && <div className="crown-land-key">
                      <span className="crown-land-key-chip" aria-hidden="true" style={{ background: atlasPalettes[basemapStyle].crown }} />
                      <div>
                        <p><a href={CROWN_SOURCE_URL}>Crown Land</a>, drawn in every Atlas style. Project-derived. Not a survey or permission to enter. <a href={crownReceiptUrl()}>Source receipt</a></p>
                        <details className="crown-land-more">
                          <summary>What this shows</summary>
                          <p>{CROWN_NOTE}</p>
                        </details>
                      </div>
                    </div>}
                    {basemapStyle === 'fletcher' && !focusDef ? <>
                      <label className="fletcher-features-toggle">
                        <input type="checkbox" checked={fletcherFeaturesVisible} onChange={event => setFletcherFeaturesVisible(event.target.checked)} />
                        Reviewed Fletcher features
                      </label>
                      <p className="resource-source-note" role="status">{fletcherFeaturesVisible ? fletcherFeaturesStatus : 'Historical features hidden'}. Zoom to level 12 or closer; select a mark for its original scan and evidence. Historical points and lines are approximate; dashed areas retain unresolved groups. On-screen research layer, excluded from exports.</p>
                    </> : null}
                    {/* The interface, not the map, so it sits last and says so. */}
                    {!focusDef ? appearanceControl : null}
                    </div>
                    </div>
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
                        symbol={layer.id === "nsprd" ? parcelSymbol : undefined}
                      />
                      {layer.id === "roads" && provinceLayers.roads ? (
                        <RoadLegend imagery={provinceLayers["ns-aerial"] || contextLayers["sentinel-2"]} />
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

                  {category.id === "elections-districts" ? <ElectoralLayerControls visibility={contextLayers} statuses={layerStatuses} licenceAccepted={licenceAccepted} modes={electoralModes} onModeChange={(id, mode) => setElectoralModes(current => withElectoralMode(current,id,mode))} onChange={setContextLayerVisibility} onReviewLicence={reviewProvinceLicence} night={basemapStyle === "night"} /> : null}
                  {contextCategoryLayers.filter(layer => layer.category !== "elections-districts").map((layer) => (
                    <ContextLayerToggle
                      key={layer.id}
                      layer={layer}
                      checked={contextLayers[layer.id]}
                      licenceAccepted={licenceAccepted}
                      status={layerStatuses[layer.id]}
                      onChange={contextToggleFor(layer.id)}
                      onReviewLicence={reviewProvinceLicence}
                    />
                  ))}

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

                  {churchCategoryLayers.length > 0 ? (
                    <details className="resource-layer-group">
                      <summary>
                        A.F. Church county maps
                        <small>{churchCategoryLayers.length} maps · web tiles pending</small>
                      </summary>
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
                    </details>
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
                        : noncommercial use only. Context only, not a survey.
                      </p>
                      <details className="fletcher-source-more">
                        <summary>Licence terms and limits</summary>
                        <p className="resource-source-note">
                          Noncommercial use only; project georeferencing,
                          clipping, and tiling changes are identified as
                          derivatives and remain within the licence’s ShareAlike
                          boundary. The MIT software licence does not cover the
                          imagery. This historical layer is context only: it is
                          not a survey and does not establish current parcels,
                          title, legal access, roads, shoreline, flood conditions,
                          value, permissions, or services.
                        </p>
                      </details>
                    </>
                  ) : null}

                  {category.id === "tax-sale" ? (
                    <>
                      <label className="layer-row tax-sale-master">
                        <input
                          type="checkbox"
                          checked={taxSaleEnabled}
                          aria-controls="tax-sale-dependent-controls"
                          onChange={(event) => event.target.checked
                            ? enableTaxSale()
                            : disableTaxSale()}
                        />
                        <span className="switch" aria-hidden="true" />
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
                            aria-label="Current notices"
                            onClick={() => changeMapMode("current")}
                          >
                            {/* One word per half so neither wraps in the
                                rail; the full name stays the button's name
                                and the caption below spells it out. */}
                            Current
                          </button>
                          <button
                            type="button"
                            className={mapMode === "historical" ? "selected" : ""}
                            aria-pressed={mapMode === "historical"}
                            aria-label="Historical records"
                            onClick={() => changeMapMode("historical")}
                          >
                            Historical
                          </button>
                        </div>
                        <p className="map-mode-caption">
                          {mapMode === "current"
                            ? "Advertised notices that still require municipal verification."
                            : "Dated notices and verified outcomes, never current offerings."}
                        </p>
                          </section>

                          {mapMode === "current" ? (
                        <>
                          <section
                            className="rail-section tax-sale-events"
                            role="region"
                            aria-label="Current sales"
                          >
                            <h4 id="events-heading" className="nested-rail-heading">
                              Tax sales
                            </h4>
                            {/* A sale is one municipal auction; a notice is one
                                advertised property within it. */}
                            <p className="section-intro">
                              One row per municipal sale, dated from its official
                              notice. Past sale dates require municipal result
                              verification.
                            </p>
                            <TaxSaleDateLegend events={upcomingTaxSaleEvents} now={currentTime} />
                            {[...taxSaleRailEvents.upcoming, ...taxSaleRailEvents.past].map((event) => {
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
                                  {event === taxSaleRailEvents.past[0] ? (
                                    <p className="tax-sale-past-heading">
                                      Past sale dates ({taxSaleRailEvents.past.length}). Verify results with the municipality.
                                    </p>
                                  ) : null}
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
                                      <strong><TaxSaleDateDot band={taxSaleDateBand(event, currentTime)} />{event.shortMunicipality}</strong>
                                      <small>{eventDateLabel(event)}</small>
                                      <small>{eventLifecycleLabel(event, currentTime)}</small>
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
                                    facts={geometryExceptions.length > 0
                                      ? `${advertisedCount} advertised ${advertisedCount === 1 ? "notice" : "notices"} · ${event.listings.length} mapped · ${geometryExceptions.length} unavailable in NSPRD`
                                      : `${advertisedCount} advertised ${advertisedCount === 1 ? "notice" : "notices"} · ${withdrawnCount} withdrawn ${withdrawnCount === 1 ? "notice" : "notices"} · ${pidCount} ${pidCount === 1 ? "PID" : "PIDs"} in advertised notices`}
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
                      <UserLayerControls api={userLayersApi} statuses={userLayerStatuses} licenceAccepted={licenceAccepted} onReviewLicence={reviewProvinceLicence} position={mapViewport.position} />
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
                        onAbandonLayer={abandonVectorLayer}
                        onNewLayer={() => void createAndEditVectorLayer()}
                        onBulkPhotos={() => setBulkPhotosOpen(true)}
                        editingId={vectorEdit.editingId}
                        editSessionHeld={vectorEdit.photoAttachRunning}
                      />
                    </>
                  ) : null}
                </LayerCategorySection>
              );
            })}
            </div>
            <UnavailableLayers />
          </section>

          {focusDef ? (
            <section className={`${focusDef.id}-focus-footer`} aria-label="Display, export and full map">
              {appearanceControl}
              {exportMapButton}
              <a
                className={`${focusDef.id}-full-map-link`}
                href={fullMapUrl(shareUrl)}
              >
                Open this view in the full NS Marks map
                <span aria-hidden="true">→</span>
              </a>
              <focusDef.chrome.FooterNote />
            </section>
          ) : null}
        </aside>

        <section
          ref={mapRegionRef}
          tabIndex={-1}
          className={`map-region${selectedPid && !pokerMode ? " has-inspector" : ""}${pokerMode ? " poker-mode" : ""}${attributionCollapsed ? " attribution-folded" : ""}`}
          aria-label="Map and parcel details"
        >
          <div className="mobile-map-chrome">
            {focusDef ? (
              <button
                className={`mobile-map-brand ${focusDef.id}-brand`}
                type="button"
                aria-label={focusDef.chrome.brand.label}
                aria-controls="map-controls"
                aria-expanded={mobileControlsOpen}
                onClick={() => setMobileControlsOpen(true)}
              >
                <focusDef.chrome.brand.Mark />
              </button>
            ) : (
              <a
                className="mobile-map-brand"
                href="../"
                aria-label="NS Marks The Spot home"
                title="NS Marks The Spot home page"
              >
                <span aria-hidden="true">NS</span>
                <strong>NS Marks</strong>
                <small className="mobile-map-brand-home">Home</small>
              </a>
            )}
            <button
              ref={mobileControlsTriggerRef}
              className="mobile-controls-trigger"
              type="button"
              aria-controls="map-controls"
              aria-expanded={mobileControlsOpen}
              onClick={() => setMobileControlsOpen(true)}
            >
              {pokerMode ? (
                // Poker's search lives on the map, so this pill opens layers
                // only and says so with a stack, not a magnifier.
                <svg className="mobile-controls-glyph" viewBox="0 0 20 20" aria-hidden="true" focusable="false">
                  <path d="M10 3 2.5 7 10 11l7.5-4Z" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
                  <path d="m2.5 10.5 7.5 4 7.5-4M2.5 14l7.5 4 7.5-4" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
                </svg>
              ) : <span aria-hidden="true">⌕</span>}
              {pokerMode ? "Layers" : "Search & layers"}
            </button>
          </div>
          {pokerMode && searchForm}
          <div ref={mapLegendsRef} className="electoral-map-legends">{(['provincial-results-2024','provincial-seats-2026'] as const).filter(id => effectiveContextLayers[id] && electoralModes[id] !== 'boundaries').map(id => <ElectoralLegend key={id} mode={electoralModes[id]} night={basemapStyle === 'night'} status={layerStatuses[id]} waiting />)}</div>
          {FocusMapOverlay ? <FocusMapOverlay {...focusChromeContext} /> : null}
          {!focusDef ? (
            // Stacked, so each pushes the next rather than covering it.
            <div className="map-overlay-stack">
              {activeThemeId !== "explore-nova-scotia" && !mobileControlsOpen ? <span className="mobile-setup-name">{activeThemeName}</span> : null}
              {showReturnNote ? (
                <ReturnNote
                  kind={openingKind === "link" ? "link" : "offer"}
                  setupName={openingKind === "link" ? activeThemeName : lastViewAtOpen?.setupName ?? "your last view"}
                  onReturn={lastViewAtOpen ? () => returnToView(lastViewAtOpen) : undefined}
                  onDismiss={dismissReturnNote}
                />
              ) : null}
              {SetupKey ? <SetupKey {...focusChromeContext} /> : null}
              {showTaxSaleKey ? <TaxSaleMapKey context={focusChromeContext} events={taxSaleEvents.filter(({ id }) => selectedEventIds.has(id))} now={currentTime} /> : null}
            </div>
          ) : null}
          {electoralSelection && effectiveContextLayers[electoralSelection.layer.id] && layerStatuses[electoralSelection.layer.id]?.status === "ready" ? <DistrictInspector selection={electoralSelection} night={basemapStyle === "night"} onClose={() => setElectoralSelection(null)} /> : null}
          <MapCanvas
            poker={pokerMode ? {
              address: pokerAddress,
              revision: pokerRevision,
              onCivicStatusChange: setPokerCivicStatus,
            } : null}
            basemapStyle={basemapStyle}
            onUseOsmBasemap={() => setBasemapPreference("osm")}
            parcels={pokerMode ? { type: "FeatureCollection", features: [] } : drawableParcels}
            taxSalePids={effectiveTaxSalePids}
            taxSaleDateBands={taxSaleDateBands}
            historicalTaxSalePids={effectiveHistoricalTaxSalePids}
            selectedPid={pokerMode ? null : selectedPid}
            provinceLayers={pokerMode ? { ...provinceLayers, nsprd: false } : provinceLayers}
            resourceLayers={effectiveResourceLayers}
            hydroPilotLayers={hydroPilotLayers}
            floodHazardLayers={effectiveFloodHazardLayers}
            environmentalHealthLayers={effectiveEnvironmentalHealthLayers}
            contextLayers={effectiveContextLayers}
            electoralModes={electoralModes}
            electoralLicenceAccepted={licenceAccepted}
            onElectoralSelect={setElectoralSelection}
            forestryLayers={forestryLayers}
            zoningLayers={zoningLayers}
            wellLogLayers={wellLogLayers}
            liveConditionsLayers={liveConditionsLayers}
            wellLogAccuracyFilter={wellLogAccuracyFilter}
            fletcherVisible={fletcherVisible}
            fletcherFeaturesVisible={basemapStyle === 'fletcher' && fletcherFeaturesVisible && !pokerMode && !focusDef}
            onFletcherFeaturesStatus={setFletcherFeaturesStatus}
            fletcherOpacity={fletcherOpacity}
            contextOpacity={contextOpacityOverrides}
            fletcherTileBaseUrl={fletcherTileConfiguration.baseUrl}
            fletcherRetryToken={fletcherRetryToken}
            onUserLayerStatus={onUserLayerStatus}
            userLayers={focusHides(focusDef, "my-maps") ? [] : userLayersApi.visibleLayers.filter(({ record }) => userLayerUse(record, undefined, licenceAccepted).view === "allowed")}
            userMaps={focusHides(focusDef, "my-maps") ? undefined : userMapsApi.visibleMaps}
            userMapFitRequest={userMapsApi.fitRequest}
            userVectorLayers={focusHides(focusDef, "my-maps") ? undefined : readOnlyVectorLayers}
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
            parcelOutlineWidth={focusDef?.parcelOutlineWidth}
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
            focusFit={focusFit}
            themeCamera={themeCamera}
            // Only a page whose state carries a spot drives the spots layer;
            // anywhere else the layer keeps its own selection.
            fishingSpots={focusDef?.shareParams?.has("spot") ? {
              month: focusPage.month,
              species: focusPage.species,
              selectedId: focusPage.spotId,
              mapReveal: focusPage.mapReveal,
              onSelect: selectFocusSpot,
              onOpenCard: openFocusSpotCard,
            } : undefined}
            backgroundSwitch={focusDef?.backgroundSwitch ? {
              aerial: licenceAccepted && provinceLayers["ns-aerial"],
              onChange: (aerial) => {
                if (aerial && !licenceAccepted) {
                  setLicenceIntent({ kind: "aerial" });
                  setLicenceDialogOpen(true);
                  return;
                }
                showAerialBackground(aerial);
              },
            } : null}
            rhodenaPickPending={rhodenaPickPending}
            onRhodenaPickStarted={() => setRhodenaPickPending(false)}
            initialPosition={!hasSharedPosition && cameraFocus ? cameraFocus.initialPosition : themeOpeningPosition(initialThemeCamera, initialShareState.position)}
            preserveInitialPosition={hasSharedPosition}
            onViewportChange={setMapViewport}
            onPositionChange={reportMapCentre}
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
              setExportSession((session) => ({
                stage: "dialog", bounds, orientation,
                frame: session?.stage === "framing" ? session.frame : DEFAULT_FRAME_STATE,
              }))}
          />
          {/* While a parcel is open the message travels inside its panel,
              which on a phone covers the map entirely: overlaid, it sat
              across the panel's own pinned row. */}
          <p
            className="parcel-lookup-message"
            role="status"
            aria-live="polite"
          >
            {selectedPid ? null : parcelLookupMessage}
          </p>
          {/* A debounced write can answer after Done has closed the editor,
              or while a different layer's panel is open — with no panel left
              to be read in. Those failures are reported here, on the map,
              which outlives every session, and each names its layer because
              the reader may be looking at a different one, or at none. */}
          {Object.keys(vectorEdit.closedSessionErrors).length > 0 ||
          vectorEdit.discardedPhotos.length > 0 ? (
            <div className="vector-edit-write-errors">
              {Object.entries(vectorEdit.closedSessionErrors).map(
                ([layerId, message]) => (
                  <p
                    key={layerId}
                    className="vector-edit-write-error"
                    role="alert"
                  >
                    <span>{message}</span>
                    <button
                      type="button"
                      onClick={() =>
                        vectorEdit.dismissClosedSessionError(layerId)}
                    >
                      Dismiss
                    </button>
                  </p>
                ),
              )}
              {/* A photo whose feature was gone before its bytes landed is
                  read here for the same reason: the strip that would have
                  shown it went away with the feature, and on Done the whole
                  panel goes. It shares this stack rather than opening a
                  second one, which would sit on this one's corner. */}
              {vectorEdit.discardedPhotos.map((photo) => (
                <p
                  key={photo.id}
                  className="vector-edit-write-error"
                  role="alert"
                >
                  <span>{photo.message}</span>
                  <button
                    type="button"
                    onClick={() => vectorEdit.dismissDiscardedPhoto(photo.id)}
                  >
                    Dismiss
                  </button>
                </p>
              ))}
            </div>
          ) : null}
          {selectedPid && !pokerMode ? (
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
              riverFlood={riverFlood}
              coastalFlood={coastalFlood}
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
                  dwellingState.status === "blocked" ||
                  dwellingState.status === "no-account" ||
                  dwellingState.status === "no-record-for-notice-aan" ||
                  dwellingState.status === "geometry-unavailable")
              }
              lookupMessage={parcelLookupMessage}
              dismissOnEscape={
                // The panel is the bottom layer under all of these, and the
                // rule the controls sheet already follows applies here: "so
                // one keypress never closes two layers". printCapture is in
                // the list because closing the panel clears it, which would
                // tear the capture out from under an open print preview;
                // editingMap is in it because the georeferencer's own Escape
                // is deliberately unscoped. The photo viewer and the frame
                // chooser are in it because Escape is their only exit and
                // this panel silences the event to keep one keypress from
                // closing two layers: without them, the viewer would be left
                // with no way out and the panel behind it would close.
                // The PDF export dialog and the bulk photo import are here
                // for the same reason as the rest: both listen for Escape on
                // the document, where stopPropagation does not reach a
                // sibling listener, so one keypress cancelled the export and
                // closed the panel behind it. The save-track dialog lives
                // inside MapCanvas, which App cannot see, so it says the same
                // thing with data-owns-escape on its own root.
                !aboutOpen &&
                !dataSourcesOpen &&
                !licenceDialogOpen &&
                !themeManagerOpen &&
                !mobileControlsOpen &&
                !editingMap &&
                !openPhoto &&
                !bulkPhotosOpen &&
                !exportSession &&
                !userMapsApi.frameChoosingMap &&
                !printCapture
              }
              now={currentTime}
              onClose={() => {
                // Focus would otherwise fall to <body>. The map region is
                // this panel's own container. preventScroll because it is
                // already on screen, and scrolling it into view here would
                // move the map under the reader.
                mapRegionRef.current?.focus({ preventScroll: true });
                selectionGeneration.current += 1;
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
                setRiverFlood({ status: "idle", request: null });
                setCoastalFlood({ status: "idle", request: null });
                setShareMessage(null);
              }}
            />
          ) : null}
        </section>
      </main>

      <footer ref={attributionRef} className={`map-attribution${attributionCollapsed ? " collapsed" : ""}`}>
        <div className="collar-head">
        <button type="button" aria-expanded={!attributionCollapsed} onClick={() => {
          cancelAttributionFold.current();
          attributionPresented.current = true;
          setAttributionFolded((folded) => !folded);
        }}>
          {attributionCollapsed ? "Show licences" : "Hide licences"}
          <span className="disclosure-chevron" aria-hidden="true" />
        </button>
        {pokerMode && (attributionCollapsed
          // Folded, the strip is a corner pill with no room for the civic
          // status; it stays a live region so it is still announced.
          ? <span className="sr-only" role="status">{pokerCivicStatus}</span>
          : <span className="poker-civic-status" role="status">
            {pokerCivicStatus} <a href={CIVIC_ADDRESS_DATASET_URL} target="_blank" rel="noreferrer">Nova Scotia Civic Address File</a>. Points may not mark the house. Distances follow your taps.
          </span>)}
        {/* Folded, the strip still states the two lines true of every view:
            the OpenStreetMap credit and the survey caveat. The full set for
            what is on screen is one click away. Phones fold to a pill that
            keeps only the caveat. */}
        {attributionCollapsed ? (
          <span className="map-attribution-folded-credit">
            <span className="folded-credit-sources">
              <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">© OpenStreetMap contributors</a>
              {/* The same gate as the licence dialog: a Province-restricted
                  layer (or tax-sale parcels) actually drawn under an accepted
                  licence. */}
              {licenceAccepted && (taxSaleEnabled || activeLayerIds.some((id) => restrictedThemeLayerIds.has(id)))
                ? <>{" · "}Province of NS (licensed)</>
                : null}
              {" · "}
            </span>
            Boundaries are not a survey
          </span>
        ) : <span className="survey-caveat">Boundaries are not a survey</span>}
        </div>
        {!attributionCollapsed && <>
          <div className="collar-groups">
            {collarCredits.groups.map(({ licence, sources }) => (
              <section key={licence} className={`collar-group${licence === PROVINCE_ATTRIBUTION ? " province-attribution" : ""}`}>
                <p className="collar-licence">{licence}</p>
                {sources.length > 0 || (licence === OPEN_LICENCE_NOVA_SCOTIA && atlasCreditVisible) ? (
                  <ul>
                    {licence === OPEN_LICENCE_NOVA_SCOTIA && atlasCreditVisible ? (
                      <li>NS Marks Atlas · Provincial-first
                        {" · "}<a href={PROVINCIAL_LICENCE_URL} target="_blank" rel="noreferrer">Licence</a>
                        {" · "}<a href={provincialReceiptUrl()} target="_blank" rel="noreferrer">Tile sources</a></li>
                    ) : null}
                    {sources.map((source) => <li key={source}>{source}</li>)}
                  </ul>
                ) : null}
              </section>
            ))}
            <UserLayerCredits layers={focusHides(focusDef, "my-maps") ? [] : userLayersApi.visibleLayers.filter(({ record }) => userLayerUse(record, undefined, licenceAccepted).view === "allowed")} />
            <section className="collar-group">
              <p className="collar-licence">Map data</p>
              <ul>
                <li><a className="osm-credit" href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">© OpenStreetMap contributors</a></li>
                {atlasCreditVisible ? (
                  <li>Supplemental <a href="https://openfreemap.org/" target="_blank" rel="noreferrer">OpenFreeMap</a> · <a href="https://openmaptiles.org/" target="_blank" rel="noreferrer">© OpenMapTiles</a></li>
                ) : null}
                {Object.values(resourceLayers).some(Boolean) ? <li>Geoscience data © Province of Nova Scotia</li> : null}
                {/* Licence-mandated statements for what is actually on screen,
                    each in the wording its licence requires: coastal notices,
                    Rumsey's CC BY-NC-SA line for the Fletcher sheets, and any
                    credit that does not share a licence sentence above. */}
                {collarCredits.other.map((line) => <li key={line}>{line}</li>)}
                {basemapStyle === 'fletcher' && fletcherFeaturesVisible && !pokerMode && !focusDef ? <li>
                  Historical annotations: {RUMSEY_ATTRIBUTION} · <a href={RUMSEY_LICENCE_URL} target="_blank" rel="noreferrer">CC BY-NC-SA 3.0</a> · transcribed and georeferenced · <a href={`${import.meta.env.BASE_URL}fletcher-features/source.json`} target="_blank" rel="noreferrer">Feature sources</a>
                </li> : null}
              </ul>
            </section>
          </div>
          <div className="collar-foot">
            <button type="button" onClick={() => setDataSourcesOpen(true)}>
              Data &amp; licences
            </button>
            <button type="button" onClick={() => setAboutOpen(true)}>
              About this map
            </button>
            <a className="source-code-link" href="https://github.com/dfakkeldy/ns-marks-the-spot" target="_blank" rel="noreferrer">
              Open source · MIT · GitHub
            </a>
            <a className="feedback-link" href="mailto:map@kinnokilabs.com?subject=NS%20Marks%20The%20Spot%20map%20feedback">
              Feedback &amp; suggestions: map@kinnokilabs.com
            </a>
          </div>
        </>}
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
          suggestedName={`${mapThemes.find(({ id }) => id === activeThemeId)?.name ?? "My setup"}, ${new Date().toLocaleDateString("en-CA", { month: "short", day: "numeric" })}`}
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
    {exportSession?.stage === "dialog" && exportReproductionLock ? (
      <LicensingLockDialog reason={exportReproductionLock} onClose={() => setExportSession(null)} />
    ) : exportSession?.stage === "dialog" ? (
      <Suspense fallback={null}>
      <ExportDialog
        orientation={exportSession.orientation}
        bounds={exportSession.bounds}
        layers={buildExportLayers({
          basemapStyle,
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
          arcgisLayers: [...provinceLayerCatalog
            .filter((layer) =>
              (layer.licence === "province-open" || licenceAccepted) && provinceLayers[layer.id] && layer.exportOptions)
            .map((layer) => ({
              id: layer.id,
              name: layer.name,
              serviceUrl: layer.serviceUrl,
              exportOptions: layer.exportOptions!,
              openData: layer.openData,
              opacity: layer.opacity,
            })),
            ...contextLayerCatalog
              .filter((layer) => effectiveContextLayers[layer.id] && contextExportOmission(layer, mapViewport.position.zoom) === null)
              .map((layer) => ({ id: layer.id, name: layer.name, serviceUrl: layer.serviceUrl,
                exportOptions: layer.exportOptions, openData: layer.openData, tileUrl: "tileUrl" in layer ? layer.tileUrl : undefined, maxNativeZoom: layer.maxNativeZoom, opacity: contextOpacityOverrides[layer.id] ?? layer.opacity })),
          ],
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
        initialFields={exportDraft.current}
        onFieldsChange={(fields) => { exportDraft.current = fields; }}
        onBack={() => setExportSession({ stage: "framing", frame: exportSession.frame })}
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
        onAttachFeaturePhotos={vectorEdit.attachFeaturePhotos}
        onPhotoCleanupFailed={vectorEdit.notePhotoCleanupFailure}
        photoAttachRunning={vectorEdit.photoAttachRunning}
        onPhotoAttachBusy={vectorEdit.notePhotoAttachBusy}
        onMoveFeaturePoint={vectorEdit.moveFeaturePoint}
        onFeatureCorners={vectorEdit.featureCorners}
        onMoveVertex={vectorEdit.moveFeatureVertex}
        onInsertVertex={vectorEdit.insertFeatureVertex}
        mapCentre={mapCentre}
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
