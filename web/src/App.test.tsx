import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useEffect } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "./App";
import {
  PROVINCE_ATTRIBUTION,
  PROVINCE_LICENSE_ACCEPTANCE_KEY,
  PROVINCE_LICENSE_URL,
} from "./licensing/provinceLicense";
import { matchedHistoricalPids } from "./data/historicalTaxSales";
import { eventsForStatus } from "./data/taxSaleCatalog";
import { buildEvidenceNote } from "./services/evidenceNote";
import {
  OPEN_GOVERNMENT_ATTRIBUTION,
  fetchCivicAddresses,
  searchCivicAddresses,
  type CivicAddress,
} from "./services/civicAddresses";
import { fetchParcelAtPoint, fetchParcels, NSPRD_LAYER_URL } from "./services/nsprd";
import { fetchParcelContext } from "./services/parcelContext";
import { fetchParcelResourceIntersections } from "./services/parcelResources";
import { fetchParcelFloodHazardEvidence } from "./services/floodHazard";
import { fetchParcelBuildingCount } from "./services/buildings";
import { fetchParcelAssessments } from "./services/pvscAssessments";
import { fetchDwellingCharacteristics } from "./services/pvscDwellings";
import {
  allResourceLayerCatalog,
  churchLayerCatalog,
  environmentalHealthLayerCatalog,
  fletcherLayerCatalog,
  floodHazardLayerCatalog,
  forestryLayerCatalog,
  hydroPilotLayerCatalog,
  provinceLayerCatalog,
  wellLogLayerCatalog,
  zoningLayerCatalog,
} from "./layers/layerCatalog";
import { UserMapStore } from "./userMaps/store/userMapStore";
import { PERSIST_DELAY_MS } from "./userMaps/useGeoreferenceSession";
import type {
  Gcp,
  PdfRegistrationCandidate,
  UserMapRecord,
} from "./userMaps/types";
import { CUSTOM_THEME_STORAGE_KEY } from "./themes/themeStorage";
import { layerCategories } from "./layers/layerCategories";
import { builtInMapThemes } from "./themes/mapThemes";

const parseGeoPdfAutoMock = vi.hoisted(() => vi.fn());
const observedInteractiveMapStates = vi.hoisted((): string[] => []);
const lastObservedInteractiveMapState = vi.hoisted(() => ({
  value: null as string | null,
}));

const currentCatalogueIds = [
  "modern",
  fletcherLayerCatalog.id,
  ...provinceLayerCatalog.map(({ id }) => id),
  ...allResourceLayerCatalog.map(({ id }) => id),
  ...hydroPilotLayerCatalog.map(({ id }) => id),
  ...floodHazardLayerCatalog.map(({ id }) => id),
  ...environmentalHealthLayerCatalog.map(({ id }) => id),
  ...forestryLayerCatalog.map(({ id }) => id),
  ...zoningLayerCatalog.map(({ id }) => id),
  ...wellLogLayerCatalog.map(({ id }) => id),
  ...churchLayerCatalog.map(({ id }) => id),
];

const expectedCataloguePlacement = [
  { id: "modern", label: "Modern map", category: "Background Maps", kind: "control" },
  { id: "ns-aerial", label: "NS Aerial", category: "Background Maps", kind: "control" },
  { id: "nsprd", label: "NS Property Boundaries", category: "Land & Property", kind: "control" },
  { id: "crown-lands", label: "Crown Lands", category: "Land & Property", kind: "control" },
  { id: "buildings", label: "Buildings", category: "Land & Property", kind: "control" },
  { id: "zoning-inverness", label: "Inverness County zoning", category: "Land & Property", kind: "control" },
  { id: "zoning-victoria", label: "Victoria County zoning", category: "Land & Property", kind: "control" },
  { id: "zoning-richmond", label: "Richmond County zoning", category: "Land & Property", kind: "control" },
  { id: "zoning-cumberland", label: "Cumberland County zoning", category: "Land & Property", kind: "control" },
  { id: "zoning-halifax", label: "Halifax Regional Municipality zoning", category: "Land & Property", kind: "control" },
  { id: "roads", label: "Roads, trails & culverts", category: "Roads & Places", kind: "control" },
  { id: "main-roads", label: "Main roads only", category: "Roads & Places", kind: "control" },
  { id: "place-names", label: "Place names", category: "Roads & Places", kind: "control" },
  { id: "flood-risk", label: "Watersheds", category: "Environment & Hazards", kind: "control" },
  { id: "waterfalls", label: "Waterfalls", category: "Water & Terrain", kind: "control" },
  { id: "water-features", label: "Water features", category: "Water & Terrain", kind: "control" },
  { id: "contours", label: "Contours", category: "Water & Terrain", kind: "control" },
  { id: "inverness-hydro-potential", label: "Inverness micro-hydro screen", category: "Water & Terrain", kind: "control" },
  { id: "published-river-flood-zones", label: "Published river flood zones", category: "Environment & Hazards", kind: "control" },
  { id: "coastal-flood-current", label: "Coastal flooding — current", category: "Environment & Hazards", kind: "control" },
  { id: "coastal-flood-2050", label: "Coastal flooding — 2050", category: "Environment & Hazards", kind: "control" },
  { id: "coastal-flood-2100", label: "Coastal flooding — 2100", category: "Environment & Hazards", kind: "control" },
  { id: "arsenic-risk-wells", label: "Arsenic risk — bedrock wells", category: "Environment & Hazards", kind: "control" },
  { id: "uranium-risk-wells", label: "Uranium risk — bedrock wells", category: "Environment & Hazards", kind: "control" },
  { id: "manganese-risk-wells", label: "Manganese risk — water wells", category: "Environment & Hazards", kind: "control" },
  { id: "surficial-aquifers", label: "Surficial aquifers", category: "Environment & Hazards", kind: "control" },
  { id: "ns-well-logs", label: "Water well logs", category: "Environment & Hazards", kind: "control" },
  { id: "old-growth-policy", label: "Old-growth policy areas", category: "Forestry & Ecology", kind: "control" },
  { id: "mineral-occurrences", label: "Mineral occurrences", category: "Geology & Resources", kind: "control" },
  { id: "mineral-tenure", label: "Mineral tenure", category: "Geology & Resources", kind: "control" },
  { id: "abandoned-mines", label: "Abandoned mine openings", category: "Geology & Resources", kind: "control" },
  { id: "mineral-proximity-parcels", label: "Properties within 1 km of a mineral occurrence", category: "Geology & Resources", kind: "control" },
  { id: "fletcher", label: "Fletcher historical map", category: "Historical Maps", kind: "control" },
  { id: "church-inverness", label: "Church — Inverness County", category: "Historical Maps", kind: "unavailable" },
  { id: "church-victoria", label: "Church — Victoria County", category: "Historical Maps", kind: "unavailable" },
  { id: "church-richmond", label: "Church — Richmond County", category: "Historical Maps", kind: "unavailable" },
  { id: "church-cape-breton", label: "Church — Cape Breton County", category: "Historical Maps", kind: "unavailable" },
] as const;

vi.mock("./userMaps/parsers/parseGeoPdfAuto", () => ({
  parseGeoPdfAuto: parseGeoPdfAutoMock,
}));

// The GeoPDF export path's own compositor and PDF composer are real,
// heavyweight code (tile fetches, canvas compositing, pdf-lib) that no other
// test in this file drives to completion — every existing export test stops
// at the dialog. These two are mocked so an App-level test CAN click all the
// way through "Download PDF" and inspect exactly what App.tsx handed the
// compositor: the `layers` it built (province-licence filtering) and the
// `attributionLines` it composed (export-vs-visible filtering), without
// depending on real tile network calls or real canvas rendering.
const composeMapImageMock = vi.hoisted(() => vi.fn());
const composeGeoPdfMock = vi.hoisted(() => vi.fn());

vi.mock("./print/pdf/mapCompositor", async (importOriginal) => {
  const original =
    await importOriginal<typeof import("./print/pdf/mapCompositor")>();
  return { ...original, composeMapImage: composeMapImageMock };
});

vi.mock("./print/pdf/pdfComposer", async (importOriginal) => {
  const original =
    await importOriginal<typeof import("./print/pdf/pdfComposer")>();
  return { ...original, composeGeoPdf: composeGeoPdfMock };
});

/** Drives the "Simulate map drift" button below; hoisted so the factory can
 *  close over it. */
let viewportDrift = vi.hoisted(() => 0);

vi.mock("./components/MapCanvas", () => ({
  MapCanvas: ({
    parcels,
    taxSalePids,
    historicalTaxSalePids,
    provinceLayers,
    resourceLayers,
    hydroPilotLayers,
    forestryLayers,
    environmentalHealthLayers,
    floodHazardLayers,
    fletcherVisible,
    fletcherOpacity,
    fletcherTileBaseUrl,
    showModernMap,
    showTaxSale,
    showHistoricalTaxSales,
    selectedPid,
    initialPosition,
    preserveInitialPosition,
    onIdentifyParcel,
    onPositionChange,
    focusRequest,
    onViewportChange,
    onLayerStatusChange,
    renderMode,
    fitBounds,
    georeference,
    userMaps,
    userMapFitRequest,
    exportFrame,
    onExportFrameContinue,
  }: {
    parcels: { features: unknown[] };
    taxSalePids: Set<string>;
    historicalTaxSalePids: Set<string>;
    provinceLayers: Record<string, boolean>;
    resourceLayers: Record<string, boolean>;
    hydroPilotLayers: Record<string, boolean>;
    forestryLayers?: Record<string, boolean>;
    environmentalHealthLayers?: Record<string, boolean>;
    floodHazardLayers: Record<string, boolean>;
    fletcherVisible?: boolean;
    fletcherOpacity?: number;
    fletcherTileBaseUrl?: string | null;
    showModernMap: boolean;
    showTaxSale: boolean;
    showHistoricalTaxSales: boolean;
    selectedPid?: string | null;
    initialPosition?: { latitude: number; longitude: number; zoom: number };
    preserveInitialPosition?: boolean;
    onIdentifyParcel: (latitude: number, longitude: number) => void;
    onPositionChange?: (position: {
      latitude: number; longitude: number; zoom: number;
    }) => void;
    focusRequest?: { pid: string; requestId: number } | null;
    onViewportChange?: (viewport: {
      position: { latitude: number; longitude: number; zoom: number };
      bounds: { north: number; east: number; south: number; west: number };
    }) => void;
    onLayerStatusChange?: (id: string, status: { status: "ready" }) => void;
    renderMode?: "interactive" | "print";
    fitBounds?: unknown;
    georeference?: {
      gcps: { id: string; pixel: { x: number; y: number }; map: { lat: number; lng: number } }[];
      draft?: { record: { id: string } };
      focus?: { lat: number; lng: number } | null;
      onPickMapPoint: (lat: number, lng: number) => void;
      onDragStartGcp: (id: string) => void;
      onDragEndGcp: (id: string) => void;
      onMoveGcpOnMap: (id: string, lat: number, lng: number) => void;
    } | null;
    userMaps?: unknown[];
    userMapFitRequest?: { mapId: string; revision: number } | null;
    exportFrame?: unknown;
    onExportFrameContinue?: (
      bounds: { north: number; south: number; west: number; east: number },
      orientation: "portrait" | "landscape",
    ) => void;
  }) => {
    if (renderMode !== "print") {
      const normalizedState = [
        `modern:${showModernMap ? "on" : "off"}`,
        `ns-aerial:${provinceLayers["ns-aerial"] ? "on" : "off"}`,
        `nsprd:${provinceLayers.nsprd ? "on" : "off"}`,
        `roads:${provinceLayers.roads ? "on" : "off"}`,
        `water:${provinceLayers["water-features"] ? "on" : "off"}`,
        `tax-sale:${showTaxSale ? "on" : "off"}`,
      ].join(";");
      if (normalizedState !== lastObservedInteractiveMapState.value) {
        observedInteractiveMapStates.push(normalizedState);
        lastObservedInteractiveMapState.value = normalizedState;
      }
    }

    useEffect(() => {
      if (renderMode === "print") {
        [
          "modern",
          "ns-aerial",
          "nsprd",
          "crown-lands",
          "flood-risk",
          "waterfalls",
          "water-features",
          "roads",
          "buildings",
          "contours",
          "mineral-occurrences",
          "mineral-tenure",
          "abandoned-mines",
          "mineral-proximity-parcels",
          "inverness-hydro-potential",
          "old-growth-policy",
          "published-river-flood-zones",
          "coastal-flood-current",
          "coastal-flood-2050",
          "coastal-flood-2100",
          "arsenic-risk-wells",
          "uranium-risk-wells",
          "manganese-risk-wells",
          "surficial-aquifers",
        ].forEach((id) => onLayerStatusChange?.(id, { status: "ready" }));
        return;
      }
      onViewportChange?.({
        position: { latitude: 46.25, longitude: -61.25, zoom: 13 },
        bounds: { north: 46.5, east: -61, south: 46, west: -61.5 },
      });
    }, [
      onLayerStatusChange,
      onViewportChange,
      renderMode,
    ]);

    return (
    <div data-testid="map-canvas">
      Map PID count: {taxSalePids.size}; geometry count: {parcels.features.length};
      modern map: {showModernMap ? "on" : "off"}; tax-sale layer:{" "}
      {showTaxSale ? "on" : "off"}; Fletcher:{" "}
      {fletcherVisible ? "on" : "off"} at{" "}
      {Math.round((fletcherOpacity ?? 0) * 100)}% from{" "}
      {fletcherTileBaseUrl ?? "no host"}; property boundaries:{" "}
      {provinceLayers.nsprd ? "on" : "off"}; water:{" "}
      {provinceLayers["water-features"] ? "on" : "off"}; roads:{" "}
      {provinceLayers.roads ? "on" : "off"}; buildings:{" "}
      {provinceLayers.buildings ? "on" : "off"}; contours:{" "}
      {provinceLayers.contours ? "on" : "off"}; historical layer:{" "}
      {showHistoricalTaxSales ? "on" : "off"}; historical PID count:{" "}
      {historicalTaxSalePids.size}; mineral occurrences:{" "}
      {resourceLayers["mineral-occurrences"] ? "on" : "off"}; mineral tenure:{" "}
      {resourceLayers["mineral-tenure"] ? "on" : "off"}; abandoned mines:{" "}
      {resourceLayers["abandoned-mines"] ? "on" : "off"}; mineral proximity parcels:{" "}
      {resourceLayers["mineral-proximity-parcels"] ? "on" : "off"}
      ; Inverness micro-hydro screen: {hydroPilotLayers["inverness-hydro-potential"] ? "on" : "off"}
      ; old-growth policy areas: {forestryLayers?.["old-growth-policy"] ? "on" : "off"}
      ; arsenic risk: {environmentalHealthLayers?.["arsenic-risk-wells"] ? "on" : "off"}
      ; uranium risk: {environmentalHealthLayers?.["uranium-risk-wells"] ? "on" : "off"}
      ; surficial aquifers: {environmentalHealthLayers?.["surficial-aquifers"] ? "on" : "off"}
      ; published river flood zones:{" "}
      {floodHazardLayers["published-river-flood-zones"] ? "on" : "off"}
      ; coastal flooding current:{" "}
      {floodHazardLayers["coastal-flood-current"] ? "on" : "off"}
      {renderMode === "print"
        ? `; ${fitBounds ? "Parcel fit" : "Missing parcel fit"}`
        : <>; initial position: {initialPosition?.latitude ?? "missing"},{initialPosition?.longitude ?? "missing"},{initialPosition?.zoom ?? "missing"}; preserve initial position: {preserveInitialPosition ? "yes" : "no"}</>}
      ; focus request: {focusRequest?.pid ?? "none"}
      ; georeferencing: {georeference?.draft?.record.id ?? "none"}
      ; saved user map layers: {userMaps?.length ?? 0}
      ; user map fit: {userMapFitRequest?.mapId ?? "none"}@
      {userMapFitRequest?.revision ?? 0}
      ; georeference focus:{" "}
      {georeference?.focus
        ? `${georeference.focus.lat},${georeference.focus.lng}`
        : "none"}
      ; export frame: {exportFrame ? "framing" : "none"}
      ; selected PID: {selectedPid ?? "none"}
      <button type="button" onClick={() => onIdentifyParcel(46.059488, -61.414138)}>
        Tap map parcel
      </button>
      {/* The real frame-to-dialog handoff lives inside `ExportFrameLayer`,
          which this mock replaces — so stand in for its Continue button and
          hand App the same (bounds, orientation) it would. Without this the
          export dialog is unreachable from an App-level test. */}
      {exportFrame ? (
        <button
          type="button"
          onClick={() =>
            onExportFrameContinue?.(
              { north: 46.2, south: 46.0, west: -61.4, east: -61.1 },
              "portrait",
            )}
        >
          Continue export frame
        </button>
      ) : null}
      {renderMode !== "print" ? (
        <>
          <button
            type="button"
            onClick={() => onPositionChange?.({ latitude: 44.01, longitude: -63.01, zoom: 17 })}
          >
            Simulate location recenter
          </button>
          <button
            type="button"
            onClick={() => onViewportChange?.({
              position: { latitude: 45.01, longitude: -62.01, zoom: 12 },
              bounds: { north: 45.2, east: -61.8, south: 44.8, west: -62.2 },
            })}
          >
            Simulate map viewport
          </button>
          {/* Each click reports a DIFFERENT position, the way a real pan or
              wheel-zoom burst does, so a test can drive successive share-URL
              changes. The button above deliberately reports a fixed position
              and cannot. */}
          <button
            type="button"
            onClick={() => {
              viewportDrift += 1;
              onViewportChange?.({
                position: {
                  latitude: 45.01 + viewportDrift / 1000,
                  longitude: -62.01 + viewportDrift / 1000,
                  zoom: 12,
                },
                bounds: { north: 45.2, east: -61.8, south: 44.8, west: -62.2 },
              });
            }}
          >
            Simulate map drift
          </button>
        </>
      ) : null}
      {georeference ? (
        <>
          {/* These three exist so an App-level test can assert on the
              REAL, OBSERVABLE effect of calling the georeference binding's
              handlers — not merely that some function reference was passed.
              Task 12's brief calls out that onPickMapPoint/onDragStartGcp/
              onMoveGcpOnMap each has a same-signature sibling on the session
              (pickScanPoint/deleteGcp/moveGcpOnScan) that would satisfy
              every other test in this branch while behaving very
              differently — only exercising the handler and checking its
              result catches a swap. */}
          <pre data-testid="georeference-gcps">
            {JSON.stringify(georeference.gcps)}
          </pre>
          <button
            type="button"
            onClick={() => georeference.onPickMapPoint(46.05, -61.1)}
          >
            Simulate map click
          </button>
          <button
            type="button"
            onClick={() =>
              georeference.onDragStartGcp(georeference.gcps[0]?.id ?? "")
            }
          >
            Simulate marker dragstart
          </button>
          <button
            type="button"
            onClick={() =>
              georeference.onDragEndGcp(georeference.gcps[0]?.id ?? "")
            }
          >
            Simulate marker dragend
          </button>
          <button
            type="button"
            onClick={() =>
              georeference.onMoveGcpOnMap(
                georeference.gcps[0]?.id ?? "",
                40,
                -70,
              )
            }
          >
            Simulate marker drag
          </button>
        </>
      ) : null}
    </div>
    );
  },
}));

vi.mock("./userMaps/components/ScanPane", () => ({
  ScanPane: () => <div data-testid="scan-pane" />,
}));

vi.mock("./userMaps/parsers/imageSource", () => ({
  parseImage: async () => ({
    pixelSize: { width: 1200, height: 800 },
    preview: new Blob(["preview"], { type: "image/png" }),
    previewSize: { width: 1200, height: 800 },
  }),
}));

vi.mock("./services/nsprd", async (importOriginal) => {
  const original = await importOriginal<typeof import("./services/nsprd")>();
  return {
    ...original,
    fetchParcelAtPoint: vi.fn().mockResolvedValue({
      type: "FeatureCollection",
      features: [],
    }),
    fetchParcels: vi.fn().mockResolvedValue({
      type: "FeatureCollection",
      features: [],
    }),
  };
});

vi.mock("./services/parcelContext", async (importOriginal) => {
  const original = await importOriginal<typeof import("./services/parcelContext")>();
  return {
    ...original,
    fetchParcelContext: vi.fn().mockResolvedValue({ roads: [], water: [] }),
  };
});

vi.mock("./services/civicAddresses", async (importOriginal) => {
  const original = await importOriginal<typeof import("./services/civicAddresses")>();
  return {
    ...original,
    fetchCivicAddresses: vi.fn().mockResolvedValue([]),
    searchCivicAddresses: vi.fn().mockResolvedValue([]),
  };
});

vi.mock("./services/parcelResources", async (importOriginal) => {
  const original = await importOriginal<typeof import("./services/parcelResources")>();
  return {
    ...original,
    fetchParcelResourceIntersections: vi.fn().mockResolvedValue({
      "mineral-occurrences": { status: "ready", intersections: [] },
      "mineral-tenure": { status: "ready", intersections: [] },
      "abandoned-mines": { status: "ready", intersections: [] },
    }),
  };
});

vi.mock("./services/floodHazard", async (importOriginal) => {
  const original = await importOriginal<typeof import("./services/floodHazard")>();
  return {
    ...original,
    fetchParcelFloodHazardEvidence: vi.fn().mockResolvedValue({
      river: { status: "outside-published-layer-extents", aep: [] },
      coastal: [
        { scenario: "current", status: "no-intersection", stormAnnualExceedanceProbabilityPercent: 1, approximateAffectedPercent: 0, approximateAffectedSquareMetres: 0, sampledParcelPixels: 100 },
        { scenario: "2050", status: "no-intersection", stormAnnualExceedanceProbabilityPercent: 1, approximateAffectedPercent: 0, approximateAffectedSquareMetres: 0, sampledParcelPixels: 100 },
        { scenario: "2100", status: "no-intersection", stormAnnualExceedanceProbabilityPercent: 1, approximateAffectedPercent: 0, approximateAffectedSquareMetres: 0, sampledParcelPixels: 100 },
      ],
    }),
  };
});

vi.mock("./services/buildings", async (importOriginal) => {
  const original = await importOriginal<typeof import("./services/buildings")>();
  return {
    ...original,
    fetchParcelBuildingCount: vi.fn().mockResolvedValue({
      count: 0,
      pointCount: 0,
      polygonCount: 0,
    }),
  };
});

vi.mock("./services/pvscAssessments", async (importOriginal) => {
  const original = await importOriginal<typeof import("./services/pvscAssessments")>();
  return {
    ...original,
    fetchParcelAssessments: vi.fn().mockResolvedValue({
      matchMethod: "spatial",
      accounts: [],
    }),
  };
});

vi.mock("./services/pvscDwellings", async (importOriginal) => {
  const original = await importOriginal<typeof import("./services/pvscDwellings")>();
  return {
    ...original,
    fetchDwellingCharacteristics: vi.fn().mockResolvedValue([]),
  };
});

vi.mock("./services/evidenceNote", async (importOriginal) => {
  const original = await importOriginal<typeof import("./services/evidenceNote")>();
  return {
    ...original,
    buildEvidenceNote: vi.fn(original.buildEvidenceNote),
  };
});

const parcelFeature = (pid: string) => ({
  type: "Feature" as const,
  properties: { PID: pid, "SHAPE.AREA": 111_057.27135 },
  geometry: {
    type: "Polygon" as const,
    coordinates: [
      [
        [-61.2, 46.4],
        [-61.1, 46.4],
        [-61.1, 46.3],
        [-61.2, 46.3],
        [-61.2, 46.4],
      ],
    ],
  },
});

const civicAddress = (pntid: string, label: string): CivicAddress => ({
  pntid,
  coordinates: [-61.15, 46.35],
  label,
  properties: {
    pntid,
    civicnum: "12",
    civsuffix: null,
    unit_num: null,
    add_loc: "Unknown",
    strprefix: null,
    strname: "Main",
    strsuffix: "St",
    strdir: null,
    comm: "Mabou",
    mun: "Municipality of the County of Inverness",
    county: "Inverness County",
  },
});

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((nextResolve, nextReject) => {
    resolve = nextResolve;
    reject = nextReject;
  });
  return { promise, resolve, reject };
}

function mapSetupStatus(): HTMLElement {
  const picker = screen.getByLabelText("Map setup").closest(".map-theme-picker");
  if (!picker) throw new Error("Map setup picker is missing");
  return within(picker as HTMLElement).getByRole("status");
}

function openLayerCategory(name: string): HTMLElement {
  const matcher = new RegExp(`^${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`);
  const disclosure = screen.getByRole("button", { name: matcher });
  if (disclosure.getAttribute("aria-expanded") === "false") {
    fireEvent.click(disclosure);
  }
  return screen.getByRole("region", { name: matcher });
}

function expandedLayerCategoryIds(): string[] {
  return layerCategories
    .filter(({ name }) => screen.getByRole("button", {
      name: new RegExp(`^${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`),
    }).getAttribute("aria-expanded") === "true")
    .map(({ id }) => id);
}

function visibleLayerCategoryButtons(): HTMLElement[] {
  return layerCategories.map(({ name }) => screen.getByRole("button", {
    name: new RegExp(`^${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`),
  }));
}

function openLayerCategories(...names: string[]): void {
  for (const name of names) {
    openLayerCategory(name);
  }
}

function renderAppWithCategoriesOpen() {
  const result = render(<App />);
  for (const { name } of layerCategories) {
    openLayerCategory(name);
  }
  return result;
}

function setTaxSaleResearchUrl(): void {
  window.history.replaceState(
    null,
    "",
    "/?taxSale=on&mode=current&layers=modern,ns-aerial,nsprd,water-features,roads",
  );
}

function setRestrictedGeneralShareUrl(): void {
  window.history.replaceState(
    null,
    "",
    "/?taxSale=off&layers=modern,ns-aerial,nsprd",
  );
}

function setMatchMedia(query: string, initialMatches: boolean) {
  let matches = initialMatches;
  const listeners = new Set<(event: MediaQueryListEvent) => void>();
  const controlledQuery = {
    get matches() {
      return matches;
    },
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn((type: string, listener: EventListener) => {
      if (type === "change") {
        listeners.add(listener as (event: MediaQueryListEvent) => void);
      }
    }),
    removeEventListener: vi.fn((type: string, listener: EventListener) => {
      if (type === "change") {
        listeners.delete(listener as (event: MediaQueryListEvent) => void);
      }
    }),
    dispatchEvent: vi.fn((event: Event) => {
      for (const listener of listeners) {
        listener(event as MediaQueryListEvent);
      }
      return true;
    }),
  } as MediaQueryList;
  vi.stubGlobal("matchMedia", vi.fn((value: string): MediaQueryList => (
    value === query
      ? controlledQuery
      : {
          matches: false,
          media: value,
          onchange: null,
          addListener: vi.fn(),
          removeListener: vi.fn(),
          addEventListener: vi.fn(),
          removeEventListener: vi.fn(),
          dispatchEvent: vi.fn(() => false),
        }
  )));
  return {
    setMatches(nextMatches: boolean) {
      matches = nextMatches;
      const event = { matches, media: query } as MediaQueryListEvent;
      controlledQuery.dispatchEvent(event);
    },
    listenerCount() {
      return listeners.size;
    },
  };
}

const STORED_FIELD_THEME = {
  id: "custom-field-day",
  name: "Field day",
  layerIds: ["modern", "roads"],
  opacityOverrides: {},
  preferredCategoryIds: ["roads-places"],
  taxSaleEnabled: false,
  mapMode: "current",
};

function storeCustomThemes(
  themes: readonly (typeof STORED_FIELD_THEME)[],
): void {
  localStorage.setItem(CUSTOM_THEME_STORAGE_KEY, JSON.stringify({
    version: 1,
    themes,
  }));
}

describe("NS Marks The Spot Online", () => {
  beforeEach(() => {
    localStorage.clear();
    window.history.replaceState(null, "", "/");
    observedInteractiveMapStates.length = 0;
    lastObservedInteractiveMapState.value = null;
    vi.mocked(fetchParcels).mockResolvedValue({
      type: "FeatureCollection",
      features: [],
    });
    vi.mocked(fetchParcelAtPoint).mockResolvedValue({
      type: "FeatureCollection",
      features: [],
    });
    vi.mocked(fetchParcelContext).mockResolvedValue({ roads: [], water: [] });
    vi.mocked(fetchCivicAddresses).mockResolvedValue([]);
    vi.mocked(searchCivicAddresses).mockResolvedValue([]);
    vi.mocked(fetchParcelResourceIntersections).mockResolvedValue({
      "mineral-occurrences": { status: "ready", intersections: [] },
      "mineral-tenure": { status: "ready", intersections: [] },
      "abandoned-mines": { status: "ready", intersections: [] },
    });
    vi.mocked(fetchParcelFloodHazardEvidence).mockResolvedValue({
      river: { status: "outside-published-layer-extents", aep: [] },
      coastal: [
        { scenario: "current", status: "no-intersection", stormAnnualExceedanceProbabilityPercent: 1, approximateAffectedPercent: 0, approximateAffectedSquareMetres: 0, sampledParcelPixels: 100 },
        { scenario: "2050", status: "no-intersection", stormAnnualExceedanceProbabilityPercent: 1, approximateAffectedPercent: 0, approximateAffectedSquareMetres: 0, sampledParcelPixels: 100 },
        { scenario: "2100", status: "no-intersection", stormAnnualExceedanceProbabilityPercent: 1, approximateAffectedPercent: 0, approximateAffectedSquareMetres: 0, sampledParcelPixels: 100 },
      ],
    });
    vi.mocked(fetchParcelBuildingCount).mockResolvedValue({
      count: 0,
      pointCount: 0,
      polygonCount: 0,
    });
    vi.mocked(fetchParcelAssessments).mockResolvedValue({
      matchMethod: "spatial",
      accounts: [],
    });
    vi.mocked(fetchDwellingCharacteristics).mockResolvedValue([]);
    vi.mocked(buildEvidenceNote).mockClear();
    composeMapImageMock.mockReset().mockResolvedValue({
      canvas: (() => {
        const canvas = document.createElement("canvas");
        canvas.width = 8;
        canvas.height = 8;
        return canvas;
      })(),
      statuses: [
        { id: "modern", name: "OpenStreetMap base map", status: "rendered" },
      ],
    });
    composeGeoPdfMock.mockReset()
      .mockResolvedValue(new Uint8Array([37, 80, 68, 70]));
    Object.defineProperty(URL, "createObjectURL", {
      configurable: true,
      value: vi.fn(() => "blob:test-evidence"),
    });
    Object.defineProperty(URL, "revokeObjectURL", {
      configurable: true,
      value: vi.fn(),
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("starts with Explore Nova Scotia and performs no tax-sale geometry request", async () => {
    localStorage.setItem(PROVINCE_LICENSE_ACCEPTANCE_KEY, "accepted");
    window.history.replaceState(null, "", "/");

    render(<App />);

    await waitFor(() => {
      expect(new URL(window.location.href).searchParams.get("taxSale"))
        .toBe("off");
    });
    expect(fetchParcels).not.toHaveBeenCalled();
    expect(
      screen.getByRole("heading", { name: "Explore Nova Scotia" }),
    ).toBeInTheDocument();
    expect(screen.getByTestId("map-canvas")).toHaveTextContent(
      "Map PID count: 0",
    );
    expect(screen.getByTestId("map-canvas")).toHaveTextContent(
      "tax-sale layer: off",
    );
    expect(screen.getByTestId("map-canvas")).toHaveTextContent(
      "focus request: none",
    );
  });

  it("removes every tax-sale surface without refetching or clearing the selected parcel", async () => {
    const anchorClick = vi
      .spyOn(HTMLAnchorElement.prototype, "click")
      .mockImplementation(() => undefined);
    localStorage.setItem(PROVINCE_LICENSE_ACCEPTANCE_KEY, "accepted");
    window.history.replaceState(
      null,
      "",
      "/?taxSale=on&mode=current&pid=50203256&event=middleton-2026-08-20&layers=nsprd",
    );
    vi.mocked(fetchParcels).mockImplementation(async (pids) => ({
      type: "FeatureCollection",
      features: pids.map(parcelFeature),
    }));
    render(<App />);
    const taxSale = openLayerCategory("Tax Sale");

    expect(await within(taxSale).findByRole("region", {
      name: "Current tax-sale notices",
    })).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByTestId("map-canvas")).toHaveTextContent(
        "selected PID: 50203256",
      );
    });
    vi.mocked(fetchParcels).mockClear();

    await userEvent.click(
      within(taxSale).getByLabelText("Show tax-sale information"),
    );

    expect(fetchParcels).not.toHaveBeenCalled();
    expect(screen.getByTestId("map-canvas")).toHaveTextContent(
      "tax-sale layer: off",
    );
    expect(screen.getByTestId("map-canvas")).toHaveTextContent(
      "historical layer: off",
    );
    expect(screen.getByTestId("map-canvas")).toHaveTextContent(
      "Map PID count: 0",
    );
    expect(screen.getByTestId("map-canvas")).toHaveTextContent(
      "historical PID count: 0",
    );
    expect(screen.getByTestId("map-canvas")).toHaveTextContent(
      "selected PID: 50203256",
    );
    const inspector = screen.getByRole("complementary", {
      name: "Parcel 50203256 details",
    });
    expect(inspector).toBeInTheDocument();
    expect(within(taxSale).queryByRole("group", {
      name: /current notices or historical records/i,
    })).not.toBeInTheDocument();
    expect(within(taxSale).queryByRole("region", {
      name: "Current tax-sale notices",
    })).not.toBeInTheDocument();
    expect(within(taxSale).queryByLabelText("Redemption category"))
      .not.toBeInTheDocument();
    await waitFor(() =>
      expect(new URL(window.location.href).searchParams.get("event")).toBeNull(),
    );

    const exportButton = within(inspector).getByRole("button", {
      name: "Export evidence note",
    });
    await waitFor(() => expect(exportButton).toBeEnabled());
    await userEvent.click(exportButton);
    expect(buildEvidenceNote).toHaveBeenLastCalledWith(expect.objectContaining({
      taxSaleEnabled: false,
      events: [],
    }));
    const exportedNote = vi.mocked(buildEvidenceNote).mock.results.at(-1)?.value;
    expect(exportedNote?.markdown).not.toContain("Mode: Current notices");
    expect(exportedNote?.markdown).not.toContain("## Event");
    expect(exportedNote?.markdown).not.toContain(
      "Tax-sale notices and results are dated source records",
    );
    expect(exportedNote?.markdown).toContain("## PVSC assessment accounts");

    await userEvent.click(within(inspector).getByRole("button", {
      name: "Print / export",
    }));
    const printDialog = await screen.findByRole("dialog", {
      name: "Print / export",
    });
    const appendix = within(printDialog).getByRole("region", {
      name: "Evidence appendix",
    });
    expect(appendix).not.toHaveTextContent(/tax[- ]sale/i);
    expect(within(appendix).getByRole("heading", {
      name: "Mapped parcel area",
    })).toBeInTheDocument();
    expect(within(printDialog).getByText(/Map PID count: 0/))
      .toHaveTextContent("historical PID count: 0");
    anchorClick.mockRestore();
  });

  it("uses ordinary parcel evidence rather than a notice AAN while Tax Sale is off", async () => {
    localStorage.setItem(PROVINCE_LICENSE_ACCEPTANCE_KEY, "accepted");
    window.history.replaceState(
      null,
      "",
      "/?taxSale=off&mode=current&pid=50203256&layers=nsprd",
    );
    vi.mocked(fetchParcels).mockResolvedValue({
      type: "FeatureCollection",
      features: [parcelFeature("50203256")],
    });

    render(<App />);

    await screen.findByRole("complementary", {
      name: "Parcel 50203256 details",
    });
    await waitFor(() => expect(fetchParcelAssessments).toHaveBeenCalled());
    expect(fetchParcelAssessments).toHaveBeenLastCalledWith(
      expect.any(Array),
      undefined,
      expect.any(AbortSignal),
    );
  });

  it("keeps an ordinary parcel inspector free of tax-sale presentation while Tax Sale is off", async () => {
    localStorage.setItem(PROVINCE_LICENSE_ACCEPTANCE_KEY, "accepted");
    window.history.replaceState(
      null,
      "",
      "/?taxSale=off&mode=historical&pid=50334317&layers=nsprd",
    );
    vi.mocked(fetchParcels).mockResolvedValue({
      type: "FeatureCollection",
      features: [parcelFeature("50334317")],
    });

    render(<App />);

    const inspector = await screen.findByRole("complementary", {
      name: "Parcel 50334317 details",
    });
    expect(within(inspector).getByText("NSPRD parcel")).toBeInTheDocument();
    expect(await within(inspector).findByText(
      "No PVSC account point from the open dataset was mapped inside this parcel. This does not prove no assessment account or assessed value exists.",
    )).toBeInTheDocument();
    expect(within(inspector).queryByText("Historical-records mode")).not.toBeInTheDocument();
    expect(within(inspector).queryByText("Current-notice mode")).not.toBeInTheDocument();
    expect(within(inspector).queryByText(
      "This PID is not listed in any municipal notice included by this map.",
    )).not.toBeInTheDocument();
    expect(within(inspector).queryByRole("region", {
      name: "Historical tax-sale records",
    })).not.toBeInTheDocument();
    expect(new URL(window.location.href).searchParams.get("mode")).toBe("historical");
  });

  it("labels a notice hidden by the active mode instead of claiming the PID is unlisted", async () => {
    localStorage.setItem(PROVINCE_LICENSE_ACCEPTANCE_KEY, "accepted");
    window.history.replaceState(
      null,
      "",
      // 00542589 is matched in the HRM 2022-03-08 historical record, which
      // current mode hides — the inspector must not call it unlisted.
      "/?taxSale=on&mode=current&pid=00542589&layers=nsprd",
    );
    vi.mocked(fetchParcels).mockResolvedValue({
      type: "FeatureCollection",
      features: [parcelFeature("00542589")],
    });

    render(<App />);

    const inspector = await screen.findByRole("complementary", {
      name: "Parcel 00542589 details",
    });
    expect(await within(inspector).findByText(
      /hidden by the current mode or filters/,
    )).toBeInTheDocument();
    expect(within(inspector).queryByText(
      "This PID is not listed in any municipal notice included by this map.",
    )).not.toBeInTheDocument();
  });

  it("ignores a late notice-AAN assessment after Tax Sale is turned off", async () => {
    const noticeAssessment = deferred<Awaited<ReturnType<typeof fetchParcelAssessments>>>();
    const ordinaryAssessment = deferred<Awaited<ReturnType<typeof fetchParcelAssessments>>>();
    localStorage.setItem(PROVINCE_LICENSE_ACCEPTANCE_KEY, "accepted");
    window.history.replaceState(
      null,
      "",
      "/?taxSale=on&mode=current&pid=50203256&event=inverness-county-2026-08-11&layers=nsprd",
    );
    vi.mocked(fetchParcels).mockImplementation(async (pids) => ({
      type: "FeatureCollection",
      features: pids.map(parcelFeature),
    }));
    vi.mocked(fetchParcelAssessments).mockImplementation((_features, noticeAan) =>
      noticeAan ? noticeAssessment.promise : ordinaryAssessment.promise,
    );

    render(<App />);
    const taxSale = openLayerCategory("Tax Sale");

    await waitFor(() => expect(fetchParcelAssessments).toHaveBeenCalledWith(
      expect.any(Array),
      "00603988",
      expect.any(AbortSignal),
    ));
    await userEvent.click(
      within(taxSale).getByLabelText("Show tax-sale information"),
    );
    await waitFor(() => expect(fetchParcelAssessments).toHaveBeenCalledWith(
      expect.any(Array),
      undefined,
      expect.any(AbortSignal),
    ));

    await act(async () => {
      ordinaryAssessment.resolve({
        matchMethod: "spatial",
        accounts: [{
          aan: "SPATIAL1",
          records: [{
            taxYear: 2026,
            assessedValue: 222_000,
            taxableAssessedValue: 220_000,
            coordinates: [-61.391318, 46.071925],
          }],
        }],
      });
      await ordinaryAssessment.promise;
    });

    const assessment = await screen.findByRole("region", {
      name: "PVSC assessment account",
    });
    expect(within(assessment).getByText(
      "Matched by a PVSC account point inside the mapped parcel.",
    )).toBeInTheDocument();
    expect(within(assessment).getByText("$222,000.00")).toBeInTheDocument();

    await act(async () => {
      noticeAssessment.resolve({
        matchMethod: "notice-aan",
        accounts: [{
          aan: "00603988",
          records: [{
            taxYear: 2026,
            assessedValue: 999_000,
            taxableAssessedValue: 990_000,
            coordinates: [-61.391318, 46.071925],
          }],
        }],
      });
      await noticeAssessment.promise;
    });

    expect(within(assessment).getByText(
      "Matched by a PVSC account point inside the mapped parcel.",
    )).toBeInTheDocument();
    expect(within(assessment).getByText("$222,000.00")).toBeInTheDocument();
    expect(within(assessment).queryByText("Matched by official notice AAN."))
      .not.toBeInTheDocument();
    expect(within(assessment).queryByText("$999,000.00")).not.toBeInTheDocument();
    expect(fetchDwellingCharacteristics).not.toHaveBeenCalledWith(
      ["00603988"],
      expect.any(AbortSignal),
    );
  });

  it("ignores a late notice-AAN assessment failure after Tax Sale is turned off", async () => {
    const noticeAssessment = deferred<Awaited<ReturnType<typeof fetchParcelAssessments>>>();
    const ordinaryAssessment = deferred<Awaited<ReturnType<typeof fetchParcelAssessments>>>();
    localStorage.setItem(PROVINCE_LICENSE_ACCEPTANCE_KEY, "accepted");
    window.history.replaceState(
      null,
      "",
      "/?taxSale=on&mode=current&pid=50203256&event=inverness-county-2026-08-11&layers=nsprd",
    );
    vi.mocked(fetchParcels).mockImplementation(async (pids) => ({
      type: "FeatureCollection",
      features: pids.map(parcelFeature),
    }));
    vi.mocked(fetchParcelAssessments).mockImplementation((_features, noticeAan) =>
      noticeAan ? noticeAssessment.promise : ordinaryAssessment.promise,
    );

    render(<App />);
    const taxSale = openLayerCategory("Tax Sale");

    await waitFor(() => expect(fetchParcelAssessments).toHaveBeenCalledWith(
      expect.any(Array),
      "00603988",
      expect.any(AbortSignal),
    ));
    await userEvent.click(
      within(taxSale).getByLabelText("Show tax-sale information"),
    );
    await waitFor(() => expect(fetchParcelAssessments).toHaveBeenCalledWith(
      expect.any(Array),
      undefined,
      expect.any(AbortSignal),
    ));

    await act(async () => {
      ordinaryAssessment.resolve({
        matchMethod: "spatial",
        accounts: [{
          aan: "SPATIAL2",
          records: [{
            taxYear: 2026,
            assessedValue: 333_000,
            taxableAssessedValue: 330_000,
            coordinates: [-61.391318, 46.071925],
          }],
        }],
      });
      await ordinaryAssessment.promise;
    });

    const assessment = await screen.findByRole("region", {
      name: "PVSC assessment account",
    });
    expect(within(assessment).getByText(
      "Matched by a PVSC account point inside the mapped parcel.",
    )).toBeInTheDocument();
    expect(within(assessment).getByText("$333,000.00")).toBeInTheDocument();

    await act(async () => {
      noticeAssessment.reject(new Error("late notice lookup failed"));
      await noticeAssessment.promise.catch(() => undefined);
    });

    expect(within(assessment).getByText(
      "Matched by a PVSC account point inside the mapped parcel.",
    )).toBeInTheDocument();
    expect(within(assessment).getByText("$333,000.00")).toBeInTheDocument();
    expect(within(assessment).queryByText(
      "PVSC open assessment data is unavailable. No absence is inferred.",
    )).not.toBeInTheDocument();
    expect(fetchDwellingCharacteristics).not.toHaveBeenCalledWith(
      ["00603988"],
      expect.any(AbortSignal),
    );
  });

  it("enables all currently loaded notices from the category master", async () => {
    localStorage.setItem(PROVINCE_LICENSE_ACCEPTANCE_KEY, "accepted");
    window.history.replaceState(null, "", "/");
    render(<App />);
    const taxSale = openLayerCategory("Tax Sale");

    await userEvent.click(
      within(taxSale).getByLabelText("Show tax-sale information"),
    );

    const currentEventIds = eventsForStatus("upcoming").map(({ id }) => id);
    await waitFor(() =>
      expect(
        new URL(window.location.href).searchParams.get("event")?.split(","),
      ).toEqual(currentEventIds),
    );
    for (const eventId of currentEventIds) {
      expect(JSON.stringify(builtInMapThemes)).not.toContain(eventId);
    }
  });

  it("applies the Tax Sale Research theme with all current notices after acceptance", async () => {
    window.history.replaceState(null, "", "/");
    render(<App />);

    await userEvent.selectOptions(
      screen.getByLabelText("Map setup"),
      "tax-sale-research",
    );
    await userEvent.click(screen.getByRole("button", { name: /accept/i }));

    const taxSale = screen.getByRole("region", { name: /Tax Sale/i });
    expect(within(taxSale).getByLabelText("Show tax-sale information"))
      .toBeChecked();
    const modeGroup = within(taxSale).getByRole("group", {
      name: "Current notices or historical records",
    });
    expect(modeGroup).toBeInTheDocument();
    expect(screen.getAllByRole("group", {
      name: "Current notices or historical records",
    })).toHaveLength(1);
    await waitFor(() => {
      const selectedEvents = new URL(window.location.href).searchParams.get("event");
      expect(selectedEvents).not.toContain("middleton-2026-08-20");
      expect(selectedEvents).toContain("victoria-county-2026-09-14");
    });
  });

  it("clears current and historical tax-sale filters when an off theme is applied", async () => {
    localStorage.setItem(PROVINCE_LICENSE_ACCEPTANCE_KEY, "accepted");
    setTaxSaleResearchUrl();
    renderAppWithCategoriesOpen();

    await userEvent.click(screen.getByRole("button", {
      name: /Immediate \/ none/,
    }));
    await userEvent.click(screen.getByRole("button", {
      name: "Historical records",
    }));
    await userEvent.selectOptions(
      screen.getByLabelText("Historical municipality"),
      "cbrm",
    );

    await userEvent.selectOptions(
      screen.getByLabelText("Map setup"),
      "explore-nova-scotia",
    );
    const taxSale = openLayerCategory("Tax Sale");
    await userEvent.click(
      within(taxSale).getByLabelText("Show tax-sale information"),
    );

    expect(within(taxSale).getByRole("button", { name: /^All / }))
      .toHaveAttribute("aria-pressed", "true");
    await userEvent.click(within(taxSale).getByRole("button", {
      name: "Historical records",
    }));
    expect(within(taxSale).getByLabelText("Historical municipality"))
      .toHaveValue("all");
  });

  it("does not expose controls from a collapsed category", async () => {
    localStorage.setItem(PROVINCE_LICENSE_ACCEPTANCE_KEY, "accepted");
    window.history.replaceState(null, "", "/?taxSale=off&layers=modern");
    render(<App />);

    expect(screen.queryByLabelText("NS Property Boundaries"))
      .not.toBeInTheDocument();
    expect(screen.queryByRole("region", {
      name: /Land & Property/i,
      hidden: false,
    })).not.toBeInTheDocument();

    const land = openLayerCategory("Land & Property");
    expect(within(land).getByLabelText("NS Property Boundaries")).toBeVisible();
  });

  it("renders raster and vector controls directly inside the single My Maps category", () => {
    localStorage.setItem(PROVINCE_LICENSE_ACCEPTANCE_KEY, "accepted");
    window.history.replaceState(null, "", "/");
    render(<App />);

    const myMaps = openLayerCategory("My Maps");
    expect(within(myMaps).getByLabelText("Add a map file")).toBeInTheDocument();
    expect(within(myMaps).getByRole("button", { name: "New drawing layer" }))
      .toBeInTheDocument();
    expect(within(myMaps).queryByText("Your maps")).not.toBeInTheDocument();
    expect(within(myMaps).queryByText("Your data")).not.toBeInTheDocument();
    expect(within(myMaps).queryByRole("group")).not.toBeInTheDocument();
  });

  it("shows one focused category and restores its button focus in phone mode", async () => {
    setMatchMedia("(max-width: 860px)", true);
    localStorage.setItem(PROVINCE_LICENSE_ACCEPTANCE_KEY, "accepted");
    window.history.replaceState(null, "", "/");
    render(<App />);

    await userEvent.click(screen.getByRole("button", { name: "Search & layers" }));
    await userEvent.click(screen.getByRole("button", { name: /^Historical Maps/ }));

    expect(screen.getByRole("button", { name: "Back to categories" }))
      .toHaveFocus();
    expect(screen.getByRole("region", { name: /^Historical Maps/ }))
      .toBeVisible();
    expect(screen.queryByRole("button", { name: /^Land & Property/ }))
      .not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Back to categories" }));
    await waitFor(() => {
      expect(screen.getByRole("button", { name: /^Historical Maps/ }))
        .toHaveFocus();
    });
  });

  it("clears phone focus across breakpoints without changing desktop disclosures", async () => {
    const media = setMatchMedia("(max-width: 860px)", false);
    localStorage.setItem(PROVINCE_LICENSE_ACCEPTANCE_KEY, "accepted");
    window.history.replaceState(null, "", "/");
    const { unmount } = render(<App />);

    expect(expandedLayerCategoryIds()).toEqual(["background-maps"]);

    act(() => media.setMatches(true));
    await userEvent.click(screen.getByRole("button", { name: "Search & layers" }));
    await userEvent.click(screen.getByRole("button", { name: /^Historical Maps/ }));
    expect(screen.getByRole("button", { name: "Back to categories" }))
      .toBeInTheDocument();

    act(() => media.setMatches(false));
    expect(screen.queryByRole("button", { name: "Back to categories" }))
      .not.toBeInTheDocument();
    expect(expandedLayerCategoryIds()).toEqual(["background-maps"]);

    act(() => media.setMatches(true));
    expect(screen.queryByRole("button", { name: "Back to categories" }))
      .not.toBeInTheDocument();
    expect(visibleLayerCategoryButtons()).toHaveLength(10);
    expect(expandedLayerCategoryIds()).toEqual(["background-maps"]);

    expect(media.listenerCount()).toBe(1);
    unmount();
    expect(media.listenerCount()).toBe(0);
  });

  it("returns to the phone category list when the focused heading is activated", async () => {
    setMatchMedia("(max-width: 860px)", true);
    localStorage.setItem(PROVINCE_LICENSE_ACCEPTANCE_KEY, "accepted");
    window.history.replaceState(null, "", "/");
    render(<App />);

    await userEvent.click(screen.getByRole("button", { name: "Search & layers" }));
    await userEvent.click(screen.getByRole("button", { name: /^Historical Maps/ }));
    await userEvent.click(screen.getByRole("button", { name: /^Historical Maps/ }));

    expect(screen.queryByRole("button", { name: "Back to categories" }))
      .not.toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByRole("button", { name: /^Historical Maps/ }))
        .toHaveFocus();
    });
    expect(visibleLayerCategoryButtons()).toHaveLength(10);
  });

  it("keeps the phone sheet and focused category open when a layer toggles", async () => {
    setMatchMedia("(max-width: 860px)", true);
    localStorage.setItem(PROVINCE_LICENSE_ACCEPTANCE_KEY, "accepted");
    window.history.replaceState(null, "", "/");
    render(<App />);

    await userEvent.click(screen.getByRole("button", { name: "Search & layers" }));
    await userEvent.click(screen.getByRole("button", { name: /^Forestry & Ecology/ }));
    await userEvent.click(screen.getByLabelText("Old-growth policy areas"));

    expect(screen.getByRole("complementary", { name: "Map controls" }))
      .toHaveClass("mobile-open");
    expect(screen.getByRole("region", { name: /^Forestry & Ecology/ }))
      .toBeVisible();
    expect(screen.getByRole("button", { name: "Back to categories" }))
      .toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^Land & Property/ }))
      .not.toBeInTheDocument();
  });

  it("renders every current catalogue entry in exactly one expected category region", async () => {
    localStorage.setItem(PROVINCE_LICENSE_ACCEPTANCE_KEY, "accepted");
    window.history.replaceState(null, "", "/?taxSale=off&layers=modern");
    render(<App />);

    for (const category of layerCategories) {
      const disclosure = screen.getByRole("button", {
        name: new RegExp(`^${category.name}`),
      });
      if (disclosure.getAttribute("aria-expanded") === "false") {
        await userEvent.click(disclosure);
      }
    }

    expect([...currentCatalogueIds].sort()).toEqual(
      expectedCataloguePlacement.map(({ id }) => id).sort(),
    );

    const categoryRegions = new Map(
      layerCategories.map(({ name }) => [
        name,
        screen.getByRole("region", { name: new RegExp(`^${name}`) }),
      ]),
    );

    for (const entry of expectedCataloguePlacement) {
      const expectedRegion = categoryRegions.get(entry.category);
      expect(expectedRegion).toBeDefined();

      if (entry.kind === "control") {
        expect(within(expectedRegion as HTMLElement).getByLabelText(entry.label))
          .toBeInTheDocument();
        expect(screen.getAllByLabelText(entry.label)).toHaveLength(1);
      } else {
        expect(within(expectedRegion as HTMLElement).getByText(entry.label))
          .toBeInTheDocument();
        expect(screen.getAllByText(entry.label)).toHaveLength(1);
      }
    }

    const taxSale = screen.getByRole("region", { name: /Tax Sale/i });

    expect(within(taxSale).getByLabelText("Show tax-sale information"))
      .not.toBeChecked();
    expect(within(taxSale).queryByRole("heading", {
      name: "Tax-sale notices",
      level: 4,
    })).not.toBeInTheDocument();
    expect(within(taxSale).queryByRole("heading", {
      name: "Redemption category",
      level: 4,
    })).not.toBeInTheDocument();
  });

  it("updates a collapsed category summary from Off to 1 on without modifying the theme", async () => {
    localStorage.setItem(PROVINCE_LICENSE_ACCEPTANCE_KEY, "accepted");
    window.history.replaceState(null, "", "/?taxSale=off&layers=modern");
    render(<App />);

    const disclosure = screen.getByRole("button", {
      name: /Land & Property.*Off/i,
    });
    await userEvent.click(disclosure);
    expect(mapSetupStatus()).toHaveTextContent("Explore Nova Scotia");
    expect(mapSetupStatus()).not.toHaveTextContent("Modified");

    const land = screen.getByRole("region", { name: /Land & Property/i });
    await userEvent.click(within(land).getByLabelText("NS Property Boundaries"));

    expect(disclosure).toHaveAccessibleName(/Land & Property.*1 on/i);
    await userEvent.click(disclosure);
    expect(screen.queryByRole("region", {
      name: /Land & Property/i,
      hidden: false,
    }))
      .not.toBeInTheDocument();
    expect(disclosure).toHaveAccessibleName(/Land & Property.*1 on/i);
  });

  it("counts a shared restricted layer only after Province licence acceptance", async () => {
    window.history.replaceState(null, "", "/?taxSale=off&layers=nsprd");
    renderAppWithCategoriesOpen();

    expect(screen.getByLabelText("Show tax-sale information")).not.toBeChecked();
    const disclosure = screen.getByRole("button", {
      name: /Land & Property.*Off.*Province licence required/i,
    });
    expect(disclosure).not.toHaveAccessibleName(/1 on/i);
    expect(screen.getByLabelText("NS Property Boundaries")).toBeDisabled();
    expect(screen.getByLabelText("NS Property Boundaries")).not.toBeChecked();

    await userEvent.click(screen.getByRole("button", {
      name: "Accept and view map layers",
    }));

    expect(disclosure).toHaveAccessibleName(/Land & Property.*1 on/i);
    expect(screen.getByLabelText("NS Property Boundaries")).toBeEnabled();
    expect(screen.getByLabelText("NS Property Boundaries")).toBeChecked();
  });

  it("does not prompt for the Province licence on an ordinary first visit", () => {
    window.history.replaceState(null, "", "/");

    renderAppWithCategoriesOpen();

    expect(
      screen.queryByRole("dialog", { name: /province data licence/i }),
    ).not.toBeInTheDocument();
    expect(screen.getByLabelText("NS Aerial")).not.toBeChecked();
    expect(screen.getByLabelText("NS Property Boundaries")).not.toBeChecked();
    expect(screen.getByLabelText("Water features")).not.toBeChecked();
    expect(screen.getByLabelText("Roads, trails & culverts")).not.toBeChecked();
    expect(screen.getByLabelText("Buildings")).not.toBeChecked();
    expect(screen.getByLabelText("Contours")).not.toBeChecked();
    expect(mapSetupStatus()).toHaveTextContent("Explore Nova Scotia");
  });

  it("resolves a geometry-less PID to distinct not-evaluated evidence instead of eternal spinners", async () => {
    // A PID search or share link can select a PID NSPRD has no geometry for.
    // Every geometry-dependent evidence state used to stay on "Checking…"
    // forever — a known condition presented as indefinite progress — and the
    // evidence note could never be exported.
    localStorage.clear();
    localStorage.setItem(PROVINCE_LICENSE_ACCEPTANCE_KEY, "accepted");
    window.history.replaceState(null, "", "/?taxSale=off&mode=current&pid=99999999&layers=nsprd");
    vi.mocked(fetchParcels).mockResolvedValue({
      type: "FeatureCollection",
      features: [],
    });

    render(<App />);
    const inspector = await screen.findByRole("complementary", {
      name: "Parcel 99999999 details",
    });

    // Distinct from a source error AND from returned-empty: the geometry
    // itself is unavailable, so spatial evidence was never evaluated.
    const lines = await within(inspector).findAllByText(
      /NSPRD geometry is unavailable/,
    );
    expect(lines.length).toBeGreaterThanOrEqual(3);
    expect(
      within(inspector).queryByText(/Checking published river/),
    ).not.toBeInTheDocument();
    expect(
      within(inspector).queryByText(/Looking up mapped civic addresses/),
    ).not.toBeInTheDocument();

    // The condition is terminal, so the durable note can be exported and
    // records it rather than claiming absence.
    const anchorClick = vi
      .spyOn(HTMLAnchorElement.prototype, "click")
      .mockImplementation(() => {});
    const exportButton = within(inspector).getByRole("button", {
      name: "Export evidence note",
    });
    await waitFor(() => expect(exportButton).toBeEnabled());
    await userEvent.click(exportButton);
    const note = vi.mocked(buildEvidenceNote).mock.results.at(-1)?.value;
    expect(note?.markdown).toContain(
      "Not evaluated — this PID's NSPRD geometry is unavailable.",
    );
    expect(note?.markdown).not.toContain(
      "No mapped civic address point returned inside the parcel.",
    );
    anchorClick.mockRestore();
  });

  it("keeps the user's layer choices when the licence is merely reviewed", async () => {
    // The footer's "Data & licences" used to open the dialog with the layer
    // intent, whose Accept ran setProvinceLayers(initial) — silently wiping
    // every province layer switched on during the session.
    localStorage.setItem(PROVINCE_LICENSE_ACCEPTANCE_KEY, "accepted");
    window.history.replaceState(null, "", "/");
    renderAppWithCategoriesOpen();

    await userEvent.click(screen.getByLabelText("NS Aerial"));
    expect(screen.getByLabelText("NS Aerial")).toBeChecked();

    await userEvent.click(
      screen.getByRole("button", { name: "Data & licences" }),
    );
    const dialog = screen.getByRole("dialog", {
      name: /province data licence/i,
    });
    // A review visit gets a neutral exit; first-run acceptance does not.
    expect(
      within(dialog).getByRole("button", { name: "Close" }),
    ).toBeInTheDocument();
    await userEvent.click(
      within(dialog).getByRole("button", { name: "Accept and view map layers" }),
    );

    expect(
      screen.queryByRole("dialog", { name: /province data licence/i }),
    ).not.toBeInTheDocument();
    expect(screen.getByLabelText("NS Aerial")).toBeChecked();
  });

  it("opens the licence from a first search and runs that search on acceptance", async () => {
    // The search box used to be silently disabled until acceptance — a dead
    // primary action whose only unlock was a footer link. The search itself
    // is now the licence trigger.
    // Self-contained against suite order: a prior test's stored acceptance
    // or mock traffic must not leak into the first-run flow under test.
    localStorage.clear();
    vi.mocked(fetchParcels).mockClear();
    window.history.replaceState(null, "", "/");
    vi.mocked(fetchParcels).mockResolvedValueOnce({
      type: "FeatureCollection",
      features: [parcelFeature("50292390")],
    });
    render(<App />);

    const searchBox = screen.getByLabelText("Search by PID or civic address");
    expect(searchBox).toBeEnabled();
    await userEvent.type(searchBox, "50292390");
    await userEvent.click(screen.getByRole("button", { name: "Find parcel" }));

    const dialog = await screen.findByRole("dialog", {
      name: /province data licence/i,
    });
    expect(fetchParcels).not.toHaveBeenCalledWith(["50292390"]);
    // The review-only exit stays absent before first acceptance.
    expect(
      within(dialog).queryByRole("button", { name: "Close" }),
    ).not.toBeInTheDocument();

    await userEvent.click(
      within(dialog).getByRole("button", { name: "Accept and view map layers" }),
    );
    await waitFor(() =>
      expect(fetchParcels).toHaveBeenCalledWith(["50292390"]),
    );
    await screen.findByRole("complementary", { name: "Parcel 50292390 details" });
  });

  it("applies Explore in one committed render", async () => {
    localStorage.setItem(PROVINCE_LICENSE_ACCEPTANCE_KEY, "accepted");
    window.history.replaceState(
      null,
      "",
      "/?taxSale=on&mode=current&layers=ns-aerial,nsprd,roads,water-features",
    );
    render(<App />);

    observedInteractiveMapStates.length = 0;
    await userEvent.selectOptions(
      screen.getByLabelText("Map setup"),
      "explore-nova-scotia",
    );

    expect(expandedLayerCategoryIds()).toEqual(["background-maps"]);
    expect(observedInteractiveMapStates).toEqual([
      "modern:on;ns-aerial:off;nsprd:off;roads:off;water:off;tax-sale:off",
    ]);
  });

  it("applies every built-in setup without enabling two opaque backgrounds", async () => {
    localStorage.setItem(PROVINCE_LICENSE_ACCEPTANCE_KEY, "accepted");
    render(<App />);

    const setups = [
      ["explore-nova-scotia", "Explore Nova Scotia"],
      ["tax-sale-research", "Tax Sale Research"],
      ["forestry-field-access", "Forestry & Field Access"],
      ["historical-maps", "Historical Maps"],
      ["georeferencing", "Georeferencing"],
    ] as const;

    for (const [id, name] of setups) {
      await userEvent.selectOptions(screen.getByLabelText("Map setup"), id);
      const backgrounds = openLayerCategory("Background Maps");
      const enabledOpaqueBackgrounds = [
        within(backgrounds).getByLabelText("Modern map"),
        within(backgrounds).getByLabelText("NS Aerial"),
      ].filter((control) => (control as HTMLInputElement).checked);

      expect(enabledOpaqueBackgrounds).toHaveLength(1);
      expect(mapSetupStatus()).toHaveTextContent(name);
    }
  });

  it("defers a restricted theme until the one licence decision", async () => {
    window.history.replaceState(null, "", "/");
    render(<App />);

    const mapSetup = screen.getByLabelText("Map setup");
    await userEvent.selectOptions(mapSetup, "forestry-field-access");

    expect(
      screen.getByRole("dialog", { name: /province data licence/i }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Modern map")).toBeChecked();

    await userEvent.click(screen.getByRole("button", { name: /accept/i }));

    openLayerCategories("Background Maps", "Forestry & Ecology");
    expect(screen.getByLabelText("NS Aerial")).toBeChecked();
    expect(screen.getByLabelText("Old-growth policy areas")).toBeChecked();
    expect(mapSetup).toHaveFocus();
  });

  it("applies the unrestricted subset and names blocked layers after refusal", async () => {
    window.history.replaceState(null, "", "/");
    render(<App />);

    const mapSetup = screen.getByLabelText("Map setup");
    await userEvent.selectOptions(mapSetup, "historical-maps");
    await userEvent.click(
      screen.getByRole("button", { name: /continue without/i }),
    );

    openLayerCategory("Background Maps");
    expect(screen.getByLabelText("Modern map")).toBeChecked();
    expect(mapSetupStatus()).toHaveTextContent(
      /Historical Maps — Partially applied.*Fletcher historical map.*Place Names.*Main Roads/i,
    );
    expect(mapSetup).toHaveFocus();

    await userEvent.click(screen.getByLabelText("Modern map"));

    expect(mapSetupStatus()).toHaveTextContent("Historical Maps — Modified");
    expect(mapSetupStatus()).not.toHaveTextContent("Partially applied");
  });

  it("labels recognized unmatched state as shared and manual changes as modified", async () => {
    localStorage.setItem(PROVINCE_LICENSE_ACCEPTANCE_KEY, "accepted");
    window.history.replaceState(
      null,
      "",
      "/?taxSale=off&mode=current&layers=modern,roads",
    );
    const { unmount } = render(<App />);

    expect(mapSetupStatus()).toHaveTextContent("Shared setup");

    unmount();
    window.history.replaceState(null, "", "/");
    render(<App />);
    await userEvent.click(screen.getByLabelText("Modern map"));

    expect(mapSetupStatus()).toHaveTextContent(
      "Explore Nova Scotia — Modified",
    );
    await userEvent.click(
      screen.getByRole("button", { name: "Reset current theme" }),
    );
    expect(screen.getByLabelText("Modern map")).toBeChecked();
    expect(mapSetupStatus()).toHaveTextContent("Explore Nova Scotia");
  });

  it("uses Fletcher catalogue opacity for exact matching and marks an override modified", async () => {
    vi.stubEnv(
      "VITE_FLETCHER_TILE_BASE_URL",
      "https://tiles.example.test/ns-marks",
    );
    localStorage.setItem(PROVINCE_LICENSE_ACCEPTANCE_KEY, "accepted");
    window.history.replaceState(null, "", "/");
    render(<App />);

    await userEvent.selectOptions(
      screen.getByLabelText("Map setup"),
      "historical-maps",
    );

    expect(screen.getByTestId("map-canvas")).toHaveTextContent(
      "Fletcher: on at 72%",
    );
    expect(mapSetupStatus()).toHaveTextContent("Historical Maps");

    fireEvent.change(screen.getByRole("slider", { name: /Opacity/ }), {
      target: { value: "0.5" },
    });
    expect(mapSetupStatus()).toHaveTextContent(
      "Historical Maps — Modified",
    );
  });

  it("does not save hidden Fletcher opacity in a custom theme", async () => {
    vi.stubEnv(
      "VITE_FLETCHER_TILE_BASE_URL",
      "https://tiles.example.test/ns-marks",
    );
    localStorage.setItem(PROVINCE_LICENSE_ACCEPTANCE_KEY, "accepted");
    window.history.replaceState(null, "", "/");
    const first = render(<App />);

    openLayerCategory("Historical Maps");
    const fletcherToggle = screen.getByLabelText("Fletcher historical map");
    await userEvent.click(fletcherToggle);
    fireEvent.change(screen.getByRole("slider", { name: /Opacity/ }), {
      target: { value: "0.5" },
    });
    await userEvent.click(fletcherToggle);

    openLayerCategory("Roads & Places");
    await userEvent.click(screen.getByLabelText("Roads, trails & culverts"));
    await userEvent.click(
      screen.getByRole("button", { name: "Save current setup as…" }),
    );
    await userEvent.type(
      screen.getByRole("textbox", { name: "Theme name" }),
      "Hidden opacity",
    );
    await userEvent.click(
      screen.getByRole("button", { name: "Save current setup" }),
    );

    const stored = JSON.parse(
      localStorage.getItem(CUSTOM_THEME_STORAGE_KEY) ?? "null",
    ) as { themes: Array<{
      id: string;
      layerIds: string[];
      opacityOverrides: Record<string, number>;
    }> };
    expect(stored.themes).toHaveLength(1);
    expect(stored.themes[0].layerIds).toEqual(["modern", "roads"]);
    expect(stored.themes[0].opacityOverrides).toEqual({});

    const customThemeId = stored.themes[0].id;
    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
    await userEvent.selectOptions(
      screen.getByLabelText("Map setup"),
      customThemeId,
    );

    expect(fletcherToggle).not.toBeChecked();
    expect(screen.getByLabelText("Roads, trails & culverts")).toBeChecked();
    expect(screen.getByTestId("map-canvas")).toHaveTextContent(
      "Fletcher: off at 72%",
    );
    expect(mapSetupStatus()).toHaveTextContent("Hidden opacity");
    expect(mapSetupStatus()).not.toHaveTextContent("Modified");

    await userEvent.click(fletcherToggle);
    expect(mapSetupStatus()).toHaveTextContent("Hidden opacity — Modified");
    await userEvent.click(
      screen.getByRole("button", { name: "Reset current theme" }),
    );
    expect(fletcherToggle).not.toBeChecked();
    expect(screen.getByTestId("map-canvas")).toHaveTextContent(
      "Fletcher: off at 72%",
    );
    expect(mapSetupStatus()).toHaveTextContent("Hidden opacity");
    expect(mapSetupStatus()).not.toHaveTextContent("Modified");
    await waitFor(() => {
      expect(new URL(window.location.href).searchParams.get("layers"))
        .toBe("modern,roads");
    });

    first.unmount();
    render(<App />);

    expect(screen.getByLabelText("Map setup")).toHaveValue(customThemeId);
    expect(screen.getByLabelText("Fletcher historical map")).not.toBeChecked();
    expect(screen.getByLabelText("Roads, trails & culverts")).toBeChecked();
    expect(screen.getByTestId("map-canvas")).toHaveTextContent(
      "Fletcher: off at 72%",
    );
    expect(mapSetupStatus()).toHaveTextContent("Hidden opacity");
    expect(mapSetupStatus()).not.toHaveTextContent("Modified");
  });

  it("saves only the current catalogue setup, then applies and resets it through the shared URL", async () => {
    const privateMapId = "private-theme-boundary-map";
    const store = await UserMapStore.open();
    await store.saveUserMap({
      id: privateMapId,
      name: "Private woodlot scan",
      source: "image",
      createdAt: "2026-08-15T00:00:00.000Z",
      pixelSize: { width: 1200, height: 800 },
      georef: {
        kind: "gcp",
        method: "affine",
        gcps: [
          { id: "a", pixel: { x: 0, y: 0 }, map: { lat: 46.1, lng: -61.2 } },
          { id: "b", pixel: { x: 1200, y: 0 }, map: { lat: 46.1, lng: -61 } },
          { id: "c", pixel: { x: 0, y: 800 }, map: { lat: 46, lng: -61.2 } },
        ],
      },
    }, new Blob(["private-raster"]), new Blob(["private-preview"]));
    localStorage.setItem(PROVINCE_LICENSE_ACCEPTANCE_KEY, "accepted");
    localStorage.setItem(
      "user-map-ui-state-v1",
      JSON.stringify({ [privateMapId]: { enabled: true, opacity: 0.7 } }),
    );
    window.history.replaceState(null, "", "/");

    try {
      render(<App />);
      openLayerCategory("My Maps");
      expect(
        await screen.findByRole("checkbox", { name: "Private woodlot scan" }),
      ).toBeChecked();
      await userEvent.click(screen.getByRole("button", { name: /^My Maps/ }));
      openLayerCategory("Roads & Places");
      await userEvent.click(screen.getByLabelText("Roads, trails & culverts"));
      expect(screen.getByLabelText("Roads, trails & culverts")).toBeChecked();
      await userEvent.click(screen.getByRole("button", { name: /^Roads & Places/ }));

      await userEvent.click(
        screen.getByRole("button", { name: "Save current setup as…" }),
      );
      await userEvent.type(
        screen.getByRole("textbox", { name: "Theme name" }),
        "Road work",
      );
      await userEvent.click(
        screen.getByRole("button", { name: "Save current setup" }),
      );

      const raw = localStorage.getItem(CUSTOM_THEME_STORAGE_KEY);
      expect(raw).not.toBeNull();
      expect(JSON.parse(raw ?? "null")).toEqual({
        version: 1,
        themes: [{
          id: expect.any(String),
          name: "Road work",
          layerIds: ["modern", "roads"],
          opacityOverrides: {},
          preferredCategoryIds: ["background-maps"],
          taxSaleEnabled: false,
          mapMode: "current",
        }],
      });
      expect(raw).not.toContain("Private woodlot scan");
      expect(raw).not.toContain("blob:test-evidence");
      expect(raw).not.toContain("position");
      expect(raw).not.toContain("event");
      expect(raw).not.toContain("licence");
      openLayerCategory("Roads & Places");
      expect(screen.getByLabelText("Roads, trails & culverts")).toBeChecked();

      const customThemeId = (JSON.parse(raw ?? "null") as {
        themes: Array<{ id: string }>;
      }).themes[0].id;
      await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
      await userEvent.selectOptions(
        screen.getByLabelText("Map setup"),
        "explore-nova-scotia",
      );
      openLayerCategory("Roads & Places");
      expect(screen.getByLabelText("Roads, trails & culverts")).not.toBeChecked();
      await waitFor(() => {
        expect(new URL(window.location.href).searchParams.get("layers"))
          .toBe("modern");
      });

      await userEvent.selectOptions(
        screen.getByLabelText("Map setup"),
        customThemeId,
      );
      openLayerCategory("Roads & Places");
      expect(screen.getByLabelText("Roads, trails & culverts")).toBeChecked();
      await waitFor(() => {
        expect(new URL(window.location.href).searchParams.get("layers"))
          .toBe("modern,roads");
      });

      await userEvent.click(screen.getByLabelText("Roads, trails & culverts"));
      expect(mapSetupStatus()).toHaveTextContent("Road work — Modified");
      await userEvent.click(
        screen.getByRole("button", { name: "Reset current theme" }),
      );
      openLayerCategory("Roads & Places");
      expect(screen.getByLabelText("Roads, trails & culverts")).toBeChecked();
      expect(mapSetupStatus()).toHaveTextContent("Road work");
    } finally {
      await store.deleteUserMap(privateMapId);
      store.close();
    }
  });

  it("preserves an imported GeoPDF across Forestry and Explore without leaking private data into themes", async () => {
    const privateMapId = "private-geopdf-theme-boundary";
    const privatePath = "/Users/private/Maps/cape-breton-woodlot.pdf";
    const privateRasterBytes = "PRIVATE_GEOPDF_RASTER_BYTES";
    const privatePreviewBytes = "PRIVATE_GEOPDF_PREVIEW_BYTES";
    const registrationCandidate: PdfRegistrationCandidate = {
      id: "private-main-frame",
      flavor: "measure",
      embeddedLabel: privatePath,
      sourceRect: { x: 20, y: 30, width: 1000, height: 700 },
      gcps: [
        { id: "gcp-a", pixel: { x: 20, y: 30 }, map: { lat: 46.2, lng: -61.3 } },
        { id: "gcp-b", pixel: { x: 1020, y: 30 }, map: { lat: 46.2, lng: -61 } },
        { id: "gcp-c", pixel: { x: 20, y: 730 }, map: { lat: 45.9, lng: -61.3 } },
      ],
    };
    const record: UserMapRecord = {
      id: privateMapId,
      name: "Private Cape Breton woodlot GeoPDF",
      source: "geopdf",
      createdAt: "2026-08-15T00:00:00.000Z",
      pixelSize: { width: 1200, height: 800 },
      sourceRect: registrationCandidate.sourceRect,
      georef: {
        kind: "gcp",
        method: "affine",
        gcps: registrationCandidate.gcps,
      },
      pdf: {
        pageNumber: 1,
        pageCount: 1,
        registration: {
          status: "embedded",
          flavor: "measure",
          selection: { kind: "sole" },
          selectedFrameId: registrationCandidate.id,
          selectedLabel: registrationCandidate.embeddedLabel,
          candidates: [registrationCandidate],
          adjusted: false,
        },
      },
    };
    const store = await UserMapStore.open();
    await store.saveUserMap(
      record,
      new Blob([privateRasterBytes]),
      new Blob([privatePreviewBytes]),
    );
    localStorage.setItem(PROVINCE_LICENSE_ACCEPTANCE_KEY, "accepted");
    localStorage.setItem(
      "user-map-ui-state-v1",
      JSON.stringify({ [privateMapId]: { enabled: true, opacity: 0.35 } }),
    );
    window.history.replaceState(null, "", "/");

    const expectPrivateMapState = async () => {
      const myMaps = openLayerCategory("My Maps");
      expect(await within(myMaps).findByRole("checkbox", {
        name: record.name,
      })).toBeChecked();
      expect(within(myMaps).getByRole("slider", {
        name: `${record.name} opacity`,
      })).toHaveValue("35");
    };

    try {
      render(<App />);
      await expectPrivateMapState();

      await userEvent.selectOptions(
        screen.getByLabelText("Map setup"),
        "forestry-field-access",
      );
      await expectPrivateMapState();

      await userEvent.selectOptions(
        screen.getByLabelText("Map setup"),
        "explore-nova-scotia",
      );
      await expectPrivateMapState();

      const storedRecord = (await store.listUserMaps()).find(
        ({ id }) => id === privateMapId,
      );
      expect(storedRecord).toEqual(record);
      expect(storedRecord?.pdf?.registration).toEqual(record.pdf?.registration);
      expect(JSON.parse(localStorage.getItem("user-map-ui-state-v1") ?? "null"))
        .toEqual({ [privateMapId]: { enabled: true, opacity: 0.35 } });

      await userEvent.click(
        screen.getByRole("button", { name: "Save current setup as…" }),
      );
      await userEvent.type(
        screen.getByRole("textbox", { name: "Theme name" }),
        "Private map companion",
      );
      await userEvent.click(
        screen.getByRole("button", { name: "Save current setup" }),
      );

      const rawThemeLibrary = localStorage.getItem(CUSTOM_THEME_STORAGE_KEY);
      expect(rawThemeLibrary).not.toBeNull();
      for (const privateValue of [
        record.name,
        privateRasterBytes,
        privatePreviewBytes,
        "blob:test-evidence",
        privatePath,
        registrationCandidate.id,
      ]) {
        expect(rawThemeLibrary).not.toContain(privateValue);
        expect(window.location.href).not.toContain(privateValue);
      }
    } finally {
      await store.deleteUserMap(privateMapId);
      store.close();
    }
  });

  it("persists rename and update without changing map layers", async () => {
    localStorage.setItem(PROVINCE_LICENSE_ACCEPTANCE_KEY, "accepted");
    storeCustomThemes([STORED_FIELD_THEME]);
    window.history.replaceState(null, "", "/");
    render(<App />);

    expect(expandedLayerCategoryIds()).toEqual(["background-maps"]);
    openLayerCategory("Roads & Places");
    expect(screen.getByLabelText("Modern map")).toBeChecked();
    expect(screen.getByLabelText("Roads, trails & culverts")).not.toBeChecked();
    await userEvent.click(screen.getByRole("button", { name: "Manage themes" }));
    const rename = screen.getByRole("textbox", { name: "Rename Field day" });
    await userEvent.clear(rename);
    await userEvent.type(rename, "Woodlot");
    await userEvent.click(screen.getByRole("button", { name: "Rename" }));

    expect(screen.getByRole("option", { name: "Woodlot" })).toBeInTheDocument();
    expect(screen.getByLabelText("Modern map")).toBeChecked();
    expect(screen.getByLabelText("Roads, trails & culverts")).not.toBeChecked();

    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
    await userEvent.click(screen.getByLabelText("Roads, trails & culverts"));
    await userEvent.click(screen.getByRole("button", { name: /^Background Maps/ }));
    expect(expandedLayerCategoryIds()).toEqual(["roads-places"]);
    await userEvent.click(screen.getByRole("button", { name: "Manage themes" }));
    await userEvent.click(
      screen.getByRole("button", { name: "Update from current setup" }),
    );

    const stored = JSON.parse(
      localStorage.getItem(CUSTOM_THEME_STORAGE_KEY) ?? "null",
    ) as { themes: Array<{
      id: string;
      name: string;
      layerIds: string[];
      opacityOverrides: Record<string, number>;
      preferredCategoryIds: string[];
      taxSaleEnabled: boolean;
      mapMode: string;
    }> };
    expect(stored.themes).toEqual([{
      id: "custom-field-day",
      name: "Woodlot",
      layerIds: ["modern", "roads"],
      opacityOverrides: {},
      preferredCategoryIds: ["roads-places"],
      taxSaleEnabled: false,
      mapMode: "current",
    }]);
    expect(screen.getByLabelText("Roads, trails & culverts")).toBeChecked();
  });

  it("persists duplicate and confirmed delete without changing active map layers", async () => {
    localStorage.setItem(PROVINCE_LICENSE_ACCEPTANCE_KEY, "accepted");
    storeCustomThemes([{ ...STORED_FIELD_THEME, name: "Woodlot" }]);
    window.history.replaceState(null, "", "/");
    render(<App />);

    await userEvent.selectOptions(
      screen.getByLabelText("Map setup"),
      "custom-field-day",
    );
    expect(screen.getByLabelText("Roads, trails & culverts")).toBeChecked();
    await userEvent.click(screen.getByRole("button", { name: "Manage themes" }));
    await userEvent.click(screen.getByRole("button", { name: "Duplicate" }));

    let stored = JSON.parse(
      localStorage.getItem(CUSTOM_THEME_STORAGE_KEY) ?? "null",
    ) as { themes: Array<{ id: string; name: string; layerIds: string[] }> };
    expect(stored.themes).toHaveLength(2);
    expect(stored.themes[1]).toMatchObject({
      name: "Woodlot",
      layerIds: ["modern", "roads"],
    });

    const rows = screen.getAllByRole("listitem", { name: "Woodlot theme" });
    await userEvent.click(within(rows[1]).getByRole("button", { name: "Delete" }));
    await userEvent.click(
      within(rows[1]).getByRole("button", { name: "Confirm delete" }),
    );
    const activeRow = screen.getByRole("listitem", { name: "Woodlot theme" });
    await userEvent.click(within(activeRow).getByRole("button", { name: "Delete" }));
    await userEvent.click(
      within(activeRow).getByRole("button", { name: "Confirm delete" }),
    );

    stored = JSON.parse(
      localStorage.getItem(CUSTOM_THEME_STORAGE_KEY) ?? "null",
    ) as { themes: Array<{ id: string; name: string; layerIds: string[] }> };
    expect(stored.themes).toEqual([]);
    openLayerCategory("Background Maps");
    openLayerCategory("Roads & Places");
    expect(screen.getByLabelText("Modern map")).toBeChecked();
    expect(screen.getByLabelText("Roads, trails & culverts")).toBeChecked();
    expect(screen.getByLabelText("Map setup")).toHaveValue("shared");
    expect(mapSetupStatus()).toHaveTextContent("Shared setup");
  });

  it("reports a selected equivalent custom theme as exact", async () => {
    localStorage.setItem(PROVINCE_LICENSE_ACCEPTANCE_KEY, "accepted");
    storeCustomThemes([
      STORED_FIELD_THEME,
      {
        ...STORED_FIELD_THEME,
        id: "custom-field-day-copy",
        name: "Field day copy",
      },
    ]);
    window.history.replaceState(null, "", "/");
    render(<App />);

    await userEvent.selectOptions(
      screen.getByLabelText("Map setup"),
      "custom-field-day-copy",
    );

    expect(screen.getByLabelText("Map setup")).toHaveValue(
      "custom-field-day-copy",
    );
    expect(mapSetupStatus()).toHaveTextContent("Field day copy");
    expect(mapSetupStatus()).not.toHaveTextContent("Modified");
    expect(
      screen.queryByRole("button", { name: "Reset current theme" }),
    ).not.toBeInTheDocument();
  });

  it("reloads a saved custom theme and restores its exact state", async () => {
    localStorage.setItem(PROVINCE_LICENSE_ACCEPTANCE_KEY, "accepted");
    storeCustomThemes([STORED_FIELD_THEME]);
    window.history.replaceState(null, "", "/");
    const first = render(<App />);

    expect(expandedLayerCategoryIds()).toEqual(["background-maps"]);
    await userEvent.selectOptions(
      screen.getByLabelText("Map setup"),
      "custom-field-day",
    );
    expect(expandedLayerCategoryIds()).toEqual(["roads-places"]);
    await waitFor(() => {
      expect(new URL(window.location.href).searchParams.get("layers"))
        .toBe("modern,roads");
    });
    first.unmount();
    render(<App />);

    expect(expandedLayerCategoryIds()).toEqual(["roads-places"]);
    expect(screen.getByLabelText("Map setup")).toHaveValue("custom-field-day");
    expect(mapSetupStatus()).toHaveTextContent("Field day");
    openLayerCategory("Background Maps");
    expect(screen.getByLabelText("Modern map")).toBeChecked();
    expect(screen.getByLabelText("Roads, trails & culverts")).toBeChecked();
  });

  it("keeps corrupt custom-theme storage untouched and uses Explore for the session", () => {
    localStorage.setItem(CUSTOM_THEME_STORAGE_KEY, "not-json");
    window.history.replaceState(null, "", "/");

    render(<App />);

    expect(screen.getByLabelText("Map setup")).toHaveValue(
      "explore-nova-scotia",
    );
    expect(mapSetupStatus()).toHaveTextContent(
      "Your custom-theme library could not be loaded. Explore Nova Scotia is being used for this session.",
    );
    expect(localStorage.getItem(CUSTOM_THEME_STORAGE_KEY)).toBe("not-json");
  });

  it("restores a recognized share when custom-theme storage is corrupt", () => {
    localStorage.setItem(CUSTOM_THEME_STORAGE_KEY, "not-json");
    localStorage.setItem(PROVINCE_LICENSE_ACCEPTANCE_KEY, "accepted");
    window.history.replaceState(null, "", "/?taxSale=off&layers=modern,roads");

    render(<App />);

    expect(screen.getByTestId("map-canvas")).toHaveTextContent(
      "tax-sale layer: off",
    );
    openLayerCategories("Background Maps", "Roads & Places");
    expect(screen.getByLabelText("Modern map")).toBeChecked();
    expect(screen.getByLabelText("Roads, trails & culverts")).toBeChecked();
    expect(screen.getByLabelText("Map setup")).toHaveValue("shared");
    expect(mapSetupStatus()).toHaveTextContent(
      "Your custom-theme library could not be loaded. Custom themes are unavailable for this session.",
    );
    expect(mapSetupStatus()).not.toHaveTextContent(
      "Explore Nova Scotia is being used",
    );
    expect(new URL(window.location.href).searchParams.get("layers"))
      .toBe("modern,roads");
    expect(localStorage.getItem(CUSTOM_THEME_STORAGE_KEY)).toBe("not-json");
  });

  it("retains the previous theme list and map state when browser persistence fails", async () => {
    storeCustomThemes([STORED_FIELD_THEME]);
    window.history.replaceState(null, "", "/");
    render(<App />);
    openLayerCategory("Roads & Places");
    const oldRaw = localStorage.getItem(CUSTOM_THEME_STORAGE_KEY);
    const originalSetItem = Storage.prototype.setItem;
    const setItem = vi.spyOn(Storage.prototype, "setItem").mockImplementation(
      function failingCustomThemeWrite(this: Storage, key, value) {
        if (key === CUSTOM_THEME_STORAGE_KEY) {
          throw new DOMException("quota exceeded", "QuotaExceededError");
        }
        originalSetItem.call(this, key, value);
      },
    );

    try {
      await userEvent.click(screen.getByRole("button", { name: "Manage themes" }));
      const rename = screen.getByRole("textbox", { name: "Rename Field day" });
      await userEvent.clear(rename);
      await userEvent.type(rename, "Woodlot");
      await userEvent.click(screen.getByRole("button", { name: "Rename" }));

      expect(mapSetupStatus()).toHaveTextContent(
        "Your custom themes could not be saved in this browser.",
      );
      expect(localStorage.getItem(CUSTOM_THEME_STORAGE_KEY)).toBe(oldRaw);
      expect(screen.getByRole("option", { name: "Field day" })).toBeInTheDocument();
      expect(screen.queryByRole("option", { name: "Woodlot" })).not.toBeInTheDocument();
      expect(screen.getByLabelText("Modern map")).toBeChecked();
      expect(screen.getByLabelText("Roads, trails & culverts")).not.toBeChecked();

      await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
      await userEvent.click(screen.getByRole("button", { name: "Manage themes" }));
      expect(screen.getByRole("textbox", { name: "Rename Field day" }))
        .toHaveValue("Field day");
    } finally {
      setItem.mockRestore();
    }
  });

  it("uses the same licence decision and reset path for a restricted custom theme", async () => {
    storeCustomThemes([STORED_FIELD_THEME]);
    window.history.replaceState(null, "", "/");
    render(<App />);
    openLayerCategory("Roads & Places");

    const picker = screen.getByLabelText("Map setup");
    await userEvent.selectOptions(picker, "custom-field-day");
    expect(
      screen.getByRole("dialog", { name: "Province data licence" }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Roads, trails & culverts")).not.toBeChecked();

    await userEvent.click(
      screen.getByRole("button", { name: /continue without/i }),
    );
    expect(mapSetupStatus()).toHaveTextContent("Field day — Partially applied");
    await userEvent.click(
      screen.getByRole("button", { name: "Reset current theme" }),
    );
    expect(
      screen.getByRole("dialog", { name: "Province data licence" }),
    ).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: /accept/i }));
    expect(screen.getByLabelText("Roads, trails & culverts")).toBeChecked();
    expect(mapSetupStatus()).toHaveTextContent("Field day");
  });

  it("toggles the building overlay and counts mapped building features on a PID", async () => {
    const user = userEvent.setup();
    localStorage.setItem("ns-marks-the-spot:province-license:v1", "accepted");
    vi.mocked(fetchParcels).mockResolvedValueOnce({
      type: "FeatureCollection",
      features: [parcelFeature("15234636")],
    });
    vi.mocked(fetchParcelBuildingCount).mockResolvedValueOnce({
      count: 2,
      pointCount: 2,
      polygonCount: 0,
    });
    renderAppWithCategoriesOpen();

    expect(screen.getByTestId("map-canvas")).toHaveTextContent("buildings: off");
    await user.click(screen.getByLabelText("Buildings"));
    expect(screen.getByTestId("map-canvas")).toHaveTextContent("buildings: on");

    await user.type(
      screen.getByLabelText("Search by PID or civic address"),
      "15234636",
    );
    await user.click(screen.getByRole("button", { name: "Find parcel" }));

    const inspector = await screen.findByRole("complementary", {
      name: "Parcel 15234636 details",
    });
    const buildingLabel = await within(inspector).findByText("Mapped buildings");
    expect(buildingLabel.nextElementSibling).toHaveTextContent("2");
    // The load-bearing caveat and the attribution stay visible…
    expect(
      within(inspector).getAllByText(/does not prove no building exists/i).length,
    ).toBeGreaterThan(0);
    // …while the interpretive prose sits behind the disclosure.
    await userEvent.click(
      within(inspector).getAllByText("What this does and doesn't show")[0],
    );
    expect(
      within(inspector).getByText(/mapped as points; larger buildings as/i),
    ).toBeInTheDocument();
  });

  it("shows the modern map when continuing without Province layers", async () => {
    const user = userEvent.setup();
    setRestrictedGeneralShareUrl();
    renderAppWithCategoriesOpen();

    await user.click(
      screen.getByRole("button", { name: "Continue without Province layers" }),
    );

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.getByTestId("map-canvas")).toHaveTextContent("modern map: on");
    expect(screen.getByLabelText("NS Aerial")).not.toBeChecked();
  });

  it("credits the open-source software separately from map-data licences", () => {
    renderAppWithCategoriesOpen();

    expect(
      screen.getByRole("link", {
        name: "© OpenStreetMap contributors",
      }),
    ).toHaveAttribute("href", "https://www.openstreetmap.org/copyright");
    expect(
      screen.getByRole("link", {
        name: "Open source · MIT · GitHub",
      }),
    ).toHaveAttribute(
      "href",
      "https://github.com/dfakkeldy/ns-marks-the-spot",
    );
  });

  it("invites map feedback through the KinNoKi Labs map address", () => {
    renderAppWithCategoriesOpen();

    expect(
      screen.getByRole("link", {
        name: "Feedback & suggestions: map@kinnokilabs.com",
      }),
    ).toHaveAttribute(
      "href",
      "mailto:map@kinnokilabs.com?subject=NS%20Marks%20The%20Spot%20map%20feedback",
    );
  });

  it("invites beta interest without claiming the iPhone beta is available", () => {
    renderAppWithCategoriesOpen();

    const betaLinks = screen.getAllByRole("link", {
      name: "Get launch updates",
    });

    // One invite, in the header banner: the rail's duplicate marketing card
    // was removed so the layer rail stays an instrument panel.
    expect(betaLinks).toHaveLength(1);
    betaLinks.forEach((link) => {
      expect(link).toHaveAttribute(
        "href",
        "mailto:map@kinnokilabs.com?subject=NS%20Marks%20The%20Spot%20beta%20signup",
      );
    });
    expect(
      screen.getByText(/iPhone app in development/),
    ).toBeInTheDocument();
    expect(screen.queryByText(/not open yet/)).not.toBeInTheDocument();
    expect(screen.queryByText("Get the iPhone app")).not.toBeInTheDocument();
  });

  it("opens the About dialog from the header, explains the method, and closes", async () => {
    const user = userEvent.setup();
    renderAppWithCategoriesOpen();

    await user.click(
      screen.getAllByRole("button", { name: "About this map" })[0],
    );

    const dialog = await screen.findByRole("dialog", {
      name: /about ns marks the spot/i,
    });
    expect(dialog).toHaveTextContent(/SHA-256/);
    expect(dialog).toHaveTextContent(/stay unknown/i);
    expect(dialog).toHaveTextContent(/browser location\s+never leaves/i);
    expect(dialog).toHaveTextContent(/twenty years/i);
    expect(dialog).toHaveTextContent(/Share, then Add to Home Screen/i);
    expect(
      within(dialog).getByRole("link", { name: "Source on GitHub" }),
    ).toHaveAttribute(
      "href",
      "https://github.com/dfakkeldy/ns-marks-the-spot",
    );

    await user.click(within(dialog).getByRole("button", { name: "Close" }));
    expect(
      screen.queryByRole("dialog", { name: /about ns marks the spot/i }),
    ).not.toBeInTheDocument();
  });

  it("reveals the privacy-minimized upcoming events after acceptance", async () => {
    const user = userEvent.setup();
    setTaxSaleResearchUrl();
    renderAppWithCategoriesOpen();

    await user.click(
      screen.getByRole("button", { name: "Accept and view map layers" }),
    );

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(
      screen.getByText("27 advertised · 18 withdrawn · 27 active PIDs"),
    ).toBeInTheDocument();
    expect(
      screen.getByText("29 advertised · 27 mapped · 2 unavailable in NSPRD"),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("checkbox", { name: /CBRM.*July 21, 2026/i }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("checkbox", { name: /Inverness.*August 11, 2026/i }),
    ).toBeChecked();
    expect(
      screen.getByRole("checkbox", { name: /Victoria County.*September 14, 2026/i }),
    ).toBeChecked();
    expect(screen.getByLabelText("Search by PID or civic address")).toBeEnabled();
    expect(screen.getByLabelText("NS Aerial")).toBeEnabled();
    expect(screen.getByLabelText("NS Aerial")).toBeChecked();
    expect(screen.getByLabelText("NS Property Boundaries")).toBeEnabled();
    expect(screen.getByLabelText("Crown Lands")).toBeEnabled();
    expect(screen.getByLabelText("Watersheds")).toBeEnabled();
    expect(screen.getByLabelText("Published river flood zones")).toBeEnabled();
    expect(screen.getByLabelText("Coastal flooding — current")).toBeEnabled();
    expect(screen.getByLabelText("Coastal flooding — 2050")).toBeEnabled();
    expect(screen.getByLabelText("Coastal flooding — 2100")).toBeEnabled();
    expect(screen.getByLabelText("Waterfalls")).toBeEnabled();
    expect(screen.getByLabelText("Water features")).toBeEnabled();
    expect(screen.getByLabelText("Roads, trails & culverts")).toBeEnabled();
    expect(screen.queryByText("Assessed owner")).not.toBeInTheDocument();
    expect(
      screen.getByText(PROVINCE_ATTRIBUTION, { selector: "footer span" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Snapshot retrieved August 10, 2026"),
    ).toBeInTheDocument();
    expect(
      screen.getAllByText("Snapshot retrieved August 18, 2026"),
    ).toHaveLength(1);
    expect(
      screen.getByText("Snapshot retrieved August 20, 2026"),
    ).toBeInTheDocument();
  });

  it("makes current notices and historical records separate map modes", async () => {
    const user = userEvent.setup();
    localStorage.setItem("ns-marks-the-spot:province-license:v1", "accepted");
    setTaxSaleResearchUrl();
    renderAppWithCategoriesOpen();

    expect(screen.getByRole("button", { name: "Current notices" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.getByRole("region", { name: "Current tax-sale notices" }))
      .toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Historical tax-sale records" }))
      .not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Historical records" }));

    expect(screen.getByRole("button", { name: "Historical records" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.queryByRole("region", { name: "Current tax-sale notices" }))
      .not.toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Historical tax-sale records" }))
      .toBeInTheDocument();
    expect(screen.getByTestId("map-canvas")).toHaveTextContent("historical layer: on");
  });

  it("restores mode, PID, layers, and position from a legacy mode/event URL", async () => {
    localStorage.setItem("ns-marks-the-spot:province-license:v1", "accepted");
    window.history.replaceState(
      null,
      "",
      "/?mode=historical&pid=40538464&event=hrm-2022-03-08&layers=nsprd,roads&position=46.1,-60.9,12",
    );
    vi.mocked(fetchParcels).mockImplementation(async (pids) => ({
      type: "FeatureCollection",
      features: pids.map(parcelFeature),
    }));

    renderAppWithCategoriesOpen();

    expect(screen.getByLabelText("Show tax-sale information")).toBeChecked();
    expect(screen.getByRole("button", { name: "Historical records" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.getByLabelText("NS Property Boundaries")).toBeChecked();
    expect(screen.getByLabelText("Roads, trails & culverts")).toBeChecked();
    expect(screen.getByLabelText("Water features")).not.toBeChecked();
    expect(screen.getByLabelText("Modern map")).toBeChecked();
    expect(screen.getByTestId("map-canvas")).toHaveTextContent(
      "initial position: 46.1,-60.9,12",
    );
    expect(screen.getByTestId("map-canvas")).toHaveTextContent(
      "preserve initial position: yes",
    );
    expect(
      await screen.findByRole("complementary", { name: "Parcel 40538464 details" }),
    ).toBeInTheDocument();
    expect(new URL(window.location.href).searchParams.get("event"))
      .toContain("hrm-2022-03-08");
  });

  it("refuses to render a restricted environmental screen shared before licence acceptance", () => {
    window.history.replaceState(
      null,
      "",
      "/?taxSale=off&mode=current&layers=arsenic-risk-wells,uranium-risk-wells,surficial-aquifers",
    );

    renderAppWithCategoriesOpen();

    // The open-licensed uranium screen needs no acceptance; the two restricted
    // services must stay off until the Province licence is accepted.
    const canvas = screen.getByTestId("map-canvas");
    expect(canvas).toHaveTextContent("arsenic risk: off");
    expect(canvas).toHaveTextContent("surficial aquifers: off");
    expect(canvas).toHaveTextContent("uranium risk: on");
  });

  it("renders shared environmental screens once the licence is accepted", () => {
    localStorage.setItem("ns-marks-the-spot:province-license:v1", "accepted");
    window.history.replaceState(
      null,
      "",
      "/?taxSale=off&mode=current&layers=arsenic-risk-wells,surficial-aquifers",
    );

    renderAppWithCategoriesOpen();

    const canvas = screen.getByTestId("map-canvas");
    expect(canvas).toHaveTextContent("arsenic risk: on");
    expect(canvas).toHaveTextContent("surficial aquifers: on");
  });

  it("carries the province's testing guidance beside every well-water screen", async () => {
    const user = userEvent.setup();
    localStorage.setItem("ns-marks-the-spot:province-license:v1", "accepted");
    renderAppWithCategoriesOpen();

    const environment = openLayerCategory("Environment & Hazards");

    expect(
      within(environment).getByText(/Testing your well is the only way to find out/i),
    ).toBeInTheDocument();
    expect(
      within(environment).getByText(
        /relative risk zones mapped by bedrock unit, not test\s+results for any property/i,
      ),
    ).toBeInTheDocument();
    expect(
      within(environment).getByText(/says nothing about water quality at any property/i),
    ).toBeInTheDocument();

    const arsenic = screen.getByLabelText("Arsenic risk — bedrock wells");
    expect(arsenic).toBeEnabled();
    expect(arsenic).not.toBeChecked();

    await user.click(arsenic);
    expect(screen.getByTestId("map-canvas")).toHaveTextContent(
      "arsenic risk: on",
    );
    expect(
      screen.getByRole("list", { name: "Arsenic risk — bedrock wells risk bands" }),
    ).toBeInTheDocument();
  });

  it("keeps layer provenance one disclosure away without burying the live status", async () => {
    const user = userEvent.setup();
    localStorage.setItem("ns-marks-the-spot:province-license:v1", "accepted");
    window.history.replaceState(null, "", "/?taxSale=off&layers=modern,nsprd");
    renderAppWithCategoriesOpen();

    openLayerCategory("Land & Property");

    const propertyRow = screen.getByLabelText("NS Property Boundaries").closest("label");
    expect(propertyRow).not.toBeNull();
    const row = within(propertyRow as HTMLElement);

    expect(
      row.getByText(/Loading|Ready|Off|Zoom/, { selector: ".layer-runtime" }),
    ).toBeInTheDocument();

    const provenance = (propertyRow as HTMLElement).querySelector(
      "details.layer-provenance",
    );
    expect(provenance).not.toBeNull();
    expect(provenance).not.toHaveAttribute("open");
    expect(row.getByText(/Source date:/)).not.toBeVisible();

    await user.click(row.getByText("Source & scale"));

    expect(provenance).toHaveAttribute("open");
    expect(row.getByText(/Source date:/)).toBeVisible();
    expect(row.getByText(/Scale:/)).toBeVisible();
    expect(row.getByText(/Coverage:/)).toBeVisible();
    expect(
      row.getByText((_, element) => element?.textContent === "Zoom: 14–24"),
    ).toBeVisible();
    expect(screen.getByLabelText("NS Property Boundaries")).toBeChecked();
  });

  it("keeps historical records off by default and loads them on demand", async () => {
    const user = userEvent.setup();
    localStorage.setItem("ns-marks-the-spot:province-license:v1", "accepted");
    setTaxSaleResearchUrl();
    vi.mocked(fetchParcels).mockImplementation(async (pids) => ({
      type: "FeatureCollection",
      features: pids.map(parcelFeature),
    }));

    renderAppWithCategoriesOpen();

    expect(screen.getByTestId("map-canvas")).toHaveTextContent(
      "historical layer: off",
    );
    expect(screen.queryByLabelText("Historical sale year")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Historical records" }));

    expect(screen.getByTestId("map-canvas")).toHaveTextContent(
      "historical layer: on",
    );
    await waitFor(() =>
      expect(
        screen.getByText(
          `${matchedHistoricalPids().length} historical PIDs matched in NSPRD.`,
        ),
      ).toBeInTheDocument(),
    );

    await user.selectOptions(screen.getByLabelText("Historical outcome"), "unsold");
    expect(screen.getByText("33 records · 27 PIDs")).toBeInTheDocument();
    await user.selectOptions(screen.getByLabelText("Historical sale year"), "2022");
    expect(screen.getByText("10 records · 10 PIDs")).toBeInTheDocument();
    await user.selectOptions(screen.getByLabelText("Historical sale year"), "2024");
    await user.selectOptions(screen.getByLabelText("Historical outcome"), "unknown");
    expect(screen.getByText("11 records · 11 PIDs")).toBeInTheDocument();
  });

  it("shows completed historical geometry before the full catalog settles", async () => {
    const user = userEvent.setup();
    const historicalRequest =
      deferred<Awaited<ReturnType<typeof fetchParcels>>>();
    localStorage.setItem("ns-marks-the-spot:province-license:v1", "accepted");
    setTaxSaleResearchUrl();
    vi.mocked(fetchParcels)
      .mockResolvedValueOnce({ type: "FeatureCollection", features: [] })
      .mockImplementationOnce((pids, _signal, onBatch) => {
        onBatch?.({
          type: "FeatureCollection",
          features: [parcelFeature(pids[0])],
        });
        return historicalRequest.promise;
      });

    renderAppWithCategoriesOpen();
    await user.click(screen.getByRole("button", { name: "Historical records" }));

    expect(
      await screen.findByText(
        `1 of ${matchedHistoricalPids().length} historical PIDs shown on the map…`,
      ),
    ).toBeInTheDocument();
    expect(screen.getByTestId("map-canvas")).toHaveTextContent(
      "geometry count: 1",
    );
  });

  it("renders the official pending result without a fabricated winning bid", async () => {
    const user = userEvent.setup();
    localStorage.setItem("ns-marks-the-spot:province-license:v1", "accepted");
    setTaxSaleResearchUrl();
    vi.mocked(fetchParcels).mockImplementation(async (pids) => ({
      type: "FeatureCollection",
      features: pids.map(parcelFeature),
    }));
    renderAppWithCategoriesOpen();

    await user.click(
      screen.getByRole("button", { name: "Historical records" }),
    );
    await user.type(
      screen.getByLabelText("Search by PID or civic address"),
      "40441354",
    );
    await user.click(screen.getByRole("button", { name: "Find parcel" }));

    const inspector = await screen.findByRole("complementary", {
      name: "Parcel 40441354 details",
    });
    expect(within(inspector).getByText("Outcome unknown")).toBeInTheDocument();
    expect(
      within(inspector).getByText("Not published in verified sources"),
    ).toBeInTheDocument();
    expect(
      within(inspector).getByText(
        "Official result: PENDING - Property is still being offered.",
      ),
    ).toBeInTheDocument();
    expect(within(inspector).queryByText("Difference")).not.toBeInTheDocument();
  });

  it("shows owner-free historical outcome and financial context for a matched PID", async () => {
    const user = userEvent.setup();
    localStorage.setItem("ns-marks-the-spot:province-license:v1", "accepted");
    setTaxSaleResearchUrl();
    vi.mocked(fetchParcels).mockImplementation(async (pids) => ({
      type: "FeatureCollection",
      features: pids.map(parcelFeature),
    }));
    renderAppWithCategoriesOpen();

    await user.click(
      screen.getByRole("button", { name: "Historical records" }),
    );
    await user.type(
      screen.getByLabelText("Search by PID or civic address"),
      "40538464",
    );
    await user.click(screen.getByRole("button", { name: "Find parcel" }));

    const inspector = await screen.findByRole("complementary", {
      name: "Parcel 40538464 details",
    });
    expect(within(inspector).getByText("Unsold - no bids")).toBeInTheDocument();
    expect(
      within(inspector).getByText("No winning bid - official result says no bids"),
    ).toBeInTheDocument();
    expect(within(inspector).getByRole("link", { name: "Official notice" })).toHaveAttribute(
      "href",
      expect.stringContaining("halifax.ca"),
    );
    expect(within(inspector).getByText(/Dated outcome only/)).toBeInTheDocument();
    expect(within(inspector).queryByText(/assessed owner/i)).not.toBeInTheDocument();
  });

  it("uses the Explore Nova Scotia defaults and keeps Fletcher last in Historical Maps", () => {
    localStorage.setItem("ns-marks-the-spot:province-license:v1", "accepted");

    renderAppWithCategoriesOpen();

    expect(screen.getByLabelText("Modern map")).toBeChecked();
    expect(screen.getByLabelText("NS Aerial")).not.toBeChecked();
    expect(screen.getByLabelText("NS Property Boundaries")).not.toBeChecked();
    expect(screen.getByLabelText("Water features")).not.toBeChecked();
    expect(screen.getByLabelText("Roads, trails & culverts")).not.toBeChecked();
    expect(screen.getByTestId("map-canvas")).toHaveTextContent(
      "modern map: on; tax-sale layer: off; Fletcher: off at 72% from no host; property boundaries: off; water: off; roads: off",
    );

    const layerSection = openLayerCategory("Historical Maps");
    const layerNames = Array.from(
      layerSection.querySelectorAll(".layer-row strong"),
      (element) => element.textContent,
    );
    expect(layerNames.at(-1)).toBe("Fletcher historical map");
  });

  it("lists the Church county sheets as unavailable rows above Fletcher", () => {
    localStorage.setItem("ns-marks-the-spot:province-license:v1", "accepted");

    renderAppWithCategoriesOpen();

    const layerSection = openLayerCategory("Historical Maps");
    const layerNames = Array.from(
      layerSection.querySelectorAll(".layer-row strong"),
      (element) => element.textContent,
    );

    expect(layerNames).toContain("Church — Inverness County");
    expect(layerNames).toContain("Church — Victoria County");
    expect(layerNames).toContain("Church — Richmond County");
    expect(layerNames).toContain("Church — Cape Breton County");

    // Fletcher stays the final row in Historical Maps and fails closed without a host.
    expect(layerNames.at(-1)).toBe("Fletcher historical map");
    expect(screen.getByLabelText("Fletcher historical map")).toBeDisabled();
    expect(screen.getByText("Tile hosting not configured")).toBeInTheDocument();

    // The sheets are not togglable, because there are no tiles to show.
    expect(
      screen.queryByLabelText("Church — Inverness County"),
    ).not.toBeInTheDocument();

    expect(
      screen.getByText(/Published 1885 · web view pending tiles/),
    ).toBeInTheDocument();
  });

  it("enables direct Fletcher tiles, opacity, attribution, and share state when hosted", async () => {
    vi.stubEnv(
      "VITE_FLETCHER_TILE_BASE_URL",
      "https://tiles.example.test/ns-marks",
    );
    localStorage.setItem("ns-marks-the-spot:province-license:v1", "accepted");
    const user = userEvent.setup();

    renderAppWithCategoriesOpen();

    const toggle = screen.getByLabelText("Fletcher historical map");
    expect(toggle).toBeEnabled();
    expect(toggle).not.toBeChecked();
    await user.click(toggle);

    expect(toggle).toBeChecked();
    expect(screen.getByTestId("map-canvas")).toHaveTextContent(
      "Fletcher: on at 72% from https://tiles.example.test/ns-marks",
    );
    await waitFor(() =>
      expect(window.location.search).toContain("fletcher"),
    );
    expect(
      screen.getByRole("link", { name: "CC BY-NC-SA 3.0" }),
    ).toHaveAttribute(
      "href",
      "https://creativecommons.org/licenses/by-nc-sa/3.0/",
    );
    expect(screen.getByText(/not a survey and does not establish/)).toBeInTheDocument();

    fireEvent.change(screen.getByRole("slider", { name: /Opacity/ }), {
      target: { value: "0.5" },
    });
    expect(screen.getByTestId("map-canvas")).toHaveTextContent(
      "Fletcher: on at 50%",
    );
  });

  it("lets a user who declined the Province licence still export a map", async () => {
    const user = userEvent.setup();
    setRestrictedGeneralShareUrl();
    renderAppWithCategoriesOpen();

    await user.click(
      screen.getByRole("button", { name: "Continue without Province layers" }),
    );

    // `continueWithoutProvinceLayers` never sets `licenceAccepted`, so the
    // blanket `disabled={!licenceAccepted}` this replaces locked the export
    // out permanently for exactly the user the feature exists for: OSM plus a
    // Fletcher sheet in the field over live GPS, which needs no Province data.
    // Province layers stay out of the export on their own — they are not
    // visible without the licence, so nothing composites them.
    const exportTrigger = screen.getByRole("button", {
      name: "Export map (PDF)",
    });
    expect(exportTrigger).toBeEnabled();

    await user.click(exportTrigger);
    expect(screen.getByTestId("map-canvas")).toHaveTextContent(
      "export frame: framing",
    );
  });

  it("names a visible zoning layer as absent from the export instead of dropping it silently", async () => {
    const user = userEvent.setup();
    setRestrictedGeneralShareUrl();
    renderAppWithCategoriesOpen();

    await user.click(
      screen.getByRole("button", { name: "Continue without Province layers" }),
    );
    openLayerCategory("Land & Property");
    await user.click(screen.getByLabelText("Inverness County zoning"));

    await user.click(screen.getByRole("button", { name: "Export map (PDF)" }));
    await user.click(
      screen.getByRole("button", { name: "Continue export frame" }),
    );

    // `buildExportLayers` carries OSM, Fletcher, and Province layers only —
    // zoning (and six other families MapCanvas renders) never reaches the
    // compositor. Exporting used to produce a page with no zoning on it and
    // nothing said about that.
    // findBy: the export dialog is lazy-loaded, so it resolves a tick after
    // the frame step continues.
    const dialog = await screen.findByRole("dialog", {
      name: "Export georeferenced PDF",
    });
    expect(dialog).toHaveTextContent(/will not be in the exported PDF/u);
    expect(dialog).toHaveTextContent("Inverness County zoning");
    // A notice, not a gate.
    expect(
      within(dialog).getByRole("button", { name: "Download PDF" }),
    ).toBeEnabled();
  });

  it("credits an exported layer but not a visible layer the export omits", async () => {
    const user = userEvent.setup();
    setRestrictedGeneralShareUrl();
    renderAppWithCategoriesOpen();

    await user.click(
      screen.getByRole("button", { name: "Continue without Province layers" }),
    );
    openLayerCategory("Land & Property");
    await user.click(screen.getByLabelText("Inverness County zoning"));

    await user.click(screen.getByRole("button", { name: "Export map (PDF)" }));
    await user.click(
      screen.getByRole("button", { name: "Continue export frame" }),
    );
    // findBy: the export dialog is lazy-loaded, so a run in which no earlier
    // test warmed its chunk resolves it a tick after the frame step.
    await user.click(
      within(
        await screen.findByRole("dialog", { name: "Export georeferenced PDF" }),
      ).getByRole("button", { name: "Download PDF" }),
    );

    await waitFor(() => expect(composeGeoPdfMock).toHaveBeenCalledTimes(1));
    const [composeInput] = composeGeoPdfMock.mock.calls[0] as [
      { attributionLines: string[] },
    ];
    const attributionText = composeInput.attributionLines.join(" ");
    // Modern map is both captured AND exported (`buildExportLayers` always
    // carries OSM): its OpenStreetMap attribution belongs on the page.
    expect(attributionText).toContain("OpenStreetMap");
    // Zoning is visible (captured) but not exported — `buildExportLayers`
    // does not carry it, and the omission is already named separately in
    // `omittedLayerNames`. Crediting it here would assert a licence over
    // data the PDF does not contain, which the EDPC attribution text (only
    // this layer family uses it) makes easy to catch.
    expect(attributionText).not.toContain(
      "Eastern District Planning Commission",
    );
  });

  it("names a visible user vector layer as absent from the export instead of dropping it silently", async () => {
    // Same gap as zoning above, but for the `nightly`-only vector-import
    // feature (KML/GPX/KMZ/shapefile) this branch predates: `MapCanvas`
    // renders it via `UserVectorLayers`, but `buildExportLayers` never
    // carries user vector layers into the compositor, and until now
    // `omittedLayerNames` never named them either.
    const user = userEvent.setup();
    setRestrictedGeneralShareUrl();
    renderAppWithCategoriesOpen();

    await user.click(
      screen.getByRole("button", { name: "Continue without Province layers" }),
    );

    const input = await screen.findByLabelText("Add a map file");
    await user.upload(
      input,
      new File(
        [
          JSON.stringify({
            type: "FeatureCollection",
            features: [
              {
                type: "Feature",
                geometry: { type: "Point", coordinates: [-61.2, 46.1] },
                properties: {},
              },
            ],
          }),
        ],
        "trail-markers.geojson",
        { type: "application/geo+json" },
      ),
    );
    // The import is async (file read + parse); a checked "Your data" row is
    // the same completion signal the rest of this suite waits on for scans.
    expect(await screen.findByLabelText("trail-markers")).toBeChecked();

    await user.click(screen.getByRole("button", { name: "Export map (PDF)" }));
    await user.click(
      screen.getByRole("button", { name: "Continue export frame" }),
    );

    // findBy: the export dialog is lazy-loaded, so it resolves a tick after
    // the frame step continues.
    const dialog = await screen.findByRole("dialog", {
      name: "Export georeferenced PDF",
    });
    expect(dialog).toHaveTextContent(/will not be in the exported PDF/u);
    expect(dialog).toHaveTextContent("trail-markers");
    // A notice, not a gate.
    expect(
      within(dialog).getByRole("button", { name: "Download PDF" }),
    ).toBeEnabled();
  });

  it("keeps every Province layer out of the exported PDF after declining the licence", async () => {
    const user = userEvent.setup();
    setRestrictedGeneralShareUrl();
    renderAppWithCategoriesOpen();

    await user.click(
      screen.getByRole("button", { name: "Continue without Province layers" }),
    );

    await user.click(screen.getByRole("button", { name: "Export map (PDF)" }));
    await user.click(
      screen.getByRole("button", { name: "Continue export frame" }),
    );
    await user.click(
      within(
        await screen.findByRole("dialog", { name: "Export georeferenced PDF" }),
      ).getByRole("button", { name: "Download PDF" }),
    );

    await waitFor(() => expect(composeMapImageMock).toHaveBeenCalledTimes(1));
    // `composeMapImage(bounds, size, layers, options)` — the third argument
    // is exactly what `buildExportLayers` built from the province-layer
    // filter this test guards. Declining the licence already keeps every
    // `provinceLayers[id]` false today (a three-hop state invariant this
    // suite does not otherwise pin at the export boundary), so this asserts
    // the outcome the `licenceAccepted &&` guard exists to protect even if
    // that invariant is ever weakened upstream.
    const [, , layers] = composeMapImageMock.mock.calls[0] as [
      unknown,
      unknown,
      Array<{ id: string }>,
    ];
    const provinceLayerIds = new Set(
      provinceLayerCatalog.map(({ id }) => id as string),
    );
    expect(layers.some((layer) => provinceLayerIds.has(layer.id))).toBe(false);
  });

  it("keeps open geology and resource overlays collapsed, optional, and licence-independent", async () => {
    const user = userEvent.setup();
    render(<App />);

    const groupSummary = screen.getByRole("button", {
      name: /^Geology & Resources/,
    });
    expect(groupSummary).toHaveAttribute("aria-expanded", "false");
    const group = openLayerCategory("Geology & Resources");
    expect(screen.getByLabelText("Mineral occurrences")).not.toBeChecked();
    expect(screen.getByLabelText("Mineral tenure")).not.toBeChecked();
    expect(screen.getByLabelText("Abandoned mine openings")).not.toBeChecked();
    expect(screen.getByLabelText("Mineral occurrences")).toBeEnabled();
    const proximityToggle = screen.getByLabelText(
      "Properties within 1 km of a mineral occurrence",
    );
    expect(proximityToggle).not.toBeChecked();
    expect(proximityToggle).toBeDisabled();
    await user.click(screen.getByLabelText("Mineral occurrences"));
    await user.click(screen.getByLabelText("Mineral tenure"));

    expect(groupSummary).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByTestId("map-canvas")).toHaveTextContent(
      "mineral occurrences: on; mineral tenure: on; abandoned mines: off; mineral proximity parcels: off",
    );
    expect(
      within(group as HTMLElement).getByText(
        "Province licence required for derived parcel geometry",
      ),
    ).toBeInTheDocument();
    await user.click(
      within(proximityToggle.closest("label") as HTMLElement).getByRole("button", {
        name: "Review Province licence for Properties within 1 km of a mineral occurrence",
      }),
    );
    expect(
      screen.getByRole("dialog", { name: "Province data licence" }),
    ).toBeInTheDocument();
    expect(
      within(group as HTMLElement).getByRole("link", { name: "Open data sources" }),
    ).toHaveAttribute("href", expect.stringContaining("novascotia.ca"));
    expect(
      within(group as HTMLElement).getByRole("link", {
        name: "Mineral Occurrences source",
      }),
    ).toHaveAttribute(
      "href",
      "https://novascotia.ca/natr/meb/download/dp002.asp",
    );
  });

  it("keeps topography collapsed and loads contours only when requested", async () => {
    const user = userEvent.setup();
    localStorage.setItem("ns-marks-the-spot:province-license:v1", "accepted");
    render(<App />);

    const summary = screen.getByRole("button", { name: /^Water & Terrain/ });
    expect(summary).toHaveAttribute("aria-expanded", "false");
    const group = openLayerCategory("Water & Terrain");
    expect(screen.getByLabelText("Contours")).not.toBeChecked();
    await user.click(screen.getByLabelText("Contours"));

    expect(summary).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByTestId("map-canvas")).toHaveTextContent("contours: on");
    expect(
      within(group as HTMLElement).getByText(/terrain screening only/i),
    ).toBeInTheDocument();
    expect(
      within(group as HTMLElement).getByRole("link", {
        name: "Official Landforms source",
      }),
    ).toHaveAttribute("href", "https://data.novascotia.ca/d/j63u-5nkj");
  });

  it("keeps the open old-growth policy layer collapsed, optional, and explicit about coverage", async () => {
    const user = userEvent.setup();
    render(<App />);

    const summary = screen.getByRole("button", { name: /^Forestry & Ecology/ });
    expect(summary).toHaveAttribute("aria-expanded", "false");
    const group = openLayerCategory("Forestry & Ecology");
    const toggle = screen.getByLabelText("Old-growth policy areas");
    expect(toggle).not.toBeChecked();
    expect(toggle).toBeEnabled();

    await user.click(toggle);

    expect(summary).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByTestId("map-canvas")).toHaveTextContent(
      "old-growth policy areas: on",
    );
    expect(
      within(group as HTMLElement).getByText(/not a complete old-growth inventory/i),
    ).toBeInTheDocument();
    expect(
      within(group as HTMLElement).getByText(/no mapped policy polygon/i),
    ).toBeInTheDocument();
    expect(
      within(group as HTMLElement).getByRole("link", {
        name: "Official old-growth policy source",
      }),
    ).toHaveAttribute(
      "href",
      "https://data.novascotia.ca/Lands-Forests-and-Wildlife/Old-Growth-Forest-Policy-Layer/wanf-acts",
    );
    expect(
      within(group as HTMLElement).getByText("Confirmed old growth"),
    ).toBeInTheDocument();
    expect(
      within(group as HTMLElement).getByText("Restoration opportunity"),
    ).toBeInTheDocument();
    expect(
      within(group as HTMLElement).getByText("Status unknown"),
    ).toBeInTheDocument();
  });

  it("offers the Inverness terrain pilot independently with a visible symbology key", async () => {
    const user = userEvent.setup();
    render(<App />);

    const summary = screen.getByRole("button", { name: /^Water & Terrain/ });
    expect(summary).toHaveAttribute("aria-expanded", "false");
    const group = openLayerCategory("Water & Terrain");
    expect(screen.getByLabelText("Inverness micro-hydro screen")).not.toBeChecked();
    expect(screen.getByLabelText("Inverness micro-hydro screen")).toBeEnabled();

    await user.click(screen.getByLabelText("Inverness micro-hydro screen"));

    expect(summary).toHaveAttribute("aria-expanded", "true");

    expect(screen.getByTestId("map-canvas")).toHaveTextContent(
      "Inverness micro-hydro screen: on",
    );
    expect(within(group as HTMLElement).getByText("Line width = modeled upstream area"))
      .toBeInTheDocument();
    expect(within(group as HTMLElement).getByText("Colour = nominal micro-hydro scale"))
      .toBeInTheDocument();
    expect(within(group as HTMLElement).getByText("1–5 kW scale"))
      .toBeInTheDocument();
    expect(within(group as HTMLElement).getByText("30–50 kW scale"))
      .toBeInTheDocument();
    expect(within(group as HTMLElement).getByText("No 5 m drop within 3 km"))
      .toBeInTheDocument();
    expect(within(group as HTMLElement).getByRole("link", {
      name: "Flow calibration source",
    })).toHaveAttribute(
      "href",
      "https://wateroffice.ec.gc.ca/services/index_e.html",
    );
    expect(within(group as HTMLElement).getByRole("link", {
      name: "Micro-hydro method",
    })).toHaveAttribute(
      "href",
      "https://natural-resources.canada.ca/maps-tools-publications/publications/micro-hydro-systems-buyer-s-guide",
    );
  });

  it("enables the derived parcel control after licence acceptance but keeps it off by default", async () => {
    const user = userEvent.setup();
    localStorage.setItem("ns-marks-the-spot:province-license:v1", "accepted");
    renderAppWithCategoriesOpen();

    const proximityToggle = screen.getByLabelText(
      "Properties within 1 km of a mineral occurrence",
    );
    expect(proximityToggle).toBeEnabled();
    expect(proximityToggle).not.toBeChecked();

    await user.click(proximityToggle);

    expect(proximityToggle).toBeChecked();
    expect(screen.getByTestId("map-canvas")).toHaveTextContent(
      "mineral proximity parcels: on",
    );
    await waitFor(() =>
      expect(new URL(window.location.href).searchParams.get("layers")).toContain(
        "mineral-proximity-parcels",
      ),
    );
  });

  it("preserves a requested shared derived layer through review and activates it only after acceptance", async () => {
    const user = userEvent.setup();
    window.history.replaceState(
      null,
      "",
      "/?taxSale=off&mode=current&layers=mineral-proximity-parcels&position=46.1,-60.9,12",
    );

    renderAppWithCategoriesOpen();

    const proximityToggle = screen.getByLabelText(
      "Properties within 1 km of a mineral occurrence",
    );
    expect(proximityToggle).toBeDisabled();
    expect(proximityToggle).not.toBeChecked();
    expect(screen.getByTestId("map-canvas")).toHaveTextContent(
      "mineral proximity parcels: off",
    );
    expect(new URL(window.location.href).searchParams.get("layers")).toContain(
      "mineral-proximity-parcels",
    );

    await user.click(
      within(proximityToggle.closest("label") as HTMLElement).getByRole("button", {
        name: "Review Province licence for Properties within 1 km of a mineral occurrence",
      }),
    );
    await user.click(
      screen.getByRole("button", { name: "Accept and view map layers" }),
    );

    expect(proximityToggle).toBeEnabled();
    expect(proximityToggle).toBeChecked();
    expect(screen.getByTestId("map-canvas")).toHaveTextContent(
      "mineral proximity parcels: on",
    );
  });

  it("refuses to render a restricted flood-hazard layer shared before licence acceptance", () => {
    window.history.replaceState(
      null,
      "",
      "/?taxSale=off&mode=current&layers=published-river-flood-zones,coastal-flood-current&position=46.1,-60.9,12",
    );

    renderAppWithCategoriesOpen();

    const canvas = screen.getByTestId("map-canvas");
    expect(canvas).toHaveTextContent("published river flood zones: off");
    expect(canvas).toHaveTextContent("coastal flooding current: on");
    expect(screen.getByLabelText("Published river flood zones")).toBeDisabled();
    expect(
      screen.getByLabelText("Published river flood zones"),
    ).not.toBeChecked();
    expect(new URL(window.location.href).searchParams.get("layers")).toContain(
      "published-river-flood-zones",
    );
    expect(
      screen.getByRole("dialog", { name: "Province data licence" }),
    ).toBeInTheDocument();
  });

  it("renders shared restricted flood-hazard layers once the licence is accepted", () => {
    localStorage.setItem("ns-marks-the-spot:province-license:v1", "accepted");
    window.history.replaceState(
      null,
      "",
      "/?taxSale=off&mode=current&layers=published-river-flood-zones&position=46.1,-60.9,12",
    );

    renderAppWithCategoriesOpen();

    expect(screen.getByTestId("map-canvas")).toHaveTextContent(
      "published river flood zones: on",
    );
    expect(screen.getByLabelText("Published river flood zones")).toBeChecked();
    expect(new URL(window.location.href).searchParams.get("layers")).toContain(
      "published-river-flood-zones",
    );
  });

  it("searches a civic address and opens its containing parcel", async () => {
    const user = userEvent.setup();
    localStorage.setItem("ns-marks-the-spot:province-license:v1", "accepted");
    const result = civicAddress(
      "27700002",
      "11064 Highway 19, Southwest Mabou, Inverness County",
    );
    result.coordinates = [-61.414138, 46.059488];
    vi.mocked(searchCivicAddresses).mockResolvedValueOnce([result]);
    vi.mocked(fetchParcelAtPoint).mockResolvedValueOnce({
      type: "FeatureCollection",
      features: [parcelFeature("50251750")],
    });
    renderAppWithCategoriesOpen();

    await user.type(
      screen.getByLabelText("Search by PID or civic address"),
      "11064 Highway 19 Mabou",
    );
    await user.click(screen.getByRole("button", { name: "Find parcel" }));

    const addressResult = await screen.findByRole("button", {
      name: "11064 Highway 19, Southwest Mabou, Inverness County",
    });
    await user.click(addressResult);

    expect(searchCivicAddresses).toHaveBeenCalledWith(
      "11064 Highway 19 Mabou",
      expect.any(AbortSignal),
    );
    expect(fetchParcelAtPoint).toHaveBeenCalledWith(
      46.059488,
      -61.414138,
      expect.any(AbortSignal),
    );
    expect(
      await screen.findByRole("complementary", {
        name: "Parcel 50251750 details",
      }),
    ).toBeInTheDocument();
    expect(screen.getByTestId("map-canvas")).toHaveTextContent(
      "focus request: 50251750",
    );
  });

  it("opens any parcel identified by tapping the visible boundary layer", async () => {
    const user = userEvent.setup();
    localStorage.setItem("ns-marks-the-spot:province-license:v1", "accepted");
    vi.mocked(fetchParcelAtPoint).mockResolvedValueOnce({
      type: "FeatureCollection",
      features: [parcelFeature("50251750")],
    });
    vi.mocked(fetchCivicAddresses).mockResolvedValueOnce([
      civicAddress(
        "27700002",
        "11064 Highway 19, Southwest Mabou, Inverness County",
      ),
    ]);
    renderAppWithCategoriesOpen();

    await user.click(screen.getByRole("button", { name: "Tap map parcel" }));

    expect(fetchParcelAtPoint).toHaveBeenCalledWith(
      46.059488,
      -61.414138,
      expect.any(AbortSignal),
    );
    const inspector = await screen.findByRole("complementary", {
      name: "Parcel 50251750 details",
    });
    expect(screen.getByTestId("map-canvas")).toHaveTextContent(
      "focus request: none",
    );
    expect(
      await within(inspector).findByText(
        "11064 Highway 19, Southwest Mabou, Inverness County",
      ),
    ).toBeInTheDocument();
    expect(
      within(inspector).queryByText("View direct official source"),
    ).not.toBeInTheDocument();
  });

  it("keeps writing the address bar when replaceState is rate-limited", async () => {
    // Safari refuses more than 100 history.replaceState calls per 30 seconds
    // and raises SecurityError. Thrown from inside the effect that writes the
    // share URL, that unmounted the entire app; the map must survive it with
    // nothing worse than a stale address bar.
    localStorage.setItem(PROVINCE_LICENSE_ACCEPTANCE_KEY, "accepted");
    window.history.replaceState(null, "", "/");
    const replaceState = vi
      .spyOn(window.history, "replaceState")
      .mockImplementation(() => {
        throw new DOMException("rate limited", "SecurityError");
      });

    try {
      renderAppWithCategoriesOpen();

      await waitFor(() => expect(replaceState).toHaveBeenCalled());
      // Still mounted: no error boundary fallback, map still rendered.
      expect(screen.getByTestId("map-canvas")).toBeInTheDocument();
      expect(
        screen.queryByRole("heading", { name: "The map stopped responding" }),
      ).not.toBeInTheDocument();
    } finally {
      replaceState.mockRestore();
    }
  });

  it("throttles address-bar writes during a burst of viewport changes", async () => {
    localStorage.setItem(PROVINCE_LICENSE_ACCEPTANCE_KEY, "accepted");
    window.history.replaceState(null, "", "/");
    renderAppWithCategoriesOpen();

    const replaceState = vi.spyOn(window.history, "replaceState");
    try {
      const viewportButton = screen.getByRole("button", {
        name: "Simulate map drift",
      });
      for (let move = 0; move < 12; move += 1) {
        fireEvent.click(viewportButton);
      }

      // Leading edge writes once; the rest of the burst collapses into a
      // single trailing write instead of one call per moveend/zoomend.
      await waitFor(() => expect(replaceState).toHaveBeenCalled());
      expect(replaceState.mock.calls.length).toBeLessThan(12);
    } finally {
      replaceState.mockRestore();
    }
  });

  it("auto-dismisses the parcel-selected toast", async () => {
    vi.useFakeTimers();
    try {
      localStorage.setItem("ns-marks-the-spot:province-license:v1", "accepted");
      vi.mocked(fetchParcelAtPoint).mockResolvedValueOnce({
        type: "FeatureCollection",
        features: [parcelFeature("50251750")],
      });
      renderAppWithCategoriesOpen();

      fireEvent.click(screen.getByRole("button", { name: "Tap map parcel" }));
      await act(async () => {
        await vi.advanceTimersByTimeAsync(0);
      });
      expect(screen.getByText("PID 50251750 selected.")).toBeInTheDocument();

      await act(async () => {
        await vi.advanceTimersByTimeAsync(6_000);
      });
      expect(
        screen.queryByText("PID 50251750 selected."),
      ).not.toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });

  it("keeps an identified parcel when the initial tax-sale geometry arrives later", async () => {
    const user = userEvent.setup();
    localStorage.setItem("ns-marks-the-spot:province-license:v1", "accepted");
    setTaxSaleResearchUrl();
    let resolveTaxSaleParcels: (
      collection: Awaited<ReturnType<typeof fetchParcels>>,
    ) => void = () => undefined;
    vi.mocked(fetchParcels).mockReturnValueOnce(
      new Promise((resolve) => {
        resolveTaxSaleParcels = resolve;
      }),
    );
    vi.mocked(fetchParcelAtPoint).mockResolvedValueOnce({
      type: "FeatureCollection",
      features: [parcelFeature("50251750")],
    });

    renderAppWithCategoriesOpen();
    await user.click(screen.getByRole("button", { name: "Tap map parcel" }));
    await screen.findByRole("complementary", {
      name: "Parcel 50251750 details",
    });

    await act(async () => {
      resolveTaxSaleParcels({
        type: "FeatureCollection",
        features: [parcelFeature("80000000")],
      });
    });

    expect(screen.getByTestId("map-canvas")).toHaveTextContent(
      "geometry count: 2",
    );
  });

  it("aborts a pending map-point lookup when a PID search takes over", async () => {
    const user = userEvent.setup();
    localStorage.setItem("ns-marks-the-spot:province-license:v1", "accepted");
    window.history.replaceState(null, "", "/");
    vi.mocked(fetchParcels).mockResolvedValueOnce({
      type: "FeatureCollection",
      features: [parcelFeature("50334317")],
    });
    let pointSignal: AbortSignal | undefined;
    vi.mocked(fetchParcelAtPoint).mockImplementationOnce((_, __, signal) => {
      pointSignal = signal;
      return new Promise((_, reject) => {
        signal?.addEventListener("abort", () => {
          reject(new DOMException("Aborted", "AbortError"));
        });
      });
    });

    renderAppWithCategoriesOpen();
    expect(screen.getByLabelText("Show tax-sale information")).not.toBeChecked();
    await user.click(screen.getByRole("button", { name: "Tap map parcel" }));
    await vi.waitFor(() => expect(pointSignal).toBeDefined());

    const search = screen.getByLabelText("Search by PID or civic address");
    await user.clear(search);
    await user.type(search, "50334317");
    await user.click(screen.getByRole("button", { name: "Find parcel" }));

    expect(pointSignal?.aborted).toBe(true);
    expect(
      await screen.findByRole("complementary", {
        name: "Parcel 50334317 details",
      }),
    ).toBeInTheDocument();
  });

  it("aborts a pending civic search when the user changes its text", async () => {
    const user = userEvent.setup();
    localStorage.setItem("ns-marks-the-spot:province-license:v1", "accepted");
    let searchSignal: AbortSignal | undefined;
    vi.mocked(searchCivicAddresses).mockImplementationOnce((_, signal) => {
      searchSignal = signal;
      return new Promise((_, reject) => {
        signal?.addEventListener("abort", () => {
          reject(new DOMException("Aborted", "AbortError"));
        });
      });
    });

    renderAppWithCategoriesOpen();
    const search = screen.getByLabelText("Search by PID or civic address");
    await user.type(search, "Highway 19 Mabou");
    await user.click(screen.getByRole("button", { name: "Find parcel" }));
    await vi.waitFor(() => expect(searchSignal).toBeDefined());

    await user.type(search, " West");

    expect(searchSignal?.aborted).toBe(true);
    expect(
      screen.getByText("Enter an 8-digit PID or a Nova Scotia civic address."),
    ).toBeInTheDocument();
  });

  it("keeps the completed CBRM event out of current notices", async () => {
    const user = userEvent.setup();
    localStorage.setItem("ns-marks-the-spot:province-license:v1", "accepted");
    setTaxSaleResearchUrl();

    renderAppWithCategoriesOpen();

    expect(
      screen.queryByRole("checkbox", { name: /CBRM.*July 21, 2026/i }),
    ).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Historical records" }));
    await user.selectOptions(screen.getByLabelText("Historical municipality"), "cbrm");

    // Both CBRM events: the result-backed July 22, 2025 sale (73 records, 75
    // PIDs) and the result-backed July 21, 2026 sale (67 records, 68 PIDs).
    // Ten parcels were listed in both sales and count once.
    expect(screen.getByText("140 records · 133 PIDs")).toBeInTheDocument();
  });

  it("keeps a blank CBRM result row unknown while linking the official result", async () => {
    const user = userEvent.setup();
    localStorage.setItem("ns-marks-the-spot:province-license:v1", "accepted");
    setTaxSaleResearchUrl();
    vi.mocked(fetchParcels).mockImplementation(async (pids) => ({
      type: "FeatureCollection",
      features: pids.map(parcelFeature),
    }));
    renderAppWithCategoriesOpen();

    await user.click(screen.getByRole("button", { name: "Historical records" }));
    await user.type(screen.getByLabelText("Search by PID or civic address"), "15054588");
    await user.click(screen.getByRole("button", { name: "Find parcel" }));

    const inspector = await screen.findByRole("complementary", {
      name: "Parcel 15054588 details",
    });
    expect(within(inspector).getByText("Outcome unknown")).toBeInTheDocument();
    expect(
      within(inspector).getByText("Not published in verified sources"),
    ).toBeInTheDocument();
    expect(within(inspector).getByRole("link", { name: "Official result" }))
      .toHaveAttribute(
        "href",
        "https://cbrm.ns.ca/wp-content/uploads/2026/07/List-of-Sold-Properties-July-21-2026.pdf",
      );
    expect(within(inspector).queryByRole("link", { name: "Check official results" }))
      .not.toBeInTheDocument();
  });

  it("toggles native-parity Province layers independently", async () => {
    const user = userEvent.setup();
    localStorage.setItem("ns-marks-the-spot:province-license:v1", "accepted");
    renderAppWithCategoriesOpen();

    const crownLands = screen.getByLabelText("Crown Lands");
    const waterfalls = screen.getByLabelText("Waterfalls");

    expect(crownLands).not.toBeChecked();
    expect(waterfalls).not.toBeChecked();

    await user.click(crownLands);
    await user.click(waterfalls);

    expect(crownLands).toBeChecked();
    expect(waterfalls).toBeChecked();
  });

  it("shows the official road-style legend only while the road layer is visible", async () => {
    const user = userEvent.setup();
    localStorage.setItem("ns-marks-the-spot:province-license:v1", "accepted");
    window.history.replaceState(null, "", "/?taxSale=off&layers=modern,roads");
    renderAppWithCategoriesOpen();

    const legend = screen.getByRole("list", { name: "Road type legend" });
    expect(within(legend).getByText("Highway")).toBeInTheDocument();
    expect(within(legend).getByText("Local road")).toBeInTheDocument();
    expect(within(legend).getByText("Resource road")).toBeInTheDocument();
    expect(within(legend).getByText("Trail / track")).toBeInTheDocument();
    expect(within(legend).getByText("Culvert")).toBeInTheDocument();

    await user.click(screen.getByLabelText("Roads, trails & culverts"));
    expect(
      screen.queryByRole("list", { name: "Road type legend" }),
    ).not.toBeInTheDocument();
  });

  it("toggles the modern map independently of Province layers", async () => {
    const user = userEvent.setup();
    renderAppWithCategoriesOpen();

    const modernMap = screen.getByLabelText("Modern map");
    expect(modernMap).toBeChecked();
    expect(screen.getByTestId("map-canvas")).toHaveTextContent(
      "modern map: on",
    );

    await user.click(modernMap);

    expect(modernMap).not.toBeChecked();
    expect(screen.getByTestId("map-canvas")).toHaveTextContent(
      "modern map: off",
    );
  });

  it("preserves an explicitly shared aerial-only basemap", () => {
    localStorage.setItem("ns-marks-the-spot:province-license:v1", "accepted");
    window.history.replaceState(
      null,
      "",
      "/?taxSale=off&layers=ns-aerial,nsprd&position=46.1,-60.9,12",
    );

    renderAppWithCategoriesOpen();

    expect(screen.getByLabelText("Show tax-sale information")).not.toBeChecked();
    expect(screen.getByLabelText("NS Aerial")).toBeChecked();
    expect(screen.getByLabelText("Modern map")).not.toBeChecked();
  });

  it("restores Modern map when shared aerial starts below its display zoom", () => {
    localStorage.setItem("ns-marks-the-spot:province-license:v1", "accepted");
    window.history.replaceState(
      null,
      "",
      "/?taxSale=off&layers=ns-aerial,nsprd&position=46.1,-60.9,9",
    );

    renderAppWithCategoriesOpen();

    expect(screen.getByLabelText("Show tax-sale information")).not.toBeChecked();
    expect(screen.getByLabelText("NS Aerial")).toBeChecked();
    expect(screen.getByLabelText("Modern map")).toBeChecked();
  });

  it("tracks Safari's visible viewport height", () => {
    const resizeListeners = new Set<EventListenerOrEventListenerObject>();
    vi.stubGlobal(
      "visualViewport",
      {
        height: 640.4,
        addEventListener: (type: string, listener: EventListenerOrEventListenerObject) => {
          if (type === "resize") {
            resizeListeners.add(listener);
          }
        },
        removeEventListener: (type: string, listener: EventListenerOrEventListenerObject) => {
          if (type === "resize") {
            resizeListeners.delete(listener);
          }
        },
      },
    );

    const { unmount } = renderAppWithCategoriesOpen();
    expect(document.documentElement.style.getPropertyValue("--app-viewport-height"))
      .toBe("640px");

    unmount();
    expect(document.documentElement.style.getPropertyValue("--app-viewport-height"))
      .toBe("");
  });

  it("collapses and restores the header", async () => {
    const user = userEvent.setup();
    renderAppWithCategoriesOpen();

    const collapse = screen.getByRole("button", { name: "Collapse header" });
    expect(collapse).toHaveAttribute("aria-expanded", "true");

    await user.click(collapse);

    const expand = screen.getByRole("button", { name: "Expand header" });
    expect(expand).toHaveAttribute("aria-expanded", "false");
    expect(expand.closest(".app-shell")).toHaveClass("header-collapsed");

    await user.click(expand);

    expect(
      screen.getByRole("button", { name: "Collapse header" }),
    ).toHaveAttribute("aria-expanded", "true");
  });

  it("keeps mobile map controls closed until the user opens them", async () => {
    const user = userEvent.setup();
    renderAppWithCategoriesOpen();

    const controls = screen.getByRole("complementary", { name: "Map controls" });
    const trigger = screen.getByRole("button", { name: "Search & layers" });

    expect(controls).not.toHaveClass("mobile-open");
    expect(trigger).toHaveAttribute("aria-expanded", "false");

    await user.click(trigger);

    expect(controls).toHaveClass("mobile-open");
    expect(trigger).toHaveAttribute("aria-expanded", "true");

    await user.click(screen.getByRole("button", { name: "Close map controls" }));

    expect(controls).not.toHaveClass("mobile-open");
    expect(trigger).toHaveAttribute("aria-expanded", "false");
  });

  it("finds a pre-sale tax-sale listing by PID without claiming that it is available", async () => {
    const nowSpy = vi.spyOn(Date, "now").mockReturnValue(
      new Date("2026-08-11T12:29:59Z").getTime(),
    );
    const user = userEvent.setup();
    try {
      localStorage.setItem("ns-marks-the-spot:province-license:v1", "accepted");
      setTaxSaleResearchUrl();
      vi.mocked(fetchParcels).mockImplementation(async (pids) => ({
        type: "FeatureCollection",
        features: pids.map(parcelFeature),
      }));
      renderAppWithCategoriesOpen();

      const search = screen.getByLabelText("Search by PID or civic address");
      await user.type(search, "50203256");
      await user.click(screen.getByRole("button", { name: "Find parcel" }));

      expect(screen.getByRole("heading", { name: "Highway 19, Mabou" })).toBeInTheDocument();
      expect(screen.getByTestId("map-canvas")).toHaveTextContent(
        "focus request: 50203256",
      );
      expect(await screen.findByText("Listed in official notice")).toBeInTheDocument();
      expect(
        within(screen.getByRole("complementary", { name: "Parcel 50203256 details" })).queryByText(
          // "available" as an availability claim — never the honest
          // "unavailable"/"not evaluated" evidence lines.
          /(?<!un)available/i,
        ),
      ).not.toBeInTheDocument();
      expect(screen.getByText("$15,529.15")).toBeInTheDocument();
    } finally {
      nowSpy.mockRestore();
    }
  });

  it("shows notice-AAN assessment values and five-year history without calling them a PID value", async () => {
    const user = userEvent.setup();
    localStorage.setItem("ns-marks-the-spot:province-license:v1", "accepted");
    setTaxSaleResearchUrl();
    vi.mocked(fetchParcels).mockResolvedValueOnce({
      type: "FeatureCollection",
      features: [parcelFeature("50203256")],
    });
    vi.mocked(fetchParcelAssessments).mockResolvedValueOnce({
      matchMethod: "notice-aan",
      accounts: [{
        aan: "00603988",
        records: [
          { taxYear: 2026, assessedValue: 41_000, taxableAssessedValue: 39_500, coordinates: [-61.391318, 46.071925] },
          { taxYear: 2025, assessedValue: 40_000, taxableAssessedValue: 40_000, coordinates: [-61.391318, 46.071925] },
        ],
      }],
    });
    renderAppWithCategoriesOpen();

    await user.type(screen.getByLabelText("Search by PID or civic address"), "50203256");
    await user.click(screen.getByRole("button", { name: "Find parcel" }));

    const assessment = await screen.findByRole("region", {
      name: "PVSC assessment account",
    });
    expect(fetchParcelAssessments).toHaveBeenCalledWith(
      expect.arrayContaining([expect.objectContaining({ properties: expect.objectContaining({ PID: "50203256" }) })]),
      "00603988",
      expect.any(AbortSignal),
    );
    expect(within(assessment).getByText("$41,000.00")).toBeInTheDocument();
    expect(within(assessment).getByText("$39,500.00")).toBeInTheDocument();
    expect(within(assessment).getByText("Matched by official notice AAN.")).toBeInTheDocument();
    expect(within(assessment).getByText(/2026 assessment reflects market value as of January 1, 2025/)).toBeInTheDocument();
    expect(within(assessment).getByText(/not today’s sale price or an appraisal/i)).toBeInTheDocument();
    expect(within(assessment).queryByText(/PID value/i)).not.toBeInTheDocument();
    await user.click(within(assessment).getByText("Assessment history"));
    expect(within(assessment).getByText("2025")).toBeInTheDocument();
  });

  it("does not assign a shared notice AAN value to each PID", async () => {
    const user = userEvent.setup();
    localStorage.setItem("ns-marks-the-spot:province-license:v1", "accepted");
    setTaxSaleResearchUrl();
    vi.mocked(fetchParcels).mockResolvedValueOnce({
      type: "FeatureCollection",
      features: [parcelFeature("50076777")],
    });
    vi.mocked(fetchParcelAssessments).mockResolvedValueOnce({
      matchMethod: "notice-aan",
      accounts: [{
        aan: "04545133",
        records: [{
          taxYear: 2026,
          assessedValue: 120_000,
          taxableAssessedValue: 118_000,
          coordinates: [-61.2, 46.4],
        }],
      }],
    });
    renderAppWithCategoriesOpen();

    await user.type(screen.getByLabelText("Search by PID or civic address"), "50076777");
    await user.click(screen.getByRole("button", { name: "Find parcel" }));

    const assessment = await screen.findByRole("region", {
      name: "PVSC assessment account",
    });
    expect(fetchParcelAssessments).toHaveBeenCalledWith(
      expect.any(Array),
      "04545133",
      expect.any(AbortSignal),
    );
    expect(within(assessment).getByText(
      "This notice AAN covers 3 PIDs. These account values are not assigned to each PID individually.",
    )).toBeInTheDocument();
  });

  it("shows PVSC dwelling records for the matched account", async () => {
    const user = userEvent.setup();
    localStorage.setItem("ns-marks-the-spot:province-license:v1", "accepted");
    vi.mocked(fetchParcels).mockResolvedValueOnce({
      type: "FeatureCollection",
      features: [parcelFeature("50319672")],
    });
    vi.mocked(fetchParcelAssessments).mockResolvedValueOnce({
      matchMethod: "spatial",
      accounts: [{
        aan: "04165829",
        records: [{
          taxYear: 2026,
          assessedValue: 150_000,
          taxableAssessedValue: 120_000,
          coordinates: [-61.470289, 45.812675],
        }],
      }],
    });
    vi.mocked(fetchDwellingCharacteristics).mockResolvedValueOnce([
      {
        aan: "04165829",
        dwellings: [
          {
            yearBuilt: 2018,
            style: "Manufactured Home",
            squareFeetLivingArea: 1056,
            livingUnits: 1,
            bathrooms: 2,
            garage: false,
            underConstruction: false,
          },
          {
            yearBuilt: 1962,
            style: "1 Storey",
            squareFeetLivingArea: 480,
            livingUnits: 1,
            bathrooms: 0,
            garage: null,
            underConstruction: null,
          },
        ],
      },
    ]);
    renderAppWithCategoriesOpen();

    await user.type(
      screen.getByLabelText("Search by PID or civic address"),
      "50319672",
    );
    await user.click(screen.getByRole("button", { name: "Find parcel" }));

    const inspector = await screen.findByRole("complementary", {
      name: "Parcel 50319672 details",
    });
    const dwellingSection = await within(inspector).findByRole("region", {
      name: "PVSC dwellings",
    });
    expect(fetchDwellingCharacteristics).toHaveBeenCalledWith(
      ["04165829"],
      expect.any(AbortSignal),
    );
    expect(
      await within(dwellingSection).findByText("Built 2018"),
    ).toBeInTheDocument();
    expect(
      within(dwellingSection).getByText(
        "Manufactured Home · 1,056 sq ft living area · 1 living unit · 2 bathrooms · No garage",
      ),
    ).toBeInTheDocument();
    expect(within(dwellingSection).getByText("Built 1962")).toBeInTheDocument();
    expect(
      within(dwellingSection).getByText(
        "1 Storey · 480 sq ft living area · 1 living unit · 0 bathrooms",
      ),
    ).toBeInTheDocument();
  });

  it("reports dwelling source failure without hiding assessed values", async () => {
    const user = userEvent.setup();
    localStorage.setItem("ns-marks-the-spot:province-license:v1", "accepted");
    vi.mocked(fetchParcels).mockResolvedValueOnce({
      type: "FeatureCollection",
      features: [parcelFeature("50319672")],
    });
    vi.mocked(fetchParcelAssessments).mockResolvedValueOnce({
      matchMethod: "spatial",
      accounts: [{
        aan: "04165829",
        records: [{
          taxYear: 2026,
          assessedValue: 150_000,
          taxableAssessedValue: 120_000,
          coordinates: [-61.470289, 45.812675],
        }],
      }],
    });
    vi.mocked(fetchDwellingCharacteristics).mockRejectedValueOnce(
      new Error("dwelling source down"),
    );
    renderAppWithCategoriesOpen();

    await user.type(
      screen.getByLabelText("Search by PID or civic address"),
      "50319672",
    );
    await user.click(screen.getByRole("button", { name: "Find parcel" }));

    const inspector = await screen.findByRole("complementary", {
      name: "Parcel 50319672 details",
    });
    const dwellingSection = await within(inspector).findByRole("region", {
      name: "PVSC dwellings",
    });
    expect(
      await within(dwellingSection).findByText(
        "PVSC dwelling data is unavailable. No absence is inferred.",
      ),
    ).toBeInTheDocument();
    expect(within(inspector).getByText("AAN 04165829")).toBeInTheDocument();
    expect(within(inspector).getByText("$150,000.00")).toBeInTheDocument();
  });

  it("bounds the claim when no dwelling record exists for the matched account", async () => {
    const user = userEvent.setup();
    localStorage.setItem("ns-marks-the-spot:province-license:v1", "accepted");
    vi.mocked(fetchParcels).mockResolvedValueOnce({
      type: "FeatureCollection",
      features: [parcelFeature("50319672")],
    });
    vi.mocked(fetchParcelAssessments).mockResolvedValueOnce({
      matchMethod: "spatial",
      accounts: [{
        aan: "04165829",
        records: [{
          taxYear: 2026,
          assessedValue: 150_000,
          taxableAssessedValue: 120_000,
          coordinates: [-61.470289, 45.812675],
        }],
      }],
    });
    vi.mocked(fetchDwellingCharacteristics).mockResolvedValueOnce([]);
    renderAppWithCategoriesOpen();

    await user.type(
      screen.getByLabelText("Search by PID or civic address"),
      "50319672",
    );
    await user.click(screen.getByRole("button", { name: "Find parcel" }));

    const inspector = await screen.findByRole("complementary", {
      name: "Parcel 50319672 details",
    });
    const dwellingSection = await within(inspector).findByRole("region", {
      name: "PVSC dwellings",
    });
    expect(
      await within(dwellingSection).findByText(
        "No residential dwelling record was returned for this parcel's matched accounts. This does not prove no building exists — commercial and other non-residential structures are not in this dataset.",
      ),
    ).toBeInTheDocument();
  });

  it("keeps multiple spatially matched assessment accounts separate", async () => {
    const user = userEvent.setup();
    localStorage.setItem("ns-marks-the-spot:province-license:v1", "accepted");
    vi.mocked(fetchParcels).mockResolvedValueOnce({
      type: "FeatureCollection",
      features: [parcelFeature("50334317")],
    });
    vi.mocked(fetchParcelAssessments).mockResolvedValueOnce({
      matchMethod: "spatial",
      accounts: [
        { aan: "00000001", records: [{ taxYear: 2026, assessedValue: 100_000, taxableAssessedValue: 90_000, coordinates: [-61.15, 46.35] }] },
        { aan: "00000002", records: [{ taxYear: 2026, assessedValue: 200_000, taxableAssessedValue: 180_000, coordinates: [-61.16, 46.36] }] },
      ],
    });
    renderAppWithCategoriesOpen();

    await user.type(screen.getByLabelText("Search by PID or civic address"), "50334317");
    await user.click(screen.getByRole("button", { name: "Find parcel" }));

    const assessment = await screen.findByRole("region", {
      name: "PVSC assessment accounts",
    });
    expect(within(assessment).getByText(/2 PVSC account points were mapped inside this parcel/)).toBeInTheDocument();
    expect(within(assessment).getByText(/shown separately and are not summed/)).toBeInTheDocument();
    expect(within(assessment).getByText("$100,000.00")).toBeInTheDocument();
    expect(within(assessment).getByText("$200,000.00")).toBeInTheDocument();
    expect(within(assessment).queryByText("$300,000.00")).not.toBeInTheDocument();
  });

  it("reports PVSC source failure without hiding the parcel", async () => {
    const user = userEvent.setup();
    localStorage.setItem("ns-marks-the-spot:province-license:v1", "accepted");
    vi.mocked(fetchParcels).mockResolvedValueOnce({
      type: "FeatureCollection",
      features: [parcelFeature("50334317")],
    });
    vi.mocked(fetchParcelAssessments).mockRejectedValueOnce(new Error("offline"));
    renderAppWithCategoriesOpen();

    await user.type(screen.getByLabelText("Search by PID or civic address"), "50334317");
    await user.click(screen.getByRole("button", { name: "Find parcel" }));

    expect(await screen.findByText("27.44 acres")).toBeInTheDocument();
    expect(screen.getByText("PVSC open assessment data is unavailable. No absence is inferred.")).toBeInTheDocument();
  });

  it("browses tax-sale properties and selects one parcel at a time", async () => {
    const user = userEvent.setup();
    localStorage.setItem("ns-marks-the-spot:province-license:v1", "accepted");
    setTaxSaleResearchUrl();
    vi.mocked(fetchParcels).mockImplementation(async (pids) => ({
      type: "FeatureCollection",
      features: pids.map(parcelFeature),
    }));
    renderAppWithCategoriesOpen();

    await user.click(
      screen.getByText("47 parcels shown").closest("summary")!,
    );
    const invernessProperties = screen.getByRole("list", {
      name: "Inverness County tax-sale properties",
    });
    const property = within(invernessProperties).getByRole("button", {
      name: "Highway 19, Mabou, lien 1, PID 50203256",
    });

    await user.click(property);

    expect(property).toHaveAttribute("aria-current", "true");
    expect(
      screen.getByRole("complementary", {
        name: "Parcel 50203256 details",
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", {
        name: "Highway 19, Mabou",
      }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Search by PID or civic address")).toHaveValue(
      "50203256",
    );
    expect(screen.getByTestId("map-canvas")).toHaveTextContent(
      "focus request: 50203256",
    );
    const viewpointLink = within(
      screen.getByRole("complementary", {
        name: "Parcel 50203256 details",
      }),
    ).getByRole("link", { name: "Open parcel in ViewPoint" });
    expect(viewpointLink).toHaveAttribute(
      "href",
      "https://www.viewpoint.ca/show/property/50203256",
    );
    expect(viewpointLink).toHaveAttribute("target", "_blank");
    expect(viewpointLink).toHaveAttribute("rel", "noreferrer");
  });

  it("keeps the property lists aligned with the redemption filter", async () => {
    const user = userEvent.setup();
    localStorage.setItem("ns-marks-the-spot:province-license:v1", "accepted");
    setTaxSaleResearchUrl();
    renderAppWithCategoriesOpen();

    await user.click(
      screen.getByRole("button", { name: /Immediate \/ none/ }),
    );

    expect(screen.getByText("17 parcels shown")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", {
        name: "75 DORCHESTER ST LAND BUILDING, lien 26-05, PID 15054588",
      }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", {
        name: "MacGarry Road, Cap Le Moine, lien 19, PID 50064146",
      }),
    ).toBeInTheDocument();
  });

  it("shows mapped acreage and exact intersecting road and water features", async () => {
    const user = userEvent.setup();
    localStorage.setItem("ns-marks-the-spot:province-license:v1", "accepted");
    vi.mocked(fetchParcels).mockResolvedValueOnce({
      type: "FeatureCollection",
      features: [
        {
          type: "Feature",
          properties: { PID: "50334317", "SHAPE.AREA": 111_057.27135 },
          geometry: {
            type: "Polygon",
            coordinates: [
              [
                [-61.2, 46.4],
                [-61.1, 46.4],
                [-61.1, 46.3],
                [-61.2, 46.3],
                [-61.2, 46.4],
              ],
            ],
          },
        },
      ],
    });
    vi.mocked(fetchParcelContext).mockResolvedValueOnce({
      roads: [
        { name: "Cabot Trail", kind: "Arterial", relationship: "intersects" },
        { name: "Harbour Road", kind: "Local", relationship: "adjacent" },
        { name: "Culvert", kind: "Non-vehicle feature", relationship: "intersects" },
      ],
      water: [
        { name: "Mabou River", kind: "River or stream", relationship: "intersects" },
      ],
    });
    vi.mocked(fetchCivicAddresses).mockResolvedValueOnce([
      civicAddress("address-road", "12 Main St, Mabou"),
    ]);
    renderAppWithCategoriesOpen();

    await user.type(screen.getByLabelText("Search by PID or civic address"), "50334317");
    await user.click(screen.getByRole("button", { name: "Find parcel" }));

    const inspector = await screen.findByRole("complementary", {
      name: "Parcel 50334317 details",
    });
    expect(within(inspector).getByText("27.44 acres")).toBeInTheDocument();
    expect(within(inspector).getByText("Cabot Trail")).toBeInTheDocument();
    expect(within(inspector).getByText(/Arterial/)).toBeInTheDocument();
    expect(within(inspector).getByText("Culvert")).toBeInTheDocument();
    expect(within(inspector).getByText("Harbour Road")).toBeInTheDocument();
    expect(within(inspector).getByText(/Adjacent within 20 m/)).toBeInTheDocument();
    expect(within(inspector).getByText("Main St")).toBeInTheDocument();
    expect(within(inspector).getByText(/Named by civic address/)).toBeInTheDocument();
    expect(within(inspector).getByText("Mabou River")).toBeInTheDocument();
    expect(within(inspector).getByText(/River or stream/)).toBeInTheDocument();
    expect(within(inspector).getByText(/not proof of legal access/)).toBeInTheDocument();
  });

  it("reports intersection lookup failures without hiding parcel facts", async () => {
    const user = userEvent.setup();
    localStorage.setItem("ns-marks-the-spot:province-license:v1", "accepted");
    vi.mocked(fetchParcels).mockResolvedValueOnce({
      type: "FeatureCollection",
      features: [
        {
          type: "Feature",
          properties: { PID: "50203256", "SHAPE.AREA": 728.4341 },
          geometry: { type: "Point", coordinates: [-61, 46] },
        },
      ],
    });
    vi.mocked(fetchParcelContext).mockRejectedValueOnce(new Error("offline"));
    renderAppWithCategoriesOpen();

    await user.type(screen.getByLabelText("Search by PID or civic address"), "50203256");
    await user.click(screen.getByRole("button", { name: "Find parcel" }));

    expect(await screen.findByText("0.18 acres")).toBeInTheDocument();
    expect(
      screen.getByText(
        "Mapped road and water intersections are unavailable right now.",
      ),
    ).toBeInTheDocument();
  });

  it("shows an honest loading state and one mapped civic address with its own licence", async () => {
    const user = userEvent.setup();
    localStorage.setItem("ns-marks-the-spot:province-license:v1", "accepted");
    vi.mocked(fetchParcels).mockResolvedValueOnce({
      type: "FeatureCollection",
      features: [parcelFeature("50334317")],
    });
    let resolveAddresses!: (addresses: CivicAddress[]) => void;
    vi.mocked(fetchCivicAddresses).mockReturnValueOnce(
      new Promise((resolve) => {
        resolveAddresses = resolve;
      }),
    );
    renderAppWithCategoriesOpen();

    await user.type(screen.getByLabelText("Search by PID or civic address"), "50334317");
    await user.click(screen.getByRole("button", { name: "Find parcel" }));

    expect(
      screen.getByText("Looking up mapped civic addresses…"),
    ).toBeInTheDocument();
    await act(async () => {
      resolveAddresses([
        civicAddress("100", "12 Main St, Mabou, Inverness County"),
      ]);
    });

    const inspector = await screen.findByRole("complementary", {
      name: "Parcel 50334317 details",
    });
    const civicSection = within(inspector)
      .getByRole("heading", { name: "Mapped civic address" })
      .closest("section");
    expect(civicSection).not.toBeNull();
    const civic = within(civicSection as HTMLElement);
    expect(
      civic.getByText("12 Main St, Mabou, Inverness County"),
    ).toBeInTheDocument();
    expect(
      civic.getByRole("link", {
        name: "87RW9V22+22 — Directions in Google Maps",
      }),
    ).toHaveAttribute(
      "href",
      "https://www.google.com/maps/dir/?api=1&destination=46.35%2C-61.15&dir_action=navigate",
    );
    expect(
      civic.getByRole("link", {
        name: "Nova Scotia Civic Address File",
      }),
    ).toHaveAttribute(
      "href",
      "https://data.novascotia.ca/Municipalities/Nova-Scotia-Civic-Address-File-Civic-Points/tntn-er5g",
    );
    expect(civic.getByText(OPEN_GOVERNMENT_ATTRIBUTION)).toBeInTheDocument();
    expect(
      civic.getByRole("link", {
        name: "Open Government Licence – Nova Scotia",
      }),
    ).toHaveAttribute(
      "href",
      "https://support.novascotia.ca/services/open-data-portal-licence",
    );
    expect(
      civic.getByText(
        "Mapped physical-address points are not proof of ownership, mailing address, access, occupancy, or legal parcel status.",
      ),
    ).toBeInTheDocument();

    // The building count sits in the same card and does not come from the
    // same place. It is asked of the Province's NSTDB map service, so it
    // arrives under the restricted licence whatever the open-data copy of the
    // same compilation says. Crediting it to the Open Government Licence told
    // a reader they could reuse a figure on terms the service never granted.
    const buildingNote = inspector.querySelector(".building-count-note");
    expect(buildingNote).not.toBeNull();
    const building = within(buildingNote as HTMLElement);
    expect(buildingNote).toHaveTextContent(PROVINCE_ATTRIBUTION);
    expect(buildingNote).not.toHaveTextContent(OPEN_GOVERNMENT_ATTRIBUTION);
    expect(
      building.getByRole("link", { name: "Read the Province licence" }),
    ).toHaveAttribute("href", PROVINCE_LICENSE_URL);
  });

  it("shows explicit official-source resource intersections in the parcel sheet", async () => {
    const user = userEvent.setup();
    localStorage.setItem("ns-marks-the-spot:province-license:v1", "accepted");
    vi.mocked(fetchParcels).mockResolvedValueOnce({
      type: "FeatureCollection",
      features: [parcelFeature("50334317")],
    });
    vi.mocked(fetchParcelResourceIntersections).mockResolvedValueOnce({
      "mineral-occurrences": {
        status: "ready",
        intersections: [
          {
            id: "A01-001",
            name: "Exact occurrence",
            detail: "Occurrence · Au, Ag",
            relationship: "on-parcel",
          },
          {
            id: "A01-002",
            name: "Nearby occurrence",
            detail: "Placer · Au",
            relationship: "within-1km",
          },
        ],
      },
      "mineral-tenure": { status: "ready", intersections: [] },
      "abandoned-mines": { status: "error", intersections: [] },
    });
    renderAppWithCategoriesOpen();

    await user.type(screen.getByLabelText("Search by PID or civic address"), "50334317");
    await user.click(screen.getByRole("button", { name: "Find parcel" }));

    const resources = await screen.findByRole("region", {
      name: "Geology & resource context",
    });
    expect(within(resources).getByText("Exact occurrence")).toBeInTheDocument();
    expect(within(resources).getByText("A01-001 · On parcel")).toBeInTheDocument();
    expect(within(resources).getByText("A01-002 · Within 1 km")).toBeInTheDocument();
    expect(within(resources).getByText("Occurrence · Au, Ag")).toBeInTheDocument();
    expect(within(resources).getByText("Placer · Au")).toBeInTheDocument();
    expect(within(resources).getByText("Source unavailable; no absence is inferred."))
      .toBeInTheDocument();
    expect(
      within(resources).getByText(/does not prove mineralization/),
    ).toBeInTheDocument();
    expect(within(resources).getAllByRole("link")).toHaveLength(3);
  });

  it("shows coverage-aware river and coastal flood evidence without a universal PID probability", async () => {
    const user = userEvent.setup();
    localStorage.setItem("ns-marks-the-spot:province-license:v1", "accepted");
    vi.mocked(fetchParcels).mockResolvedValueOnce({
      type: "FeatureCollection",
      features: [parcelFeature("50334317")],
    });
    vi.mocked(fetchParcelFloodHazardEvidence).mockResolvedValueOnce({
      river: {
        status: "published-intersection",
        aep: [
          { annualExceedanceProbabilityPercent: 5, relationship: "area", places: ["Bedford / Sackville"] },
          { annualExceedanceProbabilityPercent: 1, relationship: "boundary", places: ["Pictou"] },
        ],
      },
      coastal: [
        { scenario: "current", status: "intersects", stormAnnualExceedanceProbabilityPercent: 1, approximateAffectedPercent: 12.5, approximateAffectedSquareMetres: 13_882, sampledParcelPixels: 320 },
        { scenario: "2050", status: "no-intersection", stormAnnualExceedanceProbabilityPercent: 1, approximateAffectedPercent: 0, approximateAffectedSquareMetres: 0, sampledParcelPixels: 320 },
        { scenario: "2100", status: "error", stormAnnualExceedanceProbabilityPercent: 1, message: "Unavailable" },
      ],
    });
    renderAppWithCategoriesOpen();

    await user.type(screen.getByLabelText("Search by PID or civic address"), "50334317");
    await user.click(screen.getByRole("button", { name: "Find parcel" }));

    const evidence = await screen.findByRole("region", { name: "Flood hazard evidence" });
    expect(within(evidence).getByText(/5% annual-exceedance flood area intersects/)).toBeInTheDocument();
    expect(within(evidence).getByText(/1% annual-exceedance boundary intersects/)).toBeInTheDocument();
    expect(within(evidence).getByText(/12.5% of mapped parcel area/)).toBeInTheDocument();
    expect(
      within(evidence).getByText(/2050: no mapped pixels intersected/),
    ).toBeInTheDocument();
    expect(
      within(evidence).getByText(/2100: source unavailable — no absence is inferred/),
    ).toBeInTheDocument();
    // One shared caveat for the non-intersecting rows, not one per sentence.
    expect(
      within(evidence).getByText(
        "No intersecting pixels is not proof of no coastal hazard.",
      ),
    ).toBeInTheDocument();
    expect(within(evidence).getByText(/Reproduced and distributed with the permission/)).toBeInTheDocument();
    expect(within(evidence).getByText(/shall not be construed as constituting an endorsement/)).toBeInTheDocument();
    expect(within(evidence).queryByText(/parcel flood probability/i)).not.toBeInTheDocument();
  });

  it("uses bounded mineral empty-result wording", async () => {
    const user = userEvent.setup();
    localStorage.setItem("ns-marks-the-spot:province-license:v1", "accepted");
    vi.mocked(fetchParcels).mockResolvedValueOnce({
      type: "FeatureCollection",
      features: [parcelFeature("50334317")],
    });
    renderAppWithCategoriesOpen();

    await user.type(screen.getByLabelText("Search by PID or civic address"), "50334317");
    await user.click(screen.getByRole("button", { name: "Find parcel" }));

    const resources = await screen.findByRole("region", {
      name: "Geology & resource context",
    });
    expect(
      within(resources).getByText(
        "No published mineral occurrence was returned on or within 1 km of this parcel.",
      ),
    ).toBeInTheDocument();
  });

  it("exports relationship-safe mineral evidence and both derived-layer sources", async () => {
    const user = userEvent.setup();
    const anchorClick = vi
      .spyOn(HTMLAnchorElement.prototype, "click")
      .mockImplementation(() => undefined);
    localStorage.setItem("ns-marks-the-spot:province-license:v1", "accepted");
    vi.mocked(fetchParcels).mockResolvedValueOnce({
      type: "FeatureCollection",
      features: [parcelFeature("50334317")],
    });
    vi.mocked(fetchParcelResourceIntersections).mockResolvedValueOnce({
      "mineral-occurrences": {
        status: "ready",
        intersections: [{
          id: "A01-001",
          name: "Exact occurrence",
          detail: "Occurrence · Au, Ag",
          relationship: "on-parcel",
        }],
      },
      "mineral-tenure": { status: "ready", intersections: [] },
      "abandoned-mines": { status: "ready", intersections: [] },
    });
    renderAppWithCategoriesOpen();

    await user.click(
      screen.getByLabelText("Properties within 1 km of a mineral occurrence"),
    );
    await user.type(screen.getByLabelText("Search by PID or civic address"), "50334317");
    await user.click(screen.getByRole("button", { name: "Find parcel" }));
    await screen.findByText("A01-001 · On parcel");
    await user.click(screen.getByRole("button", { name: "Export evidence note" }));

    expect(buildEvidenceNote).toHaveBeenCalledWith(expect.objectContaining({
      shareUrl: expect.stringContaining("mineral-proximity-parcels"),
      activeLayers: expect.arrayContaining([
        expect.objectContaining({
          name: "Mineral occurrences — derived proximity input",
          sourceUrl: "https://novascotia.ca/natr/meb/download/dp002.asp",
          sourceDate: "June 2024 · version 12",
        }),
        expect.objectContaining({
          name: "NSPRD parcel geometry — derived proximity input",
          sourceUrl: NSPRD_LAYER_URL,
          sourceDate: "Live service · checked July 20, 2026",
        }),
      ]),
      resourceResults: expect.arrayContaining([
        expect.objectContaining({
          name: "Mineral occurrences",
          results: [
            "A01-001 · Exact occurrence · On parcel · Occurrence · Au, Ag",
          ],
          emptyMessage:
            "No published mineral occurrence was returned on or within 1 km of this parcel.",
        }),
      ]),
      assessmentEvidence: {
        status: "ready",
        result: { matchMethod: "spatial", accounts: [] },
      },
    }));
    anchorClick.mockRestore();
  });

  it("does not export mineral empty evidence while selected-parcel resources are pending", async () => {
    const user = userEvent.setup();
    const anchorClick = vi
      .spyOn(HTMLAnchorElement.prototype, "click")
      .mockImplementation(() => undefined);
    const resources = deferred<Awaited<ReturnType<typeof fetchParcelResourceIntersections>>>();
    localStorage.setItem("ns-marks-the-spot:province-license:v1", "accepted");
    vi.mocked(fetchParcels).mockResolvedValueOnce({
      type: "FeatureCollection",
      features: [parcelFeature("50334317")],
    });
    vi.mocked(fetchParcelResourceIntersections).mockReturnValueOnce(resources.promise);
    renderAppWithCategoriesOpen();

    await user.type(screen.getByLabelText("Search by PID or civic address"), "50334317");
    await user.click(screen.getByRole("button", { name: "Find parcel" }));

    const exportButton = await screen.findByRole("button", {
      name: "Export evidence note",
    });
    expect(exportButton).toBeDisabled();
    await user.click(exportButton);
    expect(buildEvidenceNote).not.toHaveBeenCalled();

    await act(async () => {
      resources.resolve({
        "mineral-occurrences": {
          status: "ready",
          intersections: [{
            id: "A01-002",
            name: "Nearby occurrence",
            detail: "Placer · Au",
            relationship: "within-1km",
          }],
        },
        "mineral-tenure": { status: "ready", intersections: [] },
        "abandoned-mines": { status: "ready", intersections: [] },
      });
      await resources.promise;
    });

    await waitFor(() => expect(exportButton).toBeEnabled());
    await user.click(exportButton);
    expect(buildEvidenceNote).toHaveBeenCalledWith(expect.objectContaining({
      resourceResults: expect.arrayContaining([
        expect.objectContaining({
          name: "Mineral occurrences",
          results: ["A01-002 · Nearby occurrence · Within 1 km · Placer · Au"],
        }),
      ]),
    }));
    anchorClick.mockRestore();
  });

  it("waits for assessment evidence before exporting the selected parcel", async () => {
    const user = userEvent.setup();
    const anchorClick = vi
      .spyOn(HTMLAnchorElement.prototype, "click")
      .mockImplementation(() => undefined);
    const assessments = deferred<Awaited<ReturnType<typeof fetchParcelAssessments>>>();
    const dwellings = deferred<Awaited<ReturnType<typeof fetchDwellingCharacteristics>>>();
    localStorage.setItem("ns-marks-the-spot:province-license:v1", "accepted");
    vi.mocked(fetchParcels).mockResolvedValueOnce({
      type: "FeatureCollection",
      features: [parcelFeature("50334317")],
    });
    vi.mocked(fetchParcelAssessments).mockReturnValueOnce(assessments.promise);
    vi.mocked(fetchDwellingCharacteristics).mockReturnValueOnce(dwellings.promise);
    renderAppWithCategoriesOpen();

    await user.type(screen.getByLabelText("Search by PID or civic address"), "50334317");
    await user.click(screen.getByRole("button", { name: "Find parcel" }));

    const exportButton = await screen.findByRole("button", {
      name: "Export evidence note",
    });
    expect(exportButton).toBeDisabled();
    expect(exportButton).toHaveAttribute("title", "Waiting for selected-parcel evidence");

    await act(async () => {
      assessments.resolve({
        matchMethod: "spatial",
        accounts: [{
          aan: "00603988",
          records: [{
            taxYear: 2026,
            assessedValue: 41_000,
            taxableAssessedValue: 39_500,
            coordinates: [-61.391318, 46.071925],
          }],
        }],
      });
      await assessments.promise;
    });

    expect(exportButton).toBeDisabled();

    await act(async () => {
      dwellings.resolve([]);
      await dwellings.promise;
    });

    await waitFor(() => expect(exportButton).toBeEnabled());
    await user.click(exportButton);
    expect(buildEvidenceNote).toHaveBeenCalledWith(expect.objectContaining({
      assessmentEvidence: expect.objectContaining({
        status: "ready",
        result: expect.objectContaining({ matchMethod: "spatial" }),
      }),
      dwellingEvidence: expect.objectContaining({ status: "ready" }),
    }));
    anchorClick.mockRestore();
  });

  it("lists every unique mapped civic address", async () => {
    const user = userEvent.setup();
    localStorage.setItem("ns-marks-the-spot:province-license:v1", "accepted");
    vi.mocked(fetchParcels).mockResolvedValueOnce({
      type: "FeatureCollection",
      features: [parcelFeature("50334317")],
    });
    vi.mocked(fetchCivicAddresses).mockResolvedValueOnce([
      civicAddress("100", "12 Main St, Mabou, Inverness County"),
      civicAddress("101", "Unit 2, 12 Main St, Mabou, Inverness County"),
    ]);
    renderAppWithCategoriesOpen();

    await user.type(screen.getByLabelText("Search by PID or civic address"), "50334317");
    await user.click(screen.getByRole("button", { name: "Find parcel" }));

    const inspector = await screen.findByRole("complementary", {
      name: "Parcel 50334317 details",
    });
    expect(
      await within(inspector).findByRole("heading", {
        name: "Mapped civic addresses",
      }),
    ).toBeInTheDocument();
    expect(
      within(inspector).getByText("12 Main St, Mabou, Inverness County"),
    ).toBeInTheDocument();
    expect(
      within(inspector).getByText(
        "Unit 2, 12 Main St, Mabou, Inverness County",
      ),
    ).toBeInTheDocument();
  });

  it("states when no civic point is mapped inside the selected parcel", async () => {
    const user = userEvent.setup();
    localStorage.setItem("ns-marks-the-spot:province-license:v1", "accepted");
    vi.mocked(fetchParcels).mockResolvedValueOnce({
      type: "FeatureCollection",
      features: [parcelFeature("50334317")],
    });
    renderAppWithCategoriesOpen();

    await user.type(screen.getByLabelText("Search by PID or civic address"), "50334317");
    await user.click(screen.getByRole("button", { name: "Find parcel" }));

    expect(
      await screen.findByText(
        "No civic address point is mapped inside this parcel.",
      ),
    ).toBeInTheDocument();
  });

  it("keeps road and water results visible when civic lookup fails", async () => {
    const user = userEvent.setup();
    localStorage.setItem("ns-marks-the-spot:province-license:v1", "accepted");
    vi.mocked(fetchParcels).mockResolvedValueOnce({
      type: "FeatureCollection",
      features: [parcelFeature("50334317")],
    });
    vi.mocked(fetchParcelContext).mockResolvedValueOnce({
      roads: [
        { name: "Cabot Trail", kind: "Arterial", relationship: "intersects" },
      ],
      water: [
        { name: "Mabou River", kind: "River or stream", relationship: "intersects" },
      ],
    });
    vi.mocked(fetchCivicAddresses).mockRejectedValueOnce(new Error("offline"));
    renderAppWithCategoriesOpen();

    await user.type(screen.getByLabelText("Search by PID or civic address"), "50334317");
    await user.click(screen.getByRole("button", { name: "Find parcel" }));

    expect(await screen.findByText("Cabot Trail")).toBeInTheDocument();
    expect(screen.getByText("Mabou River")).toBeInTheDocument();
    expect(
      screen.getByText("Civic address lookup is unavailable right now."),
    ).toBeInTheDocument();
  });

  it("keeps civic results visible when road and water lookup fails", async () => {
    const user = userEvent.setup();
    localStorage.setItem("ns-marks-the-spot:province-license:v1", "accepted");
    vi.mocked(fetchParcels).mockResolvedValueOnce({
      type: "FeatureCollection",
      features: [parcelFeature("50334317")],
    });
    vi.mocked(fetchParcelContext).mockRejectedValueOnce(new Error("offline"));
    vi.mocked(fetchCivicAddresses).mockResolvedValueOnce([
      civicAddress("100", "12 Main St, Mabou, Inverness County"),
    ]);
    renderAppWithCategoriesOpen();

    await user.type(screen.getByLabelText("Search by PID or civic address"), "50334317");
    await user.click(screen.getByRole("button", { name: "Find parcel" }));

    expect(
      await screen.findByText("12 Main St, Mabou, Inverness County"),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "Mapped road and water intersections are unavailable right now.",
      ),
    ).toBeInTheDocument();
  });

  it("aborts a stale civic lookup before showing the next selected PID", async () => {
    const user = userEvent.setup();
    localStorage.setItem("ns-marks-the-spot:province-license:v1", "accepted");
    vi.mocked(fetchParcels).mockResolvedValueOnce({
      type: "FeatureCollection",
      features: [parcelFeature("50334317"), parcelFeature("50203256")],
    });
    let firstSignal: AbortSignal | undefined;
    vi.mocked(fetchCivicAddresses).mockImplementation((features, signal) => {
      const pid = features[0]?.properties.PID;
      if (pid === "50334317") {
        firstSignal = signal;
        return new Promise((_, reject) => {
          signal?.addEventListener("abort", () => {
            reject(new DOMException("Aborted", "AbortError"));
          });
        });
      }
      return Promise.resolve([
        civicAddress("200", "8 Second St, Whycocomagh, Inverness County"),
      ]);
    });
    renderAppWithCategoriesOpen();

    const search = screen.getByLabelText("Search by PID or civic address");
    await user.type(search, "50334317");
    await user.click(screen.getByRole("button", { name: "Find parcel" }));
    await vi.waitFor(() => expect(firstSignal).toBeDefined());

    await user.clear(search);
    await user.type(search, "50203256");
    await user.click(screen.getByRole("button", { name: "Find parcel" }));

    expect(
      await screen.findByText(
        "8 Second St, Whycocomagh, Inverness County",
      ),
    ).toBeInTheDocument();
    expect(firstSignal?.aborted).toBe(true);
    expect(
      screen.queryByText("12 Main St, Mabou, Inverness County"),
    ).not.toBeInTheDocument();
  });

  it("opens a newly selected PID at the top of a fresh parcel sheet", async () => {
    const user = userEvent.setup();
    localStorage.setItem("ns-marks-the-spot:province-license:v1", "accepted");
    vi.mocked(fetchParcels).mockResolvedValueOnce({
      type: "FeatureCollection",
      features: [parcelFeature("50334317"), parcelFeature("50203256")],
    });
    renderAppWithCategoriesOpen();

    const search = screen.getByLabelText("Search by PID or civic address");
    await user.type(search, "50334317");
    await user.click(screen.getByRole("button", { name: "Find parcel" }));
    const firstInspector = await screen.findByRole("complementary", {
      name: "Parcel 50334317 details",
    });
    firstInspector.scrollTop = 220;
    fireEvent.scroll(firstInspector);

    await user.clear(search);
    await user.type(search, "50203256");
    await user.click(screen.getByRole("button", { name: "Find parcel" }));
    const secondInspector = await screen.findByRole("complementary", {
      name: "Parcel 50203256 details",
    });

    expect(secondInspector).not.toBe(firstInspector);
    expect(secondInspector.scrollTop).toBe(0);
  });

  it("finds an archived CBRM listing only in historical-record mode", async () => {
    const user = userEvent.setup();
    localStorage.setItem("ns-marks-the-spot:province-license:v1", "accepted");
    setTaxSaleResearchUrl();
    renderAppWithCategoriesOpen();

    await user.click(screen.getByRole("button", { name: "Historical records" }));
    await user.type(screen.getByLabelText("Search by PID or civic address"), "15054588");
    await user.click(screen.getByRole("button", { name: "Find parcel" }));

    expect(
      screen.getByRole("heading", {
        name: "75 DORCHESTER ST LAND BUILDING · SYDNEY",
      }),
    ).toBeInTheDocument();
    expect(screen.getByText("Cape Breton Regional Municipality")).toBeInTheDocument();
    expect(
      within(screen.getByRole("complementary", { name: "Parcel 15054588 details" })).getByText(
        "cbrm-2026-07-21 · Public auction",
      ),
    ).toBeInTheDocument();
    expect(screen.getByText("$33,108.73")).toBeInTheDocument();
    expect(
      screen.queryByText("Immediate deed", { exact: false }),
    ).not.toBeInTheDocument();
    expect(screen.getByText("Six-month redemption", { exact: false })).toBeInTheDocument();
    expect(
      within(screen.getByRole("complementary", { name: "Parcel 15054588 details" })).getByText(
        "Outcome unknown",
      ),
    ).toBeInTheDocument();
    expect(
      within(screen.getByRole("complementary", { name: "Parcel 15054588 details" })).queryByText(
        // "available" as an availability claim — never the honest
        // "unavailable"/"not evaluated" evidence lines.
        /(?<!un)available/i,
      ),
    ).not.toBeInTheDocument();
  });

  it("toggles upcoming events without mixing their PID counts", async () => {
    const user = userEvent.setup();
    localStorage.setItem("ns-marks-the-spot:province-license:v1", "accepted");
    setTaxSaleResearchUrl();
    renderAppWithCategoriesOpen();

    expect(screen.getByTestId("map-canvas")).toHaveTextContent("Map PID count: 63;");
    await user.click(
      screen.getByRole("checkbox", { name: /Inverness.*August 11, 2026/i }),
    );
    expect(screen.getByTestId("map-canvas")).toHaveTextContent("Map PID count: 36;");
    await user.click(
      screen.getByRole("checkbox", { name: /Annapolis.*August 31, 2026/i }),
    );
    expect(screen.getByTestId("map-canvas")).toHaveTextContent("Map PID count: 35;");
    await user.click(
      screen.getByRole("checkbox", { name: /Victoria County.*September 14, 2026/i }),
    );
    expect(screen.getByTestId("map-canvas")).toHaveTextContent("Map PID count: 28;");
    await user.click(
      screen.getByRole("checkbox", { name: /Halifax.*September 15, 2026/i }),
    );
    expect(screen.getByTestId("map-canvas")).toHaveTextContent("Map PID count: 0;");
  });

  it("keeps NSPRD failures visible without manufacturing geometry", async () => {
    const user = userEvent.setup();
    setTaxSaleResearchUrl();
    vi.mocked(fetchParcels).mockRejectedValueOnce(new Error("offline"));
    renderAppWithCategoriesOpen();

    await user.click(
      screen.getByRole("button", { name: "Accept and view map layers" }),
    );

    expect(
      await screen.findByText(
        "The Province parcel service is temporarily unavailable. The official notices remain accessible.",
      ),
    ).toBeInTheDocument();
    expect(screen.getByTestId("map-canvas")).toHaveTextContent("geometry count: 0");
  });

  it("rejects malformed PID searches", async () => {
    const user = userEvent.setup();
    localStorage.setItem("ns-marks-the-spot:province-license:v1", "accepted");
    renderAppWithCategoriesOpen();

    await user.type(screen.getByLabelText("Search by PID or civic address"), "5020");
    await user.click(screen.getByRole("button", { name: "Find parcel" }));

    expect(
      screen.getByText("Enter an 8-digit Nova Scotia parcel ID."),
    ).toHaveAttribute("role", "alert");
  });

  it("does not expose print export before a parcel is selected", () => {
    renderAppWithCategoriesOpen();

    expect(
      screen.queryByRole("button", { name: "Print / export" }),
    ).not.toBeInTheDocument();
  });

  it("keeps share and print viewport state isolated from a legacy location recenter", async () => {
    const user = userEvent.setup();
    localStorage.setItem("ns-marks-the-spot:province-license:v1", "accepted");
    vi.mocked(fetchParcels).mockResolvedValueOnce({
      type: "FeatureCollection",
      features: [parcelFeature("01234567")],
    });
    renderAppWithCategoriesOpen();

    await user.type(screen.getByLabelText("Search by PID or civic address"), "01234567");
    await user.click(screen.getByRole("button", { name: "Find parcel" }));
    const exactMapState = screen.getByRole("link", { name: "Open this exact map state" });
    expect(exactMapState).toHaveAttribute("href", expect.stringContaining("position=46.25%2C-61.25%2C13"));

    await user.click(screen.getByRole("button", { name: "Simulate location recenter" }));
    expect(exactMapState).toHaveAttribute("href", expect.stringContaining("position=46.25%2C-61.25%2C13"));
    expect(exactMapState).toHaveAttribute("href", expect.not.stringContaining("position=44.01"));

    await user.click(screen.getByRole("button", { name: "Simulate map viewport" }));
    await waitFor(() => expect(exactMapState).toHaveAttribute("href", expect.stringContaining("position=45.01%2C-62.01%2C12")));
    await user.click(screen.getByRole("button", { name: "Print / export" }));
    const dialog = await screen.findByRole("dialog", { name: "Print / export" });
    expect(within(dialog).queryByText("44.01,-63.01,17")).not.toBeInTheDocument();
  });

  it("withholds print export until selected PID geometry arrives", async () => {
    const user = userEvent.setup();
    const parcelLookup = deferred<{ type: "FeatureCollection"; features: ReturnType<typeof parcelFeature>[] }>();
    localStorage.setItem("ns-marks-the-spot:province-license:v1", "accepted");
    vi.mocked(fetchParcels).mockReturnValueOnce(parcelLookup.promise);
    renderAppWithCategoriesOpen();

    await user.type(screen.getByLabelText("Search by PID or civic address"), "01234567");
    await user.click(screen.getByRole("button", { name: "Find parcel" }));
    await screen.findByRole("complementary", { name: "Parcel 01234567 details" });
    expect(screen.queryByRole("button", { name: "Print / export" })).not.toBeInTheDocument();

    await act(async () => {
      parcelLookup.resolve({ type: "FeatureCollection", features: [parcelFeature("01234567")] });
      await parcelLookup.promise;
    });
    expect(await screen.findByRole("button", { name: "Print / export" })).toBeInTheDocument();
  });

  it("opens a privacy-safe print preview with a frozen parcel fit", async () => {
    const user = userEvent.setup();
    localStorage.setItem("ns-marks-the-spot:province-license:v1", "accepted");
    vi.mocked(fetchParcels).mockResolvedValueOnce({
      type: "FeatureCollection",
      features: [parcelFeature("01234567")],
    });
    renderAppWithCategoriesOpen();

    await user.type(screen.getByLabelText("Search by PID or civic address"), "01234567");
    await user.click(screen.getByRole("button", { name: "Find parcel" }));
    await screen.findByRole("complementary", { name: "Parcel 01234567 details" });

    await user.click(screen.getByRole("button", { name: "Print / export" }));
    const dialog = await screen.findByRole("dialog", { name: "Print / export" });

    expect(within(dialog).getAllByText("PID 01234567").length).toBeGreaterThan(0);
    expect(within(dialog).getByTestId("map-canvas")).toHaveTextContent("Parcel fit");
    await waitFor(() =>
      expect(within(dialog).getAllByText(PROVINCE_ATTRIBUTION).length)
        .toBeGreaterThan(0),
    );
    expect(
      await within(dialog).findByText(
        "Dwelling characteristics: 0 accounts captured",
      ),
    ).toBeInTheDocument();
    expect(within(dialog).queryByText("Your location is shown on the map.")).not.toBeInTheDocument();
    expect(within(dialog).queryByText("46.25,-61.25,13")).not.toBeInTheDocument();

    await user.click(within(dialog).getByRole("button", { name: "Close preview" }));
    expect(screen.getByRole("button", { name: "Print / export" })).toBeInTheDocument();
  });

  it("keeps layers frozen while matching pending evidence settles in the open preview", async () => {
    const user = userEvent.setup();
    const resources = deferred<Awaited<ReturnType<typeof fetchParcelResourceIntersections>>>();
    localStorage.setItem("ns-marks-the-spot:province-license:v1", "accepted");
    vi.mocked(fetchParcels).mockResolvedValueOnce({
      type: "FeatureCollection",
      features: [parcelFeature("01234567")],
    });
    vi.mocked(fetchParcelResourceIntersections).mockReturnValueOnce(resources.promise);
    renderAppWithCategoriesOpen();
    await user.click(screen.getByLabelText("Water features"));

    await user.type(screen.getByLabelText("Search by PID or civic address"), "01234567");
    await user.click(screen.getByRole("button", { name: "Find parcel" }));
    await user.click(await screen.findByRole("button", { name: "Print / export" }));
    const dialog = await screen.findByRole("dialog", { name: "Print / export" });
    expect(within(dialog).getByText("Waiting for research evidence to settle.")).toBeInTheDocument();

    await act(async () => {
      resources.resolve({
        "mineral-occurrences": { status: "ready", intersections: [] },
        "mineral-tenure": { status: "ready", intersections: [] },
        "abandoned-mines": { status: "ready", intersections: [] },
      });
      await resources.promise;
    });

    expect(await within(dialog).findByText("Resource evidence: captured")).toBeInTheDocument();
    expect(within(dialog).getByTestId("map-canvas")).toHaveTextContent("water: on");
    await user.click(screen.getByLabelText("Water features"));
    expect(within(dialog).getByTestId("map-canvas")).toHaveTextContent("water: on");
  });

  it("does not let an older same-PID evidence request settle a reopened print capture", async () => {
    const user = userEvent.setup();
    const olderResources = deferred<Awaited<ReturnType<typeof fetchParcelResourceIntersections>>>();
    const currentResources = deferred<Awaited<ReturnType<typeof fetchParcelResourceIntersections>>>();
    localStorage.setItem("ns-marks-the-spot:province-license:v1", "accepted");
    vi.mocked(fetchParcels).mockResolvedValueOnce({
      type: "FeatureCollection",
      features: [parcelFeature("01234567")],
    });
    vi.mocked(fetchParcelResourceIntersections)
      .mockReturnValueOnce(olderResources.promise)
      .mockReturnValueOnce(currentResources.promise);
    const initialResourceRequestCount = vi.mocked(fetchParcelResourceIntersections).mock.calls.length;
    renderAppWithCategoriesOpen();

    const search = screen.getByLabelText("Search by PID or civic address");
    await user.type(search, "01234567");
    await user.click(screen.getByRole("button", { name: "Find parcel" }));
    await waitFor(() => expect(fetchParcelResourceIntersections).toHaveBeenCalledTimes(
      initialResourceRequestCount + 1,
    ));
    await user.click(screen.getByRole("button", { name: "Close parcel details" }));
    await user.clear(search);
    await user.type(search, "01234567");
    await user.click(screen.getByRole("button", { name: "Find parcel" }));
    await waitFor(() => expect(fetchParcelResourceIntersections).toHaveBeenCalledTimes(
      initialResourceRequestCount + 2,
    ));
    await user.click(screen.getByRole("button", { name: "Print / export" }));
    const dialog = await screen.findByRole("dialog", { name: "Print / export" });
    expect(within(dialog).getByText("Waiting for research evidence to settle.")).toBeInTheDocument();

    await act(async () => {
      olderResources.resolve({
        "mineral-occurrences": { status: "ready", intersections: [{ id: "old", name: "Older completion", detail: "", relationship: "on-parcel" }] },
        "mineral-tenure": { status: "ready", intersections: [] },
        "abandoned-mines": { status: "ready", intersections: [] },
      });
      await olderResources.promise;
    });
    expect(within(dialog).getByText("Waiting for research evidence to settle.")).toBeInTheDocument();
    expect(within(dialog).queryByText("Older completion")).not.toBeInTheDocument();

    await act(async () => {
      currentResources.resolve({
        "mineral-occurrences": { status: "ready", intersections: [{ id: "current", name: "Current completion", detail: "", relationship: "on-parcel" }] },
        "mineral-tenure": { status: "ready", intersections: [] },
        "abandoned-mines": { status: "ready", intersections: [] },
      });
      await currentResources.promise;
    });
    expect(await within(dialog).findByText("Resource evidence: captured")).toBeInTheDocument();
    expect(within(dialog).getByText(/Current completion/)).toBeInTheDocument();
  });
});

describe("georeferencer", () => {
  // App syncs `window.history` to its own share-state URL on every render
  // (see the `shareUrl` effect), so any earlier test that mounted <App/>
  // leaves query params (mode/event/layers/position) behind — a sibling
  // describe does not inherit the outer suite's own reset-to-"/" beforeEach.
  // Left unset, a stray `?layers=modern` from a previous test makes
  // `hasSharedLayers` true here and drives provinceLayers off the shared
  // layer list instead of the real catalog defaults.
  beforeEach(() => {
    window.history.replaceState(null, "", "/");
  });

  const SCAN: UserMapRecord = {
    id: "scan-1",
    name: "Church of Inverness 1888",
    source: "image",
    createdAt: "2026-07-25T00:00:00.000Z",
    pixelSize: { width: 1200, height: 800 },
    georef: { kind: "gcp", method: "affine", gcps: [] },
  };

  /** Same scan, already placed: three non-collinear points that solve. */
  const PLACED: UserMapRecord = {
    ...SCAN,
    id: "placed-1",
    name: "Placed scan",
    georef: {
      kind: "gcp",
      method: "affine",
      gcps: [
        { id: "a", pixel: { x: 0, y: 0 }, map: { lat: 46.1, lng: -61.2 } },
        { id: "b", pixel: { x: 1200, y: 0 }, map: { lat: 46.1, lng: -61.0 } },
        { id: "c", pixel: { x: 0, y: 800 }, map: { lat: 46.0, lng: -61.2 } },
      ],
    },
  };

  /**
   * A tps record with FOUR points, two of them double-clicked onto the same
   * scan pixel. Deliberately a set the two solvers disagree about: an affine
   * least-squares fit averages the duplicate away and solves, while `solveTps`
   * refuses it as `coincident-points`. So the panel's status line is a direct
   * readout of WHICH solver App handed the session — "Two points are on the
   * same spot" can only appear when the record's `method` actually reached
   * `useGeoreferenceSession`, and an App that forgot to pass it shows a solved
   * RMS instead. Four points also puts it at the warp toggle's gate.
   *
   * Deliberately REUSES `SCAN`'s id and name. The suite shares one
   * fake-indexeddb across tests and every test re-seeds what it needs, so a
   * fixture with a new id would leak forward as an extra row — and this one
   * needs georeferencing, which would give the three later tests that query
   * `/^Georeference /` two matching buttons instead of one. Seeding over
   * `scan-1` keeps that count at one whichever version of the row is current.
   */
  const TPS_COINCIDENT: UserMapRecord = {
    ...SCAN,
    georef: {
      kind: "gcp",
      method: "tps",
      gcps: [
        { id: "a", pixel: { x: 0, y: 0 }, map: { lat: 46.1, lng: -61.2 } },
        { id: "b", pixel: { x: 1200, y: 0 }, map: { lat: 46.1, lng: -61.0 } },
        { id: "c", pixel: { x: 0, y: 800 }, map: { lat: 46.0, lng: -61.2 } },
        { id: "d", pixel: { x: 0, y: 0 }, map: { lat: 46.1, lng: -61.2 } },
      ],
    },
  };

  /** Placed with FOUR well-spread points — one past the warp toggle's gate. */
  const PLACED_FOUR: UserMapRecord = {
    ...PLACED,
    id: "placed-4",
    name: "Four-point scan",
    georef: {
      kind: "gcp",
      method: "affine",
      gcps: [
        { id: "a", pixel: { x: 0, y: 0 }, map: { lat: 46.1, lng: -61.2 } },
        { id: "b", pixel: { x: 1200, y: 0 }, map: { lat: 46.1, lng: -61.0 } },
        { id: "c", pixel: { x: 0, y: 800 }, map: { lat: 46.0, lng: -61.2 } },
        { id: "d", pixel: { x: 1200, y: 800 }, map: { lat: 46.0, lng: -61.0 } },
      ],
    },
  };

  /** A second placed map, somewhere else entirely — for the focus-leak test. */
  const PLACED_B: UserMapRecord = {
    ...PLACED,
    id: "placed-2",
    name: "Second placed scan",
    georef: {
      kind: "gcp",
      method: "affine",
      gcps: [
        { id: "p", pixel: { x: 0, y: 0 }, map: { lat: 44.6, lng: -63.6 } },
        { id: "q", pixel: { x: 1200, y: 0 }, map: { lat: 44.6, lng: -63.4 } },
        { id: "r", pixel: { x: 0, y: 800 }, map: { lat: 44.5, lng: -63.6 } },
      ],
    },
  };

  async function seedScan(record: UserMapRecord = SCAN) {
    const store = await UserMapStore.open();
    await store.saveUserMap(
      record,
      new Blob(["raster"], { type: "image/jpeg" }),
      new Blob(["preview"], { type: "image/png" }),
    );
  }

  it("stays closed until a map is opened for georeferencing", async () => {
    await seedScan();
    renderAppWithCategoriesOpen();
    expect(
      await screen.findByRole("button", { name: /^Georeference / }),
    ).toBeInTheDocument();
    expect(screen.queryByTestId("scan-pane")).toBeNull();
    expect(screen.getByTestId("map-canvas")).toHaveTextContent(
      "georeferencing: none",
    );
  });

  it("hands the map under edit to the panel and the map at once", async () => {
    // Seed a SECOND, already-placed and enabled map. Without it the
    // "saved user map layers: 0" assertion is vacuous — it reads 0 whether
    // or not the exclusion filter exists, because a fresh draft has no GCPs
    // and would never be in visibleMaps anyway.
    await seedScan();
    await seedScan(PLACED);
    localStorage.setItem(
      "user-map-ui-state-v1",
      JSON.stringify({
        "scan-1": { enabled: true, opacity: 0.7 },
        "placed-1": { enabled: true, opacity: 0.7 },
      }),
    );
    renderAppWithCategoriesOpen();
    await waitFor(() =>
      expect(screen.getByTestId("map-canvas")).toHaveTextContent(
        "saved user map layers: 1",
      ),
    );
    await userEvent.click(
      await screen.findByRole("button", { name: "Georeference Church of Inverness 1888" }),
    );
    expect(screen.getByTestId("scan-pane")).toBeInTheDocument();
    expect(screen.getByTestId("map-canvas")).toHaveTextContent(
      "georeferencing: scan-1",
    );
    // Spec: the georeferencer hides the layer rail so the panel can take the
    // left ~45% and the app map keep the right ~55%. styles.test.ts pins the
    // RULE; this pins the class actually being on the element, because a rule
    // with nothing to match is invisible to every test in this repo.
    expect(document.querySelector(".app-shell.georeferencing")).not.toBeNull();
    // Still 1, not 2: the map under edit is drawn by the georeferencer's own
    // draft, so the saved-map layer must not also draw it — that would be two
    // canvases fighting, and the saved layer would rebuild on every pointer
    // move. Opening a DIFFERENT map must not disturb the placed one.
    expect(screen.getByTestId("map-canvas")).toHaveTextContent(
      "saved user map layers: 1",
    );
  });

  it("solves the live session with the record's own method, and shows it on the toggle", async () => {
    // The wiring the toggle is worthless without. Everything Tasks 1-7b built
    // is reached through ONE expression — the `method` App hands
    // `useGeoreferenceSession` — and nothing else in this suite would notice
    // its absence: the toggle would still persist, the panel would still show
    // it checked, and the drape would go on being an affine.
    await seedScan(TPS_COINCIDENT);
    renderAppWithCategoriesOpen();
    await userEvent.click(
      await screen.findByRole("button", {
        name: "Georeference Church of Inverness 1888",
      }),
    );
    // Reads the record, not local state: a checkbox seeded to `false` would
    // tell a user who chose the curved warp last session that they hadn't.
    expect(
      screen.getByRole("checkbox", { name: "Curved warp (TPS)" }),
    ).toBeChecked();
    // …and the SPLINE is what refused these points. An affine solves them.
    expect(
      screen.getAllByText("Two points are on the same spot — move or delete one."
      ).length,
    ).toBeGreaterThan(0);
  });

  it("persists a warp switch made in the panel, all the way to IndexedDB", async () => {
    // Three points would be below the gate, so this fixture carries four.
    await seedScan(PLACED_FOUR);
    renderAppWithCategoriesOpen();
    await userEvent.click(
      await screen.findByRole("button", { name: "Adjust points for Four-point scan" }),
    );
    const toggle = await screen.findByRole("checkbox", {
      name: "Curved warp (TPS)",
    });
    expect(toggle).not.toBeChecked();
    await userEvent.click(toggle);
    // The checkbox follows the RECORD, so it can only tick once App's setter
    // has round-tripped through `records`.
    await waitFor(() => expect(toggle).toBeChecked());

    // The database, not the component: this is the half a session-local
    // toggle would fake perfectly.
    await waitFor(async () => {
      const persisted = (await (await UserMapStore.open()).listUserMaps()).find(
        (r) => r.id === PLACED_FOUR.id,
      );
      expect((persisted?.georef as { method: string }).method).toBe("tps");
    });
  });

  it("takes the map under edit out of the saved layers", async () => {
    // The other half of the same contract, with the placed map itself opened.
    await seedScan(PLACED);
    localStorage.setItem(
      "user-map-ui-state-v1",
      JSON.stringify({ "placed-1": { enabled: true, opacity: 0.7 } }),
    );
    renderAppWithCategoriesOpen();
    await waitFor(() =>
      expect(screen.getByTestId("map-canvas")).toHaveTextContent(
        "saved user map layers: 1",
      ),
    );
    await userEvent.click(
      screen.getByRole("button", { name: "Adjust points for Placed scan" }),
    );
    expect(screen.getByTestId("map-canvas")).toHaveTextContent(
      "saved user map layers: 0",
    );
    expect(screen.getByTestId("map-canvas")).toHaveTextContent(
      "georeferencing: placed-1",
    );
  });

  it("closes back to the map without leaving the draft behind", async () => {
    await seedScan();
    renderAppWithCategoriesOpen();
    await userEvent.click(
      await screen.findByRole("button", { name: /^Georeference / }),
    );
    await userEvent.click(screen.getByRole("button", { name: "Done" }));
    expect(screen.queryByTestId("scan-pane")).toBeNull();
    expect(screen.getByTestId("map-canvas")).toHaveTextContent(
      "georeferencing: none",
    );
    expect(document.querySelector(".app-shell.georeferencing")).toBeNull();
  });

  it("does not carry one map's zoom-to focus into the next session", async () => {
    // Zoom to on map A, close A, open map B. `georeferenceFocus` is App
    // state, not session state, so nothing resets it on its own: leave it set
    // and GeoreferenceMapLayer mounts for B with A's focus still non-null and
    // immediately recentres B's session on a point belonging to another map.
    // The bug needs two maps to show, which is why no existing test sees it.
    await seedScan(PLACED);
    await seedScan(PLACED_B);
    renderAppWithCategoriesOpen();
    await userEvent.click(
      await screen.findByRole("button", { name: "Adjust points for Placed scan" }),
    );
    await userEvent.click(
      screen.getByRole("button", { name: "Zoom to point 1" }),
    );
    expect(screen.getByTestId("map-canvas")).toHaveTextContent(
      "georeference focus: 46.1,-61.2",
    );
    await userEvent.click(screen.getByRole("button", { name: "Done" }));
    await userEvent.click(
      screen.getByRole("button", {
        name: "Adjust points for Second placed scan",
      }),
    );
    expect(screen.getByTestId("map-canvas")).toHaveTextContent(
      "georeference focus: none",
    );
  });

  it("does not carry one map's narrow-layout tab into the next session", async () => {
    // GeoreferencePanel keeps `tab` (and selectedGcpId, scanFocus) in its own
    // local state. Switch map A to its "Map" tab, then open map B WITHOUT
    // closing A first (the layer rail is only CSS-hidden during a session,
    // spec-visible only — jsdom applies no stylesheet, so its "Adjust
    // points" buttons stay reachable here exactly as they would be reachable
    // in a real browser before that CSS rule existed). Both editingMap
    // records render through the SAME conditional slot in App, so without a
    // `key` distinguishing them, React reuses the one GeoreferencePanel
    // instance instead of remounting it, and B opens already on the "Map"
    // tab — a leftover from a session about an entirely different scan.
    await seedScan(PLACED);
    await seedScan(PLACED_B);
    renderAppWithCategoriesOpen();
    await userEvent.click(
      await screen.findByRole("button", { name: "Adjust points for Placed scan" }),
    );
    await userEvent.click(screen.getByRole("tab", { name: "Map" }));
    expect(document.querySelector(".georeference-panel")).toHaveAttribute(
      "data-tab",
      "map",
    );
    await userEvent.click(
      screen.getByRole("button", {
        name: "Adjust points for Second placed scan",
      }),
    );
    expect(document.querySelector(".georeference-panel")).toHaveAttribute(
      "data-tab",
      "scan",
    );
  });

  it("will not switch on restricted reference layers without the licence", async () => {
    // `afterEach` in setup.ts clears localStorage and this suite never
    // accepts by default — the file's other tests opt in explicitly with
    // localStorage.setItem("ns-marks-the-spot:province-license:v1",
    // "accepted"), so rendering plain gives the un-accepted state.
    await seedScan();
    renderAppWithCategoriesOpen();
    await userEvent.click(
      await screen.findByRole("button", { name: /^Georeference / }),
    );
    expect(
      screen.getByRole("checkbox", { name: "Aerial imagery" }),
    ).toBeDisabled();
  });

  it("drives the real province layers once the licence is accepted", async () => {
    // The other half of the gate: proves the footer toggle is wired to the
    // app's actual layer state and not to a copy that goes nowhere. The
    // explicit share state requests NSPRD because an ordinary first visit is
    // now the modern-only Explore setup.
    localStorage.setItem("ns-marks-the-spot:province-license:v1", "accepted");
    window.history.replaceState(
      null,
      "",
      "/?taxSale=off&mode=current&layers=modern,nsprd",
    );
    await seedScan();
    renderAppWithCategoriesOpen();
    await userEvent.click(
      await screen.findByRole("button", { name: /^Georeference / }),
    );
    expect(screen.getByTestId("map-canvas")).toHaveTextContent(
      "property boundaries: on",
    );
    const parcels = screen.getByRole("checkbox", { name: "Property boundaries" });
    expect(parcels).toBeChecked();
    await userEvent.click(parcels);
    expect(screen.getByTestId("map-canvas")).toHaveTextContent(
      "property boundaries: off",
    );
  });

  it("opens the panel straight from an import, without a second click", async () => {
    // Spec: an imported scan opens the panel. `useUserMaps` consumes the
    // outcome flag (Task 5); this is the App-level proof that the flag
    // actually reaches the UI rather than being produced and dropped.
    renderAppWithCategoriesOpen();
    const input = await screen.findByLabelText("Add a map file");
    const magic = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    await userEvent.upload(
      input,
      new File([magic], "church-1888.png", { type: "image/png" }),
    );
    expect(await screen.findByTestId("scan-pane")).toBeInTheDocument();
  });

  const PDF_MAIN: PdfRegistrationCandidate = {
    id: "main",
    flavor: "measure",
    embeddedLabel: "Map Layers",
    sourceRect: { x: 160, y: 120, width: 3600, height: 2700 },
    gcps: [
      { id: "main-a", pixel: { x: 160, y: 120 }, map: { lat: 46.2, lng: -61.3 } },
      { id: "main-b", pixel: { x: 3760, y: 120 }, map: { lat: 46.2, lng: -61.0 } },
      { id: "main-c", pixel: { x: 160, y: 2820 }, map: { lat: 45.9, lng: -61.3 } },
    ],
  };
  const PDF_INSET: PdfRegistrationCandidate = {
    id: "inset",
    flavor: "measure",
    embeddedLabel: "Quadrangle Location",
    sourceRect: { x: 3300, y: 180, width: 520, height: 420 },
    gcps: [
      { id: "inset-a", pixel: { x: 3300, y: 180 }, map: { lat: 49, lng: -125 } },
      { id: "inset-b", pixel: { x: 3820, y: 180 }, map: { lat: 49, lng: -65 } },
      { id: "inset-c", pixel: { x: 3300, y: 600 }, map: { lat: 25, lng: -125 } },
    ],
  };

  function arrangeMultiFramePdf() {
    parseGeoPdfAutoMock.mockResolvedValue({
      pixelSize: { width: 4096, height: 3072 },
      previewSize: { width: 4096, height: 3072 },
      preview: new Blob(["page-one"], { type: "image/png" }),
      pageCount: 2,
      registration: {
        status: "selection-required",
        candidates: [PDF_MAIN, PDF_INSET],
      },
    });
  }

  async function uploadPdf(name: string) {
    const input = await screen.findByLabelText("Add a map file");
    await userEvent.upload(
      input,
      new File(
        [new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d])],
        `${name}.pdf`,
        { type: "application/pdf" },
      ),
    );
  }

  it("chooses an embedded main frame without opening georeferencing", async () => {
    arrangeMultiFramePdf();
    renderAppWithCategoriesOpen();
    await uploadPdf("USGS chooser main");

    const chooser = await screen.findByRole("dialog", {
      name: "Choose a frame for USGS chooser main",
    });
    expect(screen.queryByTestId("scan-pane")).toBeNull();
    expect(screen.getByTestId("map-canvas")).toHaveTextContent(
      "georeferencing: none",
    );

    await userEvent.click(
      within(chooser).getByRole("radio", { name: "Map Layers" }),
    );
    await userEvent.click(
      within(chooser).getByRole("button", { name: "Use this frame" }),
    );

    await waitFor(() =>
      expect(
        screen.queryByRole("dialog", {
          name: "Choose a frame for USGS chooser main",
        }),
      ).toBeNull(),
    );
    expect(
      screen.getByRole("checkbox", { name: "USGS chooser main" }),
    ).toBeChecked();
    expect(
      screen.getByRole("button", { name: "Change frame" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", {
        name: "Adjust points for USGS chooser main",
      }),
    ).toBeInTheDocument();
    expect(screen.getByTestId("map-canvas")).toHaveTextContent(
      /user map fit: .+@1/,
    );
  });

  it("persists the chosen inset rectangle and its own embedded GCPs", async () => {
    arrangeMultiFramePdf();
    renderAppWithCategoriesOpen();
    await uploadPdf("USGS chooser inset");

    const chooser = await screen.findByRole("dialog", {
      name: "Choose a frame for USGS chooser inset",
    });
    await userEvent.click(
      within(chooser).getByRole("radio", { name: "Quadrangle Location" }),
    );
    await userEvent.click(
      within(chooser).getByRole("button", { name: "Use this frame" }),
    );

    await waitFor(async () => {
      const store = await UserMapStore.open();
      const selected = (await store.listUserMaps()).find(
        ({ name }) => name === "USGS chooser inset",
      );
      expect(selected).toMatchObject({
        sourceRect: PDF_INSET.sourceRect,
        georef: { kind: "gcp", gcps: PDF_INSET.gcps },
        pdf: {
          registration: {
            status: "embedded",
            selectedFrameId: "inset",
            selection: { kind: "user" },
          },
        },
      });
    });
  });

  // --- Binding wiring: assert the EFFECT of each handler, not that a prop
  // reference was passed --------------------------------------------------
  //
  // Every one of GeoreferenceBinding's three map-side handlers has a
  // same-signature sibling on the session (onPickMapPoint/pickScanPoint,
  // onDragStartGcp/deleteGcp, onMoveGcpOnMap/moveGcpOnScan). A swap satisfies
  // every existing test on this branch, including Task 10's own
  // GeoreferencePanel/GeoreferenceMapLayer tests, because those mock the
  // session with `vi.fn()` and never inspect what actually changed. These
  // three tests call the handlers exposed on the mocked MapCanvas's
  // `georeference` prop and check the resulting, user-visible state.

  it("treats a live map click as the MAP side of a pending pair, not the scan side", async () => {
    await seedScan();
    renderAppWithCategoriesOpen();
    // The exact name, not the generic /^Georeference /: the previous test in
    // this file imports a scan with a random UUID that IndexedDB does not
    // reset between tests, so the loose pattern can match two rows here.
    await userEvent.click(
      await screen.findByRole("button", {
        name: "Georeference Church of Inverness 1888",
      }),
    );
    await userEvent.click(
      screen.getByRole("button", { name: "Simulate map click" }),
    );
    // A map-first click awaits the SCAN half next. Wired to pickScanPoint
    // instead, the same call would await the MAP half instead — the opposite
    // status text. Scoped to the georeference status elements specifically
    // (not screen.getAllByRole("status")): App itself renders several other
    // unrelated role="status" elements (parcel messages, the import banner)
    // that are blank by default and would otherwise dilute the assertion.
    const statuses = document.querySelectorAll(
      ".georeference-status, .georeference-map-bar-status",
    );
    expect(statuses.length).toBeGreaterThan(0);
    for (const status of statuses) {
      expect(status).toHaveTextContent(
        "Now click the same spot on the scan. (Esc to cancel)",
      );
    }
  });

  it("starts a drag by snapshotting for undo, not deleting the point", async () => {
    await seedScan(PLACED);
    localStorage.setItem(
      "user-map-ui-state-v1",
      JSON.stringify({ "placed-1": { enabled: true, opacity: 0.7 } }),
    );
    renderAppWithCategoriesOpen();
    await userEvent.click(
      await screen.findByRole("button", { name: "Adjust points for Placed scan" }),
    );
    expect(screen.getByRole("button", { name: "Undo" })).toBeDisabled();
    await userEvent.click(
      screen.getByRole("button", { name: "Simulate marker dragstart" }),
    );
    // Raises undo depth...
    expect(screen.getByRole("button", { name: "Undo" })).toBeEnabled();
    // ...and does NOT remove the point. Wired to deleteGcp instead, this
    // count would drop to 2 (deleteGcp also snapshots first, so the Undo
    // assertion above would still pass — only the count catches that swap).
    const gcps = JSON.parse(
      screen.getByTestId("georeference-gcps").textContent ?? "[]",
    ) as unknown[];
    expect(gcps).toHaveLength(3);
  });

  it("ends a drag without opening a second undo step", async () => {
    // `onDragEndGcp` and `onDragStartGcp` are both `(id: string) => void`, so
    // `onDragEndGcp: beginDragGcp` in App's binding memo passes `tsc -b` and
    // `eslint`, and every component-level test still passes — the panes only
    // ever see the props App hands them. What breaks is here: the release
    // snapshots a SECOND time, so a completed drag costs two Ctrl+Z presses
    // and the drape never leaves the coarse drag lattice.
    await seedScan(PLACED);
    localStorage.setItem(
      "user-map-ui-state-v1",
      JSON.stringify({ "placed-1": { enabled: true, opacity: 0.7 } }),
    );
    renderAppWithCategoriesOpen();
    await userEvent.click(
      await screen.findByRole("button", { name: "Adjust points for Placed scan" }),
    );
    const undoButton = screen.getByRole("button", { name: "Undo" });
    expect(undoButton).toBeDisabled();

    await userEvent.click(
      screen.getByRole("button", { name: "Simulate marker dragstart" }),
    );
    await userEvent.click(
      screen.getByRole("button", { name: "Simulate marker dragend" }),
    );
    expect(undoButton).toBeEnabled();

    // ONE step for the whole drag: a single Undo empties the history. Wired
    // to `beginDragGcp` instead, the depth would be 2 here and the button
    // would still be enabled after this click.
    await userEvent.click(undoButton);
    expect(screen.getByRole("button", { name: "Undo" })).toBeDisabled();
    // And the release must not have deleted or moved anything.
    const gcps = JSON.parse(
      screen.getByTestId("georeference-gcps").textContent ?? "[]",
    ) as unknown[];
    expect(gcps).toHaveLength(3);
  });

  it("dragging a marker on the live map moves its MAP coordinate, leaving the pixel untouched", async () => {
    await seedScan(PLACED);
    localStorage.setItem(
      "user-map-ui-state-v1",
      JSON.stringify({ "placed-1": { enabled: true, opacity: 0.7 } }),
    );
    renderAppWithCategoriesOpen();
    await userEvent.click(
      await screen.findByRole("button", { name: "Adjust points for Placed scan" }),
    );
    await userEvent.click(
      screen.getByRole("button", { name: "Simulate marker drag" }),
    );
    const gcps = JSON.parse(
      screen.getByTestId("georeference-gcps").textContent ?? "[]",
    ) as Gcp[];
    const moved = gcps.find((gcp) => gcp.id === "a");
    // onMoveGcpOnMap(id, 40, -70) must land in `map`. Wired to moveGcpOnScan
    // instead — the exact bug that shipped once in Task 10 — it would land
    // in `pixel` instead and leave `map` at its original lat/lng.
    expect(moved?.map).toEqual({ lat: 40, lng: -70 });
    expect(moved?.pixel).toEqual({ x: 0, y: 0 });
  });

  it("cancels a queued write before deleting a map, so no metadata row survives", async () => {
    // The most consequential ordering in this task, per App's own onDelete
    // comment: discardPendingWrite must run BEFORE removeMap. Writes are
    // debounced 400ms (Task 7), and removeMap AWAITS the IndexedDB delete
    // before dropping the record from React state — so a timer firing
    // inside that await still finds the record in `recordsRef` and would
    // queue a `putUserMapRecord`, resurrecting a metadata row for a map
    // whose raster and preview blobs are already gone.
    //
    // useGeoreferenceSession.test.ts proves discardPendingWrite itself
    // works; nothing there touches App or removeMap, so nothing proves App
    // actually calls it — or calls it in the right order. This does, by
    // checking the real store afterward rather than a mock.
    await seedScan(PLACED);
    localStorage.setItem(
      "user-map-ui-state-v1",
      JSON.stringify({ "placed-1": { enabled: true, opacity: 0.7 } }),
    );
    renderAppWithCategoriesOpen();
    await userEvent.click(
      await screen.findByRole("button", { name: "Adjust points for Placed scan" }),
    );

    // Switched to fake timers only now, after the async IndexedDB load and
    // button click above have already resolved on real timers — findByRole's
    // own polling depends on real timers to make progress.
    vi.useFakeTimers();
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);
    try {
      // Queue a debounced write by moving a marker on the live map.
      fireEvent.click(
        screen.getByRole("button", { name: "Simulate marker drag" }),
      );
      // Delete before the 400ms debounce timer fires.
      fireEvent.click(screen.getByRole("button", { name: "Delete map" }));
      await act(async () => {
        await vi.advanceTimersByTimeAsync(PERSIST_DELAY_MS * 2);
      });
    } finally {
      confirmSpy.mockRestore();
      vi.useRealTimers();
    }

    const store = await UserMapStore.open();
    const records = await store.listUserMaps();
    expect(records.find((record) => record.id === "placed-1")).toBeUndefined();
  });
});
