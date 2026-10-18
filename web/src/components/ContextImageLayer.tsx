import { useEffect } from "react";
import L from "leaflet";
import { useMap } from "react-leaflet";
import type { ContextMapLayer } from "../layers/contextLayerCatalog";
import type { MapLayerId, MapLayerStatus } from "./MapCanvas";

/** A source-derived, georeferenced regional raster, already warped to Web Mercator. */
export function ContextImageLayer({ layer, visible, onStatusChange }: {
  layer: ContextMapLayer;
  visible: boolean;
  onStatusChange?: (id: MapLayerId, status: MapLayerStatus) => void;
}) {
  const map = useMap();
  useEffect(() => {
    if (!visible) { onStatusChange?.(layer.id, { status: "idle" }); return; }
    if (!layer.imageBounds) { onStatusChange?.(layer.id, { status: "error" }); return; }
    // Use tilePane so this regional wash stays beneath the existing reference layers.
    const overlay = L.imageOverlay(layer.serviceUrl, [
      [...layer.imageBounds[0]], [...layer.imageBounds[1]],
    ], { pane: "tilePane", opacity: layer.opacity, zIndex: layer.zIndex, interactive: false });
    let imageState: "loading" | "ready" | "error" = "loading";
    const report = () => {
      if (map.getZoom() < layer.minZoom) {
        overlay.setOpacity(0);
        onStatusChange?.(layer.id, { status: "zoom", minZoom: layer.minZoom });
      } else {
        overlay.setOpacity(layer.opacity);
        onStatusChange?.(layer.id, { status: imageState });
      }
    };
    overlay.on("load", () => { imageState = "ready"; report(); });
    overlay.on("error", () => { imageState = "error"; report(); });
    report();
    overlay.addTo(map);
    map.on("zoomend", report);
    return () => { map.off("zoomend", report); overlay.off(); overlay.remove(); };
  }, [layer, map, onStatusChange, visible]);
  return null;
}
