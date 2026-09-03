import {
  lazy,
  memo,
  Suspense,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import L, {
  type LeafletEvent,
  type Map as LeafletMap,
  type PathOptions,
} from "leaflet";
import {
  Circle,
  CircleMarker,
  GeoJSON,
  MapContainer,
  Marker,
  Pane,
  Polyline,
  ScaleControl,
  TileLayer,
  useMap,
  useMapEvents,
} from "react-leaflet";
import { ArcGISExportTileLayer } from "../layers/arcGISExport";
import {
  hydroPilotLayerCatalog,
  environmentalHealthLayerCatalog,
  forestryLayerCatalog,
  floodHazardLayerCatalog,
  PROPERTY_BOUNDARY_MIN_ZOOM,
  allResourceLayerCatalog,
  liveConditionsLayerCatalog,
  provinceLayerCatalog,
  resourceLayerCatalog,
  wellLogLayerCatalog,
  type HydroPilotLayerId,
  type LiveConditionsLayerId,
  type EnvironmentalHealthLayerDescriptor,
  type EnvironmentalHealthLayerId,
  type ForestryLayerId,
  type FloodHazardLayerDescriptor,
  type FloodHazardLayerId,
  type FletcherLayerId,
  type ProvinceLayerId,
  type ResourceFeatureLayerDescriptor,
  type ResourceLayerId,
  type ResourceMapLayerDescriptor,
  type TrafficCameraLayerDescriptor,
  type WeatherRadarLayerDescriptor,
  type WebLayerDescriptor,
  zoningLayerCatalog,
  type ZoningLayerId,
  type WellLogLayerDescriptor,
  type WellLogLayerId,
} from "../layers/layerCatalog";
import {
  loadInvernessHydroPotential,
  type InvernessHydroPotentialCollection,
  type InvernessHydroPotentialProperties,
} from "../data/invernessHydroPotential";
import {
  fetchArcGISFeatureOverlay,
  type ArcGISPointFeatureCollection,
} from "../services/arcGISFeatureOverlay";
import type {
  NsprdFeatureCollection,
  NsprdFeatureProperties,
} from "../services/nsprd";
import { useLiveLocation } from "../location/useLiveLocation";
import type { LiveFix } from "../location/liveLocation";
import { isUsableMarkFix } from "../location/markFix";
import { useTrackRecording } from "../location/useTrackRecording";
import { SaveTrackDialog } from "../location/SaveTrackDialog";
import { buildRecordedTrackFeature } from "../location/trackFeature";
import { rawTrackGpxBlob } from "../location/rawTrackGpx";
import type { StopResult } from "../location/trackRecorder";
import { formatDistance } from "../services/geodesy";
import {
  hydroLineStyle,
  hydroPotentialLabel,
  type HydroPotentialClass,
} from "../services/hydroPotential";
import {
  DEFAULT_MAP_POSITION,
  type MapPosition,
} from "../services/mapShareState";
import {
  OVERVIEW_MARKER_MAX_ZOOM,
  representativeParcelPoints,
} from "../services/parcelMarkers";
import type { PrintMapBounds, PrintMapViewport } from "../services/printSnapshot";
import { parcelStyleForFeature, type MapRenderMode } from "./parcelStyle";
import { MineralProximityParcelLayer } from "./MineralProximityParcelLayer";
import { MeasureTool, type MeasureMode } from "./MeasureTool";
import { FletcherTileLayer } from "./FletcherTileLayer";
import { ZoningLayer } from "./ZoningLayer";
import { OldGrowthPolicyLayer } from "./OldGrowthPolicyLayer";
import { TrafficCameraLayer } from "./TrafficCameraLayer";
import { WeatherRadarLayer } from "./WeatherRadarLayer";
import {
  ENVIRONMENTAL_HEALTH_LAYER_Z_INDEX,
  ESTABLISHED_PARCEL_PANE,
  ESTABLISHED_PARCEL_PANE_Z_INDEX,
  MINERAL_PROXIMITY_PANE,
  MINERAL_PROXIMITY_PANE_Z_INDEX,
  OLD_GROWTH_POLICY_PANE,
  OLD_GROWTH_POLICY_PANE_Z_INDEX,
  PROVINCE_LAYER_Z_INDEXES,
  TRAFFIC_CAMERA_PANE,
  TRAFFIC_CAMERA_PANE_Z_INDEX,
  ZONING_PANE,
  ZONING_PANE_Z_INDEX,
  WELL_LOG_PANE,
  WELL_LOG_PANE_Z_INDEX,
} from "./mapPanes";
import { textTooltip } from "./mapTooltip";
import {
  fetchWellLogs,
  printWellLogMarkerStyle,
  wellLogMarkerRadius,
  wellLogMarkerStyle,
  wellLogPopupHtml,
  wellLogTooltipHtml,
  type WellLogAccuracyFilter,
  type WellLogCollection,
} from "../services/wellLogs";
import {
  UserMapLayers,
  type UserMapFitRequest,
  type VisibleUserMap,
} from "../userMaps/components/UserMapLayers";
import {
  GeoreferenceMapLayer,
  type GeoreferenceBinding,
} from "../userMaps/components/GeoreferenceMapLayer";
import { UserVectorLayers } from "../userMaps/vector/components/UserVectorLayers";
import type { VectorEditBinding } from "../userMaps/vector/edit/EditableVectorLayer";
import { ConversionPreviewLayer } from "../userMaps/vector/edit/ConversionPreviewLayer";
import type { PopupPhotoUi } from "../userMaps/vector/render/popup";

// Lazy like EditableVectorLayer: both exist only inside an edit session.
const ParcelSnapTargetsLayer = lazy(() =>
  import("../userMaps/vector/edit/ParcelSnapTargetsLayer").then((module) => ({
    default: module.ParcelSnapTargetsLayer,
  })),
);
// Geoman (572 KB JS + 26 KB CSS, ~60 KB gzip) patches L at module evaluation
// and is only needed while a layer is actively being edited — lazy keeps it
// out of every visitor's first paint. Module-eval side effects run identically
// under a dynamic import.
const EditableVectorLayer = lazy(() =>
  import("../userMaps/vector/edit/EditableVectorLayer").then((module) => ({
    default: module.EditableVectorLayer,
  })),
);
import type {
  UserVectorFitRequest,
  VisibleUserVectorLayer,
} from "../userMaps/vector/useUserVectorLayers";
import { ExportFrameLayer } from "../print/pdf/ExportFrameLayer";
import type { FrameState } from "../print/pdf/frameGeometry";
import type { PdfTemplateId } from "../print/pdf/templates/types";

/**
 * The scale a locate brings a reader to when their view is further out than
 * it: the web's long-standing 14, kept as a floor rather than a target.
 */
const LOCATE_MIN_ZOOM = 14;

/** The system's own answer, read at the moment of the move. */
function prefersReducedMotion(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

type MapCanvasProps = {
  parcels: NsprdFeatureCollection;
  taxSalePids: Set<string>;
  historicalTaxSalePids: Set<string>;
  selectedPid: string | null;
  provinceLayers: Record<ProvinceLayerId, boolean>;
  resourceLayers: Record<ResourceLayerId, boolean>;
  hydroPilotLayers?: Record<HydroPilotLayerId, boolean>;
  floodHazardLayers?: Record<FloodHazardLayerId, boolean>;
  environmentalHealthLayers?: Record<EnvironmentalHealthLayerId, boolean>;
  forestryLayers?: Record<ForestryLayerId, boolean>;
  zoningLayers?: Record<ZoningLayerId, boolean>;
  wellLogLayers?: Record<WellLogLayerId, boolean>;
  liveConditionsLayers?: Record<LiveConditionsLayerId, boolean>;
  wellLogAccuracyFilter?: WellLogAccuracyFilter;
  fletcherVisible?: boolean;
  fletcherOpacity?: number;
  fletcherTileBaseUrl?: string | null;
  fletcherRetryToken?: number;
  userMaps?: VisibleUserMap[];
  userMapFitRequest?: UserMapFitRequest | null;
  userVectorLayers?: VisibleUserVectorLayer[];
  userVectorFitRequest?: UserVectorFitRequest | null;
  userVectorEdit?: VectorEditBinding | null;
  /** Photo thumbnails in user-feature popups and the lightbox opener. */
  userVectorPhotoUi?: PopupPhotoUi | null;
  georeference?: GeoreferenceBinding | null;
  showModernMap: boolean;
  showTaxSale: boolean;
  showHistoricalTaxSales: boolean;
  onSelectPid: (pid: string) => void;
  onIdentifyParcel: (latitude: number, longitude: number) => void;
  focusRequest?: ParcelFocusRequest | null;
  initialPosition?: MapPosition;
  preserveInitialPosition?: boolean;
  onPositionChange?: (position: MapPosition) => void;
  onViewportChange?: (viewport: PrintMapViewport) => void;
  /**
   * Saves a point at the user's position; resolves to a status message for
   * the location live region (null for silence). Receives the current watch
   * fix when it is fresh and accurate enough, else null — the handler then
   * requests a one-shot fix itself.
   */
  onMarkLocation?: (fix: LiveFix | null) => Promise<string | null>;
  /**
   * Saves a finished track recording as a new layer; resolves to a status
   * message for the location live region (null for silence) and whether the
   * layer actually reached this device. The collection holds the processed
   * track feature; rawGpx is every received fix. `persisted` is load-bearing:
   * the unsaved recording is forgotten only when it is true, so a refused
   * write never destroys the last copy of the walk.
   */
  onSaveTrack?: (input: {
    name: string;
    collection: GeoJSON.FeatureCollection;
    rawGpx: Blob;
    startedAt: string;
    endedAt: string;
    /**
     * True only for a walk recovered from an interrupted session: it ends at
     * the last fix this device stored rather than at a Stop, and the saved
     * layer says so for the life of the record.
     */
    interrupted: boolean;
    /**
     * The layer a refused save of this same walk already left on the map.
     * Set on a retry, so the walk is rewritten there instead of appearing a
     * second time.
     */
    replaceLayerId?: string;
  }) => Promise<{
    message: string | null;
    persisted: boolean;
    /** The layer the walk is on, refused or not — what a retry aims at. */
    layerId: string;
  }>;
  onLayerStatusChange?: (
    id: MapLayerId,
    status: MapLayerStatus,
  ) => void;
  /** @deprecated Use onLayerStatusChange. Kept for embedding compatibility. */
  onResourceLayerStatusChange?: (
    id: ResourceLayerId,
    status: ResourceLayerStatus,
  ) => void;
  renderMode?: MapRenderMode;
  fitBounds?: PrintMapBounds;
  /** Non-null while the GeoPDF export frame overlay is active. */
  exportFrame?: FrameState | null;
  onExportFrameChange?: (frame: FrameState) => void;
  onExportFrameCancel?: () => void;
  onExportFrameContinue?: (
    bounds: PrintMapBounds,
    orientation: PdfTemplateId,
  ) => void;
};

export type { MapRenderMode } from "./parcelStyle";

export type ParcelFocusRequest = {
  pid: string;
  requestId: number;
};

export type MapLayerId =
  | "modern"
  | FletcherLayerId
  | ProvinceLayerId
  | ResourceLayerId
  | HydroPilotLayerId
  | FloodHazardLayerId
  | EnvironmentalHealthLayerId
  | ForestryLayerId
  | ZoningLayerId
  | WellLogLayerId
  | LiveConditionsLayerId;

export type MapLayerStatus =
  | { status: "idle" | "loading" | "error" }
  | { status: "zoom"; minZoom: number }
  /** `observedAt`: ISO observation time of a live frame, when the source states one. */
  | { status: "ready"; count?: number; observedAt?: string };

export type ResourceLayerStatus = MapLayerStatus;

const WATERFALL_DISCOVERY_BOUNDS: L.LatLngBoundsExpression = [
  [43.55300536047742, -66.00233221945133],
  [46.83835988450765, -60.35435480050904],
];
const INVERNESS_HYDRO_PILOT_BOUNDS: L.LatLngBoundsExpression = [
  [45.75, -61.52],
  [47.04, -60.55],
];
const HIDDEN_HYDRO_PILOT_LAYERS: Record<HydroPilotLayerId, boolean> = {
  "inverness-hydro-potential": false,
};
const HIDDEN_FLOOD_HAZARD_LAYERS: Record<FloodHazardLayerId, boolean> = {
  "published-river-flood-zones": false,
  "coastal-flood-current": false,
  "coastal-flood-2050": false,
  "coastal-flood-2100": false,
};
const HIDDEN_ENVIRONMENTAL_HEALTH_LAYERS: Record<
  EnvironmentalHealthLayerId,
  boolean
> = {
  "arsenic-risk-wells": false,
  "uranium-risk-wells": false,
  "manganese-risk-wells": false,
  "surficial-aquifers": false,
};
const HIDDEN_FORESTRY_LAYERS: Record<ForestryLayerId, boolean> = {
  "old-growth-policy": false,
};
const HIDDEN_ZONING_LAYERS: Record<ZoningLayerId, boolean> = {
  "zoning-inverness": false,
  "zoning-victoria": false,
  "zoning-richmond": false,
  "zoning-cumberland": false,
  "zoning-halifax": false,
};
const HIDDEN_WELL_LOG_LAYERS: Record<WellLogLayerId, boolean> = {
  "ns-well-logs": false,
};
const HIDDEN_LIVE_CONDITIONS_LAYERS: Record<LiveConditionsLayerId, boolean> = {
  "highway-cameras": false,
  "weather-radar": false,
};
// Stable reference: a fresh `[]` default would be a new array identity every
// render, churning the UserMapLayers bridge (and its layer-construction
// effects) on every unrelated MapCanvas re-render.
const EMPTY_USER_MAPS: VisibleUserMap[] = [];
const EMPTY_USER_VECTOR_LAYERS: VisibleUserVectorLayer[] = [];
const LOCATION_SUCCESS_MESSAGE = "Your location is shown on the map.";
const LOCATION_SUCCESS_MESSAGE_DURATION_MS = 4_000;
const CSS_METRES_PER_PIXEL = 0.0254 / 96;
const DISPLAY_SCALE_SAMPLE_WIDTH_CSS_PIXELS = 100;
const DISPLAY_SCALE_EXPLANATION =
  "Calculated at map centre using 96 CSS pixels per inch. Browser zoom and display scaling affect physical accuracy.";

/**
 * A double-click arrives as click → click → dblclick, so a parcel identify
 * must wait long enough for a dblclick to cancel it. The delay hides inside
 * the NSPRD network lookup that follows, so single taps feel unchanged.
 */
export const IDENTIFY_CLICK_DELAY_MS = 250;

type PrintableViewportGuard = {
  suppressBrowserLocation: boolean;
  lastSuppressed: PrintMapViewport | null;
};

type PrintableViewportGuardRef = {
  current: PrintableViewportGuard;
};

const VIEWPORT_COMPARISON_EPSILON = 1e-9;

function samePrintMapViewport(
  left: PrintMapViewport,
  right: PrintMapViewport,
): boolean {
  const leftValues = [
    left.position.latitude,
    left.position.longitude,
    left.position.zoom,
    left.bounds.north,
    left.bounds.east,
    left.bounds.south,
    left.bounds.west,
  ];
  const rightValues = [
    right.position.latitude,
    right.position.longitude,
    right.position.zoom,
    right.bounds.north,
    right.bounds.east,
    right.bounds.south,
    right.bounds.west,
  ];
  return leftValues.every(
    (value, index) =>
      Math.abs(value - rightValues[index]) <= VIEWPORT_COMPARISON_EPSILON,
  );
}

function ArcGISMapLayer({
  layer,
  visible,
  onStatusChange,
  renderMode,
}: {
  layer: WebLayerDescriptor & { id: ProvinceLayerId };
  visible: boolean;
  onStatusChange?: MapCanvasProps["onLayerStatusChange"];
  renderMode: MapRenderMode;
}) {
  const map = useMap();

  useEffect(() => {
    if (!visible || !layer.exportOptions) {
      onStatusChange?.(layer.id, { status: "idle" });
      return;
    }

    const tileLayers = [layer.exportOptions, layer.exportOverlayOptions]
      .filter((options) => options !== undefined)
      .map(
        (options, index) =>
          new ArcGISExportTileLayer(
            {
              serviceUrl: layer.serviceUrl,
              ...options,
            },
            {
              minZoom: layer.minZoom,
              maxZoom: layer.maxZoom,
              opacity: layer.opacity,
              zIndex: PROVINCE_LAYER_Z_INDEXES[layer.id] + index,
              maxNativeZoom: layer.maxNativeZoom,
              updateWhenZooming: false,
              keepBuffer: 2,
              // Carried on screen too, not only in print. These layers arrive
              // as server-rendered raster tiles, so the only way to change how
              // one of them reads is a filter on its own container — and that
              // needs a class identifying which layer the container holds.
              className:
                renderMode === "print"
                  ? `print-layer-${layer.id}`
                  : `map-layer-${layer.id}`,
            },
          ),
      );
    const physicalStatuses: Array<"loading" | "ready" | "error"> =
      tileLayers.map(() => "loading");
    const loadedTiles = tileLayers.map(() => 0);
    const isBelowZoom = () => map.getZoom() < layer.minZoom;
    const reportAggregate = () => {
      if (isBelowZoom()) {
        onStatusChange?.(layer.id, { status: "zoom", minZoom: layer.minZoom });
      } else if (physicalStatuses.some((status) => status === "error")) {
        onStatusChange?.(layer.id, { status: "error" });
      } else if (physicalStatuses.every((status) => status === "ready")) {
        onStatusChange?.(layer.id, {
          status: "ready",
          count: loadedTiles.reduce((sum, count) => sum + count, 0),
        });
      } else {
        onStatusChange?.(layer.id, { status: "loading" });
      }
    };
    const reportZoom = () => {
      reportAggregate();
    };
    map.on("zoomend", reportZoom);
    reportZoom();
    tileLayers.forEach((tileLayer, index) => {
      tileLayer.on("loading", () => {
        if (
          renderMode !== "print" ||
          physicalStatuses[index] !== "error"
        ) {
          physicalStatuses[index] = "loading";
        }
        reportAggregate();
      });
      tileLayer.on("tileload", () => {
        loadedTiles[index] += 1;
      });
      tileLayer.on("load", () => {
        if (
          renderMode !== "print" ||
          physicalStatuses[index] !== "error"
        ) {
          physicalStatuses[index] = "ready";
        }
        reportAggregate();
      });
      tileLayer.on("tileerror", () => {
        physicalStatuses[index] = "error";
        reportAggregate();
      });
      tileLayer.addTo(map);
    });

    return () => {
      map.off("zoomend", reportZoom);
      tileLayers.forEach((tileLayer) => map.removeLayer(tileLayer));
    };
  }, [layer, map, onStatusChange, renderMode, visible]);

  return null;
}

function resourceExportZIndex(
  layer:
    | ResourceMapLayerDescriptor
    | FloodHazardLayerDescriptor
    | EnvironmentalHealthLayerDescriptor,
): number {
  if ("screening" in layer) {
    return ENVIRONMENTAL_HEALTH_LAYER_Z_INDEX;
  }
  return "licence" in layer && layer.id.startsWith("coastal-") ? 228 : 225;
}

function ResourceArcGISMapLayer({
  layer,
  visible,
  onStatusChange,
  renderMode,
}: {
  layer:
    | ResourceMapLayerDescriptor
    | FloodHazardLayerDescriptor
    | EnvironmentalHealthLayerDescriptor;
  visible: boolean;
  onStatusChange?: MapCanvasProps["onLayerStatusChange"];
  renderMode: MapRenderMode;
}) {
  const map = useMap();

  useEffect(() => {
    if (!visible) {
      onStatusChange?.(layer.id, { status: "idle" });
      return;
    }

    const tileLayer = new ArcGISExportTileLayer(
      {
        serviceUrl: layer.serviceUrl,
        ...layer.exportOptions,
      },
      {
        minZoom: layer.minZoom,
        maxZoom: layer.maxZoom,
        opacity: layer.opacity,
        zIndex: resourceExportZIndex(layer),
        updateWhenZooming: false,
        keepBuffer: 2,
        className:
          renderMode === "print" ? `print-layer-${layer.id}` : undefined,
      },
    );
    let loadedTiles = 0;
    let physicalStatus: "loading" | "ready" | "error" = "loading";
    const reportAggregate = () => {
      if (map.getZoom() < layer.minZoom) {
        onStatusChange?.(layer.id, { status: "zoom", minZoom: layer.minZoom });
      } else if (physicalStatus === "error") {
        onStatusChange?.(layer.id, { status: "error" });
      } else if (physicalStatus === "ready") {
        onStatusChange?.(layer.id, { status: "ready", count: loadedTiles });
      } else {
        onStatusChange?.(layer.id, { status: "loading" });
      }
    };
    const reportZoom = () => {
      reportAggregate();
    };
    tileLayer.on("loading", () => {
      if (renderMode !== "print" || physicalStatus !== "error") {
        physicalStatus = "loading";
      }
      reportAggregate();
    });
    tileLayer.on("tileload", () => {
      loadedTiles += 1;
    });
    tileLayer.on("load", () => {
      if (renderMode !== "print" || physicalStatus !== "error") {
        physicalStatus = "ready";
      }
      reportAggregate();
    });
    tileLayer.on("tileerror", () => {
      physicalStatus = "error";
      reportAggregate();
    });
    map.on("zoomend", reportZoom);
    reportZoom();
    tileLayer.addTo(map);

    return () => {
      map.off("zoomend", reportZoom);
      map.removeLayer(tileLayer);
    };
  }, [layer, map, onStatusChange, renderMode, visible]);

  return null;
}

const EMPTY_POINT_FEATURES: ArcGISPointFeatureCollection = {
  type: "FeatureCollection",
  features: [],
};

function resourceFeatureLabel(
  layerId: ResourceLayerId,
  properties: Record<string, unknown>,
): string {
  const name = String(properties.Name ?? "").trim();
  if (layerId === "mineral-occurrences") {
    const commodity = String(
      properties.Comm_list ?? properties.Comm_prim ?? "",
    ).trim();
    return [name || "Mineral occurrence", commodity].filter(Boolean).join(" · ");
  }

  const hazard = String(properties.Degree_Haz ?? "").trim();
  return [name || "Abandoned mine opening", hazard && `Hazard: ${hazard}`]
    .filter(Boolean)
    .join(" · ");
}

function ArcGISFeatureLayer({
  layer,
  visible,
  onStatusChange,
  renderMode,
}: {
  layer: ResourceFeatureLayerDescriptor;
  visible: boolean;
  onStatusChange?: MapCanvasProps["onLayerStatusChange"];
  renderMode: MapRenderMode;
}) {
  const map = useMap();
  const [collection, setCollection] =
    useState<ArcGISPointFeatureCollection>(EMPTY_POINT_FEATURES);

  useEffect(() => {
    let controller: AbortController | null = null;
    let requestNumber = 0;

    const loadVisibleFeatures = () => {
      controller?.abort();
      controller = null;
      requestNumber += 1;
      const currentRequest = requestNumber;

      if (!visible) {
        setCollection(EMPTY_POINT_FEATURES);
        onStatusChange?.(layer.id, { status: "idle" });
        return;
      }

      if (map.getZoom() < layer.minZoom) {
        setCollection(EMPTY_POINT_FEATURES);
        onStatusChange?.(layer.id, {
          status: "zoom",
          minZoom: layer.minZoom,
        });
        return;
      }

      const bounds = map.getBounds();
      controller = new AbortController();
      onStatusChange?.(layer.id, { status: "loading" });
      void fetchArcGISFeatureOverlay({
        serviceUrl: layer.serviceUrl,
        bounds: {
          west: bounds.getWest(),
          south: bounds.getSouth(),
          east: bounds.getEast(),
          north: bounds.getNorth(),
        },
        outFields: layer.outFields,
        orderByFields: "geo_id",
        idField: "geo_id",
        signal: controller.signal,
      })
        .then((nextCollection) => {
          if (currentRequest !== requestNumber) {
            return;
          }
          setCollection(nextCollection);
          onStatusChange?.(layer.id, {
            status: "ready",
            count: nextCollection.features.length,
          });
        })
        .catch((error: unknown) => {
          if (
            currentRequest !== requestNumber ||
            (error instanceof DOMException && error.name === "AbortError")
          ) {
            return;
          }
          setCollection(EMPTY_POINT_FEATURES);
          onStatusChange?.(layer.id, { status: "error" });
        });
    };

    loadVisibleFeatures();
    // moveend only: Leaflet's _moveEnd fires zoomend then moveend from the
    // same call, so a zoomend subscription made every zoom issue a doomed
    // duplicate request that the moveend run aborted milliseconds later.
    map.on("moveend", loadVisibleFeatures);

    return () => {
      requestNumber += 1;
      controller?.abort();
      map.off("moveend", loadVisibleFeatures);
    };
  }, [layer, map, onStatusChange, visible]);

  if (!visible || collection.features.length === 0) {
    return null;
  }

  return (
    <GeoJSON
      key={`${layer.id}:${collection.features.map(({ id }) => id).join(",")}`}
      data={collection}
      pointToLayer={(_feature, latlng) =>
        L.circleMarker(latlng, {
          radius: layer.id === "abandoned-mines" ? 6 : 5,
          color: renderMode === "print" ? "#111111" : "#ffffff",
          fillColor: renderMode === "print" ? "#e8e8e8" : layer.markerColor,
          fillOpacity: renderMode === "print" ? 0.8 : layer.opacity,
          weight: 1.5,
          className:
            renderMode === "print"
              ? `print-resource-marker-${layer.id}`
              : undefined,
          dashArray:
            renderMode === "print" && layer.id === "abandoned-mines"
              ? "2 2"
              : undefined,
        })
      }
      interactive={renderMode !== "print"}
      onEachFeature={renderMode === "print" ? undefined : (feature, featureLayer) => {
        featureLayer.bindTooltip(
          textTooltip(
            resourceFeatureLabel(
              layer.id,
              (feature.properties ?? {}) as Record<string, unknown>,
            ),
          ),
          { sticky: true },
        );
      }}
    />
  );
}

const EMPTY_WELL_LOGS: WellLogCollection = {
  type: "FeatureCollection",
  features: [],
};

function WellLogLayer({
  layer,
  visible,
  accuracyFilter,
  onStatusChange,
  renderMode,
}: {
  layer: WellLogLayerDescriptor;
  visible: boolean;
  accuracyFilter: WellLogAccuracyFilter;
  onStatusChange?: MapCanvasProps["onLayerStatusChange"];
  renderMode: MapRenderMode;
}) {
  const map = useMap();
  const [collection, setCollection] =
    useState<WellLogCollection>(EMPTY_WELL_LOGS);

  useEffect(() => {
    let controller: AbortController | null = null;
    let requestNumber = 0;

    const loadVisibleWells = () => {
      controller?.abort();
      controller = null;
      requestNumber += 1;
      const currentRequest = requestNumber;

      if (!visible) {
        setCollection(EMPTY_WELL_LOGS);
        onStatusChange?.(layer.id, { status: "idle" });
        return;
      }

      if (map.getZoom() < layer.minZoom) {
        setCollection(EMPTY_WELL_LOGS);
        onStatusChange?.(layer.id, { status: "zoom", minZoom: layer.minZoom });
        return;
      }

      const bounds = map.getBounds();
      controller = new AbortController();
      onStatusChange?.(layer.id, { status: "loading" });
      void fetchWellLogs({
        serviceUrl: layer.serviceUrl,
        bounds: {
          west: bounds.getWest(),
          south: bounds.getSouth(),
          east: bounds.getEast(),
          north: bounds.getNorth(),
        },
        filter: accuracyFilter,
        signal: controller.signal,
      })
        .then((nextCollection) => {
          if (currentRequest !== requestNumber) {
            return;
          }
          setCollection(nextCollection);
          onStatusChange?.(layer.id, {
            status: "ready",
            count: nextCollection.features.length,
          });
        })
        .catch((error: unknown) => {
          if (
            currentRequest !== requestNumber ||
            (error instanceof DOMException && error.name === "AbortError")
          ) {
            return;
          }
          setCollection(EMPTY_WELL_LOGS);
          onStatusChange?.(layer.id, { status: "error" });
        });
    };

    loadVisibleWells();
    // moveend only: Leaflet's _moveEnd fires zoomend then moveend from the
    // same call, so a zoomend subscription made every zoom issue a doomed
    // duplicate request that the moveend run aborted milliseconds later.
    map.on("moveend", loadVisibleWells);

    return () => {
      requestNumber += 1;
      controller?.abort();
      map.off("moveend", loadVisibleWells);
    };
  }, [accuracyFilter, layer, map, onStatusChange, visible]);

  if (!visible || collection.features.length === 0) {
    return null;
  }

  return (
    <GeoJSON
      key={`${layer.id}:${accuracyFilter}:${collection.features
        .map(({ id }) => id)
        .join(",")}`}
      data={collection}
      pane={WELL_LOG_PANE}
      pointToLayer={(feature, latlng) => {
        const { accuracy } = feature.properties;
        return L.circleMarker(latlng, {
          radius: wellLogMarkerRadius(accuracy),
          pane: WELL_LOG_PANE,
          className:
            renderMode === "print"
              ? `print-well-log-marker print-well-log-marker--${accuracy}`
              : undefined,
          ...(renderMode === "print"
            ? printWellLogMarkerStyle(accuracy)
            : wellLogMarkerStyle(accuracy)),
        });
      }}
      interactive={renderMode !== "print"}
      onEachFeature={
        renderMode === "print"
          ? undefined
          : (feature, featureLayer) => {
              const properties = feature.properties;
              featureLayer.on("click", (event) => {
                L.DomEvent.stopPropagation(event);
              });
              featureLayer.bindTooltip(wellLogTooltipHtml(properties), {
                sticky: true,
              });
              featureLayer.bindPopup(wellLogPopupHtml(properties));
            }
      }
    />
  );
}

function HydroPilotLayer({
  visible,
  onStatusChange,
  renderMode,
}: {
  visible: boolean;
  onStatusChange?: MapCanvasProps["onLayerStatusChange"];
  renderMode: MapRenderMode;
}) {
  const [collection, setCollection] =
    useState<InvernessHydroPotentialCollection | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (!visible) {
      onStatusChange?.("inverness-hydro-potential", { status: "idle" });
      return;
    }
    if (collection) {
      onStatusChange?.("inverness-hydro-potential", {
        status: "ready",
        count: collection.metadata.watershedCount,
      });
      return;
    }

    onStatusChange?.("inverness-hydro-potential", { status: "loading" });
    void loadInvernessHydroPotential()
      .then((nextCollection) => {
        if (cancelled) return;
        setCollection(nextCollection);
        onStatusChange?.("inverness-hydro-potential", {
          status: "ready",
          count: nextCollection.metadata.watershedCount,
        });
      })
      .catch(() => {
        if (!cancelled) {
          onStatusChange?.("inverness-hydro-potential", { status: "error" });
        }
      });

    return () => {
      cancelled = true;
    };
  }, [collection, onStatusChange, visible]);

  if (!visible || !collection) {
    return null;
  }

  return (
    <GeoJSON
      data={collection}
      style={(feature) => {
        const properties = feature?.properties as InvernessHydroPotentialProperties;
        return renderMode === "print"
          ? printHydroLineStyle(properties.potentialClass)
          : hydroLineStyle(properties);
      }}
      interactive={renderMode !== "print"}
      onEachFeature={renderMode === "print" ? undefined : (feature, featureLayer) => {
        const properties = feature.properties as InvernessHydroPotentialProperties;
        const potentialLabel = hydroPotentialLabel(properties.potentialClass);
        featureLayer.on("click", (event) => {
          L.DomEvent.stopPropagation(event);
        });
        featureLayer.bindTooltip(
          textTooltip(
            `${properties.watershedName} · ${properties.upstreamAreaKm2.toLocaleString("en-CA")} km² modeled upstream`,
          ),
          { sticky: true },
        );
        const dropRows = properties.dropThresholdMetres === null
          ? `<div><dt>Bounded drop</dt><dd>No 5 m drop within 3 km</dd></div>`
          : `
              <div><dt>Selected drop</dt><dd>${properties.dropThresholdMetres.toLocaleString("en-CA")} m</dd></div>
              <div><dt>Downstream route</dt><dd>${properties.downstreamRouteLengthKm!.toLocaleString("en-CA")} km</dd></div>
              <div><dt>Average mapped fall</dt><dd>${properties.averageMappedFallMetresPerKm!.toLocaleString("en-CA")} m/km</dd></div>
              <div><dt>Nominal flow scenario</dt><dd>${properties.nominalFlowLitresPerSecond!.toLocaleString("en-CA")} L/s</dd></div>
              <div><dt>Indicative scale</dt><dd>${properties.indicativePowerKw!.toLocaleString("en-CA")} kW</dd></div>
            `;
        featureLayer.bindPopup(`
          <article class="hydro-potential-popup">
            <p class="hydro-popup-eyebrow">Inverness point-screen pilot</p>
            <h3>${properties.watershedName}</h3>
            <dl>
              <div><dt>Modeled upstream area</dt><dd>${properties.upstreamAreaKm2.toLocaleString("en-CA")} km²</dd></div>
              <div><dt>Network reach</dt><dd>${properties.networkRole === "tributary" ? "Tributary" : "Main trunk"}</dd></div>
              ${dropRows}
              <div><dt>Opportunity band</dt><dd><strong>${potentialLabel}</strong></dd></div>
            </dl>
            <p>Area changes at routed ${properties.catchmentResolution} catchment outlets; it is not exact at an arbitrary point. The kW scale uses ${collection.metadata.nominalSpecificDischargeLitresPerSecondPerKm2} L/s/km², mapped gross drop, and ${Math.round(collection.metadata.nominalSystemEfficiency * 100)}% nominal efficiency. It is not measured flow, net head, seasonal output, predicted production, access, rights, or approval.</p>
          </article>
        `);
      }}
    />
  );
}

function printHydroLineStyle(potentialClass: HydroPotentialClass): PathOptions {
  const styles: Record<HydroPotentialClass, Pick<PathOptions, "dashArray" | "weight">> = {
    "not-qualified": { dashArray: "1 4", weight: 1.5 },
    "below-1kw": { dashArray: "3 4", weight: 1.75 },
    "kw-1-5": { dashArray: "6 3", weight: 2 },
    "kw-5-15": { dashArray: "10 3", weight: 2.25 },
    "kw-15-30": { dashArray: "10 2 2 2", weight: 2.5 },
    "kw-30-50": { dashArray: "14 2", weight: 2.75 },
    "over-50kw": { dashArray: undefined, weight: 3.25 },
  };
  return {
    color: "#222222",
    opacity: 0.9,
    lineCap: "round",
    lineJoin: "round",
    className: `print-hydro-${potentialClass}`,
    ...styles[potentialClass],
  };
}

function MapPositionController({
  onPositionChange,
  onViewportChange,
  printableViewportGuard,
}: Pick<MapCanvasProps, "onPositionChange" | "onViewportChange"> & {
  printableViewportGuard: PrintableViewportGuardRef;
}) {
  const map = useMap();

  useEffect(() => {
    if (!onPositionChange && !onViewportChange) {
      return;
    }
    const reportPosition = (event?: LeafletEvent) => {
      const center = map.getCenter();
      const bounds = map.getBounds();
      const position = {
        latitude: center.lat,
        longitude: center.lng,
        zoom: map.getZoom(),
      };
      onPositionChange?.(position);
      const viewport: PrintMapViewport = {
        position,
        bounds: {
          north: bounds.getNorth(),
          east: bounds.getEast(),
          south: bounds.getSouth(),
          west: bounds.getWest(),
        },
      };

      const guard = printableViewportGuard.current;
      if (guard.suppressBrowserLocation) {
        guard.lastSuppressed = viewport;
        if (event?.type === "moveend") {
          guard.suppressBrowserLocation = false;
        }
        return;
      }
      if (
        guard.lastSuppressed !== null &&
        samePrintMapViewport(guard.lastSuppressed, viewport)
      ) {
        return;
      }
      guard.lastSuppressed = null;
      onViewportChange?.(viewport);
    };
    reportPosition();
    // moveend only: Leaflet's _moveEnd fires zoomend then moveend from the
    // same call, so a zoomend subscription made every zoom issue a doomed
    // duplicate request that the moveend run aborted milliseconds later.
    map.on("moveend", reportPosition);
    return () => {
      map.off("moveend", reportPosition);
    };
  }, [map, onPositionChange, onViewportChange, printableViewportGuard]);

  return null;
}

function PrintBoundsController({ bounds }: { bounds?: PrintMapBounds }) {
  const map = useMap();

  useEffect(() => {
    if (!bounds) return;
    map.fitBounds(
      [[bounds.south, bounds.west], [bounds.north, bounds.east]],
      { padding: [24, 24], maxZoom: 18, animate: false },
    );
  }, [bounds, map]);
  return null;
}

function MapStatusController({
  id,
  visible,
  onStatusChange,
}: {
  id: MapLayerId;
  visible: boolean;
  onStatusChange?: MapCanvasProps["onLayerStatusChange"];
}) {
  useEffect(() => {
    if (!visible) {
      onStatusChange?.(id, { status: "idle" });
    }
  }, [id, onStatusChange, visible]);
  return null;
}

function LayerZoomController({
  provinceLayers,
  hydroPilotLayers,
}: {
  provinceLayers: MapCanvasProps["provinceLayers"];
  hydroPilotLayers: Record<HydroPilotLayerId, boolean>;
}) {
  const map = useMap();
  const waterfallsWereVisible = useRef(false);
  const hydroPilotWasVisible = useRef(false);

  useEffect(() => {
    const waterfallsAreVisible = provinceLayers.waterfalls;
    const waterfallsBecameVisible =
      waterfallsAreVisible && !waterfallsWereVisible.current;
    waterfallsWereVisible.current = waterfallsAreVisible;

    if (waterfallsBecameVisible) {
      map.fitBounds(WATERFALL_DISCOVERY_BOUNDS, {
        animate: true,
        padding: [48, 48],
        maxZoom: 8,
      });
      return;
    }

    const hydroPilotIsVisible =
      hydroPilotLayers["inverness-hydro-potential"];
    const hydroPilotBecameVisible =
      hydroPilotIsVisible && !hydroPilotWasVisible.current;
    hydroPilotWasVisible.current = hydroPilotIsVisible;

    if (hydroPilotBecameVisible) {
      map.fitBounds(INVERNESS_HYDRO_PILOT_BOUNDS, {
        animate: true,
        padding: [48, 48],
        maxZoom: 9,
      });
      return;
    }

    const targetDetailZoom = provinceLayerCatalog.reduce(
      (target, { id, minZoom }) =>
        id !== "nsprd" && provinceLayers[id] && minZoom >= 12
          ? Math.max(target, minZoom)
          : target,
      0,
    );

    if (targetDetailZoom > 0 && map.getZoom() < targetDetailZoom) {
      map.setZoom(targetDetailZoom, { animate: true });
    }
  }, [hydroPilotLayers, map, provinceLayers]);

  return null;
}

function ParcelFocusController({
  parcels,
  focusRequest,
}: Pick<MapCanvasProps, "parcels" | "focusRequest">) {
  const map = useMap();
  const handledRequestId = useRef<number | null>(null);

  useEffect(() => {
    if (!focusRequest || handledRequestId.current === focusRequest.requestId) {
      return;
    }

    const focusedFeatures = parcels.features.filter(
      ({ properties }) => properties.PID === focusRequest.pid,
    );
    if (focusedFeatures.length === 0) {
      return;
    }

    const bounds = L.geoJSON({
      type: "FeatureCollection",
      features: focusedFeatures,
    } as GeoJSON.FeatureCollection<
      GeoJSON.Geometry,
      NsprdFeatureProperties
    >).getBounds();
    if (!bounds.isValid()) {
      return;
    }

    handledRequestId.current = focusRequest.requestId;
    map.fitBounds(bounds, { padding: [64, 64], maxZoom: 16 });
  }, [focusRequest, map, parcels]);

  return null;
}

function InitialTaxSaleBoundsController({
  parcels,
  taxSalePids,
  showTaxSale,
  preserveInitialPosition,
}: Pick<
  MapCanvasProps,
  "parcels" | "taxSalePids" | "showTaxSale" | "preserveInitialPosition"
>) {
  const map = useMap();
  const hasFittedInitialTaxSaleLayer = useRef(false);

  useEffect(() => {
    if (
      preserveInitialPosition ||
      hasFittedInitialTaxSaleLayer.current ||
      !showTaxSale
    ) {
      return;
    }

    const taxSaleFeatures = parcels.features.filter(({ properties }) =>
      taxSalePids.has(properties.PID),
    );
    if (taxSaleFeatures.length === 0) {
      return;
    }

    const taxSaleCollection: GeoJSON.FeatureCollection<
      GeoJSON.Geometry,
      NsprdFeatureProperties
    > = {
      type: "FeatureCollection",
      features: taxSaleFeatures,
    };
    const bounds = L.geoJSON(taxSaleCollection).getBounds();
    if (!bounds.isValid()) {
      return;
    }

    hasFittedInitialTaxSaleLayer.current = true;
    map.fitBounds(bounds, {
      animate: false,
      padding: [48, 48],
      maxZoom: 13,
    });
  }, [map, parcels, preserveInitialPosition, showTaxSale, taxSalePids]);

  return null;
}

function InitialHistoricalBoundsController({
  parcels,
  historicalTaxSalePids,
  showHistoricalTaxSales,
  preserveInitialPosition,
}: Pick<
  MapCanvasProps,
  | "parcels"
  | "historicalTaxSalePids"
  | "showHistoricalTaxSales"
  | "preserveInitialPosition"
>) {
  const map = useMap();
  const hasFittedHistoricalLayer = useRef(false);

  useEffect(() => {
    if (
      preserveInitialPosition ||
      hasFittedHistoricalLayer.current ||
      !showHistoricalTaxSales
    ) {
      return;
    }

    const features = parcels.features.filter(({ properties }) =>
      historicalTaxSalePids.has(properties.PID),
    );
    if (features.length === 0) {
      return;
    }

    const bounds = L.geoJSON({
      type: "FeatureCollection",
      features,
    } as GeoJSON.FeatureCollection<GeoJSON.Geometry, NsprdFeatureProperties>).getBounds();
    if (!bounds.isValid()) {
      return;
    }

    hasFittedHistoricalLayer.current = true;
    map.fitBounds(bounds, {
      animate: true,
      padding: [48, 48],
      maxZoom: 11,
    });
  }, [
    historicalTaxSalePids,
    map,
    parcels,
    preserveInitialPosition,
    showHistoricalTaxSales,
  ]);

  return null;
}

function ParcelIdentifyController({
  enabled,
  onIdentifyParcel,
}: {
  enabled: boolean;
  onIdentifyParcel: MapCanvasProps["onIdentifyParcel"];
}) {
  const map = useMap();
  const pendingClick = useRef<number | null>(null);

  const cancelPendingClick = useCallback(() => {
    if (pendingClick.current !== null) {
      window.clearTimeout(pendingClick.current);
      pendingClick.current = null;
    }
  }, []);

  useEffect(() => cancelPendingClick, [cancelPendingClick]);

  // A click schedules the identify IDENTIFY_CLICK_DELAY_MS in the future; if
  // measuring turns on inside that window the timer must not survive it, or
  // an identify still fires at the click's position after `enabled` is gone.
  useEffect(() => {
    if (!enabled) {
      cancelPendingClick();
    }
  }, [enabled, cancelPendingClick]);

  useMapEvents({
    click: ({ latlng }) => {
      cancelPendingClick();
      if (enabled && map.getZoom() >= PROPERTY_BOUNDARY_MIN_ZOOM) {
        pendingClick.current = window.setTimeout(() => {
          pendingClick.current = null;
          onIdentifyParcel(latlng.lat, latlng.lng);
        }, IDENTIFY_CLICK_DELAY_MS);
      }
    },
    dblclick: cancelPendingClick,
  });

  return null;
}

function MapSizeController() {
  const map = useMap();

  useEffect(() => {
    const invalidateSize = () => {
      map.invalidateSize({ animate: false });
    };
    const visualViewport = window.visualViewport;
    const resizeObserver =
      typeof ResizeObserver === "undefined"
        ? null
        : new ResizeObserver(invalidateSize);

    invalidateSize();
    resizeObserver?.observe(map.getContainer());
    visualViewport?.addEventListener("resize", invalidateSize);

    return () => {
      resizeObserver?.disconnect();
      visualViewport?.removeEventListener("resize", invalidateSize);
    };
  }, [map]);

  return null;
}

function approximateScreenScaleDenominator(map: LeafletMap): number | null {
  const size = map.getSize();
  const sampleWidth = Math.min(
    DISPLAY_SCALE_SAMPLE_WIDTH_CSS_PIXELS,
    size.x,
  );
  if (!Number.isFinite(sampleWidth) || sampleWidth <= 0) {
    return null;
  }

  const y = size.y / 2;
  const x = (size.x - sampleWidth) / 2;
  const left = map.containerPointToLatLng([x, y]);
  const right = map.containerPointToLatLng([x + sampleWidth, y]);
  const groundMetres = map.distance(left, right);
  const denominator =
    groundMetres / (sampleWidth * CSS_METRES_PER_PIXEL);

  if (!Number.isFinite(denominator) || denominator <= 0) {
    return null;
  }
  return Number(denominator.toPrecision(3));
}

function ApproximateScaleReadout() {
  const map = useMap();
  const [denominator, setDenominator] = useState(() =>
    approximateScreenScaleDenominator(map),
  );

  useEffect(() => {
    function updateScale() {
      setDenominator(approximateScreenScaleDenominator(map));
    }

    updateScale();
    map.on("moveend", updateScale);
    map.on("zoomend", updateScale);
    return () => {
      map.off("moveend", updateScale);
      map.off("zoomend", updateScale);
    };
  }, [map]);

  if (denominator === null) {
    return null;
  }

  return (
    <p className="display-scale-readout" title={DISPLAY_SCALE_EXPLANATION}>
      Approx. screen scale 1:{denominator.toLocaleString("en-CA")}
    </p>
  );
}

function PositionReadout() {
  const map = useMap();
  const [position, setPosition] = useState(() => ({
    center: map.getCenter(),
    zoom: map.getZoom(),
  }));
  const [copied, setCopied] = useState(false);
  useMapEvents({
    moveend: () =>
      setPosition({ center: map.getCenter(), zoom: map.getZoom() }),
    zoomend: () =>
      setPosition({ center: map.getCenter(), zoom: map.getZoom() }),
  });

  useEffect(() => {
    if (!copied) {
      return;
    }
    const timer = window.setTimeout(() => setCopied(false), 2_000);
    return () => window.clearTimeout(timer);
  }, [copied]);

  const coordinates = `${position.center.lat.toFixed(5)}, ${position.center.lng.toFixed(5)}`;
  return (
    <button
      type="button"
      className="position-readout"
      aria-label="Copy map centre coordinates"
      onClick={() => {
        if (navigator.clipboard?.writeText) {
          void navigator.clipboard.writeText(coordinates).then(
            () => setCopied(true),
            () => setCopied(false),
          );
        }
      }}
    >
      {copied ? "Copied" : `Z ${position.zoom} · ${coordinates}`}
    </button>
  );
}

function TaxSaleOverviewMarkers({
  parcels,
  taxSalePids,
  historicalTaxSalePids,
  showTaxSale,
  showHistoricalTaxSales,
  selectedPid,
  onSelectPid,
  renderMode = "interactive",
}: Pick<
  MapCanvasProps,
  | "parcels"
  | "taxSalePids"
  | "historicalTaxSalePids"
  | "showTaxSale"
  | "showHistoricalTaxSales"
  | "selectedPid"
  | "onSelectPid"
  | "renderMode"
>) {
  const map = useMap();
  const [zoom, setZoom] = useState(() => map.getZoom());
  useMapEvents({ zoomend: () => setZoom(map.getZoom()) });

  const currentPoints = useMemo(
    () =>
      showTaxSale ? representativeParcelPoints(parcels, taxSalePids) : [],
    [parcels, showTaxSale, taxSalePids],
  );
  const historicalPoints = useMemo(
    () =>
      showHistoricalTaxSales
        ? representativeParcelPoints(parcels, historicalTaxSalePids)
        : [],
    [historicalTaxSalePids, parcels, showHistoricalTaxSales],
  );

  if (zoom > OVERVIEW_MARKER_MAX_ZOOM) {
    return null;
  }

  return (
    <>
      {historicalPoints.map((point) => (
        <OverviewMarker
          key={`historical-${point.pid}`}
          point={point}
          keyPrefix="historical"
          color="#5a4385"
          selected={point.pid === selectedPid}
          renderMode={renderMode}
          onSelectPid={onSelectPid}
        />
      ))}
      {currentPoints.map((point) => (
        <OverviewMarker
          key={`current-${point.pid}`}
          point={point}
          keyPrefix="current"
          color="#be4d3c"
          selected={point.pid === selectedPid}
          renderMode={renderMode}
          onSelectPid={onSelectPid}
        />
      ))}
    </>
  );
}

/**
 * One memoized marker per point. react-leaflet re-applies center
 * (setLatLng), pathOptions (setStyle), and eventHandlers (off/on) whenever
 * their IDENTITY changes, and the previous inline construction handed every
 * marker fresh objects on every App render — hundreds of markers times three
 * Leaflet mutations per moveend, keystroke, and tile event. Everything here
 * is memoized on real inputs, so a re-render with unchanged props is free.
 */
const OverviewMarker = memo(function OverviewMarker({
  point,
  keyPrefix,
  color,
  selected,
  renderMode,
  onSelectPid,
}: {
  point: { pid: string; latitude: number; longitude: number };
  keyPrefix: "current" | "historical";
  color: string;
  selected: boolean;
  renderMode: MapRenderMode;
  onSelectPid: (pid: string) => void;
}) {
  const center = useMemo<[number, number]>(
    () => [point.latitude, point.longitude],
    [point.latitude, point.longitude],
  );
  const pathOptions = useMemo<PathOptions>(
    () =>
      renderMode === "print"
        ? {
            color: "#111111",
            weight: selected ? 3 : 1.75,
            fillColor: keyPrefix === "current" ? "#f3f3f3" : "#777777",
            fillOpacity: 1,
            dashArray: keyPrefix === "historical" ? "3 2" : undefined,
            className: `print-${keyPrefix}-tax-sale-marker`,
          }
        : {
            color: "#ffffff",
            weight: selected ? 3 : 1.5,
            fillColor: color,
            fillOpacity: selected ? 1 : 0.85,
          },
    [color, keyPrefix, renderMode, selected],
  );
  const eventHandlers = useMemo(
    () =>
      renderMode === "print"
        ? undefined
        : {
            click: (event: L.LeafletMouseEvent) => {
              L.DomEvent.stopPropagation(event);
              onSelectPid(point.pid);
            },
          },
    [onSelectPid, point.pid, renderMode],
  );
  return (
    <CircleMarker
      center={center}
      radius={selected ? 9 : 7}
      pane={ESTABLISHED_PARCEL_PANE}
      pathOptions={pathOptions}
      interactive={renderMode !== "print"}
      eventHandlers={eventHandlers}
    />
  );
});

function ParcelGeometryOverlay({
  collection,
  selectedPid,
  showTaxSale,
  showHistoricalTaxSales,
  style,
  onSelectPid,
  renderMode,
}: {
  collection: NsprdFeatureCollection;
  selectedPid: string | null;
  showTaxSale: boolean;
  showHistoricalTaxSales: boolean;
  style: (
    feature?: GeoJSON.Feature<GeoJSON.Geometry, NsprdFeatureProperties>,
  ) => PathOptions;
  onSelectPid: (pid: string) => void;
  renderMode: MapRenderMode;
}) {
  const map = useMap();
  const [zoom, setZoom] = useState(() => map.getZoom());
  useMapEvents({ zoomend: () => setZoom(map.getZoom()) });

  if (zoom <= OVERVIEW_MARKER_MAX_ZOOM) {
    return null;
  }

  return (
    <GeoJSON
      // Keyed by CONTENT (the visible PIDs), not by count: react-leaflet's
      // GeoJSON never re-reads `data`, so an equal-length parcel-set change —
      // switching to a different single-parcel event, changing a filter that
      // swaps N parcels for N others — kept rendering the previous set's
      // geometry. visibleParcels is the small selected/tax-sale subset, so
      // the join stays cheap.
      key={`${collection.features
        .map(({ properties }) => properties.PID)
        .sort()
        .join(",")}:${selectedPid ?? "none"}:${showTaxSale}:${showHistoricalTaxSales}`}
      data={collection}
      pane={ESTABLISHED_PARCEL_PANE}
      style={style}
      interactive={renderMode !== "print"}
      onEachFeature={
        renderMode === "print"
          ? undefined
          : (feature, layer) => {
              const pid = (feature.properties as NsprdFeatureProperties).PID;
              layer.on("click", (event) => {
                // The Leaflet event, never `event.originalEvent`: only the
                // former sets the `_stopped` flag the map's dispatch loop
                // checks, so passing the raw DOM event left ParcelIdentify-
                // Controller free to fire a second, unrequested identify
                // 250 ms after every parcel click. Same form as MeasureTool.
                L.DomEvent.stopPropagation(event);
                onSelectPid(pid);
              });
              layer.bindTooltip(textTooltip(`PID ${pid}`), { sticky: true });
            }
      }
    />
  );
}

function headingDivIcon(headingDeg: number): L.DivIcon {
  // The interpolated value is forced numeric — nothing user-authored can
  // reach this HTML string.
  const rotation = Math.round(headingDeg) % 360;
  return L.divIcon({
    className: "location-heading-anchor",
    html: `<div class="location-heading" style="transform: rotate(${rotation}deg)"></div>`,
    iconSize: [44, 44],
    iconAnchor: [22, 22],
  });
}

function formatElapsed(ms: number): string {
  const totalSeconds = Math.floor(ms / 1_000);
  const hours = Math.floor(totalSeconds / 3_600);
  const minutes = Math.floor((totalSeconds % 3_600) / 60);
  const seconds = totalSeconds % 60;
  const pad = (value: number) => String(value).padStart(2, "0");
  return hours > 0
    ? `${hours}:${pad(minutes)}:${pad(seconds)}`
    : `${minutes}:${pad(seconds)}`;
}

function RecordTrackIcon() {
  return (
    <svg
      className="location-button-icon"
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="8" />
      <circle cx="12" cy="12" r="3.5" fill="currentColor" />
    </svg>
  );
}

function MarkLocationIcon() {
  return (
    <svg
      className="location-button-icon"
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      <path d="M12 21s-6.5-5.9-6.5-10.4a6.5 6.5 0 0 1 13 0C18.5 15.1 12 21 12 21Z" />
      <path d="M9.5 10h5M12 7.5v5" />
    </svg>
  );
}

function LocationControlIcon() {
  return (
    <svg
      className="location-button-icon"
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="4.25" />
      <path d="M12 2.75v3M12 18.25v3M2.75 12h3M18.25 12h3" />
    </svg>
  );
}

export function MapCanvas({
  parcels,
  taxSalePids,
  historicalTaxSalePids,
  selectedPid,
  provinceLayers,
  resourceLayers,
  hydroPilotLayers = HIDDEN_HYDRO_PILOT_LAYERS,
  floodHazardLayers = HIDDEN_FLOOD_HAZARD_LAYERS,
  environmentalHealthLayers = HIDDEN_ENVIRONMENTAL_HEALTH_LAYERS,
  forestryLayers = HIDDEN_FORESTRY_LAYERS,
  zoningLayers = HIDDEN_ZONING_LAYERS,
  wellLogLayers = HIDDEN_WELL_LOG_LAYERS,
  liveConditionsLayers = HIDDEN_LIVE_CONDITIONS_LAYERS,
  wellLogAccuracyFilter = "surveyed",
  fletcherVisible = false,
  fletcherOpacity = 0.72,
  fletcherTileBaseUrl = null,
  fletcherRetryToken = 0,
  userMaps = EMPTY_USER_MAPS,
  userMapFitRequest = null,
  userVectorLayers = EMPTY_USER_VECTOR_LAYERS,
  userVectorFitRequest = null,
  userVectorEdit = null,
  userVectorPhotoUi = null,
  georeference = null,
  showModernMap,
  showTaxSale,
  showHistoricalTaxSales,
  onSelectPid,
  onIdentifyParcel,
  focusRequest = null,
  initialPosition = DEFAULT_MAP_POSITION,
  preserveInitialPosition = false,
  onPositionChange,
  onViewportChange,
  onMarkLocation,
  onSaveTrack,
  onLayerStatusChange,
  onResourceLayerStatusChange,
  renderMode = "interactive",
  fitBounds,
  exportFrame = null,
  onExportFrameChange,
  onExportFrameCancel,
  onExportFrameContinue,
}: MapCanvasProps) {
  const isPrintMode = renderMode === "print";
  const modernPrintError = useRef(false);
  const reportLayerStatus = useCallback(
    (id: MapLayerId, status: MapLayerStatus) => {
      onLayerStatusChange?.(id, status);
      if (allResourceLayerCatalog.some((layer) => layer.id === id)) {
        onResourceLayerStatusChange?.(id as ResourceLayerId, status);
      }
    },
    [onLayerStatusChange, onResourceLayerStatusChange],
  );
  const reportMineralProximityStatus = useCallback(
    (status: MapLayerStatus) => {
      reportLayerStatus("mineral-proximity-parcels", status);
    },
    [reportLayerStatus],
  );
  const reportModernStatus = useCallback(
    (status: MapLayerStatus) => {
      if (isPrintMode && modernPrintError.current && status.status !== "error") {
        return;
      }
      if (isPrintMode && status.status === "error") {
        modernPrintError.current = true;
      }
      reportLayerStatus("modern", status);
    },
    [isPrintMode, reportLayerStatus],
  );
  const reportFletcherStatus = useCallback(
    (status: MapLayerStatus) => {
      reportLayerStatus("fletcher", status);
    },
    [reportLayerStatus],
  );
  const [map, setMap] = useState<LeafletMap | null>(null);
  const printableViewportGuard = useRef<PrintableViewportGuard>({
    suppressBrowserLocation: false,
    lastSuppressed: null,
  });
  const [locationOn, setLocationOn] = useState(false);
  // Armed while a recording session exists (recording OR paused): the watch
  // restarts with maximumAge 0 so no cached fix ever enters a track.
  const [recorderArmed, setRecorderArmed] = useState(false);
  const live = useLiveLocation(locationOn && !isPrintMode, recorderArmed);
  const recording = useTrackRecording(live.fix);
  const [stopResult, setStopResult] = useState<StopResult | null>(null);
  // The layer a refused save left on the map, held with the walk it carries
  // and with the name and tolerance that save was made with. A retry is aimed
  // at that layer; pairing it with the walk is what keeps a later, different
  // recording from being written over it. The user's own two choices travel
  // with it because the retry rewrites that layer: reopening on the generated
  // default name would rename the track already on the map, and the default
  // tolerance would re-simplify it at a setting nobody picked.
  const [refusedSave, setRefusedSave] = useState<{
    result: StopResult;
    layerId: string;
    name: string;
    toleranceM: number;
  } | null>(null);
  const [savingTrack, setSavingTrack] = useState(false);
  const [followOn, setFollowOn] = useState(false);
  const [marking, setMarking] = useState(false);
  // Once per toggle-on: the success message and the fly-to happen on the
  // first fix only; later fixes just move the marker (and pan under follow).
  const hasCenteredRef = useRef(false);
  const [locationMessage, setLocationMessage] = useState<string | null>(null);
  const [modernMapRetry, setModernMapRetry] = useState(0);
  const [modernMapFailed, setModernMapFailed] = useState(false);
  const [measureMode, setMeasureMode] = useState<MeasureMode>("off");
  const measuring = measureMode !== "off";
  const measuringRef = useRef(false);
  useLayoutEffect(() => {
    measuringRef.current = measuring;
  }, [measuring]);
  // Layer click handlers are wired inside effects; a ref-guarded stable
  // callback suspends selection without remounting those layers.
  const guardedSelectPid = useCallback(
    (pid: string) => {
      if (!measuringRef.current) {
        onSelectPid(pid);
      }
    },
    [onSelectPid],
  );

  useEffect(() => {
    // Good news auto-dismisses; problems ("permission was not granted",
    // "signal lost") stay until the state changes.
    // Good news is a whole sentence about a point or a track that landed:
    // "Point saved to Field notes (±7.4 m).". A message that starts the same
    // way and then says the write did not reach the device is a warning, and
    // warnings stay until the state changes.
    const autoDismisses =
      locationMessage === LOCATION_SUCCESS_MESSAGE ||
      (locationMessage !== null &&
        /^(Point (saved|added) to |Track saved as ).*\(±[^)]*\)\.$/.test(
          locationMessage,
        )) ||
      (locationMessage?.startsWith("Track saved") ?? false);
    if (!autoDismisses) {
      return;
    }

    const timeout = window.setTimeout(
      () => setLocationMessage(null),
      LOCATION_SUCCESS_MESSAGE_DURATION_MS,
    );
    return () => window.clearTimeout(timeout);
  }, [locationMessage]);

  const visibleParcels = useMemo<NsprdFeatureCollection>(() => {
    return {
      ...parcels,
      features: parcels.features.filter(
        ({ properties }) =>
          properties.PID === selectedPid ||
          (showTaxSale && taxSalePids.has(properties.PID)) ||
          (showHistoricalTaxSales &&
            historicalTaxSalePids.has(properties.PID)),
      ),
    };
  }, [
    historicalTaxSalePids,
    parcels,
    selectedPid,
    showHistoricalTaxSales,
    showTaxSale,
    taxSalePids,
  ]);

  // useCallback, not a render-scoped closure: react-leaflet updates GeoJSON
  // with `if (style !== prevStyle) layer.setStyle(style)`, and setStyle walks
  // every feature sub-layer rewriting SVG attributes. A fresh closure per
  // render restyled every visible parcel on every App render — each map move,
  // keystroke, and tile-status event.
  const parcelStyle = useCallback(
    (
      feature?: GeoJSON.Feature<GeoJSON.Geometry, NsprdFeatureProperties>,
    ): PathOptions =>
      parcelStyleForFeature(feature, {
        selectedPid,
        showTaxSale,
        taxSalePids,
        showHistoricalTaxSales,
        historicalTaxSalePids,
      }, renderMode),
    [
      historicalTaxSalePids,
      renderMode,
      selectedPid,
      showHistoricalTaxSales,
      showTaxSale,
      taxSalePids,
    ],
  );

  const toggleLocation = () => {
    if (recording.status !== "idle" || stopResult) {
      // Turning the watch off mid-recording would silently truncate the
      // track; the user decides through the recorder controls instead.
      setLocationMessage("Stop the track recording first.");
      return;
    }
    if (locationOn) {
      setLocationOn(false);
      setFollowOn(false);
      setLocationMessage(null);
      hasCenteredRef.current = false;
      return;
    }
    setLocationOn(true);
    // Follow is the point of turning location on; dragging opts back out.
    setFollowOn(true);
    setLocationMessage("Finding your location…");
  };

  // Watch-status messages. Denial, a missing API, and a device that kept
  // reporting no position are final for this toggle-on, so the button resets;
  // signal loss keeps the (dimmed) marker.
  // The transient reason is a dependency of its own: a watch that goes from
  // "still trying" to "cannot place you" stays `signal-lost` throughout, and
  // the sentence has to follow the change the status does not show.
  const lostReason = live.status === "signal-lost" ? live.reason : null;
  // A watch that has never delivered a position has not lost a signal; it has
  // never had one. `fix === null` is the same test the marker is drawn by, so
  // the sentence and the map agree: nothing found, so nothing drawn. It also
  // moves with a watch restart (arming the recorder starts a new one), which a
  // "have we ever had a fix" flag would not. The native map draws the same
  // line: MapController.LocationMessage.signalLost ("GPS signal lost — still
  // trying.") is reported only while an established fix is being followed, and
  // a search that has produced nothing settles on .unavailable ("Your location
  // couldn't be found. Try again outdoors.").
  const lostWithoutAnyFix = live.status === "signal-lost" && live.fix === null;
  // The terminal reason is a dependency of its own, for the reason lostReason
  // is: the status alone does not say which of the three endings this was,
  // and the sentence has to follow it.
  const stoppedReason =
    live.status === "position-unavailable" ? live.reason : null;
  useEffect(() => {
    if (!locationOn) {
      return;
    }
    if (live.status === "active") {
      // Every return to a fix, not only the first: a watch that timed out
      // and then answered would otherwise leave "still trying" on screen
      // over a map that is showing the reader where they are.
      setLocationMessage(LOCATION_SUCCESS_MESSAGE);
    } else if (lostWithoutAnyFix) {
      // Nothing has been found, so nothing is on the map and nothing was
      // lost. Both watches are still running, so both sentences end in the
      // present tense — but they part company on what has been heard back: one
      // has had no answer yet, the other has been told the position could not
      // be worked out. The cause is not guessed either — location switched off
      // for the device, and a device under a roof, answer identically — so
      // both are named and neither is claimed.
      setLocationMessage(
        lostReason === "timeout"
          ? "Your location hasn't been found yet — still looking. Move " +
              "outdoors, or check that location is switched on for this device."
          : "Your location is unavailable — the device cannot work out where " +
              "it is. Still trying. Move outdoors, or check that location is " +
              "switched on for this device.",
      );
    } else if (live.status === "signal-lost") {
      // A fix was had and stopped coming. Not "GPS": the browser answers from
      // a satellite fix, a Wi-Fi lookup or an IP estimate and never says
      // which. And a device still trying is not a device that cannot place
      // itself.
      setLocationMessage(
        lostReason === "timeout"
          ? "Your location is taking longer than expected — still trying."
          : "Your location is unavailable right now — still trying.",
      );
    } else if (live.status === "denied") {
      setLocationOn(false);
      setFollowOn(false);
      hasCenteredRef.current = false;
      setLocationMessage(
        "Location permission was not granted. You can keep using the map.",
      );
    } else if (live.status === "position-unavailable") {
      // The watch is already cleared, so the toggle has to come back up: a
      // pressed button over a search that has stopped is a lie the reader has
      // no way to see through. Only what the device reported is said — no
      // refusal, and no claim that this machine cannot locate itself — and the
      // way back is named, because the toggle is the retry. The latch is reset
      // for the same reason the denial branch resets it: every path that ends
      // a toggle-on leaves it as a fresh one would find it.
      //
      // The two endings are not the same account. One device said it could
      // not place itself several times; the other said it once and then said
      // nothing at all, and reporting that as several would be a count nobody
      // made.
      setLocationOn(false);
      setFollowOn(false);
      hasCenteredRef.current = false;
      setLocationMessage(
        (stoppedReason === "repeated"
          ? "The device reported your location as unavailable several times, " +
            "so the map stopped asking. "
          : stoppedReason === "no-answer"
            ? "The device reported your location as unavailable and then " +
              "stopped answering, so the map stopped asking. "
            : "Your location wasn't found, so after half a minute the map " +
              "stopped looking. ") +
          "Location may be switched off for this device, or there may be " +
          "nothing here to place you by. Press Use my location to try again.",
      );
    } else if (live.status === "unavailable") {
      setLocationOn(false);
      setFollowOn(false);
      setLocationMessage("Location is not available in this browser.");
    }
  }, [live.status, lostReason, lostWithoutAnyFix, locationOn, stoppedReason]);

  // Dragging the map is how the user says "stop following me around".
  useEffect(() => {
    if (!map || !locationOn) {
      return;
    }
    const onDragStart = () => setFollowOn(false);
    map.on("dragstart", onDragStart);
    return () => {
      map.off("dragstart", onDragStart);
    };
  }, [map, locationOn]);

  // Follow mode: every location-driven move arms the same viewport guard the
  // old one-shot fly-to used, so a follow session never leaks the user's
  // position into share URLs, print viewports, or evidence notes.
  const lastCenteredFixRef = useRef<LiveFix | null>(null);

  // Pressing Follow again is a request to be taken back to the fix, and it
  // must not depend on a new one arriving: the last fix has already been
  // centred on, so the effect below would otherwise do nothing at all and
  // the press would have no result to see or hear.
  const followRecentre = () => {
    lastCenteredFixRef.current = null;
    setFollowOn(true);
    setLocationMessage(LOCATION_SUCCESS_MESSAGE);
  };

  useEffect(() => {
    if (!map || !followOn || !live.fix) {
      return;
    }
    if (lastCenteredFixRef.current === live.fix) {
      return;
    }
    lastCenteredFixRef.current = live.fix;
    printableViewportGuard.current.suppressBrowserLocation = true;
    printableViewportGuard.current.lastSuppressed = null;
    // Reduce Motion is a system setting about movement, and Leaflet's fly
    // and pan animate in JavaScript, where the stylesheet's media rule
    // cannot reach them. The map still goes to the fix; it just arrives.
    const animate = !prefersReducedMotion();
    const target: [number, number] = [live.fix.latitude, live.fix.longitude];
    const onScreen = map.getBounds().contains(target);
    const zoom = map.getZoom();
    if (!hasCenteredRef.current) {
      hasCenteredRef.current = true;
      // The reader's zoom is theirs. A parcel searched at 16, or imagery
      // read at 18, is not something the locate button may throw away to
      // reach a fixed 14: at that scale a 12 m accuracy circle is sub-pixel
      // and the lot they were reading is gone. The fixed locate scale is
      // for the case it was written for — a view further out than it.
      if (onScreen && zoom >= LOCATE_MIN_ZOOM) {
        map.panTo(target, { animate });
      } else {
        map.flyTo(target, Math.max(zoom, LOCATE_MIN_ZOOM), { animate });
      }
      return;
    }
    // Following: the zoom stays where the reader left it, and only a fix on
    // screen is panned to. Leaflet declines to animate a pan longer than the
    // viewport for good reason — the tiles between are never fetched — so a
    // fix that has moved out of view is flown to instead.
    if (onScreen) {
      map.panTo(target, { animate });
    } else {
      map.flyTo(target, zoom, { animate });
    }
  }, [followOn, live.fix, map]);

  const handleMark = async () => {
    if (!onMarkLocation || marking) {
      return;
    }
    setMarking(true);
    setLocationMessage("Saving a point at your location…");
    try {
      // A fresh, tight watch fix saves instantly; anything stale, rough,
      // future-dated or off the globe makes the handler re-request, so a
      // mark never lands on data the one-shot would have refused. One rule,
      // shared with that path.
      const usable =
        live.fix !== null && isUsableMarkFix(live.fix, Date.now())
          ? live.fix
          : null;
      const message = await onMarkLocation(usable);
      setLocationMessage(message);
    } finally {
      setMarking(false);
    }
  };

  // A walk that has not been saved or discarded: this session's own Stop, or
  // a recording this device stored before the tab went away.
  const unsavedTrack = recording.unsaved;
  // Only the second kind carries the truncation caveat, and only it is marked
  // interrupted on the record it becomes.
  const recoveredDraft =
    unsavedTrack !== null &&
    unsavedTrack.interrupted &&
    stopResult === unsavedTrack.result;

  // The refused save this dialog is a retry of, if it is a retry at all.
  // Identity of the walk, not a flag: a different recording must never inherit
  // another walk's layer, name or tolerance.
  const retryOfRefusedSave =
    refusedSave !== null && refusedSave.result === stopResult
      ? refusedSave
      : null;

  const startRecording = () => {
    setRecorderArmed(true);
    recording.start();
  };

  const stopRecording = () => {
    const result = recording.stop();
    setRecorderArmed(false);
    if (result) {
      setStopResult(result);
    }
  };

  const handleSaveTrack = async (name: string, simplifyToleranceM: number) => {
    if (!onSaveTrack || !stopResult) {
      return;
    }
    const feature = buildRecordedTrackFeature(stopResult, name, simplifyToleranceM);
    if (!feature) {
      // The dialog disables Save in this state; this is the belt to its
      // braces if the two ever disagree. Nothing here can be saved, so the
      // device's copy goes too rather than being offered back forever.
      setLocationMessage("Too little movement was recorded to save a track.");
      recording.clearUnsaved();
      setRefusedSave(null);
      setStopResult(null);
      return;
    }
    setSavingTrack(true);
    try {
      const outcome = await onSaveTrack({
        name,
        collection: { type: "FeatureCollection", features: [feature] },
        rawGpx: rawTrackGpxBlob(name, stopResult.rawSegments),
        startedAt: stopResult.startedAt,
        endedAt: stopResult.endedAt,
        interrupted: recoveredDraft,
        // Only ever this walk's own layer: a retry rewrites what the refused
        // save left on the map instead of adding a second copy of the track.
        replaceLayerId: retryOfRefusedSave?.layerId,
      });
      setLocationMessage(outcome.message);
      // A layer the device refused leaves the walk with no durable copy at
      // all, so it is kept and offered back instead of being forgotten on the
      // strength of a message.
      if (outcome.persisted) {
        recording.clearUnsaved();
        setRefusedSave(null);
      } else {
        setRefusedSave({
          result: stopResult,
          layerId: outcome.layerId,
          // What the user typed and chose, so the retry opens on their track
          // rather than on a freshly generated default.
          name,
          toleranceM: simplifyToleranceM,
        });
      }
      setStopResult(null);
    } finally {
      setSavingTrack(false);
    }
  };

  // Quality dot thresholds match the accuracy gate: green is survey-walk
  // quality, amber still passes the 25 m gate, red means fixes are being
  // rejected (or the signal is gone) and the track is not growing.
  const fixQuality =
    live.status !== "active" || !live.fix
      ? "red"
      : live.fix.accuracyM <= 10
        ? "green"
        : live.fix.accuracyM <= 25
          ? "amber"
          : "red";

  return (
    <div
      className={`map-canvas${georeference ? " map-canvas--georeferencing" : ""}`}
      aria-label="Nova Scotia municipal parcel map"
    >
      <MapContainer
        center={[initialPosition.latitude, initialPosition.longitude]}
        zoom={initialPosition.zoom}
        minZoom={7}
        maxZoom={23}
        zoomControl={!isPrintMode}
        dragging={!isPrintMode}
        touchZoom={!isPrintMode}
        doubleClickZoom={!isPrintMode}
        scrollWheelZoom={!isPrintMode}
        boxZoom={!isPrintMode}
        keyboard={!isPrintMode}
        attributionControl={false}
        ref={setMap}
      >
        <MapSizeController />
        <UserMapLayers
          maps={userMaps}
          draft={georeference?.draft ?? null}
          fitRequest={userMapFitRequest}
        />
        {/* User vector data never reaches PrintMap: the print pipeline takes
            no userVectorLayers prop, keeping uploads out of the sealed print
            capture by construction (documented print/export boundary). */}
        <UserVectorLayers
          layers={userVectorLayers}
          fitRequest={userVectorFitRequest}
          photoUi={userVectorPhotoUi}
          snapAsTargets={Boolean(
            userVectorEdit &&
              userVectorEdit.snap.enabled &&
              userVectorEdit.snap.myFeatures,
          )}
        />
        {userVectorEdit ? (
          <Suspense fallback={null}>
            <EditableVectorLayer
              key={userVectorEdit.record.id}
              record={userVectorEdit.record}
              data={userVectorEdit.data}
              snap={userVectorEdit.snap}
              mode={userVectorEdit.mode}
              onGeometryChange={userVectorEdit.onGeometryChange}
              onSelectFeature={userVectorEdit.onSelectFeature}
            />
            {userVectorEdit.snap.enabled && userVectorEdit.snap.parcels ? (
              <ParcelSnapTargetsLayer
                onStatusChange={userVectorEdit.onParcelSnapStatus}
              />
            ) : null}
            {userVectorEdit.conversionPreview ? (
              <ConversionPreviewLayer {...userVectorEdit.conversionPreview} />
            ) : null}
          </Suspense>
        ) : null}
        {georeference ? <GeoreferenceMapLayer binding={georeference} /> : null}
        {exportFrame ? (
          <ExportFrameLayer
            state={exportFrame}
            onStateChange={onExportFrameChange!}
            onCancel={onExportFrameCancel!}
            onContinue={onExportFrameContinue!}
          />
        ) : null}
        {!isPrintMode ? <ScaleControl position="bottomleft" /> : null}
        {!isPrintMode ? <ApproximateScaleReadout /> : null}
        {!isPrintMode ? <PositionReadout /> : null}
        {showModernMap ? (
          <TileLayer
            key={`modern-${modernMapRetry}`}
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            maxZoom={23}
            maxNativeZoom={19}
            zIndex={100}
            className={isPrintMode ? "print-layer-modern" : undefined}
            eventHandlers={{
              loading: () => {
                if (!isPrintMode) {
                  setModernMapFailed(false);
                }
                reportModernStatus({ status: "loading" });
              },
              load: () => reportModernStatus({ status: "ready" }),
              tileerror: () => {
                if (!isPrintMode) {
                  setModernMapFailed(true);
                }
                reportModernStatus({ status: "error" });
              },
            }}
          />
        ) : (
          <MapStatusController id="modern" visible={false} onStatusChange={reportLayerStatus} />
        )}
        <FletcherTileLayer
          visible={fletcherVisible}
          opacity={fletcherOpacity}
          tileBaseUrl={fletcherTileBaseUrl}
          retryToken={fletcherRetryToken}
          renderMode={renderMode}
          onStatusChange={reportFletcherStatus}
        />
        {provinceLayerCatalog.map((layer) => (
          <ArcGISMapLayer
            key={layer.id}
            layer={layer}
            visible={provinceLayers[layer.id]}
            onStatusChange={reportLayerStatus}
            renderMode={renderMode}
          />
        ))}
        {resourceLayerCatalog
          .filter(
            (layer): layer is ResourceMapLayerDescriptor =>
              layer.delivery === "map-export",
          )
          .map((layer) => (
            <ResourceArcGISMapLayer
              key={layer.id}
            layer={layer}
            visible={resourceLayers[layer.id]}
            onStatusChange={reportLayerStatus}
            renderMode={renderMode}
            />
          ))}
        {environmentalHealthLayerCatalog.map((layer) => (
          <ResourceArcGISMapLayer
            key={layer.id}
            layer={layer}
            visible={environmentalHealthLayers[layer.id]}
            onStatusChange={reportLayerStatus}
            renderMode={renderMode}
          />
        ))}
        {floodHazardLayerCatalog.map((layer) => (
          <ResourceArcGISMapLayer
            key={layer.id}
            layer={layer}
            visible={floodHazardLayers[layer.id]}
            onStatusChange={reportLayerStatus}
            renderMode={renderMode}
          />
        ))}
        {liveConditionsLayerCatalog
          .filter(
            (layer): layer is WeatherRadarLayerDescriptor =>
              layer.delivery === "wms-raster",
          )
          .map((layer) => (
            <WeatherRadarLayer
              key={layer.id}
              layer={layer}
              visible={liveConditionsLayers[layer.id]}
              onStatusChange={reportLayerStatus}
              renderMode={renderMode}
            />
          ))}
        <Pane
          name={OLD_GROWTH_POLICY_PANE}
          pane="tilePane"
          style={{ zIndex: OLD_GROWTH_POLICY_PANE_Z_INDEX }}
        >
          {forestryLayerCatalog.map((layer) => (
            <OldGrowthPolicyLayer
              key={layer.id}
              layer={layer}
              visible={forestryLayers[layer.id]}
              onStatusChange={reportLayerStatus}
              renderMode={renderMode}
            />
          ))}
        </Pane>
        <Pane name={ZONING_PANE} style={{ zIndex: ZONING_PANE_Z_INDEX }}>
          {zoningLayerCatalog.map((layer) => (
            <ZoningLayer
              key={layer.id}
              layer={layer}
              visible={zoningLayers[layer.id]}
              onStatusChange={reportLayerStatus}
              renderMode={renderMode}
            />
          ))}
        </Pane>
        <Pane name={WELL_LOG_PANE} style={{ zIndex: WELL_LOG_PANE_Z_INDEX }}>
          {wellLogLayerCatalog.map((layer) => (
            <WellLogLayer
              key={layer.id}
              layer={layer}
              visible={wellLogLayers[layer.id]}
              accuracyFilter={wellLogAccuracyFilter}
              onStatusChange={reportLayerStatus}
              renderMode={renderMode}
            />
          ))}
        </Pane>
        <Pane
          name={TRAFFIC_CAMERA_PANE}
          style={{ zIndex: TRAFFIC_CAMERA_PANE_Z_INDEX }}
        >
          {liveConditionsLayerCatalog
            .filter(
              (layer): layer is TrafficCameraLayerDescriptor =>
                layer.delivery === "bundled-points-live-images",
            )
            .map((layer) => (
              <TrafficCameraLayer
                key={layer.id}
                layer={layer}
                visible={liveConditionsLayers[layer.id]}
                onStatusChange={reportLayerStatus}
                renderMode={renderMode}
              />
            ))}
        </Pane>
        <Pane
          name={MINERAL_PROXIMITY_PANE}
          style={{ zIndex: MINERAL_PROXIMITY_PANE_Z_INDEX }}
        >
          <MineralProximityParcelLayer
            visible={resourceLayers["mineral-proximity-parcels"]}
            onSelectPid={guardedSelectPid}
            onStatusChange={reportMineralProximityStatus}
            renderMode={renderMode}
          />
        </Pane>
        <Pane
          name={ESTABLISHED_PARCEL_PANE}
          style={{ zIndex: ESTABLISHED_PARCEL_PANE_Z_INDEX }}
        >
          <ParcelGeometryOverlay
            collection={visibleParcels}
            selectedPid={selectedPid}
            showTaxSale={showTaxSale}
            showHistoricalTaxSales={showHistoricalTaxSales}
            style={parcelStyle}
            onSelectPid={guardedSelectPid}
            renderMode={renderMode}
          />
          <TaxSaleOverviewMarkers
            parcels={parcels}
            taxSalePids={taxSalePids}
            historicalTaxSalePids={historicalTaxSalePids}
            showTaxSale={showTaxSale}
            showHistoricalTaxSales={showHistoricalTaxSales}
            selectedPid={selectedPid}
            onSelectPid={guardedSelectPid}
            renderMode={renderMode}
          />
         </Pane>
        {hydroPilotLayerCatalog.map((layer) => (
          <HydroPilotLayer
            key={layer.id}
            visible={hydroPilotLayers[layer.id]}
            onStatusChange={reportLayerStatus}
            renderMode={renderMode}
          />
        ))}
        {resourceLayerCatalog
          .filter(
            (layer): layer is ResourceFeatureLayerDescriptor =>
              layer.delivery === "feature-query",
          )
          .map((layer) => (
            <ArcGISFeatureLayer
              key={layer.id}
              layer={layer}
              visible={resourceLayers[layer.id]}
              onStatusChange={reportLayerStatus}
              renderMode={renderMode}
            />
          ))}
        {!isPrintMode && live.fix ? (
          <>
            <Circle
              center={[live.fix.latitude, live.fix.longitude]}
              radius={Math.max(live.fix.accuracyM, 12)}
              interactive={false}
              pathOptions={{
                color: "#2f80ed",
                fillColor: "#2f80ed",
                // A lost signal dims the marker in place: the last fix stays
                // visible but no longer claims to be current.
                opacity: live.status === "signal-lost" ? 0.45 : 1,
                fillOpacity: live.status === "signal-lost" ? 0.08 : 0.18,
                weight: 2,
              }}
            />
            <CircleMarker
              center={[live.fix.latitude, live.fix.longitude]}
              radius={8}
              interactive={false}
              pathOptions={{
                color: "#ffffff",
                fillColor: "#2f80ed",
                opacity: live.status === "signal-lost" ? 0.6 : 1,
                fillOpacity: live.status === "signal-lost" ? 0.5 : 1,
                weight: 3,
              }}
            />
            {live.fix.headingDeg !== null && (live.fix.speedMps ?? 0) > 0.5 ? (
              <Marker
                position={[live.fix.latitude, live.fix.longitude]}
                icon={headingDivIcon(live.fix.headingDeg)}
                interactive={false}
                keyboard={false}
              />
            ) : null}
          </>
        ) : null}
        {!isPrintMode && recording.status !== "idle"
          ? recording.liveSegments
              .filter((segment) => segment.length >= 2)
              .map((segment, index) => (
                <Polyline
                  // Index keys are safe here: segments only ever append.
                  key={index}
                  positions={segment}
                  interactive={false}
                  pathOptions={{
                    color: "#2f80ed",
                    weight: 3,
                    dashArray: "6 8",
                    opacity: 0.9,
                  }}
                />
              ))
          : null}
        {isPrintMode ? <PrintBoundsController bounds={fitBounds} /> : <>
          <InitialTaxSaleBoundsController
            parcels={parcels}
            taxSalePids={taxSalePids}
            showTaxSale={showTaxSale}
            preserveInitialPosition={preserveInitialPosition}
          />
          <InitialHistoricalBoundsController
            parcels={parcels}
            historicalTaxSalePids={historicalTaxSalePids}
            showHistoricalTaxSales={showHistoricalTaxSales}
            preserveInitialPosition={preserveInitialPosition}
          />
          <LayerZoomController
            provinceLayers={provinceLayers}
            hydroPilotLayers={hydroPilotLayers}
          />
          <ParcelFocusController
            parcels={visibleParcels}
            focusRequest={focusRequest}
          />
          <ParcelIdentifyController
            // A click during georeferencing places a control point; letting
            // it also open the parcel inspector would fight the user for the
            // same gesture. Same reasoning as the measure tool above — and
            // the same again for an edit session, whose drawing clicks used
            // to ALSO fire an identify 250 ms later.
            enabled={
              provinceLayers.nsprd &&
              !measuring &&
              !georeference &&
              !userVectorEdit
            }
            onIdentifyParcel={onIdentifyParcel}
          />
          {/* Unmounted for the duration of a session, not merely forced to
              mode "off". MeasureCapture subscribes to map `click` and to
              window `keydown` for Escape, so leaving it mounted means every
              click during a session appends a measurement vertex AND places a
              control-point half, and one Escape both clears the measurement
              and closes the panel. Unmounting rather than passing "off" also
              takes the `.measure-control` buttons away: at `left: 12px` they
              sit BEHIND the 45vw panel on a wide screen — so the user cannot
              switch measuring off without closing the georeferencer first —
              and they are fully exposed on the narrow Map tab, where the panel
              is display:none, so a still-rendered-but-inert control would read
              as a dead button. `measureMode` itself is left alone, so the
              user's tool choice survives the session. */}
          {georeference ? null : (
            <MeasureTool mode={measureMode} onModeChange={setMeasureMode} />
          )}
        </>}
        <MapPositionController
          onPositionChange={onPositionChange}
          onViewportChange={onViewportChange}
          printableViewportGuard={printableViewportGuard}
        />
      </MapContainer>

      {!isPrintMode ? <>
      <button
        className="location-button"
        type="button"
        aria-label="Use my location"
        aria-pressed={locationOn}
        onClick={toggleLocation}
      >
        <LocationControlIcon />
      </button>
      {locationOn ? (
        <div className="location-cluster">
          {onMarkLocation ? (
            <button
              type="button"
              className="location-cluster-button"
              aria-label="Mark my location"
              disabled={marking}
              onClick={() => void handleMark()}
            >
              <MarkLocationIcon />
            </button>
          ) : null}
          {onSaveTrack &&
          recording.status === "idle" &&
          !stopResult &&
          !unsavedTrack ? (
            <button
              type="button"
              className="location-cluster-button"
              aria-label="Record a track"
              // Held until this device has said what it is already holding: a
              // walk it has not been asked about lives under the same key the
              // first write of a new recording would take.
              disabled={recording.restore === "pending"}
              onClick={startRecording}
            >
              <RecordTrackIcon />
            </button>
          ) : null}
          {!followOn ? (
            <button
              type="button"
              className="location-follow"
              onClick={followRecentre}
            >
              Follow
            </button>
          ) : null}
          <small className="location-privacy">
            Location stays on this device.
          </small>
        </div>
      ) : null}
      {recording.status !== "idle" ? (
        <div className="location-hud" role="status">
          <div className="location-hud-stats">
            <span
              className={`location-hud-quality location-hud-quality-${fixQuality}`}
              aria-hidden="true"
            />
            <span>{formatElapsed(recording.stats.elapsedMs)}</span>
            <span>{formatDistance(recording.stats.distanceM)}</span>
            <span>
              {recording.stats.keptVertexCount.toLocaleString("en-CA")} pts
            </span>
          </div>
          {recording.status === "paused" ? (
            <small>Paused — the gap will not be connected.</small>
          ) : null}
          {recording.wakeLockSupported === false ? (
            <small>Keep your screen on — this browser can't hold it awake.</small>
          ) : null}
          {recording.draftError === "quota" ? (
            <small>
              Storage is full — this recording isn't being kept as you go. A
              reload would lose it.
            </small>
          ) : recording.draftError ? (
            <small>
              This browser isn't keeping this recording as you go. A reload
              would lose it.
            </small>
          ) : null}
          <div className="location-hud-actions">
            {recording.status === "recording" ? (
              <button type="button" onClick={recording.pause}>
                Pause
              </button>
            ) : (
              <button type="button" onClick={recording.resume}>
                Resume
              </button>
            )}
            <button type="button" onClick={stopRecording}>
              Stop
            </button>
          </div>
        </div>
      ) : null}
      {onSaveTrack && unsavedTrack && !stopResult && recording.status === "idle" ? (
        <div className="location-hud" role="status">
          <small>A track recording is waiting to be saved.</small>
          <div className="location-hud-actions">
            <button
              type="button"
              onClick={() => setStopResult(unsavedTrack.result)}
            >
              Recover unsaved track
            </button>
          </div>
        </div>
      ) : null}
      {onSaveTrack &&
      recording.restore === "unreadable" &&
      !unsavedTrack &&
      !stopResult &&
      recording.status === "idle" ? (
        <div className="location-hud" role="status">
          <small>
            This browser couldn't read what's stored here, so a recording may
            still be on this device. Starting a new one replaces it.
          </small>
        </div>
      ) : null}
      {recording.clearError ? (
        <div className="location-hud" role="status">
          <small>
            This device still has a copy of that recording — it wouldn't be
            deleted, so it may be offered again after a reload.
          </small>
          <div className="location-hud-actions">
            <button type="button" onClick={recording.retryClear}>
              Delete it
            </button>
          </div>
        </div>
      ) : null}
      {stopResult ? (
        <SaveTrackDialog
          result={stopResult}
          recovered={recoveredDraft}
          initialName={retryOfRefusedSave?.name}
          initialToleranceM={retryOfRefusedSave?.toleranceM}
          saving={savingTrack}
          onSave={(name, toleranceM) => void handleSaveTrack(name, toleranceM)}
          onDiscard={() => {
            recording.clearUnsaved();
            setRefusedSave(null);
            setStopResult(null);
          }}
        />
      ) : null}
      {showModernMap && modernMapFailed ? (
        <div className="modern-map-error" role="status">
          <span>Modern map did not load.</span>
          <button
            type="button"
            onClick={() => {
              setModernMapFailed(false);
              setModernMapRetry((current) => current + 1);
            }}
          >
            Retry
          </button>
        </div>
      ) : null}
      <p className="location-message" role="status" aria-live="polite">
        {locationMessage}
      </p>
      </> : null}
    </div>
  );
}
