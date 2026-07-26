import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useEffect } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "./App";
import { PROVINCE_ATTRIBUTION } from "./licensing/provinceLicense";
import { matchedHistoricalPids } from "./data/historicalTaxSales";
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
import { UserMapStore } from "./userMaps/store/userMapStore";
import { PERSIST_DELAY_MS } from "./userMaps/useGeoreferenceSession";
import type { Gcp, UserMapRecord } from "./userMaps/types";

vi.mock("./components/MapCanvas", () => ({
  MapCanvas: ({
    parcels,
    taxSalePids,
    historicalTaxSalePids,
    provinceLayers,
    resourceLayers,
    hydroPilotLayers,
    environmentalHealthLayers,
    floodHazardLayers,
    fletcherVisible,
    fletcherOpacity,
    fletcherTileBaseUrl,
    showModernMap,
    showHistoricalTaxSales,
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
  }: {
    parcels: { features: unknown[] };
    taxSalePids: Set<string>;
    historicalTaxSalePids: Set<string>;
    provinceLayers: Record<string, boolean>;
    resourceLayers: Record<string, boolean>;
    hydroPilotLayers: Record<string, boolean>;
    environmentalHealthLayers?: Record<string, boolean>;
    floodHazardLayers: Record<string, boolean>;
    fletcherVisible?: boolean;
    fletcherOpacity?: number;
    fletcherTileBaseUrl?: string | null;
    showModernMap: boolean;
    showHistoricalTaxSales: boolean;
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
      onMoveGcpOnMap: (id: string, lat: number, lng: number) => void;
    } | null;
    userMaps?: unknown[];
  }) => {
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
      modern map: {showModernMap ? "on" : "off"}; Fletcher:{" "}
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
      ; georeference focus:{" "}
      {georeference?.focus
        ? `${georeference.focus.lat},${georeference.focus.lng}`
        : "none"}
      <button type="button" onClick={() => onIdentifyParcel(46.059488, -61.414138)}>
        Tap map parcel
      </button>
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

describe("NS Marks The Spot Online", () => {
  beforeEach(() => {
    localStorage.clear();
    window.history.replaceState(null, "", "/");
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

  it("requires licence acceptance before enabling Province map layers", () => {
    render(<App />);

    expect(
      screen.getByRole("dialog", { name: "Use Nova Scotia map data" }),
    ).toBeInTheDocument();
    expect(screen.getAllByText(PROVINCE_ATTRIBUTION)).toHaveLength(2);
    expect(
      screen.getByRole("button", { name: "Accept and view map layers" }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("NS Aerial")).not.toBeChecked();
    expect(screen.getByLabelText("NS Property Boundaries")).not.toBeChecked();
    expect(screen.getByLabelText("Water features")).not.toBeChecked();
    expect(screen.getByLabelText("Roads, trails & culverts")).not.toBeChecked();
    expect(screen.getByLabelText("Buildings")).not.toBeChecked();
    expect(screen.getByLabelText("Contours")).not.toBeChecked();
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
    render(<App />);
    await screen.findByText("1 PIDs matched in NSPRD.");

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
    expect(
      within(inspector).getByText(/point and polygon building features/i),
    ).toBeInTheDocument();
  });

  it("shows the modern map when continuing without Province layers", async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(
      screen.getByRole("button", { name: "Continue without Province layers" }),
    );

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.getByTestId("map-canvas")).toHaveTextContent("modern map: on");
    expect(screen.getByLabelText("NS Aerial")).not.toBeChecked();
  });

  it("credits the open-source software separately from map-data licences", () => {
    render(<App />);

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
    render(<App />);

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
    render(<App />);

    const betaLinks = screen.getAllByRole("link", {
      name: "Get launch updates",
    });

    expect(betaLinks).toHaveLength(2);
    betaLinks.forEach((link) => {
      expect(link).toHaveAttribute(
        "href",
        "mailto:map@kinnokilabs.com?subject=NS%20Marks%20The%20Spot%20beta%20signup",
      );
    });
    expect(
      screen.getByText(
        /NS Marks The Spot for iPhone is in development/,
      ),
    ).toBeInTheDocument();
    expect(screen.queryByText(/not open yet/)).not.toBeInTheDocument();
    expect(screen.queryByText("Get the iPhone app")).not.toBeInTheDocument();
  });

  it("opens the About dialog from the header, explains the method, and closes", async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(
      screen.getByRole("button", { name: "Accept and view map layers" }),
    );
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

  it("reveals the remaining privacy-minimized upcoming event after acceptance", async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(
      screen.getByRole("button", { name: "Accept and view map layers" }),
    );

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(
      screen.getByText("40 advertised · 5 withdrawn · 40 active PIDs"),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("checkbox", { name: /CBRM.*July 21, 2026/i }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("checkbox", { name: /Inverness.*August 11, 2026/i }),
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
      screen.getAllByText("Snapshot retrieved July 22, 2026"),
    ).toHaveLength(1);
  });

  it("makes current notices and historical records separate map modes", async () => {
    const user = userEvent.setup();
    localStorage.setItem("ns-marks-the-spot:province-license:v1", "accepted");
    render(<App />);

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

  it("restores mode, PID, layers, and position from a shared URL", async () => {
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

    render(<App />);

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
      "/?mode=current&layers=arsenic-risk-wells,uranium-risk-wells,surficial-aquifers",
    );

    render(<App />);

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
      "/?mode=current&layers=arsenic-risk-wells,surficial-aquifers",
    );

    render(<App />);

    const canvas = screen.getByTestId("map-canvas");
    expect(canvas).toHaveTextContent("arsenic risk: on");
    expect(canvas).toHaveTextContent("surficial aquifers: on");
  });

  it("carries the province's testing guidance beside every well-water screen", async () => {
    const user = userEvent.setup();
    localStorage.setItem("ns-marks-the-spot:province-license:v1", "accepted");
    render(<App />);

    await user.click(screen.getByText("Environmental health screens"));

    expect(
      screen.getByText(/Testing your well is the only way to find out/i),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        /relative risk zones mapped by bedrock unit, not test\s+results for any property/i,
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/says nothing about water quality at any property/i),
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
    render(<App />);

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
    vi.mocked(fetchParcels).mockImplementation(async (pids) => ({
      type: "FeatureCollection",
      features: pids.map(parcelFeature),
    }));

    render(<App />);

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
    expect(screen.getByText("28 records · 22 PIDs")).toBeInTheDocument();
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
    vi.mocked(fetchParcels)
      .mockResolvedValueOnce({ type: "FeatureCollection", features: [] })
      .mockImplementationOnce((pids, _signal, onBatch) => {
        onBatch?.({
          type: "FeatureCollection",
          features: [parcelFeature(pids[0])],
        });
        return historicalRequest.promise;
      });

    render(<App />);
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
    vi.mocked(fetchParcels).mockImplementation(async (pids) => ({
      type: "FeatureCollection",
      features: pids.map(parcelFeature),
    }));
    render(<App />);

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
    vi.mocked(fetchParcels).mockImplementation(async (pids) => ({
      type: "FeatureCollection",
      features: pids.map(parcelFeature),
    }));
    render(<App />);

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

  it("uses the parcel-first map defaults and keeps Fletcher last", () => {
    localStorage.setItem("ns-marks-the-spot:province-license:v1", "accepted");

    render(<App />);

    expect(screen.getByLabelText("Modern map")).toBeChecked();
    expect(screen.getByLabelText("NS Aerial")).toBeChecked();
    expect(screen.getByLabelText("NS Property Boundaries")).toBeChecked();
    expect(screen.getByLabelText("Water features")).toBeChecked();
    expect(screen.getByLabelText("Roads, trails & culverts")).toBeChecked();
    expect(screen.getByTestId("map-canvas")).toHaveTextContent(
      "modern map: on; Fletcher: off at 72% from no host; property boundaries: on; water: on; roads: on",
    );

    const layerSection = screen.getByRole("region", { name: "Map layers" });
    const layerNames = Array.from(
      layerSection.querySelectorAll(".layer-row strong"),
      (element) => element.textContent,
    );
    expect(layerNames.at(-1)).toBe("Fletcher historical map");
  });

  it("lists the Church county sheets as unavailable rows above Fletcher", () => {
    localStorage.setItem("ns-marks-the-spot:province-license:v1", "accepted");

    render(<App />);

    const layerSection = screen.getByRole("region", { name: "Map layers" });
    const layerNames = Array.from(
      layerSection.querySelectorAll(".layer-row strong"),
      (element) => element.textContent,
    );

    expect(layerNames).toContain("Church — Inverness County");
    expect(layerNames).toContain("Church — Victoria County");
    expect(layerNames).toContain("Church — Richmond County");
    expect(layerNames).toContain("Church — Cape Breton County");

    // Fletcher stays the final row in the rail and fails closed without a host.
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

    render(<App />);

    const toggle = screen.getByLabelText("Fletcher historical map");
    expect(toggle).toBeEnabled();
    expect(toggle).not.toBeChecked();
    await user.click(toggle);

    expect(toggle).toBeChecked();
    expect(screen.getByTestId("map-canvas")).toHaveTextContent(
      "Fletcher: on at 72% from https://tiles.example.test/ns-marks",
    );
    expect(window.location.search).toContain("fletcher");
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

  it("keeps open geology and resource overlays collapsed, optional, and licence-independent", async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(
      screen.getByRole("button", { name: "Continue without Province layers" }),
    );

    const groupSummary = screen.getByText("Geology & Resources");
    const group = groupSummary.closest("details");
    expect(group).not.toHaveAttribute("open");
    expect(screen.getByLabelText("Mineral occurrences")).not.toBeChecked();
    expect(screen.getByLabelText("Mineral tenure")).not.toBeChecked();
    expect(screen.getByLabelText("Abandoned mine openings")).not.toBeChecked();
    expect(screen.getByLabelText("Mineral occurrences")).toBeEnabled();
    const proximityToggle = screen.getByLabelText(
      "Properties within 1 km of a mineral occurrence",
    );
    expect(proximityToggle).not.toBeChecked();
    expect(proximityToggle).toBeDisabled();
    expect(screen.getByText("4 optional screening layers")).toBeInTheDocument();

    await user.click(groupSummary);
    await user.click(screen.getByLabelText("Mineral occurrences"));
    await user.click(screen.getByLabelText("Mineral tenure"));

    expect(group).toHaveAttribute("open");
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
      screen.getByRole("dialog", { name: "Use Nova Scotia map data" }),
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

    const summary = screen.getByText("Topography");
    const group = summary.closest("details");
    expect(group).not.toHaveAttribute("open");
    expect(screen.getByText("1 optional terrain layer")).toBeInTheDocument();
    expect(screen.getByLabelText("Contours")).not.toBeChecked();

    await user.click(summary);
    await user.click(screen.getByLabelText("Contours"));

    expect(group).toHaveAttribute("open");
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

  it("offers the Inverness terrain pilot independently with a visible symbology key", async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(
      screen.getByRole("button", { name: "Continue without Province layers" }),
    );

    const summary = screen.getByText("Micro-hydro pilot");
    const group = summary.closest("details");
    expect(group).not.toHaveAttribute("open");
    expect(screen.getByLabelText("Inverness micro-hydro screen")).not.toBeChecked();
    expect(screen.getByLabelText("Inverness micro-hydro screen")).toBeEnabled();

    await user.click(summary);
    await user.click(screen.getByLabelText("Inverness micro-hydro screen"));

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
    render(<App />);

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
    expect(new URL(window.location.href).searchParams.get("layers")).toContain(
      "mineral-proximity-parcels",
    );
  });

  it("preserves a requested shared derived layer through review and activates it only after acceptance", async () => {
    const user = userEvent.setup();
    window.history.replaceState(
      null,
      "",
      "/?mode=current&layers=mineral-proximity-parcels&position=46.1,-60.9,12",
    );

    render(<App />);

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
      "/?mode=current&layers=published-river-flood-zones,coastal-flood-current&position=46.1,-60.9,12",
    );

    render(<App />);

    const canvas = screen.getByTestId("map-canvas");
    expect(canvas).toHaveTextContent("published river flood zones: off");
    expect(canvas).toHaveTextContent("coastal flooding current: on");
    expect(screen.getByLabelText("Published river flood zones")).toBeDisabled();
    expect(
      screen.getByLabelText("Published river flood zones"),
    ).not.toBeChecked();
    expect(new URL(window.location.href).searchParams.get("layers")).not.toContain(
      "published-river-flood-zones",
    );
  });

  it("renders shared restricted flood-hazard layers once the licence is accepted", () => {
    localStorage.setItem("ns-marks-the-spot:province-license:v1", "accepted");
    window.history.replaceState(
      null,
      "",
      "/?mode=current&layers=published-river-flood-zones&position=46.1,-60.9,12",
    );

    render(<App />);

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
    render(<App />);

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
    render(<App />);

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

  it("auto-dismisses the parcel-selected toast", async () => {
    vi.useFakeTimers();
    try {
      localStorage.setItem("ns-marks-the-spot:province-license:v1", "accepted");
      vi.mocked(fetchParcelAtPoint).mockResolvedValueOnce({
        type: "FeatureCollection",
        features: [parcelFeature("50251750")],
      });
      render(<App />);

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

    render(<App />);
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

    render(<App />);
    await screen.findByText("1 PIDs matched in NSPRD.");
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

    render(<App />);
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

    render(<App />);

    expect(
      screen.queryByRole("checkbox", { name: /CBRM.*July 21, 2026/i }),
    ).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Historical records" }));
    await user.selectOptions(screen.getByLabelText("Historical municipality"), "cbrm");

    // Both CBRM events: the result-backed July 22, 2025 sale (73 records, 75
    // PIDs) and the outcome-pending July 21, 2026 sale (67 records, 68 PIDs).
    // Ten parcels were listed in both sales and count once.
    expect(screen.getByText("140 records · 133 PIDs")).toBeInTheDocument();
  });

  it("labels the archived CBRM records as awaiting official results", async () => {
    const user = userEvent.setup();
    localStorage.setItem("ns-marks-the-spot:province-license:v1", "accepted");
    vi.mocked(fetchParcels).mockImplementation(async (pids) => ({
      type: "FeatureCollection",
      features: pids.map(parcelFeature),
    }));
    render(<App />);

    await user.click(screen.getByRole("button", { name: "Historical records" }));
    await user.type(screen.getByLabelText("Search by PID or civic address"), "15054588");
    await user.click(screen.getByRole("button", { name: "Find parcel" }));

    const inspector = await screen.findByRole("complementary", {
      name: "Parcel 15054588 details",
    });
    expect(within(inspector).getByText("Outcome pending")).toBeInTheDocument();
    expect(within(inspector).getByText("Awaiting official results")).toBeInTheDocument();
    expect(within(inspector).getByRole("link", { name: "Check official results" }))
      .toHaveAttribute("href", "https://cbrm.ns.ca/business/property-sales-management/tax-sales/");
    expect(within(inspector).queryByRole("link", { name: "Official result" }))
      .not.toBeInTheDocument();
  });

  it("toggles native-parity Province layers independently", async () => {
    const user = userEvent.setup();
    localStorage.setItem("ns-marks-the-spot:province-license:v1", "accepted");
    render(<App />);

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
    render(<App />);

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
    render(<App />);

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
      "/?layers=ns-aerial,nsprd&position=46.1,-60.9,12",
    );

    render(<App />);

    expect(screen.getByLabelText("NS Aerial")).toBeChecked();
    expect(screen.getByLabelText("Modern map")).not.toBeChecked();
  });

  it("restores Modern map when shared aerial starts below its display zoom", () => {
    localStorage.setItem("ns-marks-the-spot:province-license:v1", "accepted");
    window.history.replaceState(
      null,
      "",
      "/?layers=ns-aerial,nsprd&position=46.1,-60.9,9",
    );

    render(<App />);

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

    const { unmount } = render(<App />);
    expect(document.documentElement.style.getPropertyValue("--app-viewport-height"))
      .toBe("640px");

    unmount();
    expect(document.documentElement.style.getPropertyValue("--app-viewport-height"))
      .toBe("");
  });

  it("collapses and restores the header", async () => {
    const user = userEvent.setup();
    render(<App />);

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
    render(<App />);

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

  it("finds a tax-sale listing by PID without claiming that it is available", async () => {
    const user = userEvent.setup();
    localStorage.setItem("ns-marks-the-spot:province-license:v1", "accepted");
    render(<App />);

    const search = screen.getByLabelText("Search by PID or civic address");
    await user.type(search, "50203256");
    await user.click(screen.getByRole("button", { name: "Find parcel" }));

    expect(screen.getByRole("heading", { name: "Highway 19, Mabou" })).toBeInTheDocument();
    expect(screen.getByTestId("map-canvas")).toHaveTextContent(
      "focus request: 50203256",
    );
    expect(screen.getByText("Listed in official notice")).toBeInTheDocument();
    expect(
      within(screen.getByRole("complementary", { name: "Parcel 50203256 details" })).queryByText(
        /available/i,
      ),
    ).not.toBeInTheDocument();
    expect(screen.getByText("$15,529.15")).toBeInTheDocument();
  });

  it("shows notice-AAN assessment values and five-year history without calling them a PID value", async () => {
    const user = userEvent.setup();
    localStorage.setItem("ns-marks-the-spot:province-license:v1", "accepted");
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
    render(<App />);
    await screen.findByText("1 PIDs matched in NSPRD.");

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
    render(<App />);
    await screen.findByText("1 PIDs matched in NSPRD.");

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
    render(<App />);
    await screen.findByText("1 PIDs matched in NSPRD.");

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
    render(<App />);
    await screen.findByText("1 PIDs matched in NSPRD.");

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
    render(<App />);
    await screen.findByText("1 PIDs matched in NSPRD.");

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
    render(<App />);
    await screen.findByText("1 PIDs matched in NSPRD.");

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
    render(<App />);
    await screen.findByText("1 PIDs matched in NSPRD.");

    await user.type(screen.getByLabelText("Search by PID or civic address"), "50334317");
    await user.click(screen.getByRole("button", { name: "Find parcel" }));

    expect(await screen.findByText("27.44 acres")).toBeInTheDocument();
    expect(screen.getByText("PVSC open assessment data is unavailable. No absence is inferred.")).toBeInTheDocument();
  });

  it("browses tax-sale properties and selects one parcel at a time", async () => {
    const user = userEvent.setup();
    localStorage.setItem("ns-marks-the-spot:province-license:v1", "accepted");
    vi.mocked(fetchParcels).mockImplementation(async (pids) => ({
      type: "FeatureCollection",
      features: pids.map(parcelFeature),
    }));
    render(<App />);

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
    render(<App />);

    await user.click(
      screen.getByRole("button", { name: /Immediate \/ none/ }),
    );

    expect(screen.getByText("18 parcels shown")).toBeInTheDocument();
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
    render(<App />);

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
    render(<App />);

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
    render(<App />);
    await screen.findByText("1 PIDs matched in NSPRD.");

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
    render(<App />);
    await screen.findByText("1 PIDs matched in NSPRD.");

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
    render(<App />);
    await screen.findByText("1 PIDs matched in NSPRD.");

    await user.type(screen.getByLabelText("Search by PID or civic address"), "50334317");
    await user.click(screen.getByRole("button", { name: "Find parcel" }));

    const evidence = await screen.findByRole("region", { name: "Flood hazard evidence" });
    expect(within(evidence).getByText(/5% annual-exceedance flood area intersects/)).toBeInTheDocument();
    expect(within(evidence).getByText(/1% annual-exceedance boundary intersects/)).toBeInTheDocument();
    expect(within(evidence).getByText(/12.5% of mapped parcel area/)).toBeInTheDocument();
    expect(within(evidence).getByText(/No 2050 map pixels intersected/)).toBeInTheDocument();
    expect(within(evidence).getByText(/2100 source unavailable; no absence is inferred/)).toBeInTheDocument();
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
    render(<App />);
    await screen.findByText("1 PIDs matched in NSPRD.");

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
    render(<App />);
    await screen.findByText("1 PIDs matched in NSPRD.");

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
    render(<App />);
    await screen.findByText("1 PIDs matched in NSPRD.");

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
    render(<App />);
    await screen.findByText("1 PIDs matched in NSPRD.");

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
    render(<App />);
    await screen.findByText("1 PIDs matched in NSPRD.");

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
    render(<App />);
    await screen.findByText("1 PIDs matched in NSPRD.");

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
    render(<App />);
    await screen.findByText("1 PIDs matched in NSPRD.");

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
    render(<App />);
    await screen.findByText("1 PIDs matched in NSPRD.");

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
    render(<App />);
    await screen.findByText("2 PIDs matched in NSPRD.");

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
    render(<App />);
    await screen.findByText("2 PIDs matched in NSPRD.");

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
    render(<App />);

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
    expect(screen.getByText("Outcome pending")).toBeInTheDocument();
    expect(
      within(screen.getByRole("complementary", { name: "Parcel 15054588 details" })).queryByText(
        /available/i,
      ),
    ).not.toBeInTheDocument();
  });

  it("toggles upcoming events without mixing their PID counts", async () => {
    const user = userEvent.setup();
    localStorage.setItem("ns-marks-the-spot:province-license:v1", "accepted");
    render(<App />);

    expect(screen.getByTestId("map-canvas")).toHaveTextContent("Map PID count: 41;");
    await user.click(
      screen.getByRole("checkbox", { name: /Inverness.*August 11, 2026/i }),
    );
    expect(screen.getByTestId("map-canvas")).toHaveTextContent("Map PID count: 1;");
    await user.click(
      screen.getByRole("checkbox", { name: /Annapolis.*August 31, 2026/i }),
    );
    expect(screen.getByTestId("map-canvas")).toHaveTextContent("Map PID count: 0;");
  });

  it("keeps NSPRD failures visible without manufacturing geometry", async () => {
    const user = userEvent.setup();
    vi.mocked(fetchParcels).mockRejectedValueOnce(new Error("offline"));
    render(<App />);

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
    render(<App />);

    await user.type(screen.getByLabelText("Search by PID or civic address"), "5020");
    await user.click(screen.getByRole("button", { name: "Find parcel" }));

    expect(
      screen.getByText("Enter an 8-digit Nova Scotia parcel ID."),
    ).toHaveAttribute("role", "alert");
  });

  it("does not expose print export before a parcel is selected", () => {
    render(<App />);

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
    render(<App />);
    await screen.findByText("1 PIDs matched in NSPRD.");

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
    vi.mocked(fetchParcels)
      .mockResolvedValueOnce({ type: "FeatureCollection", features: [] })
      .mockReturnValueOnce(parcelLookup.promise);
    render(<App />);
    await screen.findByText("0 PIDs matched in NSPRD.");

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
    render(<App />);
    await screen.findByText("1 PIDs matched in NSPRD.");

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
    render(<App />);
    await screen.findByText("1 PIDs matched in NSPRD.");

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
    render(<App />);
    await screen.findByText("1 PIDs matched in NSPRD.");

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
    render(<App />);
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
    render(<App />);
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

  it("takes the map under edit out of the saved layers", async () => {
    // The other half of the same contract, with the placed map itself opened.
    await seedScan(PLACED);
    localStorage.setItem(
      "user-map-ui-state-v1",
      JSON.stringify({ "placed-1": { enabled: true, opacity: 0.7 } }),
    );
    render(<App />);
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
    render(<App />);
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
    render(<App />);
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
    render(<App />);
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
    render(<App />);
    await userEvent.click(
      await screen.findByRole("button", { name: /^Georeference / }),
    );
    expect(
      screen.getByRole("checkbox", { name: "Aerial imagery" }),
    ).toBeDisabled();
  });

  it("drives the real province layers once the licence is accepted", async () => {
    // The other half of the gate: proves the footer toggle is wired to the
    // app's actual layer state and not to a copy that goes nowhere.
    // `initialProvinceLayerVisibility.nsprd` is TRUE (verified in
    // layerCatalog.ts), so the click here turns property boundaries OFF —
    // an earlier draft asserted this backwards and would have passed only by
    // accident if the default ever flipped.
    localStorage.setItem("ns-marks-the-spot:province-license:v1", "accepted");
    await seedScan();
    render(<App />);
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
    render(<App />);
    const input = await screen.findByLabelText("Add a map file");
    const magic = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    await userEvent.upload(
      input,
      new File([magic], "church-1888.png", { type: "image/png" }),
    );
    expect(await screen.findByTestId("scan-pane")).toBeInTheDocument();
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
    render(<App />);
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
    render(<App />);
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

  it("dragging a marker on the live map moves its MAP coordinate, leaving the pixel untouched", async () => {
    await seedScan(PLACED);
    localStorage.setItem(
      "user-map-ui-state-v1",
      JSON.stringify({ "placed-1": { enabled: true, opacity: 0.7 } }),
    );
    render(<App />);
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
    render(<App />);
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
