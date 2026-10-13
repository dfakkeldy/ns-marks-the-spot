import { describe, expect, it } from "vitest";
import { biodiversityLayers } from "../layers/biodiversityLayers";
import { contextLayerCatalog } from "../layers/contextLayerCatalog";
import type { ShareLayerId } from "../services/mapShareState";
import {
  contextLayerIdsInCategories,
  filterFocusLayerIds,
  focusHides,
  focusOffersLayer,
  type FocusHiddenFeature,
} from "./focusDefinition";

const layerSets = (allow: readonly ShareLayerId[], deny: readonly ShareLayerId[] = []) => ({
  allowLayerIds: new Set(allow),
  denyLayerIds: new Set(deny),
});

describe("focus page layer sets", () => {
  it("offers every layer when no focus page is open", () => {
    expect(focusOffersLayer(undefined, "mineral-tenure")).toBe(true);
    expect(filterFocusLayerIds(undefined, ["modern", "mineral-tenure"])).toEqual(["modern", "mineral-tenure"]);
  });

  it("offers only the allowed layers", () => {
    const page = layerSets(["modern", "water-features"]);
    expect(focusOffersLayer(page, "water-features")).toBe(true);
    expect(focusOffersLayer(page, "mineral-tenure")).toBe(false);
    expect(focusOffersLayer(page, "not-a-layer")).toBe(false);
  });

  it("denies a layer even when its whole category is allowed", () => {
    // A page can offer a whole category and still withhold a layer that would
    // mislead beside the page's own content.
    const denied = ["dfo-aquatic-critical-habitat", "dfo-aquatic-sar-range"] as const;
    const page = layerSets(["modern", ...contextLayerIdsInCategories(["forestry-ecology"])], denied);

    for (const id of denied) {
      expect(contextLayerCatalog.find((layer) => layer.id === id)?.category, id).toBe("forestry-ecology");
      expect(page.allowLayerIds.has(id), id).toBe(true);
      expect(focusOffersLayer(page, id), id).toBe(false);
    }
    expect(focusOffersLayer(page, "ns-sar-core-habitat")).toBe(true);
  });

  it("lets a deny win over an explicit allow of the same id", () => {
    const page = layerSets(["modern", "waterfalls"], ["waterfalls"]);
    expect(focusOffersLayer(page, "waterfalls")).toBe(false);
    expect(focusOffersLayer(page, "modern")).toBe(true);
  });

  it("drops shared layers the page does not offer and keeps the order of the rest", () => {
    const page = layerSets(["modern", "roads", "water-features", "waterfalls"], ["waterfalls"]);
    expect(filterFocusLayerIds(page, ["water-features", "mineral-tenure", "waterfalls", "modern", "roads"]))
      .toEqual(["water-features", "modern", "roads"]);
  });
});

describe("context layers by category", () => {
  it("collects every context layer filed under the categories and nothing else", () => {
    const ids = contextLayerIdsInCategories(["water-terrain", "roads-places", "land-property"]);
    expect(ids).toContain("nshn-spines");
    expect(ids).toContain("wsc-hydrometric-stations");
    expect(ids).toContain("protected-conservation-areas");
    // Province-catalogue layers are named explicitly, never by category.
    expect(ids).not.toContain("water-features");
    expect(ids).not.toContain("crown-lands");
    for (const { id } of biodiversityLayers) expect(ids, id).not.toContain(id);
    for (const id of ids) {
      expect(["water-terrain", "roads-places", "land-property"], id)
        .toContain(contextLayerCatalog.find((layer) => layer.id === id)?.category);
    }
  });

  it("collects nothing for no categories", () => {
    expect(contextLayerIdsInCategories([])).toEqual([]);
  });
});

describe("hidden features", () => {
  it("hides only what the page lists, and nothing on the full map", () => {
    const page = { hiddenFeatures: new Set<FocusHiddenFeature>(["tax-sale"]) };
    expect(focusHides(page, "tax-sale")).toBe(true);
    expect(focusHides(page, "my-maps")).toBe(false);
    expect(focusHides(undefined, "tax-sale")).toBe(false);
  });
});
