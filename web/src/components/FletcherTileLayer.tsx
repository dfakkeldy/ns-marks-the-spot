import { useEffect, useRef } from "react";
import L, { type TileLayer } from "leaflet";
import { useMap } from "react-leaflet";
import {
  fletcherTileRegions,
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
  // Keep the single mosaic layer mounted across pans and opacity changes.
  // Source-sheet footprints are metadata, not 24 independently drawn copies.
  const layersRef = useRef(new Map<string, TileLayer>());
  const opacityRef = useRef(opacity);

  useEffect(() => {
    const layers = layersRef.current;
    // Cumulative across the session, matching what the status line reports:
    // "tiles this layer has loaded", not "tiles since the last pan".
    let loadedTiles = 0;
    let pendingSheets = 0;

    const removeLayer = (id: string, layer: TileLayer) => {
      layer.off();
      map.removeLayer(layer);
      layers.delete(id);
    };
    const removeAll = () => {
      for (const [id, layer] of layers) {
        removeLayer(id, layer);
      }
    };

    const refresh = () => {
      if (!visible) {
        removeAll();
        onStatusChange({ status: "idle" });
        return;
      }
      if (!tileBaseUrl) {
        removeAll();
        onStatusChange({ status: "error" });
        return;
      }
      if (map.getZoom() < fletcherLayerCatalog.minZoom) {
        removeAll();
        onStatusChange({
          status: "zoom",
          minZoom: fletcherLayerCatalog.minZoom,
        });
        return;
      }

      const visibleRegions = fletcherTileRegions.filter(({ bounds }) =>
        map.getBounds().intersects(L.latLngBounds(bounds)),
      );
      const visibleIds = new Set(visibleRegions.map(({ id }) => id));

      for (const [id, layer] of layers) {
        if (!visibleIds.has(id)) {
          removeLayer(id, layer);
        }
      }

      for (const { id, bounds } of visibleRegions) {
        if (layers.has(id)) {
          continue;
        }
        const url = fletcherTileUrl(tileBaseUrl);
        if (!url) continue;
        const layer = L.tileLayer(url, {
          bounds: L.latLngBounds(bounds),
          minZoom: fletcherLayerCatalog.minZoom,
          maxZoom: fletcherLayerCatalog.maxZoom,
          // Past the sheets' native depth the tiles upscale instead of the
          // whole layer vanishing — the layer being traced has to survive
          // tracing zoom.
          maxNativeZoom:
            fletcherLayerCatalog.maxNativeZoom ?? fletcherLayerCatalog.maxZoom,
          noWrap: true,
          opacity: opacityRef.current,
          updateWhenZooming: false,
          keepBuffer: 1,
          zIndex: FLETCHER_LAYER_Z_INDEX,
          className:
            renderMode === "print" ? "print-layer-fletcher" : undefined,
        });
        pendingSheets += 1;
        layer.on("tileload", () => {
          loadedTiles += 1;
        });
        layer.on("load", () => {
          pendingSheets = Math.max(0, pendingSheets - 1);
          if (pendingSheets === 0) {
            onStatusChange(
              loadedTiles > 0
                ? { status: "ready", count: loadedTiles }
                : { status: "error" },
            );
          }
        });
        layers.set(id, layer);
        layer.addTo(map);
      }

      if (layers.size === 0) {
        onStatusChange({ status: "ready", count: 0 });
        return;
      }
      if (pendingSheets > 0) {
        onStatusChange({ status: "loading" });
      } else {
        onStatusChange({ status: "ready", count: loadedTiles });
      }
    };

    refresh();
    // moveend only: Leaflet fires moveend after every zoom, and the zoomend
    // subscription doubled every refresh.
    map.on("moveend", refresh);
    return () => {
      map.off("moveend", refresh);
      removeAll();
    };
  }, [
    map,
    onStatusChange,
    renderMode,
    retryToken,
    tileBaseUrl,
    visible,
  ]);

  // Opacity is a live property of the existing layers, not a reason to
  // rebuild them: each 5-unit slider tick used to discard and refetch every
  // visible sheet's tiles.
  useEffect(() => {
    opacityRef.current = opacity;
    for (const layer of layersRef.current.values()) {
      layer.setOpacity(opacity);
    }
  }, [opacity]);

  return null;
}
