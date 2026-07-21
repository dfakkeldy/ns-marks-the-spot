import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import L, { type Map as LeafletMap, type PathOptions } from "leaflet";
import {
  Circle,
  CircleMarker,
  GeoJSON,
  MapContainer,
  Pane,
  TileLayer,
  useMap,
  useMapEvents,
} from "react-leaflet";
import { ArcGISExportTileLayer } from "../layers/arcGISExport";
import {
  hydroPilotLayerCatalog,
  PROPERTY_BOUNDARY_MIN_ZOOM,
  allResourceLayerCatalog,
  provinceLayerCatalog,
  resourceLayerCatalog,
  type HydroPilotLayerId,
  type ProvinceLayerId,
  type ResourceFeatureLayerDescriptor,
  type ResourceLayerId,
  type ResourceMapLayerDescriptor,
  type WebLayerDescriptor,
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
} from "../services/hydroPotential";
import {
  DEFAULT_MAP_POSITION,
  type MapPosition,
} from "../services/mapShareState";
import {
  OPAQUE_SELECTED_PARCEL_ZOOM,
  parcelStyleForFeature,
} from "./parcelStyle";
import { MineralProximityParcelLayer } from "./MineralProximityParcelLayer";
import {
  ESTABLISHED_PARCEL_PANE,
  ESTABLISHED_PARCEL_PANE_Z_INDEX,
  MINERAL_PROXIMITY_PANE,
  MINERAL_PROXIMITY_PANE_Z_INDEX,
  PROVINCE_LAYER_Z_INDEXES,
} from "./mapPanes";

type MapCanvasProps = {
  parcels: NsprdFeatureCollection;
  taxSalePids: Set<string>;
  historicalTaxSalePids: Set<string>;
  selectedPid: string | null;
  provinceLayers: Record<ProvinceLayerId, boolean>;
  resourceLayers: Record<ResourceLayerId, boolean>;
  hydroPilotLayers?: Record<HydroPilotLayerId, boolean>;
  showModernMap: boolean;
  showTaxSale: boolean;
  showHistoricalTaxSales: boolean;
  onSelectPid: (pid: string) => void;
  onIdentifyParcel: (latitude: number, longitude: number) => void;
  initialPosition?: MapPosition;
  onPositionChange?: (position: MapPosition) => void;
  onLayerStatusChange?: (
    id: MapLayerId,
    status: MapLayerStatus,
  ) => void;
  /** @deprecated Use onLayerStatusChange. Kept for embedding compatibility. */
  onResourceLayerStatusChange?: (
    id: ResourceLayerId,
    status: ResourceLayerStatus,
  ) => void;
};

export type MapLayerId =
  | "modern"
  | ProvinceLayerId
  | ResourceLayerId
  | HydroPilotLayerId;

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
const LOCATION_SUCCESS_MESSAGE = "Your location is shown on the map.";
const LOCATION_SUCCESS_MESSAGE_DURATION_MS = 4_000;
function ArcGISMapLayer({
  layer,
  visible,
  onStatusChange,
}: {
  layer: WebLayerDescriptor & { id: ProvinceLayerId };
  visible: boolean;
  onStatusChange?: MapCanvasProps["onLayerStatusChange"];
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
            },
          ),
      );
    let loadedTiles = 0;
    const reportZoom = () => {
      if (map.getZoom() < layer.minZoom) {
        onStatusChange?.(layer.id, { status: "zoom", minZoom: layer.minZoom });
      }
    };
    map.on("zoomend", reportZoom);
    reportZoom();
    tileLayers.forEach((tileLayer) => {
      tileLayer.on("loading", () =>
        onStatusChange?.(layer.id, { status: "loading" }),
      );
      tileLayer.on("tileload", () => {
        loadedTiles += 1;
      });
      tileLayer.on("load", () =>
        onStatusChange?.(layer.id, { status: "ready", count: loadedTiles }),
      );
      tileLayer.on("tileerror", () =>
        onStatusChange?.(layer.id, { status: "error" }),
      );
      tileLayer.addTo(map);
    });

    return () => {
      map.off("zoomend", reportZoom);
      tileLayers.forEach((tileLayer) => map.removeLayer(tileLayer));
    };
  }, [layer, map, onStatusChange, visible]);

  return null;
}

function ResourceArcGISMapLayer({
  layer,
  visible,
  onStatusChange,
}: {
  layer: ResourceMapLayerDescriptor;
  visible: boolean;
  onStatusChange?: MapCanvasProps["onLayerStatusChange"];
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
        zIndex: 225,
        updateWhenZooming: false,
        keepBuffer: 2,
      },
    );
    let loadedTiles = 0;
    const reportZoom = () => {
      if (map.getZoom() < layer.minZoom) {
        onStatusChange?.(layer.id, { status: "zoom", minZoom: layer.minZoom });
      }
    };
    tileLayer.on("loading", () => onStatusChange?.(layer.id, { status: "loading" }));
    tileLayer.on("tileload", () => {
      loadedTiles += 1;
    });
    tileLayer.on("load", () =>
      onStatusChange?.(layer.id, { status: "ready", count: loadedTiles }),
    );
    tileLayer.on("tileerror", () => onStatusChange?.(layer.id, { status: "error" }));
    map.on("zoomend", reportZoom);
    reportZoom();
    tileLayer.addTo(map);

    return () => {
      map.off("zoomend", reportZoom);
      map.removeLayer(tileLayer);
    };
  }, [layer, map, onStatusChange, visible]);

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
}: {
  layer: ResourceFeatureLayerDescriptor;
  visible: boolean;
  onStatusChange?: MapCanvasProps["onLayerStatusChange"];
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
          color: "#ffffff",
          fillColor: layer.markerColor,
          fillOpacity: layer.opacity,
          weight: 1.5,
        })
      }
      onEachFeature={(feature, featureLayer) => {
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

function HydroPilotLayer({
  visible,
  onStatusChange,
}: {
  visible: boolean;
  onStatusChange?: MapCanvasProps["onLayerStatusChange"];
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
        return hydroLineStyle(properties);
      }}
      onEachFeature={(feature, featureLayer) => {
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
          ? `<div><dt>Bounded drop</dt><dd>No 10 m drop within 10 km</dd></div>`
          : `
              <div><dt>Selected drop</dt><dd>${properties.dropThresholdMetres.toLocaleString("en-CA")} m</dd></div>
              <div><dt>Downstream route</dt><dd>${properties.downstreamRouteLengthKm!.toLocaleString("en-CA")} km</dd></div>
              <div><dt>Average mapped fall</dt><dd>${properties.averageMappedFallMetresPerKm!.toLocaleString("en-CA")} m/km</dd></div>
            `;
        featureLayer.bindPopup(`
          <article class="hydro-potential-popup">
            <p class="hydro-popup-eyebrow">Inverness point-screen pilot</p>
            <h3>${properties.watershedName}</h3>
            <dl>
              <div><dt>Modeled upstream area</dt><dd>${properties.upstreamAreaKm2.toLocaleString("en-CA")} km²</dd></div>
              ${dropRows}
              <div><dt>Relative potential</dt><dd><strong>${potentialLabel}</strong></dd></div>
            </dl>
            <p>Area changes at routed ${properties.catchmentResolution} catchment outlets; it is not exact at an arbitrary point. Potential is relative among qualifying reaches. Terrain screening only—not measured flow, channel width, hydraulic head, power, access, rights, or approval.</p>
          </article>
        `);
      }}
    />
  );
}

function MapPositionController({
  onPositionChange,
}: Pick<MapCanvasProps, "onPositionChange">) {
  const map = useMap();

  useEffect(() => {
    if (!onPositionChange) {
      return;
    }
    const reportPosition = () => {
      const center = map.getCenter();
      onPositionChange?.({
        latitude: center.lat,
        longitude: center.lng,
        zoom: map.getZoom(),
      });
    };
    reportPosition();
    map.on("moveend", reportPosition);
    map.on("zoomend", reportPosition);
    return () => {
      map.off("moveend", reportPosition);
      map.off("zoomend", reportPosition);
    };
  }, [map, onPositionChange]);

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

    const needsDetailZoom = provinceLayerCatalog.some(
      ({ id, minZoom }) => provinceLayers[id] && minZoom >= 12,
    );

    if (needsDetailZoom && map.getZoom() < 12) {
      map.setZoom(12, { animate: true });
    }
  }, [hydroPilotLayers, map, provinceLayers]);

  return null;
}

function SelectionController({
  parcels,
  selectedPid,
}: Pick<MapCanvasProps, "parcels" | "selectedPid">) {
  const map = useMap();

  useEffect(() => {
    if (!selectedPid) {
      return;
    }

    const selectedFeatures = parcels.features.filter(
      ({ properties }) => properties.PID === selectedPid,
    );

    if (selectedFeatures.length === 0) {
      return;
    }

    const selectedCollection: GeoJSON.FeatureCollection<
      GeoJSON.Geometry,
      NsprdFeatureProperties
    > = {
      type: "FeatureCollection",
      features: selectedFeatures,
    };
    const bounds = L.geoJSON(selectedCollection).getBounds();

    if (bounds.isValid()) {
      map.fitBounds(bounds, { padding: [64, 64], maxZoom: 16 });
    }
  }, [map, parcels, selectedPid]);

  return null;
}

function InitialTaxSaleBoundsController({
  parcels,
  taxSalePids,
  showTaxSale,
}: Pick<MapCanvasProps, "parcels" | "taxSalePids" | "showTaxSale">) {
  const map = useMap();
  const hasFittedInitialTaxSaleLayer = useRef(false);

  useEffect(() => {
    if (hasFittedInitialTaxSaleLayer.current || !showTaxSale) {
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
  }, [map, parcels, showTaxSale, taxSalePids]);

  return null;
}

function InitialHistoricalBoundsController({
  parcels,
  historicalTaxSalePids,
  showHistoricalTaxSales,
}: Pick<
  MapCanvasProps,
  "parcels" | "historicalTaxSalePids" | "showHistoricalTaxSales"
>) {
  const map = useMap();
  const hasFittedHistoricalLayer = useRef(false);

  useEffect(() => {
    if (hasFittedHistoricalLayer.current || !showHistoricalTaxSales) {
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
  }, [historicalTaxSalePids, map, parcels, showHistoricalTaxSales]);

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

  useMapEvents({
    click: ({ latlng }) => {
      if (enabled && map.getZoom() >= PROPERTY_BOUNDARY_MIN_ZOOM) {
        onIdentifyParcel(latlng.lat, latlng.lng);
      }
    },
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

export function MapCanvas({
  parcels,
  taxSalePids,
  historicalTaxSalePids,
  selectedPid,
  provinceLayers,
  resourceLayers,
  hydroPilotLayers = HIDDEN_HYDRO_PILOT_LAYERS,
  showModernMap,
  showTaxSale,
  showHistoricalTaxSales,
  onSelectPid,
  onIdentifyParcel,
  initialPosition = DEFAULT_MAP_POSITION,
  onPositionChange,
  onLayerStatusChange,
  onResourceLayerStatusChange,
}: MapCanvasProps) {
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
  const [map, setMap] = useState<LeafletMap | null>(null);
  const [mapZoom, setMapZoom] = useState(initialPosition.zoom);
  const [userLocation, setUserLocation] = useState<BrowserLocation | null>(null);
  const [locationMessage, setLocationMessage] = useState<string | null>(null);

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

  useEffect(() => {
    if (!map) {
      return;
    }

    const updateMapZoom = () => setMapZoom(map.getZoom());
    updateMapZoom();
    map.on("zoomend", updateMapZoom);

    return () => {
      map.off("zoomend", updateMapZoom);
    };
  }, [map]);

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
      zoom: mapZoom,
    });

  const requestLocation = () => {
    setLocationMessage("Finding your location…");
    getBrowserLocation()
      .then((location) => {
        setUserLocation(location);
        setLocationMessage(LOCATION_SUCCESS_MESSAGE);
        map?.flyTo([location.latitude, location.longitude], 14);
      })
      .catch(() => {
        setLocationMessage(
          "Location permission was not granted. You can keep using the map.",
        );
      });
  };

  return (
    <div className="map-canvas" aria-label="Nova Scotia municipal parcel map">
      <MapContainer
        center={[initialPosition.latitude, initialPosition.longitude]}
        zoom={initialPosition.zoom}
        minZoom={7}
        maxZoom={23}
        zoomControl
        attributionControl={false}
        ref={setMap}
      >
        <MapSizeController />
        {showModernMap ? (
          <TileLayer
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            maxZoom={23}
            maxNativeZoom={19}
            zIndex={100}
            eventHandlers={{
              loading: () => reportLayerStatus?.("modern", { status: "loading" }),
              load: () => reportLayerStatus?.("modern", { status: "ready" }),
              tileerror: () => reportLayerStatus?.("modern", { status: "error" }),
            }}
          />
        ) : (
          <MapStatusController id="modern" visible={false} onStatusChange={reportLayerStatus} />
        )}
        {provinceLayerCatalog.map((layer) => (
          <ArcGISMapLayer
            key={layer.id}
            layer={layer}
            visible={provinceLayers[layer.id]}
            onStatusChange={reportLayerStatus}
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
            />
          ))}
        <Pane
          name={MINERAL_PROXIMITY_PANE}
          style={{ zIndex: MINERAL_PROXIMITY_PANE_Z_INDEX }}
        >
          <MineralProximityParcelLayer
            visible={resourceLayers["mineral-proximity-parcels"]}
            onSelectPid={onSelectPid}
            onStatusChange={reportMineralProximityStatus}
          />
        </Pane>
        <Pane
          name={ESTABLISHED_PARCEL_PANE}
          style={{ zIndex: ESTABLISHED_PARCEL_PANE_Z_INDEX }}
        >
          <GeoJSON
            key={`${visibleParcels.features.length}:${selectedPid ?? "none"}:${showTaxSale}:${showHistoricalTaxSales}:${mapZoom >= OPAQUE_SELECTED_PARCEL_ZOOM}`}
            data={visibleParcels}
            pane={ESTABLISHED_PARCEL_PANE}
            style={parcelStyle}
            onEachFeature={(feature, layer) => {
              const pid = (feature.properties as NsprdFeatureProperties).PID;
              layer.on("click", (event) => {
                L.DomEvent.stopPropagation(event.originalEvent);
                onSelectPid(pid);
              });
              layer.bindTooltip(`PID ${pid}`, { sticky: true });
            }}
           />
         </Pane>
        {hydroPilotLayerCatalog.map((layer) => (
          <HydroPilotLayer
            key={layer.id}
            visible={hydroPilotLayers[layer.id]}
            onStatusChange={reportLayerStatus}
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
            />
          ))}
        {userLocation ? (
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
        <SelectionController parcels={visibleParcels} selectedPid={selectedPid} />
        <InitialTaxSaleBoundsController
          parcels={parcels}
          taxSalePids={taxSalePids}
          showTaxSale={showTaxSale}
        />
        <InitialHistoricalBoundsController
          parcels={parcels}
          historicalTaxSalePids={historicalTaxSalePids}
          showHistoricalTaxSales={showHistoricalTaxSales}
        />
        <LayerZoomController
          provinceLayers={provinceLayers}
          hydroPilotLayers={hydroPilotLayers}
        />
        <ParcelIdentifyController
          enabled={provinceLayers.nsprd}
          onIdentifyParcel={onIdentifyParcel}
        />
        <MapPositionController onPositionChange={onPositionChange} />
      </MapContainer>

      <button
        className="location-button"
        type="button"
        aria-label="Use my location"
        aria-pressed={userLocation !== null}
        onClick={requestLocation}
      >
        <span aria-hidden="true">⌖</span>
      </button>
      <p className="location-message" role="status" aria-live="polite">
        {locationMessage}
      </p>
    </div>
  );
}
