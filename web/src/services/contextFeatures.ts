import type { ContextLayerDescriptor, ContextFeatureStyle } from "../layers/contextLayerTypes";

/** Preserve the published classes as distinct tones in monochrome print. */
export function contextPrintColor(color: string): string {
  const rgb = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(color);
  if (!rgb) return color;
  const gray = Math.round(0.2126 * parseInt(rgb[1], 16) + 0.7152 * parseInt(rgb[2], 16) + 0.0722 * parseInt(rgb[3], 16));
  return `#${gray.toString(16).padStart(2, "0").repeat(3)}`;
}

export function contextFeatureLabel(layer: ContextLayerDescriptor, properties: Record<string, unknown>): string {
  const value = layer.featureRenderer?.field ? properties[layer.featureRenderer.field] : undefined;
  return typeof value === "string" || typeof value === "number"
    ? `${layer.name} · ${value}` : layer.name;
}

export function contextFeatureStyle(
  layer: ContextLayerDescriptor,
  properties: Record<string, unknown>,
  renderMode: "interactive" | "print",
): ContextFeatureStyle {
  const renderer = layer.featureRenderer;
  const value = renderer?.field ? String(properties[renderer.field] ?? "") : "";
  const style = (renderer && Object.hasOwn(renderer.styles, value) ? renderer.styles[value] : undefined) ?? renderer?.defaultStyle ?? { color: "#555555", fillOpacity: 0.25 };
  return renderMode === "print"
    ? { ...style, color: contextPrintColor(style.color), fillColor: contextPrintColor(style.fillColor ?? style.color) }
    : style;
}
