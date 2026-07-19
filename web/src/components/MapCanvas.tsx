import { useEffect, useMemo, useState } from "react";
import L, { type Map as LeafletMap, type PathOptions } from "leaflet";
import { GeoJSON, MapContainer, TileLayer, useMap } from "react-leaflet";
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
  showParcelOutlines: boolean;
  showTaxSale: boolean;
  onSelectPid: (pid: string) => void;
};

const INVERNESS_COUNTY_CENTER: [number, number] = [46.18, -61.22];

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
  showParcelOutlines,
  showTaxSale,
  onSelectPid,
}: MapCanvasProps) {
  const [map, setMap] = useState<LeafletMap | null>(null);
  const [userLocation, setUserLocation] = useState<BrowserLocation | null>(null);
  const [locationMessage, setLocationMessage] = useState<string | null>(null);

  const visibleParcels = useMemo<NsprdFeatureCollection>(() => {
    if (showParcelOutlines) {
      return parcels;
    }

    return {
      ...parcels,
      features: showTaxSale
        ? parcels.features.filter(({ properties }) =>
            taxSalePids.has(properties.PID),
          )
        : [],
    };
  }, [parcels, showParcelOutlines, showTaxSale, taxSalePids]);

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
    <div className="map-canvas" aria-label="Inverness County parcel map">
      <MapContainer
        center={INVERNESS_COUNTY_CENTER}
        zoom={9}
        minZoom={7}
        maxZoom={19}
        zoomControl
        attributionControl={false}
        ref={setMap}
      >
        <TileLayer
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          maxZoom={19}
        />
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
