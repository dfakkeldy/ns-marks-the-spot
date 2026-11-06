import type { ContextLayerDescriptor } from "../layers/contextLayerTypes";
import type { OpenDataSource } from "../layers/openDataSources";

/**
 * A layer row's small key: the layer's own map symbol, drawn from what the
 * catalogue already says about it. A layer with no symbol colour in the
 * catalogue (server-rendered images, aerial photos, parcels drawn by the
 * parcel styler) gets none; the row never shows an invented colour.
 */
export type LayerSwatchSpec =
  | { readonly shape: "area"; readonly color: string; readonly fill: string; readonly fillOpacity: number; readonly outline: boolean }
  | { readonly shape: "line"; readonly color: string; readonly dashed: boolean; readonly casing: boolean; readonly road: boolean }
  | { readonly shape: "dot"; readonly color: string; readonly hollow: boolean }
  | { readonly shape: "ring"; readonly color: string }
  | { readonly shape: "classes"; readonly colors: readonly string[] };

/**
 * A very faint fill (a 4% watershed tint) would leave an empty box in the
 * row, so the swatch never fills lighter than this; the outline keeps the hue.
 */
export const SWATCH_MIN_FILL_OPACITY = 0.3;
/** Classed legends show their first few colours; the full key stays under "Legend & source". */
export const SWATCH_MAX_CLASSES = 4;

/** The symbol the open-data canvas renderer (services/renderOpenData.ts) draws. */
export function openDataSwatch(source: OpenDataSource): LayerSwatchSpec {
  const { color } = source;
  if (source.pointRing) return { shape: "ring", color };
  if (source.symbol === "point") return { shape: "dot", color, hollow: false };
  if (source.roads) return { shape: "line", color, dashed: false, casing: true, road: true };
  if (source.dash || source.casing || source.fillOpacity === 0) {
    return { shape: "line", color, dashed: Boolean(source.dash), casing: Boolean(source.casing), road: false };
  }
  return {
    shape: "area",
    color,
    fill: color,
    fillOpacity: Math.max(source.fillOpacity ?? 0.2, SWATCH_MIN_FILL_OPACITY),
    outline: source.stroke !== false,
  };
}

/**
 * A context layer's swatch: its open-data symbol, else its one feature style,
 * else the colours its legend names.
 */
export function contextLayerSwatch(layer: Pick<ContextLayerDescriptor, "openData" | "featureRenderer" | "legend">): LayerSwatchSpec | null {
  if (layer.openData) return openDataSwatch(layer.openData);
  const renderer = layer.featureRenderer;
  if (renderer && Object.keys(renderer.styles).length === 0) {
    const style = renderer.defaultStyle;
    const fill = style.fillColor ?? style.color;
    if (style.marker) return { shape: "dot", color: fill, hollow: Boolean(style.marker.hollow) };
    if (style.radius !== undefined) return { shape: "dot", color: fill, hollow: false };
    if (style.fillOpacity === 0) return { shape: "line", color: style.color, dashed: false, casing: false, road: false };
    return { shape: "area", color: style.color, fill, fillOpacity: Math.max(style.fillOpacity ?? 0.2, SWATCH_MIN_FILL_OPACITY), outline: true };
  }
  const colors = [...new Set(layer.legend.flatMap(({ color }) => (color ? [color] : [])))];
  if (colors.length === 0) return null;
  if (colors.length === 1) return { shape: "area", color: colors[0], fill: colors[0], fillOpacity: SWATCH_MIN_FILL_OPACITY, outline: true };
  return { shape: "classes", colors: colors.slice(0, SWATCH_MAX_CLASSES) };
}
