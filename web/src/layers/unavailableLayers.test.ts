import { describe, expect, it } from "vitest";
import { contextLayerCatalog } from "./contextLayerCatalog";
import { forestryExclusionReason } from "./forestryExclusions";
import { landContextLayers } from "./landContextLayers";
import { isShareLayerId } from "../services/mapShareState";
import { unavailableLayers } from "./unavailableLayers";

describe("unavailable layer notices", () => {
  it("describes exactly the excluded sources without restoring executable descriptors", () => {
    const excluded = landContextLayers.filter(layer => forestryExclusionReason(layer.id) !== null);
    const ids = unavailableLayers.map(layer => layer.id);
    expect([...ids].sort()).toEqual(excluded.map(layer => layer.id).sort());
    expect(new Set(ids).size).toBe(ids.length);
    for (const notice of unavailableLayers) {
      expect(notice.name).toBe(excluded.find(layer => layer.id === notice.id)?.name);
      expect(contextLayerCatalog.some(layer => layer.id === notice.id)).toBe(false);
      expect(isShareLayerId(notice.id)).toBe(false);
      expect(notice).not.toHaveProperty("serviceUrl");
      expect(notice).not.toHaveProperty("exportOptions");
    }
  });
});
