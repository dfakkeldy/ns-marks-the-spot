import { useEffect, useMemo, useRef, useState } from "react";
import L, { type Map as LeafletMap, type PathOptions } from "leaflet";
import { GeoJSON, MapContainer, TileLayer, useMap } from "react-leaflet";
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

type MapCanvasProps = {
  parcels: NsprdFeatureCollection;
  taxSalePids: Set<string>;
  selectedPid: string | null;
  provinceLayers: Record<ProvinceLayerId, boolean>;
  showModernMap: boolean;
  showTaxSale: boolean;
  onSelectPid: (pid: string) => void;
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

export function MapCanvas({
  parcels,
  taxSalePids,
  selectedPid,
  provinceLayers,
  showModernMap,
  showTaxSale,
  onSelectPid,
}: MapCanvasProps) {
  const [map, setMap] = useState<LeafletMap | null>(null);
  const [userLocation, setUserLocation] = useState<BrowserLocation | null>(null);
  const [locationMessage, setLocationMessage] = useState<string | null>(null);

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
  ): PathOptions => {
    const pid = feature?.properties.PID;
    const isSelected = pid === selectedPid;
    const isTaxSale = pid ? taxSalePids.has(pid) && showTaxSale : false;

    if (isSelected) {
      return {
        color: "#9f2f24",
        fillColor: "#be4d3c",
        fillOpacity: 0.34,
        weight: 4,
      };
    }

    if (isTaxSale) {
      return {
        color: "#be4d3c",
        fillColor: "#e7a86b",
        fillOpacity: 0.3,
        weight: 2,
      };
    }

    return {
      color: "#0a7180",
      fillColor: "#eef7f5",
      fillOpacity: 0.08,
      weight: 1.25,
    };
  };

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
        maxZoom={19}
        zoomControl
        attributionControl={false}
        ref={setMap}
      >
        {showModernMap ? (
          <TileLayer
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            maxZoom={19}
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
          key={`${visibleParcels.features.length}:${selectedPid ?? "none"}:${showTaxSale}`}
          data={visibleParcels}
          style={parcelStyle}
          onEachFeature={(feature, layer) => {
            const pid = (feature.properties as NsprdFeatureProperties).PID;
            layer.on("click", () => onSelectPid(pid));
            layer.bindTooltip(`PID ${pid}`, { sticky: true });
          }}
        />
        {userLocation ? (
          <GeoJSON
            data={L.circle(
              [userLocation.latitude, userLocation.longitude],
              Math.max(userLocation.accuracy, 12),
            ).toGeoJSON()}
            style={{
              color: "#ffffff",
              fillColor: "#2f80ed",
              fillOpacity: 0.8,
              weight: 3,
            }}
          />
        ) : null}
        <SelectionController parcels={visibleParcels} selectedPid={selectedPid} />
        <LayerZoomController provinceLayers={provinceLayers} />
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
