import { describe, expect, it } from "vitest";
import {
  initialResourceLayerVisibility,
  initialProvinceLayerVisibility,
  nativeLayerCatalog,
  provinceLayerIds,
  resourceLayerCatalog,
} from "./layerCatalog";

describe("web native-layer parity catalog", () => {
  it("mirrors the native catalog order, names, and service URLs", () => {
    expect(
      nativeLayerCatalog.map(({ id, name, serviceUrl }) => ({
        id,
        name,
        serviceUrl,
      })),
    ).toEqual([
      {
        id: "fletcher",
        name: "Fletcher",
        serviceUrl:
          "https://wmts.oldmapsonline.org/maps/9b86f069-b432-5e78-a4c9-306ee238e5fb/2023-06-13T14:40:41.945831Z/{z}/{x}/{y}.png",
      },
      {
        id: "ns-aerial",
        name: "NS Aerial",
        serviceUrl:
          "https://nsgiwa.novascotia.ca/arcgis/rest/services/BASE/BASE_NSODB_10k_WM84/MapServer",
      },
      {
        id: "nsprd",
        name: "NS Property Boundaries",
        serviceUrl:
          "https://nsgiwa2.novascotia.ca/arcgis/rest/services/PLAN/PLAN_NSPRD_WM84/MapServer",
      },
      {
        id: "crown-lands",
        name: "Crown Lands",
        serviceUrl:
          "https://nsgiwa.novascotia.ca/arcgis/rest/services/PLAN/PLANCrownLandsWM84V1/MapServer",
      },
      {
        id: "flood-risk",
        name: "Flood Risk Areas",
        serviceUrl:
          "https://fletcher.novascotia.ca/arcgis/rest/services/mrlu/flood_risk_areas/MapServer",
      },
      {
        id: "waterfalls",
        name: "Waterfalls",
        serviceUrl:
          "https://nsgiwa.novascotia.ca/arcgis/rest/services/BASE/BASE_NSTDB_10k_Water_WM84/MapServer",
      },
      {
        id: "water-features",
        name: "Water features",
        serviceUrl:
          "https://nsgiwa.novascotia.ca/arcgis/rest/services/BASE/BASE_NSTDB_10k_Water_WM84/MapServer",
      },
      {
        id: "roads",
        name: "Roads, trails & culverts",
        serviceUrl:
          "https://nsgiwa.novascotia.ca/arcgis/rest/services/BASE/BASE_NSTDB_10k_Roads_UT83/MapServer",
      },
    ]);
  });

  it("keeps Fletcher unavailable on the web while retaining native metadata", () => {
    const fletcher = nativeLayerCatalog[0];

    expect(fletcher.nativeDefaultVisibility).toBe(true);
    expect(fletcher.webAvailability).toBe("rights-pending");
    expect(fletcher.webCaveat).toBe("Web rights pending");
  });

  it("requires the Province licence for every Province-hosted layer", () => {
    expect(provinceLayerIds).toEqual([
      "ns-aerial",
      "nsprd",
      "crown-lands",
      "flood-risk",
      "waterfalls",
      "water-features",
      "roads",
    ]);

    expect(
      nativeLayerCatalog
        .filter(({ id }) => provinceLayerIds.includes(id))
        .every(({ licence }) => licence === "province-restricted"),
    ).toBe(true);
  });

  it("starts with aerial imagery, parcel boundaries, water, and roads as the context map", () => {
    expect(initialProvinceLayerVisibility).toEqual({
      "ns-aerial": true,
      nsprd: true,
      "crown-lands": false,
      "flood-risk": false,
      waterfalls: false,
      "water-features": true,
      roads: true,
    });
  });

  it("carries the native flood and waterfall rendering restrictions", () => {
    const aerial = nativeLayerCatalog.find(({ id }) => id === "ns-aerial");
    const floodRisk = nativeLayerCatalog.find(
      ({ id }) => id === "flood-risk",
    );
    const waterfalls = nativeLayerCatalog.find(
      ({ id }) => id === "waterfalls",
    );

    expect(aerial?.maxZoom).toBe(23);
    expect(floodRisk?.exportOptions?.layers).toBe("show:24,25,26");
    expect(waterfalls?.minZoom).toBe(7);
    expect(waterfalls?.webCaveat).toBe(
      "90 mapped falls · overview on selection",
    );
    expect(waterfalls?.exportOptions?.dynamicLayers).toContain(
      "FEAT_DESC = 'Falls -  On a single line river point'",
    );
    expect(waterfalls?.exportOptions?.dynamicLayers).toContain(
      '"mapLayerId":1',
    );
  });

  it("keeps the Province cartography and makes linear features legible", () => {
    const water = nativeLayerCatalog.find(
      ({ id }) => id === "water-features",
    );
    const roads = nativeLayerCatalog.find(({ id }) => id === "roads");

    expect(water?.exportOptions).toMatchObject({ transparent: true, dpi: 144 });
    expect(roads?.exportOptions).toMatchObject({ transparent: true, dpi: 192 });
    expect(roads?.webCaveat).toContain("culverts close up");
  });

  it("delays property boundaries until a useful regional zoom", () => {
    const propertyBoundaries = nativeLayerCatalog.find(
      ({ id }) => id === "nsprd",
    );

    expect(propertyBoundaries?.minZoom).toBe(10);
    expect(propertyBoundaries?.webCaveat).toBe("Zoom 10+ · not a survey");
    expect(propertyBoundaries?.exportOptions?.dpi).toBe(0.75);
  });

  it("publishes source date, scale, coverage, and zoom metadata for every layer", () => {
    for (const layer of nativeLayerCatalog) {
      expect(layer.sourceDate).not.toHaveLength(0);
      expect(layer.scale).not.toHaveLength(0);
      expect(layer.coverage).not.toHaveLength(0);
      expect(layer.minZoom).toBeTypeOf("number");
      expect(layer.maxZoom).toBeTypeOf("number");
    }
  });
});

describe("geology and resources catalog", () => {
  it("offers three open-data overlays without changing native-layer parity", () => {
    expect(
      resourceLayerCatalog.map(({ id, name, delivery }) => ({
        id,
        name,
        delivery,
      })),
    ).toEqual([
      {
        id: "mineral-occurrences",
        name: "Mineral occurrences",
        delivery: "feature-query",
      },
      {
        id: "mineral-tenure",
        name: "Mineral tenure",
        delivery: "map-export",
      },
      {
        id: "abandoned-mines",
        name: "Abandoned mine openings",
        delivery: "feature-query",
      },
    ]);

    expect(resourceLayerCatalog.every(({ licence }) => licence === "province-open")).toBe(
      true,
    );
  });

  it("starts every resource overlay off and carries source-specific cautions", () => {
    expect(initialResourceLayerVisibility).toEqual({
      "mineral-occurrences": false,
      "mineral-tenure": false,
      "abandoned-mines": false,
    });
    expect(
      resourceLayerCatalog
        .find(({ id }) => id === "mineral-occurrences")
        ?.webCaveat.toLocaleLowerCase(),
    ).toContain("recorded occurrences");
    expect(
      resourceLayerCatalog.find(({ id }) => id === "mineral-tenure")
        ?.webCaveat,
    ).toContain("not land ownership");
    expect(
      resourceLayerCatalog.find(({ id }) => id === "abandoned-mines")
        ?.webCaveat,
    ).toContain("hazard inventory");
  });

  it("exposes dated source, scale, coverage, and zoom metadata beside resource layers", () => {
    const mineralOccurrences = resourceLayerCatalog.find(
      ({ id }) => id === "mineral-occurrences",
    );
    const abandonedMines = resourceLayerCatalog.find(
      ({ id }) => id === "abandoned-mines",
    );

    expect(mineralOccurrences).toMatchObject({
      sourceDate: "June 2024 · version 12",
      scale: "Point inventory · source displays to 1:500,000",
      coverage: "Nova Scotia",
    });
    expect(abandonedMines).toMatchObject({
      sourceDate: "2024 · version 9",
      coverage: "Nova Scotia · incomplete inventory",
    });
  });
});
