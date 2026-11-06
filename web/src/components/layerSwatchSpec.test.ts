import { render } from "@testing-library/react";
import { createElement } from "react";
import { describe, expect, it } from "vitest";
import { contextLayerCatalog } from "../layers/contextLayerCatalog";
import { provinceLayerCatalog } from "../layers/layerCatalog";
import { LayerSwatch } from "./LayerSwatch";
import { contextLayerSwatch, openDataSwatch, SWATCH_MIN_FILL_OPACITY, type LayerSwatchSpec } from "./layerSwatchSpec";

const colorsOf = (spec: LayerSwatchSpec): string[] =>
  spec.shape === "classes" ? [...spec.colors] : spec.shape === "area" ? [spec.color, spec.fill] : [spec.color];

describe("layer row swatches", () => {
  it("draw each project-rendered Province layer in its renderer colour", () => {
    for (const layer of provinceLayerCatalog) {
      if (!layer.openData) continue;
      const spec = openDataSwatch(layer.openData);
      expect(colorsOf(spec), layer.id).toEqual(colorsOf(spec).map(() => layer.openData!.color));
    }
  });

  it("leave layers with no catalogue symbol bare", () => {
    // Aerial photos and property boundaries carry no symbol colour in the catalogue.
    for (const id of ["ns-aerial", "nsprd"]) {
      expect(provinceLayerCatalog.find((layer) => layer.id === id)?.openData).toBeUndefined();
    }
    for (const layer of contextLayerCatalog) {
      const named = [
        layer.openData?.color,
        layer.featureRenderer?.defaultStyle.color,
        layer.featureRenderer?.defaultStyle.fillColor,
        ...layer.legend.map(({ color }) => color),
      ].filter(Boolean);
      if (named.length === 0) expect(contextLayerSwatch(layer), layer.id).toBeNull();
    }
  });

  it("never show a colour the layer's catalogue entry does not name", () => {
    for (const layer of contextLayerCatalog) {
      const spec = contextLayerSwatch(layer);
      if (!spec) continue;
      const named = new Set([
        layer.openData?.color,
        layer.featureRenderer?.defaultStyle.color,
        layer.featureRenderer?.defaultStyle.fillColor,
        ...layer.legend.map(({ color }) => color),
      ]);
      for (const color of colorsOf(spec)) expect(named.has(color), `${layer.id}: ${color}`).toBe(true);
    }
  });

  it("match the renderer's symbol shape", () => {
    const province = (id: string) => openDataSwatch(provinceLayerCatalog.find((layer) => layer.id === id)!.openData!);
    expect(province("roads")).toMatchObject({ shape: "line", road: true });
    expect(province("contours")).toMatchObject({ shape: "line", dashed: false });
    expect(province("place-names")).toMatchObject({ shape: "ring" });
    expect(province("waterfalls")).toMatchObject({ shape: "dot" });
    expect(province("buildings")).toMatchObject({ shape: "area", fillOpacity: 0.45, outline: true });
    // Crown land is drawn as a tint with no outline.
    expect(province("crown-lands")).toMatchObject({ shape: "area", outline: false, fillOpacity: SWATCH_MIN_FILL_OPACITY });
    const context = (id: string) => contextLayerSwatch(contextLayerCatalog.find((layer) => layer.id === id)!);
    expect(context("pipelines")).toMatchObject({ shape: "line", dashed: true, casing: true });
    expect(context("planned-wind-turbines")).toMatchObject({ shape: "dot", hollow: true });
    expect(context("nshn-spines")).toMatchObject({ shape: "line" });
    expect(context("ns-sar-core-habitat")).toMatchObject({ shape: "area", color: "#c25079" });
    expect(context("fishing-spots")).toMatchObject({ shape: "classes" });
    expect(context("sentinel-2")).toBeNull();
  });

  it("render as a decorative mark, or nothing", () => {
    const { container, rerender } = render(createElement(LayerSwatch, { spec: { shape: "ring", color: "#29332e" } }));
    const mark = container.querySelector(".layer-swatch");
    expect(mark?.getAttribute("aria-hidden")).toBe("true");
    expect(mark?.getAttribute("data-swatch")).toBe("ring");
    rerender(createElement(LayerSwatch, { spec: null }));
    expect(container.querySelector(".layer-swatch")).toBeNull();
  });
});
