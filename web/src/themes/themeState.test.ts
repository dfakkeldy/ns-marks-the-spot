import { describe, expect, it } from "vitest";
import { builtInMapThemes } from "./mapThemes";
import { matchTheme, resolveTheme } from "./themeState";

describe("theme state", () => {
  it("resolves one complete target before UI state changes", () => {
    const theme = builtInMapThemes.find(({ id }) => id === "forestry-field-access")!;

    expect(
      resolveTheme(theme, {
        licenceAccepted: true,
        availableLayerIds: new Set(theme.layerIds),
        restrictedLayerIds: new Set(theme.layerIds),
      }),
    ).toEqual({
      target: {
        layerIds: theme.layerIds,
        opacityOverrides: {},
        preferredCategoryIds: theme.preferredCategoryIds,
        taxSaleEnabled: false,
        mapMode: "current",
      },
      blockedLayerIds: [],
      unavailableLayerIds: [],
      status: "exact",
    });
  });

  it("applies unrestricted layers and explains restricted and unavailable ones", () => {
    const theme = builtInMapThemes.find(({ id }) => id === "historical-maps")!;

    expect(
      resolveTheme(theme, {
        licenceAccepted: false,
        availableLayerIds: new Set(["modern", "place-names", "main-roads"]),
        restrictedLayerIds: new Set(["place-names", "main-roads"]),
      }),
    ).toMatchObject({
      target: { layerIds: ["modern"] },
      blockedLayerIds: ["place-names", "main-roads"],
      unavailableLayerIds: ["fletcher"],
      status: "partial",
    });
  });

  it("matches only map-affecting fields", () => {
    expect(matchTheme({
      layerIds: ["modern"],
      opacityOverrides: {},
      taxSaleEnabled: false,
      mapMode: "historical",
    }, builtInMapThemes)?.id).toBe("explore-nova-scotia");
  });

  it("marks visible layer IDs and supported opacity as modified", () => {
    expect(matchTheme({
      layerIds: ["modern", "roads"],
      opacityOverrides: {},
      taxSaleEnabled: false,
      mapMode: "current",
    }, builtInMapThemes)).toBeUndefined();
    expect(matchTheme({
      layerIds: ["modern"],
      opacityOverrides: { modern: 0.5 },
      taxSaleEnabled: false,
      mapMode: "current",
    }, builtInMapThemes)).toBeUndefined();
  });

  it("marks enabled Tax Sale and its mode as modified", () => {
    expect(matchTheme({
      layerIds: ["modern"],
      opacityOverrides: {},
      taxSaleEnabled: true,
      mapMode: "current",
    }, builtInMapThemes)).toBeUndefined();
    expect(matchTheme({
      layerIds: ["modern"],
      opacityOverrides: {},
      taxSaleEnabled: true,
      mapMode: "historical",
    }, builtInMapThemes)).toBeUndefined();
  });

  it("normalizes layer order and opacity key order before matching", () => {
    const theme = {
      ...builtInMapThemes[0],
      layerIds: ["modern", "roads"] as const,
      opacityOverrides: { roads: 0.4, modern: 0.8 },
    };

    expect(matchTheme({
      layerIds: ["roads", "modern"],
      opacityOverrides: { modern: 0.8, roads: 0.4 },
      taxSaleEnabled: false,
      mapMode: "historical",
    }, [theme])?.id).toBe("explore-nova-scotia");
  });
});
