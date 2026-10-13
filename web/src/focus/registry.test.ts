import { describe, expect, it } from "vitest";
import { fishingLayers } from "../layers/fishingLayers";
import { layerCategories, layerCategoryByLayerId } from "../layers/layerCategories";
import { rhodenaLayers } from "../rhodena/catalog";
import { rhodenaFocusDefinition } from "../rhodena/focusDefinition";
import { rhodenaFocusCategoryIds, rhodenaFocusLayerIds } from "../rhodena/focus";
import { isShareLayerId } from "../services/mapShareState";
import { builtInMapThemes } from "../themes/mapThemes";
import { focusOffersLayer } from "./focusDefinition";
import { focusDefinitions, focusForTheme } from "./registry";

const registered = Object.entries(focusDefinitions);

describe("focus page registry", () => {
  it.each(registered)("files %s under its own id", (key, focus) => {
    expect(focus.id).toBe(key);
  });

  it("gives each page its own setup", () => {
    const themeIds = registered.map(([, focus]) => focus.themeId);
    expect(new Set(themeIds).size).toBe(themeIds.length);
  });

  it.each(registered)("opens %s on a built-in setup whose layers it all offers", (_key, focus) => {
    const theme = builtInMapThemes.find(({ id }) => id === focus.themeId);
    expect(theme, focus.themeId).toBeDefined();
    for (const id of theme!.layerIds) expect(focusOffersLayer(focus, id), id).toBe(true);
  });

  it.each(registered)("lists real, distinct panel categories on %s", (_key, focus) => {
    const known = new Set<string>(layerCategories.map(({ id }) => id));
    for (const id of focus.categoryIds) expect(known.has(id), id).toBe(true);
    expect(new Set(focus.categoryIds).size).toBe(focus.categoryIds.length);
    if (focus.hiddenFeatures.has("tax-sale")) expect(focus.categoryIds).not.toContain("tax-sale");
    if (focus.hiddenFeatures.has("my-maps")) expect(focus.categoryIds).not.toContain("my-maps");
  });

  it.each(registered)("names only real layers on %s, each offered one in a category the page shows", (_key, focus) => {
    for (const id of [...focus.allowLayerIds, ...focus.denyLayerIds]) expect(isShareLayerId(id), id).toBe(true);
    for (const id of focus.allowLayerIds) {
      if (!focusOffersLayer(focus, id)) continue;
      expect(focus.categoryIds, id).toContain(layerCategoryByLayerId[id as keyof typeof layerCategoryByLayerId]);
    }
    for (const id of focus.denyLayerIds) expect(focusOffersLayer(focus, id), id).toBe(false);
  });

  it.each(registered)("opens %s inside the area it zooms to", (_key, focus) => {
    const [[south, west], [north, east]] = focus.fitBounds;
    expect(south).toBeLessThan(north);
    expect(west).toBeLessThan(east);
    expect(focus.initialPosition.latitude).toBeGreaterThanOrEqual(south);
    expect(focus.initialPosition.latitude).toBeLessThanOrEqual(north);
    expect(focus.initialPosition.longitude).toBeGreaterThanOrEqual(west);
    expect(focus.initialPosition.longitude).toBeLessThanOrEqual(east);
  });

  it("finds a page by its setup, and nothing for other setups", () => {
    expect(focusForTheme("rhodena")).toBe(focusDefinitions.rhodena);
    expect(focusForTheme("fishing")).toBe(focusDefinitions.fishing);
    expect(focusForTheme("explore-nova-scotia")).toBeUndefined();
    expect(focusForTheme("poker")).toBeUndefined();
    expect(focusForTheme(null)).toBeUndefined();
    expect(focusForTheme(undefined)).toBeUndefined();
  });
});

describe("Rhodena on the registry", () => {
  it("keeps the page's published set, camera and chrome", () => {
    expect(focusDefinitions.rhodena).toBe(rhodenaFocusDefinition);
    expect(rhodenaFocusDefinition.themeId).toBe("rhodena");
    expect(rhodenaFocusDefinition.pageTitle).toBe("Rhodena Wind — proposed turbine map");
    expect(rhodenaFocusDefinition.categoryIds).toBe(rhodenaFocusCategoryIds);
    expect(rhodenaFocusDefinition.allowLayerIds).toBe(rhodenaFocusLayerIds);
    // The fishing layers sit in Rhodena's water category but belong to /fishing.
    expect([...rhodenaFocusDefinition.denyLayerIds].sort()).toEqual(fishingLayers.map(({ id }) => id).sort());
    expect([...rhodenaFocusDefinition.hiddenFeatures].sort()).toEqual(["my-maps", "setup-picker", "tax-sale"]);
    expect(rhodenaFocusDefinition.backgroundSwitch).toBe(true);
    expect(rhodenaFocusDefinition.initialPosition).toEqual({ latitude: 45.785, longitude: -61.405, zoom: 11 });
    expect(rhodenaFocusDefinition.chrome.brand.label).toBe("Rhodena Wind — summary and layers");
    expect(rhodenaFocusDefinition.chrome.Panel).toBeUndefined();
    for (const { id } of rhodenaLayers) expect(focusOffersLayer(rhodenaFocusDefinition, id), id).toBe(true);
  });
});
