import { useEffect, useState } from "react";
import L, { type PathOptions } from "leaflet";
import { GeoJSON, useMap } from "react-leaflet";
import { MINERAL_PROXIMITY_MIN_ZOOM, fetchMineralProximityParcels } from "../services/mineralProximity";
import type { NsprdFeatureCollection } from "../services/nsprd";
import type { MapLayerStatus } from "./MapCanvas";
import { MINERAL_PROXIMITY_PANE } from "./mapPanes";

type MineralProximityParcelLayerProps = {
  visible: boolean;
  onSelectPid: (pid: string) => void;
  onStatusChange?: (status: MapLayerStatus) => void;
};

// eslint-disable-next-line react-refresh/only-export-components -- exported map style is part of this layer's public surface.
export const mineralProximityParcelStyle: PathOptions = {
  color: "#72520f",
  fillColor: "#f1c453",
  fillOpacity: 0.28,
  weight: 2,
  dashArray: "5 3",
};

const EMPTY_PARCELS: NsprdFeatureCollection = {
  type: "FeatureCollection",
  features: [],
};

export function MineralProximityParcelLayer({
  visible,
  onSelectPid,
  onStatusChange,
}: MineralProximityParcelLayerProps) {
  const map = useMap();
  const [collection, setCollection] =
    useState<NsprdFeatureCollection>(EMPTY_PARCELS);

  useEffect(() => {
    let controller: AbortController | null = null;
    let requestNumber = 0;

    const loadVisibleParcels = () => {
      controller?.abort();
      controller = null;
      requestNumber += 1;
      const currentRequest = requestNumber;

      if (!visible) {
        setCollection(EMPTY_PARCELS);
        onStatusChange?.({ status: "idle" });
        return;
      }

      if (map.getZoom() < MINERAL_PROXIMITY_MIN_ZOOM) {
        setCollection(EMPTY_PARCELS);
        onStatusChange?.({
          status: "zoom",
          minZoom: MINERAL_PROXIMITY_MIN_ZOOM,
        });
        return;
      }

      const bounds = map.getBounds();
      controller = new AbortController();
      onStatusChange?.({ status: "loading" });
      void fetchMineralProximityParcels(
        {
          west: bounds.getWest(),
          south: bounds.getSouth(),
          east: bounds.getEast(),
          north: bounds.getNorth(),
        },
        controller.signal,
      )
        .then((nextCollection) => {
          if (currentRequest !== requestNumber) {
            return;
          }
          setCollection(nextCollection);
          onStatusChange?.({
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
          setCollection(EMPTY_PARCELS);
          onStatusChange?.({ status: "error" });
        });
    };

    loadVisibleParcels();
    map.on("moveend", loadVisibleParcels);
    map.on("zoomend", loadVisibleParcels);

    return () => {
      requestNumber += 1;
      controller?.abort();
      map.off("moveend", loadVisibleParcels);
      map.off("zoomend", loadVisibleParcels);
    };
  }, [map, onStatusChange, visible]);

  if (!visible) {
    return null;
  }

  return (
    <GeoJSON
      key={collection.features.map(({ properties }) => properties.PID).join(",")}
      data={collection}
      pane={MINERAL_PROXIMITY_PANE}
      style={mineralProximityParcelStyle}
      onEachFeature={(feature, featureLayer) => {
        const pid = feature.properties.PID;
        featureLayer.bindTooltip(
          `PID ${pid} · within 1 km of a published mineral occurrence`,
          { sticky: true },
        );
        featureLayer.on("click", (event) => {
          L.DomEvent.stopPropagation(event.originalEvent);
          onSelectPid(pid);
        });
      }}
    />
  );
}
