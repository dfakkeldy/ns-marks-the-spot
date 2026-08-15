import { describe, expect, it } from "vitest";
import {
  buildMapPresentationFixture,
  builtInMapThemes,
  validateMapTheme,
} from "./mapThemes";

describe("built-in map themes", () => {
  it("defines the approved Explore setup", () => {
    expect(builtInMapThemes[0]).toMatchObject({
      id: "explore-nova-scotia",
      name: "Explore Nova Scotia",
      layerIds: ["modern"],
      preferredCategoryIds: ["background-maps"],
      taxSaleEnabled: false,
      mapMode: "current",
    });
  });

  it("defines Tax Sale Research as an explicit current-notice opt-in", () => {
    const theme = builtInMapThemes.find(({ id }) => id === "tax-sale-research");

    expect(theme).toMatchObject({
      layerIds: ["ns-aerial", "nsprd", "roads", "water-features", "buildings"],
      preferredCategoryIds: ["tax-sale", "land-property"],
      taxSaleEnabled: true,
      mapMode: "current",
    });
  });

  it("defines Forestry & Field Access with the approved field context", () => {
    const theme = builtInMapThemes.find(({ id }) => id === "forestry-field-access");

    expect(theme).toMatchObject({
      layerIds: [
        "ns-aerial",
        "nsprd",
        "crown-lands",
        "roads",
        "water-features",
        "contours",
        "old-growth-policy",
      ],
      preferredCategoryIds: [
        "forestry-ecology",
        "land-property",
        "roads-places",
        "water-terrain",
      ],
      taxSaleEnabled: false,
      mapMode: "current",
    });
  });

  it("defines Historical Maps with modern references", () => {
    const theme = builtInMapThemes.find(({ id }) => id === "historical-maps");

    expect(theme).toMatchObject({
      layerIds: ["modern", "fletcher", "place-names", "main-roads"],
      preferredCategoryIds: ["historical-maps", "roads-places"],
      taxSaleEnabled: false,
      mapMode: "current",
    });
  });

  it("defines Georeferencing as a clean reference setup", () => {
    const theme = builtInMapThemes.find(({ id }) => id === "georeferencing");

    expect(theme).toMatchObject({
      layerIds: ["modern", "place-names", "main-roads"],
      preferredCategoryIds: ["my-maps", "background-maps", "roads-places"],
      taxSaleEnabled: false,
      mapMode: "current",
    });
  });

  it("rejects more than one opaque background", () => {
    expect(
      validateMapTheme({
        ...builtInMapThemes[0],
        layerIds: ["modern", "ns-aerial"],
      }),
    ).toContain("opaque background");
  });

  it("rejects duplicate and unknown layer IDs", () => {
    expect(
      validateMapTheme({
        ...builtInMapThemes[0],
        layerIds: ["modern", "modern"],
      }),
    ).not.toEqual([]);
    expect(
      validateMapTheme({
        ...builtInMapThemes[0],
        layerIds: ["not-a-layer"] as never,
      }),
    ).not.toEqual([]);
  });

  it("rejects opacity outside the supported range and unknown categories", () => {
    expect(
      validateMapTheme({
        ...builtInMapThemes[0],
        opacityOverrides: { modern: 1.1 },
      }),
    ).not.toEqual([]);
    expect(
      validateMapTheme({
        ...builtInMapThemes[0],
        preferredCategoryIds: ["not-a-category"] as never,
      }),
    ).not.toEqual([]);
  });

  it("validates every built-in theme", () => {
    for (const theme of builtInMapThemes) {
      expect(validateMapTheme(theme)).toEqual([]);
    }
  });

  it("exports the native portability fixture from the registries", async () => {
    await expect(
      `${JSON.stringify(buildMapPresentationFixture(), null, 2)}\n`,
    ).toMatchFileSnapshot("./fixtures/map-presentation.json");
  });
});
