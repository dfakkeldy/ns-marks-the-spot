import { describe, expect, it } from "vitest";
import type { Feature } from "geojson";
import { LAYER_COLORS, nextLayerColor, styleForFeature } from "./style";

function feature(properties: Record<string, unknown> | null): Feature {
  return {
    type: "Feature",
    geometry: { type: "Point", coordinates: [-63, 45] },
    properties,
  };
}

describe("nextLayerColor", () => {
  it("cycles through the palette by count", () => {
    expect(nextLayerColor(0)).toBe(LAYER_COLORS[0]);
    expect(nextLayerColor(1)).toBe(LAYER_COLORS[1]);
    expect(nextLayerColor(LAYER_COLORS.length)).toBe(LAYER_COLORS[0]);
  });
});

describe("styleForFeature", () => {
  const layerStyle = { color: "#0072b2" };

  it("uses the layer color by default", () => {
    const style = styleForFeature(feature({}), layerStyle);
    expect(style.color).toBe("#0072b2");
    expect(style.fillColor).toBe("#0072b2");
    expect(style.weight).toBeGreaterThan(0);
    expect(style.fillOpacity).toBeGreaterThan(0);
    expect(style.fillOpacity).toBeLessThan(1);
  });

  it("tolerates null properties", () => {
    expect(styleForFeature(feature(null), layerStyle).color).toBe("#0072b2");
  });

  it("honors simplestyle stroke and fill properties (KML conversions carry them)", () => {
    const style = styleForFeature(
      feature({
        stroke: "#ff0000",
        "stroke-width": 4,
        "stroke-opacity": 0.5,
        fill: "#00ff00",
        "fill-opacity": 0.35,
      }),
      layerStyle,
    );
    expect(style.color).toBe("#ff0000");
    expect(style.weight).toBe(4);
    expect(style.opacity).toBe(0.5);
    expect(style.fillColor).toBe("#00ff00");
    expect(style.fillOpacity).toBe(0.35);
  });

  it("uses marker-color for point fills", () => {
    const style = styleForFeature(feature({ "marker-color": "#123456" }), layerStyle);
    expect(style.fillColor).toBe("#123456");
  });

  it("ignores non-string colors and non-finite numbers", () => {
    const style = styleForFeature(
      feature({ stroke: 42, "stroke-width": "wide", "fill-opacity": NaN }),
      layerStyle,
    );
    expect(style.color).toBe("#0072b2");
    expect(style.weight).toBeGreaterThan(0);
    expect(Number.isFinite(style.fillOpacity)).toBe(true);
  });
});
