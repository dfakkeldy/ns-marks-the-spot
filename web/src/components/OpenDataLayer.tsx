import { OpenDataAreaTooLargeError } from "../services/openDataOverlay";
import { useEffect } from "react";
import L from "leaflet";
import { useMap } from "react-leaflet";
import type { OpenDataSource } from "../layers/openDataSources";
import { renderOpenData } from "../services/renderOpenData";
import type { MapLayerId, MapLayerStatus, MapRenderMode } from "./MapCanvas";

export function OpenDataLayer({ layer, visible, zIndex, onStatusChange, renderMode }: {
  layer: { id: MapLayerId; openData?: OpenDataSource; minZoom: number; maxZoom: number; opacity: number };
  visible: boolean; zIndex: number; renderMode: MapRenderMode;
  onStatusChange?: (id: MapLayerId, status: MapLayerStatus) => void;
}) {
  const map = useMap();
  useEffect(() => {
    if (!visible || !layer.openData) { onStatusChange?.(layer.id, { status: "idle" }); return; }
    let generation = 0;
    let controller: AbortController | undefined;
    let image: L.ImageOverlay | undefined;
    const load = () => {
      const request = ++generation;
      controller?.abort(); image?.remove(); image = undefined;
      if (map.getZoom() < layer.minZoom) { onStatusChange?.(layer.id, { status: "zoom", minZoom: layer.minZoom }); return; }
      controller = new AbortController();
      const active = controller;
      const timeout = window.setTimeout(() => active.abort(), 30_000);
      const b = map.getBounds(); const size = map.getSize();
      onStatusChange?.(layer.id, { status: "loading" });
      void renderOpenData(layer.openData!, { west: b.getWest(), east: b.getEast(), south: b.getSouth(), north: b.getNorth() }, { width: Math.max(1, Math.round(size.x)), height: Math.max(1, Math.round(size.y)) }, map.getZoom(), active.signal).then(({ canvas, count }) => {
        if (generation !== request) return;
        const paneName = `open-${layer.id}`;
        const pane = map.getPane(paneName) ?? map.createPane(paneName, map.getPane("tilePane"));
        pane.style.zIndex = String(zIndex); pane.style.pointerEvents = "none";
        let imageFailed = false;
        image = L.imageOverlay(canvas.toDataURL("image/png"), b, { pane: paneName, opacity: layer.opacity, interactive: false, className: renderMode === "print" ? `print-layer-${layer.id}` : `map-layer-${layer.id}` });
        image.once("load", () => { if (generation === request && !imageFailed) onStatusChange?.(layer.id, { status: "ready", count }); });
        image.once("error", () => { imageFailed = true; if (generation === request) onStatusChange?.(layer.id, { status: "error" }); });
        image.addTo(map);
      }).catch((error: unknown) => { if (generation === request) onStatusChange?.(layer.id, error instanceof OpenDataAreaTooLargeError ? { status: "zoom", minZoom: Math.ceil(map.getZoom()) + 1 } : { status: "error" }); }).finally(() => window.clearTimeout(timeout));
    };
    load(); map.on("moveend", load);
    return () => { generation += 1; controller?.abort(); image?.remove(); map.off("moveend", load); };
  }, [layer, visible, zIndex, map, onStatusChange, renderMode]);
  return null;
}
