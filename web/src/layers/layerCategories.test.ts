import { describe, expect, it } from "vitest";
import {
  churchLayerCatalog,
  environmentalHealthLayerCatalog,
  fletcherLayerCatalog,
  floodHazardLayerCatalog,
  forestryLayerCatalog,
  hydroPilotLayerCatalog,
  liveConditionsLayerCatalog,
  provinceLayerCatalog,
  allResourceLayerCatalog,
  wellLogLayerCatalog,
  zoningLayerCatalog,
} from "./layerCatalog";
import {
  layerCategories,
  layerCategoryByLayerId,
} from "./layerCategories";

const catalogueIds = [
  "modern",
  fletcherLayerCatalog.id,
  ...provinceLayerCatalog.map((layer) => layer.id),
  ...allResourceLayerCatalog.map((layer) => layer.id),
  ...hydroPilotLayerCatalog.map((layer) => layer.id),
  ...floodHazardLayerCatalog.map((layer) => layer.id),
  ...environmentalHealthLayerCatalog.map((layer) => layer.id),
  ...forestryLayerCatalog.map((layer) => layer.id),
  ...zoningLayerCatalog.map((layer) => layer.id),
  ...wellLogLayerCatalog.map((layer) => layer.id),
  ...churchLayerCatalog.map((layer) => layer.id),
  ...liveConditionsLayerCatalog.map((layer) => layer.id),
];

describe("layer category contract", () => {
  it("assigns every supported catalogue layer exactly once", () => {
    expect(Object.keys(layerCategoryByLayerId).sort()).toEqual(
      [...new Set(catalogueIds)].sort(),
    );
    expect(catalogueIds).toHaveLength(new Set(catalogueIds).size);
  });

  it("uses the approved category order", () => {
    expect(layerCategories.map(({ id }) => id)).toEqual([
      "background-maps",
      "land-property",
      "roads-places",
      "water-terrain",
      "environment-hazards",
      "forestry-ecology",
      "geology-resources",
      "historical-maps",
      "tax-sale",
      "my-maps",
    ]);
  });

  it("keeps category identity independent of themes", () => {
    expect(layerCategoryByLayerId["modern"]).toBe("background-maps");
    expect(layerCategoryByLayerId["nsprd"]).toBe("land-property");
    expect(layerCategoryByLayerId["roads"]).toBe("roads-places");
    expect(layerCategoryByLayerId["water-features"]).toBe("water-terrain");
    expect(layerCategoryByLayerId["old-growth-policy"]).toBe("forestry-ecology");
    expect(layerCategoryByLayerId["fletcher"]).toBe("historical-maps");
  });
});
