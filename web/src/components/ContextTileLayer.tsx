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
    if (!visible) { onStatusChange?.(layer.id, { status: "idle" }); return; }
    if (!layer.tileUrl) {
      onStatusChange?.(layer.id, { status: "source-error", message: layer.unavailableReason ?? "Tiles are unavailable for this source." });
      return;
    }
    let failed = false;
    let loaded = false;
    const bounds = layer.coverageBounds ? L.latLngBounds([
      [layer.coverageBounds.south, layer.coverageBounds.west],
      [layer.coverageBounds.north, layer.coverageBounds.east],
    ]) : undefined;
    const attribution = (layer.attribution ?? "").replace(/&/gu, "&amp;").replace(/</gu, "&lt;").replace(/>/gu, "&gt;");
    const tiles = L.tileLayer(layer.tileUrl, {
      minZoom: layer.minZoom, maxZoom: layer.maxZoom, maxNativeZoom: layer.maxNativeZoom,
      opacity: layer.opacity, zIndex: layer.zIndex, crossOrigin: "anonymous",
      className: renderMode === "print" ? `print-layer-${layer.id}` : `map-layer-${layer.id}`,
      attribution,
      ...(bounds ? { bounds, noWrap: true } : {}),
    });
    const report = () => {
      if (map.getZoom() < layer.minZoom) onStatusChange?.(layer.id, { status: "zoom", minZoom: layer.minZoom });
      else if (bounds && !map.getBounds().intersects(bounds)) onStatusChange?.(layer.id, { status: "outside-coverage" });
      else if (failed) onStatusChange?.(layer.id, { status: "source-error" });
      else onStatusChange?.(layer.id, { status: loaded && !tiles.isLoading() ? "ready" : "loading" });
    };
    tiles.on("loading", () => {
      if (renderMode !== "print") failed = false;
      loaded = false;
      report();
    });
    tiles.on("tileerror", () => { failed = true; report(); });
    tiles.on("load", () => { loaded = true; report(); });
    map.on("moveend", report);
    tiles.addTo(map);
    report();
    return () => { map.off("moveend", report); tiles.off(); tiles.remove(); };
  }, [layer, map, onStatusChange, renderMode, visible]);
  return null;
}
