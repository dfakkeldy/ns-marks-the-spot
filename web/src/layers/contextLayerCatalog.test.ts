import { describe, expect, it } from "vitest";
import { contextLayerCatalog, hiddenContextLayers } from "./contextLayerCatalog";
import { layerCategoryByLayerId } from "./layerCategories";
import { buildMapShareUrl, parseMapShareState, DEFAULT_MAP_POSITION } from "../services/mapShareState";
import { buildMapPresentationFixture } from "../themes/mapThemes";

describe("GeoNova catalogue integration", () => {
  it("roundtrips all new layers in shared map state and starts them off", () => {
    const ids = contextLayerCatalog.map(({ id }) => id);
    expect(ids.length).toBeGreaterThanOrEqual(36);
    expect(new Set(ids).size).toBe(ids.length);
    expect(Object.values(hiddenContextLayers).every((visible) => !visible)).toBe(true);
    const url = buildMapShareUrl("https://example.test/map/", {
      taxSaleEnabled: false, mode: "current", pid: null, eventIds: [], layerIds: ids, position: DEFAULT_MAP_POSITION,
    });
    expect(parseMapShareState(url).layerIds).toEqual(ids);
  });
  it("puts historical coal workings with history and keeps web additions out of the native fixture", () => {
    expect(layerCategoryByLayerId["historical-coal-workings"]).toBe("historical-maps");
    expect(layerCategoryByLayerId.campgrounds).toBe("roads-places");
    expect(layerCategoryByLayerId["bedrock-geology"]).toBe("geology-resources");
    const nativeIds = buildMapPresentationFixture().categories.flatMap(({ layerIds }) => layerIds);
    for (const { id } of contextLayerCatalog) expect(nativeIds).not.toContain(id);
  });
  it("keeps broad context below selected-parcel authority with source and licence receipts", () => {
    for (const layer of contextLayerCatalog) {
      expect(layer.zIndex).toBeLessThan(300);
      expect(layer.sourceUrl).toMatch(/^https:\/\//);
      expect(layer.licenceUrl).toMatch(/^https:\/\//);
      expect(layer.sourceDate).toBeTruthy();
      expect(layer.coverage).toBeTruthy();
      expect(layer.webCaveat).toBeTruthy();
      if (layer.delivery === "feature-query") {
        expect(layer.idField).toBeTruthy();
        expect(layer.featureRenderer).toBeDefined();
      }
    }
  });
});
