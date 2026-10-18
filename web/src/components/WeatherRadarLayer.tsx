import { useEffect } from "react";
import L from "leaflet";
import { useMap } from "react-leaflet";
import type { WeatherRadarLayerDescriptor } from "../layers/layerCatalog";
import {
  fetchLatestRadarTime,
  RADAR_REFRESH_INTERVAL_MS,
} from "../services/weatherRadar";
import { WEATHER_RADAR_Z_INDEX } from "./mapPanes";
import type { MapLayerStatus } from "./MapCanvas";
import type { MapRenderMode } from "./parcelStyle";

/**
 * The codebase's first WMS layer. GeoMet serves the latest frame by default;
 * the capabilities probe pins an explicit TIME so the row can say when the
 * frame was observed and so the periodic refresh busts tile caches by
 * changing the URL rather than by guessing at cache headers.
 *
 * Excluded from print for the same reason as the cameras: a radar frame is a
 * moment, not evidence a sealed PDF can carry.
 */
export function WeatherRadarLayer({
  layer,
  visible,
  onStatusChange,
  renderMode,
}: {
  layer: WeatherRadarLayerDescriptor;
  visible: boolean;
  onStatusChange?: (id: "weather-radar", status: MapLayerStatus) => void;
  renderMode: MapRenderMode;
}) {
  const map = useMap();
  const shown = visible && renderMode !== "print";

  useEffect(() => {
    if (!shown) {
      onStatusChange?.(layer.id, { status: "idle" });
      return;
    }

    let disposed = false;
    let failed = false;
    let observedAt: string | undefined;
    let controller: AbortController | undefined;
    let frameRequest = 0;
    onStatusChange?.(layer.id, { status: "loading" });

    const wmsLayer = L.tileLayer.wms(layer.serviceUrl, {
      layers: layer.wmsLayer,
      format: "image/png",
      transparent: true,
      version: "1.3.0",
      opacity: layer.opacity,
      zIndex: WEATHER_RADAR_Z_INDEX,
    });
    wmsLayer.on("loading", () => {
      if (disposed) return;
      failed = false;
      onStatusChange?.(layer.id, { status: "loading" });
    });
    wmsLayer.on("load", () => {
      if (!disposed && !failed) onStatusChange?.(layer.id, { status: "ready", observedAt });
    });
    wmsLayer.on("tileerror", () => {
      if (disposed) return;
      failed = true;
      onStatusChange?.(layer.id, { status: "error" });
    });
    wmsLayer.addTo(map);

    const applyLatestFrame = () => {
      const request = ++frameRequest;
      controller?.abort();
      controller = new AbortController();
      fetchLatestRadarTime(layer, controller.signal)
        .then((time) => {
          if (disposed || request !== frameRequest || time === null || time === observedAt) {
            return;
          }
          observedAt = time;
          // `time` is a WMS dimension, not part of Leaflet's WMSParams type.
          wmsLayer.setParams({ time } as unknown as L.WMSParams);
        })
        .catch(() => {
          // A failed probe is not a tile failure: retain the current frame
          // and its last known observation time, if any.
        });
    };
    applyLatestFrame();
    const timer = window.setInterval(
      applyLatestFrame,
      RADAR_REFRESH_INTERVAL_MS,
    );

    return () => {
      disposed = true;
      controller?.abort();
      window.clearInterval(timer);
      // Leaflet's remove listener detaches the layer's map event handlers.
      wmsLayer.remove();
      wmsLayer.off();
    };
  }, [layer, map, onStatusChange, shown]);

  return null;
}
