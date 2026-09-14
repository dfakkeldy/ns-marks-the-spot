import { OpenDataAreaTooLargeError } from "../services/openDataOverlay";
import { useEffect, useMemo } from "react";
import L from "leaflet";
import { useMap } from "react-leaflet";
import type { OpenDataSource } from "../layers/openDataSources";
import { renderOpenData } from "../services/renderOpenData";
import type { MapLayerId, MapLayerStatus, MapRenderMode } from "./MapCanvas";

export function OpenDataLayer({ layer, visible, zIndex, onStatusChange, renderMode, atlasRoads = false, roadsVisible = false, backgroundLabels = false, crownColor }: {
  layer: { id: MapLayerId; openData?: OpenDataSource; minZoom: number; maxZoom: number; opacity: number };
  crownColor?: string;
  atlasRoads?: boolean; roadsVisible?: boolean; backgroundLabels?: boolean;
  visible: boolean; zIndex: number; renderMode: MapRenderMode;
  onStatusChange?: (id: MapLayerId, status: MapLayerStatus) => void;
}) {
  const map = useMap();
  const source = useMemo(() => {
    if (!layer.openData) return undefined;
    const parts = layer.id === 'roads' && atlasRoads ? layer.openData.parts.filter(part => part.dataset !== '484g-adjn')
      : layer.openData.parts;
    return { ...layer.openData, ...(layer.id === "crown-lands" && crownColor ? { color: crownColor } : {}), parts, labelField: backgroundLabels && (layer.openData.roads || layer.id === 'place-names') ? undefined : layer.openData.labelField };
  }, [layer, atlasRoads, backgroundLabels, crownColor]);
  useEffect(() => {
    if (!visible || !source) { onStatusChange?.(layer.id, { status: "idle" }); return; }
    let generation = 0;
    let controller: AbortController | undefined;
    let image: L.ImageOverlay | undefined;
    const images = new Set<L.ImageOverlay>();
    const clearImages = () => { for (const current of images) current.remove(); images.clear(); image = undefined; };
    const load = () => {
      const request = ++generation;
      controller?.abort();
      if (layer.id === 'main-roads' && (atlasRoads || (roadsVisible && map.getZoom() >= 10))) {
        clearImages();
        onStatusChange?.(layer.id, { status: "ready", message: atlasRoads ? "Roads shown by Atlas" : "Included in Roads layer" });
        return;
      }
      if (map.getZoom() < layer.minZoom) { clearImages(); onStatusChange?.(layer.id, { status: "zoom", minZoom: layer.minZoom }); return; }
      controller = new AbortController();
      const active = controller;
      const timeout = window.setTimeout(() => active.abort(), 30_000);
      const b = map.getBounds(); const size = map.getSize();
      onStatusChange?.(layer.id, { status: "loading" });
      void renderOpenData(source, { west: b.getWest(), east: b.getEast(), south: b.getSouth(), north: b.getNorth() }, { width: Math.max(1, Math.round(size.x)), height: Math.max(1, Math.round(size.y)) }, map.getZoom(), active.signal).then(({ canvas, count }) => {
        if (generation !== request) return;
        const paneName = `open-${layer.id}`;
        const pane = map.getPane(paneName) ?? map.createPane(paneName, map.getPane("tilePane"));
        pane.style.zIndex = String(zIndex); pane.style.pointerEvents = "none";
        let imageFailed = false;
        image = L.imageOverlay(canvas.toDataURL("image/png"), b, { pane: paneName, opacity: layer.opacity, interactive: false, className: renderMode === "print" ? `print-layer-${layer.id}` : `map-layer-${layer.id}` });
        images.add(image);
        const replacement = image;
        image.once("load", () => { if (generation !== request) return; for (const old of images) if (old !== replacement) { old.remove(); images.delete(old); } if (generation === request && !imageFailed) onStatusChange?.(layer.id, { status: "ready", count }); });
        image.once("error", () => { if (generation !== request) return; imageFailed = true; clearImages(); if (generation === request) onStatusChange?.(layer.id, { status: "error" }); });
        image.addTo(map);
      }).catch((error: unknown) => { if (generation === request) { clearImages(); onStatusChange?.(layer.id, error instanceof OpenDataAreaTooLargeError ? { status: "zoom", minZoom: Math.ceil(map.getZoom()) + 1 } : { status: "error", message: active.signal.aborted ? "Source timed out after 30 seconds. Pan to retry." : error instanceof Error ? error.message : "Open-data source unavailable. Pan to retry." }); } }).finally(() => window.clearTimeout(timeout));
    };
    load(); map.on("moveend", load);
    return () => { generation += 1; controller?.abort(); clearImages(); map.off("moveend", load); };
  }, [layer, source, visible, zIndex, map, onStatusChange, renderMode, atlasRoads, roadsVisible]);
  return null;
}
