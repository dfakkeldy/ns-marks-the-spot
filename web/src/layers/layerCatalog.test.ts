import { describe, expect, it } from "vitest";
import { nativeLayerCatalog, provinceLayerIds } from "./layerCatalog";

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

  it("makes property boundaries available across the full supported map range", () => {
    const propertyBoundaries = nativeLayerCatalog.find(
      ({ id }) => id === "nsprd",
    );

    expect(propertyBoundaries?.minZoom).toBe(7);
    expect(propertyBoundaries?.webCaveat).toBe("Zoom 7+ · not a survey");
    expect(propertyBoundaries?.exportOptions?.dpi).toBe(0.75);
  });
});
