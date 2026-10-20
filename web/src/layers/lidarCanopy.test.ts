import { describe, expect, it } from "vitest";
import { contextLayerCatalog, hiddenContextLayers } from "./contextLayerCatalog";
import { buildLayerParityFixture } from "./layerParity";
import { reproductionLockReason } from "../licensing/layerUse";
import { canopyTileBaseUrl } from "./lidarCanopy";

describe("Judique canopy-height pilot", () => {
  it("requires explicit tile configuration and rejects credentials or insecure remote hosts", () => {
    expect(canopyTileBaseUrl("")).toBeNull();
    expect(canopyTileBaseUrl(" http://127.0.0.1:4199/ ")).toBe("http://127.0.0.1:4199");
    expect(canopyTileBaseUrl("https://tiles.kinnokilabs.com/")).toBe("https://tiles.kinnokilabs.com");
    for (const url of ["http://example.test", "https://user:password@example.test", "https://example.test?token=value", "https://example.test#state"]) {
      expect(() => canopyTileBaseUrl(url)).toThrow();
    }
  });
  it("keeps the dated raster separate from inventory polygons, default off and outside native parity", () => {
    const layer = contextLayerCatalog.find(({ id }) => id === "lidar-canopy-height");
    expect(layer).toBeDefined();
    expect(layer).toMatchObject({
      category: "forestry-ecology", delivery: "tile", licence: "province-restricted",
      maxNativeZoom: 17,
    });
    expect(layer?.sourceDate).toContain("2017");
    expect(layer?.sourceDate).toContain("1045850061400");
    expect(layer?.webCaveat).toMatch(/not a timber cruise/i);
    expect(layer?.webCaveat).toMatch(/licence.*provisional/i);
    expect(layer?.attribution).toContain("shall not be construed");
    expect(Object.entries(hiddenContextLayers)).toContainEqual(["lidar-canopy-height", false]);
    expect(buildLayerParityFixture().layers.map(({ id }) => id)).not.toContain("lidar-canopy-height");
    expect(contextLayerCatalog.find(({ id }) => id === "forest-height")?.delivery).not.toBe("tile");
  });

  it("keeps print and PDF reproduction locked pending the CHM licence confirmation", () => {
    expect(reproductionLockReason("lidar-canopy-height")).toMatch(/canopy.*licence.*confirm/i);
  });
});
