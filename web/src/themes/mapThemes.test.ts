import { describe, expect, it } from "vitest";
import { contextLayerCatalog } from "../layers/contextLayerCatalog";
import {
  allResourceLayerCatalog,
  environmentalHealthLayerCatalog,
  floodHazardLayerCatalog,
  provinceLayerCatalog,
} from "../layers/layerCatalog";
import type { ShareLayerId } from "../services/mapShareState";
import {
  buildMapPresentationFixture,
  builtInMapThemes,
  validateMapTheme,
} from "./mapThemes";
import { matchTheme, resolveTheme } from "./themeState";

/**
 * The fixture lives under the Swift package's test resources, beside
 * `layer-parity.json` and for the same reason: it is the web's declaration of
 * the categories and built-in themes, read by `MapThemeTests` so the Swift port
 * is checked against what the browser actually ships rather than against a
 * second Swift copy of the same list. It must never be bundled into the app.
 *
 * Regenerate with `npx vitest run mapThemes -u` after a theme change.
 */
const MAP_PRESENTATION_FIXTURE_PATH =
  "../../../NSMarksCore/Tests/ParityFixtures/Fixtures/map-presentation.json";

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
    ).toMatchFileSnapshot(MAP_PRESENTATION_FIXTURE_PATH);
  });
});

describe("Fishing setup", () => {
  const fishing = builtInMapThemes.find(({ id }) => id === "fishing")!;
  // The same restricted set App uses to decide whether a named setup needs the licence.
  const restricted = new Set<ShareLayerId>([
    ...provinceLayerCatalog.filter(({ licence }) => licence === "province-restricted").map(({ id }) => id),
    ...allResourceLayerCatalog.filter((layer) => "requiresProvinceLicence" in layer && layer.requiresProvinceLicence).map(({ id }) => id),
    ...floodHazardLayerCatalog.filter(({ licence }) => licence === "province-restricted").map(({ id }) => id),
    ...environmentalHealthLayerCatalog.filter(({ licence }) => licence === "province-restricted").map(({ id }) => id),
    ...contextLayerCatalog.filter(({ licence }) => licence === "province-restricted").map(({ id }) => id),
  ]);

  it("opens open water, access and fishing context on one modern background", () => {
    expect(fishing).toMatchObject({
      name: "Fishing",
      layerIds: [
        "modern",
        "fishing-spots",
        "stocked-waters",
        "dfo-small-craft-harbours-core",
        "dfo-small-craft-harbours-non-core",
        "water-features",
        "nshn-spines",
        "wsc-hydrometric-stations",
        "wharves-coastal-structures",
        "protected-conservation-areas",
        "roads",
        "campgrounds",
      ],
      preferredCategoryIds: ["water-terrain", "roads-places", "land-property"],
      taxSaleEnabled: false,
      mapMode: "current",
    });
    expect(fishing.description).toBeTruthy();
    expect(validateMapTheme(fishing)).toEqual([]);
  });

  it("needs no Province licence, so a first visit applies it exactly", () => {
    expect(fishing.layerIds.filter((id) => restricted.has(id))).toEqual([]);
    const resolved = resolveTheme(fishing, {
      licenceAccepted: false,
      availableLayerIds: new Set<ShareLayerId>(fishing.layerIds),
      restrictedLayerIds: restricted,
    });
    expect(resolved).toMatchObject({ status: "exact", blockedLayerIds: [], unavailableLayerIds: [] });
  });

  it("leaves the DFO aquatic species-at-risk layers out of the setup", () => {
    expect(contextLayerCatalog.map(({ id }) => id)).toEqual(expect.arrayContaining(["dfo-aquatic-critical-habitat", "dfo-aquatic-sar-range"]));
    expect(fishing.layerIds).not.toContain("dfo-aquatic-critical-habitat");
    expect(fishing.layerIds).not.toContain("dfo-aquatic-sar-range");
  });

  it("leaves out waterfalls, whose first appearance refits the map to the whole province", () => {
    // MapCanvas's LayerZoomController fits WATERFALL_DISCOVERY_BOUNDS when the
    // layer becomes visible, which would override the camera of a fishing link.
    expect(fishing.layerIds).not.toContain("waterfalls");
  });

  it("leaves out the GeoNAMES place-name dots, which bury the spot pins at the opening zoom", () => {
    expect(fishing.layerIds).not.toContain("place-names");
  });

  it("opens no province layer that would zoom the map in past the spot overview", () => {
    // LayerZoomController zooms to the largest minZoom >= 12 among the visible
    // province layers (property boundaries excepted), which would take a
    // fishing link from the spot overview to a few kilometres of shore.
    const detail = provinceLayerCatalog.filter(({ id, minZoom }) => id !== "nsprd" && minZoom >= 12).map(({ id }) => id);
    expect(fishing.layerIds.filter((id) => detail.includes(id as never))).toEqual([]);
    expect(fishing.layerIds).not.toContain("crown-lands");
  });

  it("is the setup its own layers identify, and stays outside the native presentation contract", () => {
    expect(matchTheme(fishing, builtInMapThemes)?.id).toBe("fishing");
    expect(buildMapPresentationFixture().builtInThemes.some(({ id }) => id === "fishing")).toBe(false);
    const nativeLayerIds = buildMapPresentationFixture().builtInThemes.flatMap(({ layerIds }) => layerIds);
    for (const { id } of contextLayerCatalog) expect(nativeLayerIds).not.toContain(id);
  });
});

it("keeps Poker clear and outside the native presentation contract", () => {
  expect(builtInMapThemes.find(({ id }) => id === "poker")).toMatchObject({
    layerIds: ["ns-aerial", "roads"], taxSaleEnabled: false,
  });
  expect(buildMapPresentationFixture().builtInThemes.some(({ id }) => id === "poker")).toBe(false);
});
