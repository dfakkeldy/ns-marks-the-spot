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
  provinceLayerCatalog,
  type ProvinceLayerId,
  type WebLayerDescriptor,
} from "../layers/layerCatalog";
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
  selectedPid: string | null;
  provinceLayers: Record<ProvinceLayerId, boolean>;
  showModernMap: boolean;
  showTaxSale: boolean;
  onSelectPid: (pid: string) => void;
  onIdentifyParcel: (latitude: number, longitude: number) => void;
};

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

function ParcelIdentifyController({
  enabled,
  onIdentifyParcel,
}: {
  enabled: boolean;
  onIdentifyParcel: MapCanvasProps["onIdentifyParcel"];
}) {
  useMapEvents({
    click: ({ latlng }) => {
      if (enabled) {
        onIdentifyParcel(latlng.lat, latlng.lng);
      }
    },
  });

  return null;
}

export function MapCanvas({
  parcels,
  taxSalePids,
  selectedPid,
  provinceLayers,
  showModernMap,
  showTaxSale,
  onSelectPid,
  onIdentifyParcel,
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
          (showTaxSale && taxSalePids.has(properties.PID)),
      ),
    };
  }, [parcels, selectedPid, showTaxSale, taxSalePids]);

  const parcelStyle = (
    feature?: GeoJSON.Feature<GeoJSON.Geometry, NsprdFeatureProperties>,
  ): PathOptions =>
    parcelStyleForFeature(feature, {
      selectedPid,
      showTaxSale,
      taxSalePids,
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
        <GeoJSON
          key={`${visibleParcels.features.length}:${selectedPid ?? "none"}:${showTaxSale}:${mapZoom >= OPAQUE_SELECTED_PARCEL_ZOOM}`}
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
