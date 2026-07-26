import { useEffect } from "react";
import L, { type TileLayer } from "leaflet";
import { useMap } from "react-leaflet";
import {
  fletcherSheets,
  fletcherTileUrl,
} from "../layers/fletcherLayer";
import { fletcherLayerCatalog } from "../layers/layerCatalog";
import { FLETCHER_LAYER_Z_INDEX } from "./mapPanes";
import type { MapLayerStatus } from "./MapCanvas";
import type { MapRenderMode } from "./parcelStyle";

export function FletcherTileLayer({
  visible,
  opacity,
  tileBaseUrl,
  retryToken,
  renderMode,
  onStatusChange,
}: {
  visible: boolean;
  opacity: number;
  tileBaseUrl: string | null;
  retryToken: number;
  renderMode: MapRenderMode;
  onStatusChange: (status: MapLayerStatus) => void;
}) {
  const map = useMap();

  useEffect(() => {
    const layers = new Set<TileLayer>();
    let generation = 0;

    const clearLayers = () => {
      layers.forEach((layer) => {
        layer.off();
        map.removeLayer(layer);
      });
      layers.clear();
    };

    const refresh = () => {
      generation += 1;
      const currentGeneration = generation;
      clearLayers();

      if (!visible) {
        onStatusChange({ status: "idle" });
        return;
      }
      if (!tileBaseUrl) {
        onStatusChange({ status: "error" });
        return;
      }
      if (map.getZoom() < fletcherLayerCatalog.minZoom) {
        onStatusChange({
          status: "zoom",
          minZoom: fletcherLayerCatalog.minZoom,
        });
        return;
      }

      const visibleSheets = fletcherSheets.filter(({ bounds }) =>
        map.getBounds().intersects(L.latLngBounds(bounds)),
      );
      if (visibleSheets.length === 0) {
        onStatusChange({ status: "ready", count: 0 });
        return;
      }

      let finishedSheets = 0;
      let loadedTiles = 0;
      onStatusChange({ status: "loading" });

      visibleSheets.forEach(({ sheet, bounds }) => {
        const url = fletcherTileUrl(sheet, tileBaseUrl);
        if (!url) return;
        const layer = L.tileLayer(url, {
          bounds: L.latLngBounds(bounds),
          minZoom: fletcherLayerCatalog.minZoom,
          maxZoom: fletcherLayerCatalog.maxZoom,
          maxNativeZoom: fletcherLayerCatalog.maxZoom,
          noWrap: true,
          opacity,
          updateWhenZooming: false,
          keepBuffer: 1,
          zIndex: FLETCHER_LAYER_Z_INDEX,
          className:
            renderMode === "print" ? "print-layer-fletcher" : undefined,
        });
        layer.on("tileload", () => {
          if (currentGeneration === generation) {
            loadedTiles += 1;
          }
        });
        layer.on("load", () => {
          if (currentGeneration !== generation) return;
          finishedSheets += 1;
          if (finishedSheets === visibleSheets.length) {
            onStatusChange(
              loadedTiles > 0
                ? { status: "ready", count: loadedTiles }
                : { status: "error" },
            );
          }
        });
        layers.add(layer);
        layer.addTo(map);
      });
    };

    refresh();
    map.on("moveend zoomend", refresh);
    return () => {
      generation += 1;
      map.off("moveend zoomend", refresh);
      clearLayers();
    };
  }, [
    map,
    onStatusChange,
    opacity,
    renderMode,
    retryToken,
    tileBaseUrl,
    visible,
  ]);

  return null;
}
