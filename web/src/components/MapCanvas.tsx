import {
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
  Pane,
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
  provinceLayerCatalog,
  resourceLayerCatalog,
  wellLogLayerCatalog,
  type HydroPilotLayerId,
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
import {
  getBrowserLocation,
  type BrowserLocation,
} from "../services/browserLocation";
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
import {
  ENVIRONMENTAL_HEALTH_LAYER_Z_INDEX,
  ESTABLISHED_PARCEL_PANE,
  ESTABLISHED_PARCEL_PANE_Z_INDEX,
  MINERAL_PROXIMITY_PANE,
  MINERAL_PROXIMITY_PANE_Z_INDEX,
  OLD_GROWTH_POLICY_PANE,
  OLD_GROWTH_POLICY_PANE_Z_INDEX,
  PROVINCE_LAYER_Z_INDEXES,
  ZONING_PANE,
  ZONING_PANE_Z_INDEX,
  WELL_LOG_PANE,
  WELL_LOG_PANE_Z_INDEX,
} from "./mapPanes";
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
import type {
  UserVectorFitRequest,
  VisibleUserVectorLayer,
} from "../userMaps/vector/useUserVectorLayers";

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
  wellLogAccuracyFilter?: WellLogAccuracyFilter;
  fletcherVisible?: boolean;
  fletcherOpacity?: number;
  fletcherTileBaseUrl?: string | null;
  fletcherRetryToken?: number;
  userMaps?: VisibleUserMap[];
  userMapFitRequest?: UserMapFitRequest | null;
  userVectorLayers?: VisibleUserVectorLayer[];
  userVectorFitRequest?: UserVectorFitRequest | null;
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
  | WellLogLayerId;

export type MapLayerStatus =
  | { status: "idle" | "loading" | "error" }
  | { status: "zoom"; minZoom: number }
  | { status: "ready"; count?: number };

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
// Stable reference: a fresh `[]` default would be a new array identity every
// render, churning the UserMapLayers bridge (and its layer-construction
// effects) on every unrelated MapCanvas re-render.
const EMPTY_USER_MAPS: VisibleUserMap[] = [];
const EMPTY_USER_VECTOR_LAYERS: VisibleUserVectorLayer[] = [];
const LOCATION_SUCCESS_MESSAGE = "Your location is shown on the map.";
const LOCATION_SUCCESS_MESSAGE_DURATION_MS = 4_000;

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
              maxNativeZoom: layer.id === "ns-aerial" ? 19 : undefined,
              updateWhenZooming: false,
              keepBuffer: 2,
              className:
                renderMode === "print" ? `print-layer-${layer.id}` : undefined,
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
    map.on("moveend", loadVisibleFeatures);
    map.on("zoomend", loadVisibleFeatures);

    return () => {
      requestNumber += 1;
      controller?.abort();
      map.off("moveend", loadVisibleFeatures);
      map.off("zoomend", loadVisibleFeatures);
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
          resourceFeatureLabel(
            layer.id,
            (feature.properties ?? {}) as Record<string, unknown>,
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
    map.on("moveend", loadVisibleWells);
    map.on("zoomend", loadVisibleWells);

    return () => {
      requestNumber += 1;
      controller?.abort();
      map.off("moveend", loadVisibleWells);
      map.off("zoomend", loadVisibleWells);
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
                L.DomEvent.stopPropagation(event.originalEvent);
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
          L.DomEvent.stopPropagation(event.originalEvent);
        });
        featureLayer.bindTooltip(
          `${properties.watershedName} · ${properties.upstreamAreaKm2.toLocaleString("en-CA")} km² modeled upstream`,
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
    map.on("moveend", reportPosition);
    map.on("zoomend", reportPosition);
    return () => {
      map.off("moveend", reportPosition);
      map.off("zoomend", reportPosition);
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

  const markerStyle = (
    selected: boolean,
    color: string,
    keyPrefix: "current" | "historical",
  ): PathOptions =>
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
        };

  const marker = (
    point: { pid: string; latitude: number; longitude: number },
    keyPrefix: "current" | "historical",
    color: string,
  ) => (
    <CircleMarker
      key={`${keyPrefix}-${point.pid}`}
      center={[point.latitude, point.longitude]}
      radius={point.pid === selectedPid ? 9 : 7}
      pane={ESTABLISHED_PARCEL_PANE}
      pathOptions={markerStyle(point.pid === selectedPid, color, keyPrefix)}
      interactive={renderMode !== "print"}
      eventHandlers={
        renderMode === "print"
          ? undefined
          : {
              click: (event) => {
                L.DomEvent.stopPropagation(event.originalEvent);
                onSelectPid(point.pid);
              },
            }
      }
    />
  );

  return (
    <>
      {historicalPoints.map((point) =>
        marker(point, "historical", "#5a4385"),
      )}
      {currentPoints.map((point) => marker(point, "current", "#be4d3c"))}
    </>
  );
}

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
      key={`${collection.features.length}:${selectedPid ?? "none"}:${showTaxSale}:${showHistoricalTaxSales}`}
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
                L.DomEvent.stopPropagation(event.originalEvent);
                onSelectPid(pid);
              });
              layer.bindTooltip(`PID ${pid}`, { sticky: true });
            }
      }
    />
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
  wellLogAccuracyFilter = "surveyed",
  fletcherVisible = false,
  fletcherOpacity = 0.72,
  fletcherTileBaseUrl = null,
  fletcherRetryToken = 0,
  userMaps = EMPTY_USER_MAPS,
  userMapFitRequest = null,
  userVectorLayers = EMPTY_USER_VECTOR_LAYERS,
  userVectorFitRequest = null,
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
  onLayerStatusChange,
  onResourceLayerStatusChange,
  renderMode = "interactive",
  fitBounds,
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
  const [userLocation, setUserLocation] = useState<BrowserLocation | null>(null);
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
    if (locationMessage !== LOCATION_SUCCESS_MESSAGE) {
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

  const parcelStyle = (
    feature?: GeoJSON.Feature<GeoJSON.Geometry, NsprdFeatureProperties>,
  ): PathOptions =>
    parcelStyleForFeature(feature, {
      selectedPid,
      showTaxSale,
      taxSalePids,
      showHistoricalTaxSales,
      historicalTaxSalePids,
    }, renderMode);

  const requestLocation = () => {
    setLocationMessage("Finding your location…");
    getBrowserLocation()
      .then((location) => {
        setUserLocation(location);
        setLocationMessage(LOCATION_SUCCESS_MESSAGE);
        if (map) {
          printableViewportGuard.current.suppressBrowserLocation = true;
          printableViewportGuard.current.lastSuppressed = null;
          map.flyTo([location.latitude, location.longitude], 14);
        }
      })
      .catch(() => {
        setLocationMessage(
          "Location permission was not granted. You can keep using the map.",
        );
      });
  };

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
        <UserVectorLayers layers={userVectorLayers} fitRequest={userVectorFitRequest} />
        {georeference ? <GeoreferenceMapLayer binding={georeference} /> : null}
        {!isPrintMode ? <ScaleControl position="bottomleft" /> : null}
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
        {!isPrintMode && userLocation ? (
          <>
            <Circle
              center={[userLocation.latitude, userLocation.longitude]}
              radius={Math.max(userLocation.accuracy, 12)}
              interactive={false}
              pathOptions={{
                color: "#2f80ed",
                fillColor: "#2f80ed",
                fillOpacity: 0.18,
                weight: 2,
              }}
            />
            <CircleMarker
              center={[userLocation.latitude, userLocation.longitude]}
              radius={8}
              interactive={false}
              pathOptions={{
              color: "#ffffff",
              fillColor: "#2f80ed",
              fillOpacity: 1,
              weight: 3,
              }}
            />
          </>
        ) : null}
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
            // same gesture. Same reasoning as the measure tool above.
            enabled={provinceLayers.nsprd && !measuring && !georeference}
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
        aria-pressed={userLocation !== null}
        onClick={requestLocation}
      >
        <LocationControlIcon />
      </button>
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
