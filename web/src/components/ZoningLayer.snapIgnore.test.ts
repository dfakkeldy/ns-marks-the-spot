import { describe, expect, it } from "vitest";
import { zoningLayerCatalog } from "../layers/layerCatalog";
import { printZoningStyle, zoningStyle } from "./ZoningLayer";

/**
 * Zoning geometry is live-query-only (redistribution restricted), so it must
 * never become a snap source — a snapped vertex would persist redistributed
 * coordinates into user layers and their exports. The default Geoman
 * semantics already exclude it under the edit session's opt-in mode; this
 * pin keeps the exclusion explicit instead of hinging on a vendored default.
 */
describe("zoning snap exclusion", () => {
  it("stamps snapIgnore on every zoning style", () => {
    for (const layer of zoningLayerCatalog) {
      expect(
        (zoningStyle(layer) as { snapIgnore?: boolean }).snapIgnore,
      ).toBe(true);
    }
    expect((printZoningStyle as { snapIgnore?: boolean }).snapIgnore).toBe(true);
  });
});
