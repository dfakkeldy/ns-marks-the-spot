import { describe, expect, it } from "vitest";
import {
  allResourceLayerCatalog,
  derivedResourceLayerCatalog,
  environmentalHealthLayerCatalog,
  floodHazardLayerCatalog,
  initialEnvironmentalHealthLayerVisibility,
  initialFloodHazardLayerVisibility,
  hydroPilotLayerCatalog,
  initialHydroPilotLayerVisibility,
  initialResourceLayerVisibility,
  initialProvinceLayerVisibility,
  nativeLayerCatalog,
  provinceLayerCatalog,
  provinceLayerIds,
  resourceLayerCatalog,
  initialZoningLayerVisibility,
  zoningLayerCatalog,
  type ProvinceLayerId,
} from "./layerCatalog";
import {
  OPEN_GOVERNMENT_LICENCE_TERMS_URL,
  PROVINCE_LICENSE_URL,
} from "../licensing/provinceLicense";

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
        name: "Watersheds",
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
      "buildings",
      "contours",
    ]);

    expect(
      nativeLayerCatalog
        .filter(({ id }) => provinceLayerIds.includes(id as ProvinceLayerId))
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
      buildings: false,
      contours: false,
    });
  });

  it("offers labelled LiDAR-derived contours as an optional close-range layer", () => {
    const contours = provinceLayerCatalog.find(({ id }) => id === "contours");

    expect(contours).toMatchObject({
      name: "Contours",
      serviceUrl:
        "https://nsgiwa.novascotia.ca/arcgis/rest/services/BASE/BASE_NSTDB_10k_Landforms_UT83/MapServer",
      minZoom: 13,
      maxZoom: 24,
      opacity: 0.88,
      exportOptions: {
        transparent: true,
        layers: "show:2,4",
        dpi: 144,
      },
    });
    expect(contours?.webCaveat).toContain("terrain screening only");
    expect(contours?.scale).toContain("5 m contours");
  });

  it("adds the web-only NSTDB buildings overlay without changing native parity", () => {
    expect(nativeLayerCatalog.some(({ id }) => id === "buildings")).toBe(false);
    expect(provinceLayerCatalog.find(({ id }) => id === "buildings")).toEqual(
      expect.objectContaining({
        name: "Buildings",
        serviceUrl:
          "https://nsgiwa.novascotia.ca/arcgis/rest/services/BASE/BASE_NSTDB_10k_Buildings_UT83/MapServer",
        minZoom: 13,
        exportOptions: { transparent: true, dpi: 144 },
      }),
    );
  });

  it("labels the watershed renderer honestly and carries its restrictions", () => {
    const aerial = nativeLayerCatalog.find(({ id }) => id === "ns-aerial");
    const floodRisk = nativeLayerCatalog.find(
      ({ id }) => id === "flood-risk",
    );
    const waterfalls = nativeLayerCatalog.find(
      ({ id }) => id === "waterfalls",
    );

    expect(aerial?.maxZoom).toBe(23);
    expect(floodRisk?.webCaveat).toContain("not flood-risk mapping");
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

  it("offers independently controlled published river and coastal hazard layers", () => {
    expect(
      floodHazardLayerCatalog.map(({ id, name, licence, exportOptions }) => ({
        id,
        name,
        licence,
        layers: exportOptions.layers,
      })),
    ).toEqual([
      {
        id: "published-river-flood-zones",
        name: "Published river flood zones",
        licence: "province-restricted",
        layers: "show:2,3,4,5,7,8,9,10,12,13,14,16,17,18",
      },
      {
        id: "coastal-flood-current",
        name: "Coastal flooding — current",
        licence: "province-open",
        layers: undefined,
      },
      {
        id: "coastal-flood-2050",
        name: "Coastal flooding — 2050",
        licence: "province-open",
        layers: undefined,
      },
      {
        id: "coastal-flood-2100",
        name: "Coastal flooding — 2100",
        licence: "province-open",
        layers: undefined,
      },
    ]);
    expect(initialFloodHazardLayerVisibility).toEqual({
      "published-river-flood-zones": false,
      "coastal-flood-current": false,
      "coastal-flood-2050": false,
      "coastal-flood-2100": false,
    });
  });

  it("keeps the Province cartography and makes linear features legible", () => {
    const water = nativeLayerCatalog.find(
      ({ id }) => id === "water-features",
    );
    const roads = nativeLayerCatalog.find(({ id }) => id === "roads");

    expect(water?.exportOptions).toMatchObject({ transparent: true, dpi: 144 });
    expect(roads?.exportOptions).toMatchObject({ transparent: true, dpi: 192 });
    expect(roads?.exportOverlayOptions?.dynamicLayers).toContain(
      "FEAT_DESC LIKE '%TRACK%' OR FEAT_DESC LIKE 'TRAIL%'",
    );
    expect(roads?.exportOverlayOptions?.dynamicLayers).toContain(
      '"mapLayerId":8',
    );
    expect(roads?.exportOverlayOptions?.dynamicLayers).toContain(
      '"color":[43,39,48,255]',
    );
    expect(roads?.webCaveat).toContain("culverts close up");
  });

  it("delays property boundaries until close parcel-detail zoom", () => {
    const propertyBoundaries = nativeLayerCatalog.find(
      ({ id }) => id === "nsprd",
    );

    expect(propertyBoundaries?.minZoom).toBe(14);
    expect(propertyBoundaries?.maxZoom).toBe(24);
    expect(propertyBoundaries?.webCaveat).toBe("Zoom 14+ · not a survey");
    expect(propertyBoundaries?.exportOptions?.dpi).toBeUndefined();
  });

  it("gates imagery and 1:10k line work to zooms where they are legible", () => {
    const byId = Object.fromEntries(
      nativeLayerCatalog.map((layer) => [layer.id, layer]),
    );

    expect(byId["ns-aerial"].minZoom).toBe(10);
    expect(byId["roads"].minZoom).toBe(10);
    expect(byId["water-features"].minZoom).toBe(10);
    expect(byId["waterfalls"].minZoom).toBe(7);
    expect(byId["ns-aerial"].webCaveat).toContain("zoom 10+");
    expect(byId["roads"].webCaveat).toContain("zoom 10+");
    expect(byId["water-features"].webCaveat).toContain("zoom 10+");
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
      "mineral-proximity-parcels": false,
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

  it("separates derived parcel proximity from source-backed resource overlays", () => {
    expect(derivedResourceLayerCatalog).toEqual([
      expect.objectContaining({
        id: "mineral-proximity-parcels",
        name: "Properties within 1 km of a mineral occurrence",
        delivery: "derived-parcel-query",
        minZoom: 12,
        requiresProvinceLicence: true,
      }),
    ]);
    expect(allResourceLayerCatalog).toHaveLength(4);
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

describe("environmental health screening catalog", () => {
  it("publishes the well-water risk screens and the aquifer context layer", () => {
    expect(
      environmentalHealthLayerCatalog.map(
        ({ id, name, licence, screening }) => ({
          id,
          name,
          licence,
          screening,
        }),
      ),
    ).toEqual([
      {
        id: "arsenic-risk-wells",
        name: "Arsenic risk — bedrock wells",
        licence: "province-restricted",
        screening: "well-water-risk",
      },
      {
        id: "uranium-risk-wells",
        name: "Uranium risk — bedrock wells",
        licence: "province-open",
        screening: "well-water-risk",
      },
      {
        id: "manganese-risk-wells",
        name: "Manganese risk — water wells",
        licence: "province-restricted",
        screening: "well-water-risk",
      },
      {
        id: "surficial-aquifers",
        name: "Surficial aquifers",
        licence: "province-restricted",
        screening: "aquifer-context",
      },
    ]);
    expect(initialEnvironmentalHealthLayerVisibility).toEqual({
      "arsenic-risk-wells": false,
      "uranium-risk-wells": false,
      "manganese-risk-wells": false,
      "surficial-aquifers": false,
    });
  });

  it("points every layer at the verified provincial service endpoint", () => {
    expect(
      Object.fromEntries(
        environmentalHealthLayerCatalog.map(({ id, serviceUrl }) => [
          id,
          serviceUrl,
        ]),
      ),
    ).toEqual({
      "arsenic-risk-wells":
        "https://nsgiwa.novascotia.ca/arcgis/rest/services/GEOL/GEOL_hg_ArsenicRiskWaterWells_h499ns_UT83/MapServer",
      "uranium-risk-wells":
        "https://dawson.novascotia.ca/arcgis/rest/services/hg_uranium_risk_h529ns_UT83/MapServer",
      "manganese-risk-wells":
        "https://dawson.novascotia.ca/arcgis/rest/services/hg_manganese_risk_h535ns_UT83/MapServer",
      "surficial-aquifers":
        "https://nsgiwa.novascotia.ca/arcgis/rest/services/GEOL/GEOL_hg_SurficialAquifers_h490ns_UT83/MapServer",
    });
  });

  it("licenses the open-data uranium screen apart from the restricted services", () => {
    const uranium = environmentalHealthLayerCatalog.find(
      ({ id }) => id === "uranium-risk-wells",
    );

    expect(uranium?.licenceUrl).toBe(OPEN_GOVERNMENT_LICENCE_TERMS_URL);
    expect(
      environmentalHealthLayerCatalog
        .filter(({ licence }) => licence === "province-restricted")
        .every(({ licenceUrl }) => licenceUrl === PROVINCE_LICENSE_URL),
    ).toBe(true);
  });

  it("frames every risk layer as a relative zone rather than a property result", () => {
    const riskLayers = environmentalHealthLayerCatalog.filter(
      ({ screening }) => screening === "well-water-risk",
    );

    expect(riskLayers).toHaveLength(3);
    for (const layer of riskLayers) {
      expect(layer.webCaveat).toContain("not a test result for this property");
      expect(layer.guidance.toLocaleLowerCase()).toContain("test");
      expect(layer.riskBands.map(({ label }) => label)).toEqual([
        "High Risk",
        "Medium Risk",
        "Low Risk",
      ]);
      // The province defines the top band by exceedance rate, not concentration.
      expect(layer.scale).toContain("high risk is >15% of well samples");
    }
  });

  it("keeps the aquifer context layer free of any risk claim", () => {
    const aquifers = environmentalHealthLayerCatalog.find(
      ({ id }) => id === "surficial-aquifers",
    );

    expect(aquifers?.riskBands).toEqual([]);
    expect(aquifers?.webCaveat).toContain("carries no risk rating");
    expect(aquifers?.guidance).toContain("no risk rating");
  });

  it("draws each screen with the province's own legend colours", () => {
    const bandsFor = (id: string) =>
      environmentalHealthLayerCatalog
        .find((layer) => layer.id === id)
        ?.riskBands.map(({ color }) => color);

    expect(bandsFor("arsenic-risk-wells")).toEqual([
      "#993d7a",
      "#c363e0",
      "#d8b5eb",
    ]);
    expect(bandsFor("uranium-risk-wells")).toEqual([
      "#808000",
      "#ffffbf",
      "#b0b0b0",
    ]);
    expect(bandsFor("manganese-risk-wells")).toEqual([
      "#828282",
      "#b2b2b2",
      "#e1e1e1",
    ]);
  });

  it("requests transparent exports across the full screening zoom range", () => {
    for (const layer of environmentalHealthLayerCatalog) {
      expect(layer.exportOptions).toMatchObject({ transparent: true });
      expect(layer.minZoom).toBe(7);
      expect(layer.maxZoom).toBe(24);
      expect(layer.opacity).toBeLessThan(0.6);
      expect(layer.sourceDate).not.toHaveLength(0);
      expect(layer.coverage).not.toHaveLength(0);
    }
  });
});

describe("municipal zoning catalog", () => {
  it("publishes one layer per zoning jurisdiction, all starting off", () => {
    expect(
      zoningLayerCatalog.map(({ id, name, minZoom }) => ({ id, name, minZoom })),
    ).toEqual([
      { id: "zoning-inverness", name: "Inverness County", minZoom: 12 },
      { id: "zoning-victoria", name: "Victoria County", minZoom: 12 },
      { id: "zoning-richmond", name: "Richmond County", minZoom: 12 },
      { id: "zoning-cumberland", name: "Cumberland County", minZoom: 13 },
      {
        id: "zoning-halifax",
        name: "Halifax Regional Municipality",
        minZoom: 13,
      },
    ]);
    expect(initialZoningLayerVisibility).toEqual({
      "zoning-inverness": false,
      "zoning-victoria": false,
      "zoning-richmond": false,
      "zoning-cumberland": false,
      "zoning-halifax": false,
    });
  });

  it("never republishes geometry from a source that states no licence", () => {
    for (const layer of zoningLayerCatalog) {
      if (layer.licence === "municipal-no-stated-licence") {
        expect(layer.licenceUrl).toBeNull();
        expect(layer.redistribution).toBe("live-query-only");
      } else {
        expect(layer.licenceUrl).not.toBeNull();
      }
    }

    // Halifax is the only source publishing an explicit open licence.
    expect(
      zoningLayerCatalog
        .filter(({ redistribution }) => redistribution === "permitted")
        .map(({ id }) => id),
    ).toEqual(["zoning-halifax"]);
  });

  it("shares one field mapping across the three EDPC counties", () => {
    const edpc = zoningLayerCatalog.filter(({ serviceUrl }) =>
      serviceUrl.includes("services5.arcgis.com/IRdatShZ61GuNjMZ"),
    );

    expect(edpc).toHaveLength(3);
    for (const layer of edpc) {
      expect(layer.zoneCodeField).toBe("Zone");
      expect(layer.zoneNameField).toBe("ZONETYPE");
      expect(layer.planAreaField).toBe("PLAN_");
      expect(layer.bylawUrl).toMatch(/^https:\/\/edpc\.ca\/plandocs\/.+\.pdf$/);
    }
  });

  it("orders and identifies every source by a field that source actually has", () => {
    for (const layer of zoningLayerCatalog) {
      // geo_id is a provincial convention; these services reject it outright.
      expect(layer.orderByFields).not.toBe("geo_id");
      expect(layer.outFields).toContain(layer.idField);
      expect(layer.outFields).toContain(layer.zoneCodeField);
      expect(layer.outFields).toContain(layer.zoneNameField);
    }
  });

  it("states the vintage Cumberland's service name hides", () => {
    const cumberland = zoningLayerCatalog.find(
      ({ id }) => id === "zoning-cumberland",
    );

    // The service slug says 2018; the published layer is CU_Zone_2025.
    expect(cumberland?.serviceUrl).toContain("Zoning_Cumberland_2018");
    expect(cumberland?.sourceDate).toContain("CU_Zone_2025");
    expect(cumberland?.sourceDate).toContain("consolidated to April 17, 2026");
  });

  it("points Halifax at a by-law index because its zoning spans many by-laws", () => {
    const halifax = zoningLayerCatalog.find(({ id }) => id === "zoning-halifax");

    expect(halifax?.bylawUrl).toBe(
      "https://www.halifax.ca/city-hall/legislation-by-laws/land-use-by-laws",
    );
    expect(halifax?.coverage).toContain("22 separate plan-area by-laws");
  });

  it("warns that county layers do not cover separately zoned communities", () => {
    const victoria = zoningLayerCatalog.find(({ id }) => id === "zoning-victoria");

    expect(victoria?.coverage).toContain("Baddeck");
    expect(
      zoningLayerCatalog.every(({ webCaveat }) =>
        webCaveat.includes("Unofficial"),
      ),
    ).toBe(true);
  });

  it("publishes dated source, scale, and coverage metadata for every layer", () => {
    for (const layer of zoningLayerCatalog) {
      expect(layer.sourceDate).not.toHaveLength(0);
      expect(layer.scale).not.toHaveLength(0);
      expect(layer.coverage).not.toHaveLength(0);
      expect(layer.attribution).not.toHaveLength(0);
      expect(layer.bylawLabel).not.toHaveLength(0);
    }
  });
});

describe("micro-hydro screening pilot catalog", () => {
  it("publishes one optional open-data Inverness screening layer", () => {
    expect(hydroPilotLayerCatalog).toEqual([
      expect.objectContaining({
        id: "inverness-hydro-potential",
        name: "Inverness micro-hydro screen",
        licence: "province-open",
        coverage: "13 Inverness-centred watersheds with connected tributary coverage",
      }),
    ]);
    expect(initialHydroPilotLayerVisibility).toEqual({
      "inverness-hydro-potential": false,
    });
    expect(hydroPilotLayerCatalog[0].webCaveat).toContain("1–50 kW scale");
    expect(hydroPilotLayerCatalog[0].scale).toContain("tertiary");
  });
});
