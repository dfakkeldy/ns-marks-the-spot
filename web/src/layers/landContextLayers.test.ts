import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { landContextLayers } from "./landContextLayers";
import type { ContextLayerDescriptor } from "./contextLayerTypes";

const find = (id: string): ContextLayerDescriptor => {
  const layer = landContextLayers.find((candidate) => candidate.id === id);
  if (!layer) throw new Error(`Missing ${id}`);
  return layer;
};

describe("land context source contracts", () => {
  it("keeps the WAM index separate from modelled drainage", () => {
    expect(find("wam-relative-wetness").exportOptions.layers).toBe("show:1");
    expect(find("wam-predicted-flow").exportOptions.layers).toBe("show:0");
    expect(find("wam-relative-wetness").webCaveat).toContain("not depth to groundwater");
    expect(find("wam-predicted-flow").minZoom).toBe(14);
  });
  it("lets source scale ranges switch treatment detail without showing archived harvest plans", () => {
    expect(find("forest-treatments").exportOptions.layers).toBe("show:2,3");
    expect(find("crown-harvest-plans").exportOptions.layers).toBe("show:0");
  });
  it("does not merge water-source evidence into a service availability layer", () => {
    expect(find("designated-water-supply-areas").exportOptions.layers).toBe("show:38");
    expect(find("municipal-surface-water-supply-areas").exportOptions.layers).toBe("show:39");
    expect(find("source-water-well-field-protection").exportOptions.layers).toBe("show:47");
  });
  it("preserves source classes and an explicit unevaluated seawater state", () => {
    const layer = find("seawater-intrusion-vulnerability");
    expect(layer.featureRenderer?.field).toBe("swi_eval");
    expect(layer.featureRenderer?.styles.unknown).not.toEqual(layer.featureRenderer?.styles.Low);
    expect(layer.legend).toContainEqual({ label: "Not Evaluated", color: "#cccccc" });
    expect(find("karst-risk").featureRenderer?.field).toBe("rank_1");
    expect(find("karst-occurrences").featureRenderer?.field).toBe("plot_code");
  });
  it("keeps coal workings historical and regional fills below parcel evidence", () => {
    expect(find("historical-coal-workings").category).toBe("historical-maps");
    for (const id of ["bedrock-geology", "surficial-geology", "forest-leading-species", "forest-height", "karst-risk"]) {
      expect(find(id).zIndex).toBeLessThan(200);
      expect(find(id).maxZoom).toBe(23);
    }
    expect(find("karst-occurrences").zIndex).toBe(245);
  });
  it("pins the radon raster to its verified source receipt and geographic bounds", () => {
    const receipt = JSON.parse(readFileSync(resolve("public/data/radon-potential.source.json"), "utf8"));
    const png = readFileSync(resolve("public/data/radon-potential.png"));
    expect(createHash("sha256").update(png).digest("hex")).toBe(receipt.outputSha256);
    expect(find("radon-potential").imageBounds).toEqual(receipt.imageBounds);
    expect(find("radon-potential").delivery).toBe("static-image");
    expect(receipt.sourceRasterCellSizeMetres).toBe(250);
    expect(receipt.validation.mismatches).toBe(0);
    expect(receipt.scoreToClass[15]).toBe("Water Feature/No Data");
    expect(receipt.scoreToClass[120]).toBe("Low");
    expect(receipt.scoreToClass[125]).toBe("Medium");
    expect(receipt.scoreToClass[175]).toBe("High");
  });

});
