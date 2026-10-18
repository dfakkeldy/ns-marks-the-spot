import type { Feature } from "geojson";
import type { PathOptions } from "leaflet";

/**
 * Colorblind-safe cycle (Okabe–Ito, minus yellow — too faint over aerial
 * imagery). Assigned once at import and stored on the record, so a layer
 * keeps its color for life instead of shifting when its neighbors are
 * removed.
 */
export const LAYER_COLORS = [
  "#d55e00", // vermillion
  "#0072b2", // blue
  "#009e73", // bluish green
  "#cc79a7", // reddish purple
  "#e69f00", // orange
  "#56b4e9", // sky blue
] as const;

/** Takes a count, not the records array: a multi-file batch advances the
 * cursor locally, before React has flushed the new records into state. */
export function nextLayerColor(existingCount: number): string {
  return LAYER_COLORS[existingCount % LAYER_COLORS.length];
}

function asColor(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function asFinite(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

/**
 * Layer default, overridden per feature by simplestyle-spec properties
 * (`stroke`, `stroke-width`, `stroke-opacity`, `fill`, `fill-opacity`,
 * `marker-color`) — the vocabulary togeojson emits for KML styles, so KML
 * imports keep their authored look with no extra plumbing. Unknown or
 * malformed values fall back to the layer default rather than to Leaflet's.
 */
export function styleForFeature(
  feature: Feature,
  layerStyle: { color: string },
): PathOptions {
  const props: Record<string, unknown> =
    feature.properties && typeof feature.properties === "object"
      ? (feature.properties as Record<string, unknown>)
      : {};
  const stroke = asColor(props.stroke) ?? layerStyle.color;
  const fill =
    asColor(props["marker-color"]) ?? asColor(props.fill) ?? layerStyle.color;
  return {
    color: stroke,
    weight: asFinite(props["stroke-width"]) ?? 2,
    opacity: asFinite(props["stroke-opacity"]) ?? 0.9,
    fillColor: fill,
    fillOpacity: asFinite(props["fill-opacity"]) ?? 0.25,
  };
}
