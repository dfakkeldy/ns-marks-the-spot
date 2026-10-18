import { useEffect } from "react";
import L from "leaflet";
import { GeoJSON } from "react-leaflet";
import type { Feature, FeatureCollection, Point } from "geojson";
import type { TrafficCameraLayerDescriptor } from "../layers/layerCatalog";
import { highwayCameras, type HighwayCamera } from "../data/highwayCameras";
import { buildCameraPopup } from "./trafficCameraPresentation";
import { textTooltip } from "./mapTooltip";
import type { MapLayerStatus } from "./MapCanvas";
import type { MapRenderMode } from "./parcelStyle";

type CameraFeature = Feature<Point, HighwayCamera>;

const cameraFeatureCollection: FeatureCollection<Point, HighwayCamera> = {
  type: "FeatureCollection",
  features: highwayCameras.map(
    (camera): CameraFeature => ({
      type: "Feature",
      id: camera.id,
      geometry: {
        type: "Point",
        coordinates: [camera.longitude, camera.latitude],
      },
      properties: camera,
    }),
  ),
};

/**
 * Bundled camera sites with live imagery fetched on demand. Excluded from
 * print: a camera frame is a moment, and the print flow seals evidence with
 * a stated source date the frame cannot honour.
 */
export function TrafficCameraLayer({
  layer,
  visible,
  onStatusChange,
  renderMode,
}: {
  layer: TrafficCameraLayerDescriptor;
  visible: boolean;
  onStatusChange?: (id: "highway-cameras", status: MapLayerStatus) => void;
  renderMode: MapRenderMode;
}) {
  const shown = visible && renderMode !== "print";

  useEffect(() => {
    onStatusChange?.(
      layer.id,
      shown
        ? { status: "ready", count: highwayCameras.length }
        : { status: "idle" },
    );
  }, [layer.id, onStatusChange, shown]);

  if (!shown) {
    return null;
  }

  return (
    <GeoJSON
      key={layer.id}
      data={cameraFeatureCollection}
      pointToLayer={(_feature, latlng) =>
        L.circleMarker(latlng, {
          radius: 6,
          color: "#ffffff",
          fillColor: layer.markerColor,
          fillOpacity: layer.opacity,
          weight: 1.5,
        })
      }
      onEachFeature={(feature, featureLayer) => {
        const camera = feature.properties as HighwayCamera;
        featureLayer.bindTooltip(textTooltip(camera.name), { sticky: true });
        // Content callback: each open rebuilds the popup with a fresh cache
        // key, so a reopened camera shows the current frame.
        featureLayer.bindPopup(() => buildCameraPopup(layer, camera, Date.now()), {
          maxWidth: 340,
        });
        featureLayer.on("click", (event) => L.DomEvent.stopPropagation(event));
      }}
    />
  );
}
