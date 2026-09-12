import { useEffect } from "react";
import L from "leaflet";
import { useMap } from "react-leaflet";
import type { ContextMapLayer } from "../layers/contextLayerCatalog";
import type { MapLayerId, MapLayerStatus, MapRenderMode } from "./MapCanvas";

export function ContextTileLayer({ layer, visible, onStatusChange, renderMode }: {
  layer: ContextMapLayer; visible: boolean; renderMode: MapRenderMode;
  onStatusChange?: (id: MapLayerId, status: MapLayerStatus) => void;
}) {
  const map = useMap();
  useEffect(() => {
    if (!visible || !layer.tileUrl) { onStatusChange?.(layer.id, { status: "idle" }); return; }
    let failed = false;
    const tiles = L.tileLayer(layer.tileUrl, {
      minZoom: layer.minZoom, maxZoom: layer.maxZoom, maxNativeZoom: layer.maxNativeZoom,
      opacity: layer.opacity, zIndex: layer.zIndex, crossOrigin: "anonymous",
      className: renderMode === "print" ? `print-layer-${layer.id}` : `map-layer-${layer.id}`,
      attribution: '<a href="https://cloudless.eox.at">EOxCloudless</a> by <a href="https://eox.at">EOX</a> · modified Copernicus Sentinel data 2016 &amp; 2017 · <a href="https://creativecommons.org/licenses/by/4.0/">CC BY 4.0</a>',
    });
    tiles.on("loading", () => {
      if (renderMode !== "print") failed = false;
      if (!failed) onStatusChange?.(layer.id, { status: "loading" });
    });
    tiles.on("tileerror", () => { failed = true; onStatusChange?.(layer.id, { status: "error" }); });
    tiles.on("load", () => { if (!failed) onStatusChange?.(layer.id, { status: "ready" }); });
    onStatusChange?.(layer.id, { status: "loading" });
    tiles.addTo(map);
    return () => { tiles.off(); tiles.remove(); };
  }, [layer, map, onStatusChange, renderMode, visible]);
  return null;
}
