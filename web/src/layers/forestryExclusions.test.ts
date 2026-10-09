import { beforeEach, describe, expect, it } from "vitest";
import { contextLayerCatalog, hiddenContextLayers } from "./contextLayerCatalog";
import { landContextLayers } from "./landContextLayers";
import { inRhodenaFocus } from "../rhodena/focus";
import { buildMapShareUrl, DEFAULT_MAP_POSITION, isShareLayerId, parseMapShareState, type ShareLayerId } from "../services/mapShareState";
import { CUSTOM_THEME_STORAGE_KEY, loadCustomThemes } from "../themes/themeStorage";
import { resolveTheme, visibilityRecordFor } from "../themes/themeState";
import { buildExportLayers, contextExportOmission } from "../print/pdf/exportLayerSpecs";

const excludedIds = ["wam-relative-wetness", "wam-predicted-flow", "forest-treatments"] as const;
const legacyIds: ShareLayerId[] = ["modern", ...excludedIds, "forest-height"];
const legacyTheme = {
  id: "legacy-forestry", kind: "custom" as const, name: "Legacy forestry",
  description: "A saved map from before the exclusions.", layerIds: legacyIds,
  opacityOverrides: { "forest-treatments": 0.5, "forest-height": 0.7 },
  preferredCategoryIds: ["water-terrain", "forestry-ecology"] as const,
  taxSaleEnabled: false, mapMode: "current" as const,
};
const bounds = { north: 46.35, south: 46.25, west: -61.25, east: -61.10 };
const source = (id: string) => landContextLayers.find(layer => layer.id === id)!;

beforeEach(() => localStorage.clear());

describe("withheld provincial forestry sources", () => {
  it.each(excludedIds)("does not offer %s in either production panel", id => {
    expect(contextLayerCatalog.some(layer => layer.id === id)).toBe(false);
    expect(Object.hasOwn(hiddenContextLayers, id)).toBe(false);
    expect(inRhodenaFocus(id)).toBe(false);
  });

  it("discards excluded IDs from old shared links while retaining other layers", () => {
    const parsed = parseMapShareState(`https://example.test/map/?layers=${legacyIds.join(",")}`);
    expect(parsed.layerIds).toEqual(["modern", "forest-height"]);
    for (const id of excludedIds) expect(isShareLayerId(id)).toBe(false);
  });

  it("does not carry stale excluded IDs into a newly shared URL", () => {
    const url = new URL(buildMapShareUrl("https://example.test/map/", {
      taxSaleEnabled: false, mode: "current", pid: null, eventIds: [],
      layerIds: legacyIds, position: DEFAULT_MAP_POSITION,
    }));
    expect(url.searchParams.get("layers")).toBe("modern,forest-height");
  });

  it("restores saved themes without excluded layers or their opacity settings", () => {
    const raw = JSON.stringify({ version: 1, themes: [legacyTheme] });
    localStorage.setItem(CUSTOM_THEME_STORAGE_KEY, raw);
    const restored = loadCustomThemes(localStorage);
    expect(restored.status).toBe("partial");
    expect(restored.themes[0].layerIds).toEqual(["modern", "forest-height"]);
    expect(restored.themes[0].opacityOverrides).toEqual({ "forest-height": 0.7 });
    expect(restored.warning).toContain("could not be restored");
    expect(localStorage.getItem(CUSTOM_THEME_STORAGE_KEY)).toBe(raw);
  });

  it("keeps stale visibility from re-enabling excluded IDs", () => {
    const visible = visibilityRecordFor(legacyIds, new Set(legacyIds));
    for (const id of excludedIds) expect(visible[id]).toBe(false);
    expect(visible["forest-height"]).toBe(true);
  });

  it("refuses excluded layers even when stale theme capabilities list them as available", () => {
    const resolved = resolveTheme(legacyTheme, {
      licenceAccepted: true, availableLayerIds: new Set(legacyIds), restrictedLayerIds: new Set(),
    });
    expect(resolved.target.layerIds).toEqual(["modern", "forest-height"]);
    expect(resolved.target.opacityOverrides).toEqual({ "forest-height": 0.7 });
    expect(resolved.unavailableLayerIds).toEqual(excludedIds);
  });

  it("does not suggest licence acceptance can restore excluded layers", () => {
    const resolved = resolveTheme(legacyTheme, {
      licenceAccepted: false, availableLayerIds: new Set(legacyIds), restrictedLayerIds: new Set(legacyIds),
    });
    expect(resolved.unavailableLayerIds).toEqual(excludedIds);
    expect(resolved.blockedLayerIds).toEqual(["modern", "forest-height"]);
  });

  it.each(excludedIds)("refuses direct PDF input for stale %s", id => {
    const legacySource = source(id);
    expect(() => buildExportLayers({
      bounds, showModernMap: false,
      fletcher: { visible: false, opacity: 1, tileBaseUrl: null, maxNativeZoom: 15 },
      arcgisLayers: [legacySource], userMaps: [], selectedParcelRings: [],
    })).toThrow(/excluded/);
  });

  it.each(excludedIds)("reports the exclusion before display-scale checks for %s", id => {
    const legacySource = source(id);
    expect(contextExportOmission(legacySource, legacySource.minZoom)).toMatch(/excluded/);
    expect(contextExportOmission(legacySource, legacySource.minZoom - 1)).toMatch(/excluded/);
  });

  it("preserves every other land-context descriptor", () => {
    for (const layer of landContextLayers.filter(layer => !excludedIds.some(id => id === layer.id))) {
      expect(contextLayerCatalog).toContain(layer);
    }
  });

  it("retains separate forest-inventory selectors on the same service", () => {
    const retained = [source("forest-leading-species"), source("forest-height")];
    const expectedSelectors: Record<string, string> = { "forest-leading-species": "show:5", "forest-height": "show:7" };
    const exported = buildExportLayers({
      bounds, showModernMap: false,
      fletcher: { visible: false, opacity: 1, tileBaseUrl: null, maxNativeZoom: 15 },
      arcgisLayers: retained, userMaps: [], selectedParcelRings: [],
    });
    expect(exported).toHaveLength(2);
    for (const layer of retained) {
      const image = exported.find(candidate => candidate.id === layer.id)!;
      if (image.kind !== "image") throw new Error("Missing forest-inventory image");
      const url = new URL(image.url({ bounds, widthPx: 900, heightPx: 600 })!);
      expect(url.searchParams.get("layers")).toBe(expectedSelectors[layer.id]);
    }
  });
});
