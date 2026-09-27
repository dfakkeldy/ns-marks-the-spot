import { useEffect } from "react";
import L, { type PathOptions } from "leaflet";
import { useMap } from "react-leaflet";
import type { ContextMapLayer } from "../layers/contextLayerCatalog";
import { ContextAreaTooLargeError, ContextOutsideCoverageError, fetchContextFeatures } from "../services/contextVectorSource";
import type { MapLayerId, MapLayerStatus, MapRenderMode } from "./MapCanvas";
import { contextFeatureStyle, contextFeatureLabel } from "../services/contextFeatures";

/** Bounded viewport queries share the same cancellation/paging path as zoning. */
export function ContextFeatureLayer({ layer, visible, onStatusChange, renderMode }: {
  layer: ContextMapLayer;
  visible: boolean;
  onStatusChange?: (id: MapLayerId, status: MapLayerStatus) => void;
  renderMode: MapRenderMode;
}) {
  const map = useMap();
  useEffect(() => {
    if (!visible) {
      onStatusChange?.(layer.id, { status: "idle" });
      return;
    }
    const paneName = `context-${layer.id}`;
    const pane = map.getPane(paneName) ?? map.createPane(paneName, map.getPane("tilePane"));
    // Share the image-layer stacking context so broad fills remain below roads and parcels.
    pane.style.zIndex = String(layer.zIndex);
    pane.style.pointerEvents = renderMode === "print" ? "none" : "auto";
    let controller: AbortController | undefined;
    let generation = 0;
    let rendered: L.GeoJSON | undefined;
    const load = () => {
      controller?.abort();
      const request = ++generation;
      rendered?.remove();
      rendered = undefined;
      if (map.getZoom() < layer.minZoom) {
        onStatusChange?.(layer.id, { status: "zoom", minZoom: layer.minZoom });
        return;
      }
      controller = new AbortController();
      const activeController = controller;
      const timeout = window.setTimeout(() => activeController.abort(), 30_000);
      const bounds = map.getBounds();
      onStatusChange?.(layer.id, { status: "loading" });
      void fetchContextFeatures(layer, { west: bounds.getWest(), south: bounds.getSouth(), east: bounds.getEast(), north: bounds.getNorth() }, controller.signal).then((collection) => {
        if (request !== generation) return;
        const style = (feature?: GeoJSON.Feature): PathOptions => ({
          ...contextFeatureStyle(layer, feature?.properties ?? {}, renderMode),
          snapIgnore: true, pmIgnore: true,
        } as PathOptions);
        rendered = L.geoJSON(collection, {
          pane: paneName,
          style,
          interactive: renderMode !== "print",
          pointToLayer: (feature, latlng) => L.circleMarker(latlng, {
            ...style(feature), radius: contextFeatureStyle(layer, feature.properties ?? {}, renderMode).radius ?? 5,
            pane: paneName, interactive: renderMode !== "print",
          }),
          onEachFeature: renderMode === "print" ? undefined : (feature, featureLayer) => {
            const article = document.createElement("article");
            const title = document.createElement("strong");
            title.textContent = contextFeatureLabel(layer, feature.properties ?? {});
            const details = document.createElement("dl");
            details.className = "context-feature-details";
            const properties = feature.properties ?? {};
            const fields = [{ field: layer.idField ?? "OBJECTID", label: "Source record", values: undefined }, ...(layer.popupFields ?? [])];
            for (const { field, label, values } of fields) {
              const value = properties[field] ?? (field === layer.idField ? feature.id : undefined);
              const term = document.createElement("dt"); term.textContent = label;
              const definition = document.createElement("dd");
              const scalar = typeof value === "string" || typeof value === "number" || typeof value === "boolean";
              const sourceText = scalar ? String(value) : "Not supplied by source";
              definition.textContent = scalar && values && Object.hasOwn(values, sourceText) ? `${values[sourceText]} (${sourceText})` : sourceText;
              details.append(term, definition);
            }
            const note = document.createElement("p");
            note.textContent = `${layer.sourceDate}. ${layer.webCaveat}`;
            const link = document.createElement("a");
            link.href = layer.sourceUrl;
            link.target = "_blank";
            link.rel = "noreferrer";
            link.textContent = "Official source";
            article.append(title, details, note, link);
            featureLayer.bindPopup(article);
          },
        }).addTo(map);
        onStatusChange?.(layer.id, collection.features.length ? { status: "ready", count: collection.features.length } : { status: "returned-empty" });
      }).catch((error: unknown) => {
        if (request === generation) onStatusChange?.(layer.id, error instanceof ContextOutsideCoverageError
          ? { status: "outside-coverage" }
          : error instanceof ContextAreaTooLargeError ? { status: "zoom", minZoom: Math.ceil(map.getZoom()) + 1 } : { status: "error" });
      }).finally(() => window.clearTimeout(timeout));
    };
    load();
    map.on("moveend", load);
    return () => {
      generation += 1;
      controller?.abort();
      map.off("moveend", load);
      rendered?.remove();
    };
  }, [layer, map, onStatusChange, renderMode, visible]);
  return null;
}
