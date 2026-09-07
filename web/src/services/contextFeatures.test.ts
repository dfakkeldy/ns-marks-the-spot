import { describe, expect, it } from "vitest";
import type { ContextLayerDescriptor } from "../layers/contextLayerTypes";
import { contextLayerCatalog } from "../layers/contextLayerCatalog";
import { contextFeatureLabel, contextFeatureStyle, contextPrintColor } from "./contextFeatures";

const layer: ContextLayerDescriptor = {
  ...contextLayerCatalog.find(({ id }) => id === "karst-risk")!,
  featureRenderer: {
    field: "class",
    styles: { high: { color: "#ff0000", fillOpacity: 0.7, radius: 8 } },
    defaultStyle: { color: "#777777", fillOpacity: 0.2, radius: 4 },
  },
};

describe("context feature presentation", () => {
  it("selects the published class and preserves a neutral fallback for missing or unknown values", () => {
    expect(contextFeatureStyle(layer, { class: "high" }, "interactive")).toEqual(layer.featureRenderer?.styles.high);
    for (const value of [undefined, null, "new publisher class", 999, {}, []]) {
      expect(contextFeatureStyle(layer, { class: value }, "interactive")).toEqual(layer.featureRenderer?.defaultStyle);
    }
  });

  it("does not treat inherited object properties as source classes", () => {
    for (const value of ["constructor", "toString", "__proto__", "hasOwnProperty"]) {
      expect(contextFeatureStyle(layer, { class: value }, "interactive")).toEqual(layer.featureRenderer?.defaultStyle);
    }
  });

  it("uses monochrome print styling without mutating the live source style", () => {
    const original = structuredClone(layer.featureRenderer?.styles.high);
    expect(contextFeatureStyle(layer, { class: "high" }, "print")).toEqual({
      ...original, color: "#363636", fillColor: "#363636",
    });
    expect(layer.featureRenderer?.styles.high).toEqual(original);
  });

  it("keeps every published risk class distinguishable in print, including Not Evaluated", () => {
    for (const id of ["karst-risk", "seawater-intrusion-vulnerability"]) {
      const source = contextLayerCatalog.find((entry) => entry.id === id)!;
      const renderer = source.featureRenderer!;
      const tones = Object.keys(renderer.styles).map((value) =>
        contextFeatureStyle(source, { [renderer.field!]: value }, "print").fillColor);
      expect(new Set(tones).size).toBe(tones.length);
      expect(source.legend.filter(({ color }) => color).map(({ color }) => contextPrintColor(color!)))
        .toEqual(tones);
    }
  });

  it("labels only scalar source values and retains source text without interpreting markup", () => {
    expect(contextFeatureLabel(layer, { class: 0 })).toBe(`${layer.name} · 0`);
    expect(contextFeatureLabel(layer, { class: '<img src=x onerror="alert(1)">' })).toContain("<img");
    for (const value of [null, undefined, {}, []]) {
      expect(contextFeatureLabel(layer, { class: value })).toBe(layer.name);
    }
  });
});
