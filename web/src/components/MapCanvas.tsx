import { useEffect, useMemo, useRef, useState } from "react";
import L, { type Map as LeafletMap, type PathOptions } from "leaflet";
import {
  Circle,
  CircleMarker,
  GeoJSON,
  MapContainer,
  TileLayer,
  useMap,
  useMapEvents,
} from "react-leaflet";
import { ArcGISExportTileLayer } from "../layers/arcGISExport";
import {
  PROPERTY_BOUNDARY_MIN_ZOOM,
  provinceLayerCatalog,
  resourceLayerCatalog,
  type ProvinceLayerId,
  type ResourceFeatureLayerDescriptor,
  type ResourceLayerId,
  type ResourceMapLayerDescriptor,
  type WebLayerDescriptor,
} from "../layers/layerCatalog";
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
  OPAQUE_SELECTED_PARCEL_ZOOM,
  parcelStyleForFeature,
} from "./parcelStyle";

type MapCanvasProps = {
  parcels: NsprdFeatureCollection;
  taxSalePids: Set<string>;
  historicalTaxSalePids: Set<string>;
  selectedPid: string | null;
  provinceLayers: Record<ProvinceLayerId, boolean>;
  resourceLayers: Record<ResourceLayerId, boolean>;
  showModernMap: boolean;
  showTaxSale: boolean;
  showHistoricalTaxSales: boolean;
  onSelectPid: (pid: string) => void;
  onIdentifyParcel: (latitude: number, longitude: number) => void;
  onResourceLayerStatusChange?: (
    id: ResourceLayerId,
    status: ResourceLayerStatus,
  ) => void;
};

export type ResourceLayerStatus =
  | { status: "idle" | "loading" | "error" }
  | { status: "zoom"; minZoom: number }
  | { status: "ready"; count: number };

const CAPE_BRETON_CENTER: [number, number] = [46.08, -60.92];
const WATERFALL_DISCOVERY_BOUNDS: L.LatLngBoundsExpression = [
  [43.55300536047742, -66.00233221945133],
  [46.83835988450765, -60.35435480050904],
];
const layerZIndexes: Record<ProvinceLayerId, number> = {
  "ns-aerial": 150,
  "crown-lands": 220,
  "flood-risk": 230,
  nsprd: 240,
  waterfalls: 250,
  "water-features": 210,
  roads: 235,
};

function ArcGISMapLayer({
  layer,
  visible,
}: {
  layer: WebLayerDescriptor & { id: ProvinceLayerId };
  visible: boolean;
}) {
  const map = useMap();

  useEffect(() => {
    if (!visible || !layer.exportOptions) {
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
        zIndex: layerZIndexes[layer.id],
        maxNativeZoom: layer.id === "ns-aerial" ? 19 : undefined,
        updateWhenZooming: false,
        keepBuffer: 2,
      },
    );
    tileLayer.addTo(map);

    return () => {
      map.removeLayer(tileLayer);
    };
  }, [layer, map, visible]);

  return null;
}

function ResourceArcGISMapLayer({
  layer,
  visible,
}: {
  layer: ResourceMapLayerDescriptor;
  visible: boolean;
}) {
  const map = useMap();

  useEffect(() => {
    if (!visible) {
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
    tileLayer.addTo(map);

    return () => {
      map.removeLayer(tileLayer);
    };
  }, [layer, map, visible]);

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
  onStatusChange?: MapCanvasProps["onResourceLayerStatusChange"];
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

function LayerZoomController({
  provinceLayers,
}: Pick<MapCanvasProps, "provinceLayers">) {
  const map = useMap();
  const waterfallsWereVisible = useRef(false);

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

    const needsDetailZoom = provinceLayerCatalog.some(
      ({ id, minZoom }) => provinceLayers[id] && minZoom >= 12,
    );

    if (needsDetailZoom && map.getZoom() < 12) {
      map.setZoom(12, { animate: true });
    }
  }, [map, provinceLayers]);

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

export function MapCanvas({
  parcels,
  taxSalePids,
  historicalTaxSalePids,
  selectedPid,
  provinceLayers,
  resourceLayers,
  showModernMap,
  showTaxSale,
  showHistoricalTaxSales,
  onSelectPid,
  onIdentifyParcel,
  onResourceLayerStatusChange,
}: MapCanvasProps) {
  const [map, setMap] = useState<LeafletMap | null>(null);
  const [mapZoom, setMapZoom] = useState(9);
  const [userLocation, setUserLocation] = useState<BrowserLocation | null>(null);
  const [locationMessage, setLocationMessage] = useState<string | null>(null);

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
        setLocationMessage("Your location is shown on the map.");
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
        center={CAPE_BRETON_CENTER}
        zoom={9}
        minZoom={7}
        maxZoom={23}
        zoomControl
        attributionControl={false}
        ref={setMap}
      >
        {showModernMap ? (
          <TileLayer
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            maxZoom={23}
            maxNativeZoom={19}
            zIndex={100}
          />
        ) : null}
        {provinceLayerCatalog.map((layer) => (
          <ArcGISMapLayer
            key={layer.id}
            layer={layer}
            visible={provinceLayers[layer.id]}
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
            />
          ))}
        <GeoJSON
          key={`${visibleParcels.features.length}:${selectedPid ?? "none"}:${showTaxSale}:${showHistoricalTaxSales}:${mapZoom >= OPAQUE_SELECTED_PARCEL_ZOOM}`}
          data={visibleParcels}
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
              onStatusChange={onResourceLayerStatusChange}
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
        <LayerZoomController provinceLayers={provinceLayers} />
        <ParcelIdentifyController
          enabled={provinceLayers.nsprd}
          onIdentifyParcel={onIdentifyParcel}
        />
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
