import type { WeatherRadarLayerDescriptor } from "../layers/layerCatalog";

/**
 * GeoMet publishes a new radar composite about every 6 minutes; polling at 5
 * keeps the layer at most one frame behind without hammering the service.
 */
export const RADAR_REFRESH_INTERVAL_MS = 5 * 60 * 1000;

/**
 * Layer-scoped GetCapabilities. The `layer` parameter is a GeoMet extension
 * that trims the document to one layer (~20 KB) instead of the full service
 * catalogue, which runs to megabytes.
 */
export function radarCapabilitiesUrl(layer: WeatherRadarLayerDescriptor): string {
  const url = new URL(layer.serviceUrl);
  url.searchParams.set("service", "WMS");
  url.searchParams.set("version", "1.3.0");
  url.searchParams.set("request", "GetCapabilities");
  url.searchParams.set("layer", layer.wmsLayer);
  return url.toString();
}

/**
 * The observation time of the newest available frame, from the capabilities
 * time dimension's `default` attribute. Returns null when the document has no
 * parseable time — the layer then renders the server's own latest frame and
 * simply cannot say when it was observed, which is weaker but still honest.
 */
export function parseLatestRadarTime(capabilitiesXml: string): string | null {
  const doc = new DOMParser().parseFromString(capabilitiesXml, "text/xml");
  if (doc.getElementsByTagName("parsererror").length > 0) {
    return null;
  }
  for (const dimension of Array.from(doc.getElementsByTagName("Dimension"))) {
    if (dimension.getAttribute("name") !== "time") {
      continue;
    }
    const value = dimension.getAttribute("default");
    return value !== null && !Number.isNaN(Date.parse(value)) ? value : null;
  }
  return null;
}

export async function fetchLatestRadarTime(
  layer: WeatherRadarLayerDescriptor,
  signal: AbortSignal,
): Promise<string | null> {
  const response = await fetch(radarCapabilitiesUrl(layer), { signal });
  if (!response.ok) {
    throw new Error(`Radar capabilities request failed (${response.status})`);
  }
  return parseLatestRadarTime(await response.text());
}

/** "3:54 p.m." in the viewer's own timezone, for the layer-row status line. */
export function radarObservedLabel(isoTime: string): string | null {
  const parsed = Date.parse(isoTime);
  if (Number.isNaN(parsed)) {
    return null;
  }
  return new Date(parsed).toLocaleTimeString("en-CA", {
    hour: "numeric",
    minute: "2-digit",
  });
}
