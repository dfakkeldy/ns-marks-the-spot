import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import * as layerCatalogs from "./layerCatalog";
import { contextLayerCatalog, hiddenContextLayers } from "./contextLayerCatalog";
import type { ContextLayerDescriptor } from "./contextLayerTypes";
import { layerCategoryByLayerId } from "./layerCategories";
import {
  FISHING_SPOT_FIELDS,
  FISHING_SPOTS_COVERAGE,
  fishingEvidenceLabels,
  fishingLayers,
  fishingSpotsLayer,
  fishingWaterTypes,
  withheldFishingSources,
} from "./fishingLayers";
import { ContextOutsideCoverageError, fetchContextFeatures } from "../services/contextVectorSource";
import coreHarbours from "../test/fixtures/dfo-small-craft-harbours/core-ns.json";
import nonCoreHarbours from "../test/fixtures/dfo-small-craft-harbours/non-core-ns.json";

type Feature = { type: string; geometry: { type: string; coordinates: [number, number] }; properties: Record<string, unknown> };
const publicText = (name: string) => readFileSync(resolve("public/fishing", name), "utf8");
const publicJson = (name: string) => JSON.parse(publicText(name));
const spots = publicJson("spots.geojson") as { notice: string; features: Feature[] };
const stocked = publicJson("stocked-waters.geojson") as { label: string; features: Feature[] };
const receipt = publicJson("source.json");
const stockedReceipt = publicJson("stocked-waters.source.json");
const layer = (id: (typeof fishingLayers)[number]["id"]): ContextLayerDescriptor => fishingLayers.find((entry) => entry.id === id)!;
const scalar = (value: unknown) => typeof value === "string" || typeof value === "number" || typeof value === "boolean";
const inside = ([x, y]: [number, number], b: { west: number; south: number; east: number; north: number }) =>
  x >= b.west && x <= b.east && y >= b.south && y <= b.north;

/** Every popup field must be a scalar on every shipped record, or the generic popup says "Not supplied by source". */
function expectScalarPopups(descriptor: ContextLayerDescriptor, features: readonly Feature[]) {
  const fields = [descriptor.idField!, descriptor.labelField!, ...(descriptor.popupFields ?? []).map(({ field }) => field)];
  for (const feature of features) {
    for (const field of fields) expect(scalar(feature.properties[field]), `${String(feature.properties[descriptor.idField!])}.${field}`).toBe(true);
  }
  const ids = features.map((feature) => feature.properties[descriptor.idField!]);
  expect(new Set(ids).size).toBe(ids.length);
}

afterEach(() => vi.unstubAllGlobals());

describe("fishing layer descriptors", () => {
  it("files every fishing layer under Water & Terrain, off by default, with no new category", () => {
    expect(fishingLayers.map(({ id }) => id)).toEqual([
      "fishing-spots", "stocked-waters", "dfo-small-craft-harbours-core", "dfo-small-craft-harbours-non-core",
    ]);
    const catalogued = new Set(contextLayerCatalog.map(({ id }) => id));
    for (const { id, category, delivery } of fishingLayers) {
      expect(catalogued.has(id)).toBe(true);
      expect(category).toBe("water-terrain");
      expect(layerCategoryByLayerId[id]).toBe("water-terrain");
      expect(hiddenContextLayers[id]).toBe(false);
      expect(delivery).toBe("feature-query");
    }
  });

  it("keeps each source's licence and identity, and marks only the curated spots as the project's own", () => {
    expect(layer("fishing-spots")).toMatchObject({ licence: "cc-by", provenance: "project-derived" });
    expect(layer("fishing-spots").attribution).toMatch(/CC BY 4\.0/);
    expect(layer("fishing-spots").attribution).toMatch(/Open Government Licence – Nova Scotia/);
    expect(layer("fishing-spots").attribution).toMatch(/Open Government Licence – Canada/);
    expect(layer("fishing-spots").sourceUrl).toMatch(/\/docs\/gis-fishing-sources\.md$/);
    expect(layer("fishing-spots").licenceUrl).toMatch(/\/web\/public\/fishing\/LICENCE\.txt$/);
    expect(layer("stocked-waters")).toMatchObject({ licence: "province-open", sourceUrl: "https://data.novascotia.ca/d/8e4a-m6fw" });
    for (const id of ["dfo-small-craft-harbours-core", "dfo-small-craft-harbours-non-core"] as const) {
      expect(layer(id)).toMatchObject({ licence: "canada-open", licenceUrl: "https://open.canada.ca/en/open-government-licence-canada" });
    }
    expect(contextLayerCatalog.filter((entry) => entry.provenance === "project-derived").map(({ id }) => id)).toEqual(["fishing-spots"]);
    for (const { licence } of fishingLayers) expect(licence).not.toBe("province-restricted");
  });
});

describe("curated fishing spots", () => {
  it("ships exactly the export allowlist, with no other field", () => {
    expect(spots.features).toHaveLength(receipt.spots.features);
    for (const feature of spots.features) {
      expect(Object.keys(feature.properties).sort()).toEqual([...FISHING_SPOT_FIELDS].sort());
      expect(feature.geometry.type).toBe("Point");
    }
    expect(publicText("spots.geojson")).not.toMatch(/openstreetmap|osrm/i);
  });

  it("shows only scalar popup fields, labelled values and pins inside the declared coverage", () => {
    const descriptor = layer("fishing-spots");
    expectScalarPopups(descriptor, spots.features);
    expect(FISHING_SPOTS_COVERAGE).toEqual(receipt.spots.coverageBounds);
    expect(descriptor.coverageBounds).toEqual(receipt.spots.coverageBounds);
    for (const feature of spots.features) expect(inside(feature.geometry.coordinates, FISHING_SPOTS_COVERAGE)).toBe(true);
    expect(descriptor.webCaveat).toBe(spots.notice);
    const waterTypes = new Set(spots.features.map(({ properties }) => String(properties.water_type)));
    expect([...waterTypes].sort()).toEqual(Object.keys(fishingWaterTypes).sort());
    for (const type of waterTypes) expect(descriptor.featureRenderer?.styles[type]?.fillColor).toBe(fishingWaterTypes[type as keyof typeof fishingWaterTypes].color);
    expect(descriptor.legend.map(({ color }) => color)).toEqual(Object.values(fishingWaterTypes).map(({ color }) => color));
    const evidence = descriptor.popupFields?.find(({ field }) => field === "evidence")?.values ?? {};
    for (const { properties } of spots.features) expect(Object.hasOwn(fishingEvidenceLabels, String(properties.evidence)) && Object.hasOwn(evidence, String(properties.evidence))).toBe(true);
    expect(fishingSpotsLayer).toBe(fishingLayers[0]);
  });

  it("keeps the generic feature path's coverage gate, though the map never takes it", async () => {
    // MapCanvas draws this layer with FishingSpotsLayer, not ContextFeatureLayer;
    // when that fetches is pinned in data.test.ts and FishingSpotsLayer.test.tsx.
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    await expect(fetchContextFeatures(layer("fishing-spots"), { west: -64, south: 44.5, east: -63, north: 45 }))
      .rejects.toBeInstanceOf(ContextOutsideCoverageError);
    expect(fetch).not.toHaveBeenCalled();
  });
});

describe("stocked waters", () => {
  it("ships the receipted snapshot with scalar popups and its publisher caveat", () => {
    const descriptor = layer("stocked-waters");
    expect(stocked.features).toHaveLength(stockedReceipt.output.features);
    expectScalarPopups(descriptor, stocked.features);
    expect(descriptor.webCaveat).toBe(stocked.label);
    for (const { properties } of stocked.features) {
      expect(Object.hasOwn(descriptor.featureRenderer!.styles, String(properties.water_type))).toBe(true);
      expect(String(properties.species_text)).not.toMatch(/salmon/i);
    }
    for (const feature of stocked.features) expect(inside(feature.geometry.coordinates, { west: -66.5, south: 43.3, east: -59.6, north: 47.1 })).toBe(true);
  });
});

describe("DFO small craft harbours", () => {
  const harbours = [
    { id: "dfo-small-craft-harbours-core", layerNumber: "0", fixture: coreHarbours },
    { id: "dfo-small-craft-harbours-non-core", layerNumber: "1", fixture: nonCoreHarbours },
  ] as const;

  it.each(harbours)("queries MapServer layer $layerNumber for Nova Scotia rows only ($id)", ({ id, layerNumber }) => {
    const descriptor = layer(id);
    expect(descriptor.serviceUrl).toBe(`https://egisp.dfo-mpo.gc.ca/arcgis/rest/services/open_data_donnees_ouvertes/small_craft_harbours_en/MapServer/${layerNumber}`);
    expect(descriptor.featureWhere).toBe("Province = 'NS'");
    expect(descriptor.idField).toBe("OBJECTID");
    for (const { field } of descriptor.popupFields ?? []) expect(descriptor.outFields).toContain(field);
    expect(descriptor.webCaveat).toMatch(/not permission to fish from the wharf/);
  });

  it.each(harbours)("reads the mocked service response for $id with its source identities", async ({ id, layerNumber, fixture }) => {
    const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify(fixture), { headers: { "content-type": "application/geo+json" } }));
    vi.stubGlobal("fetch", fetch);
    const descriptor = layer(id);
    const collection = await fetchContextFeatures(descriptor, { west: -62, south: 45.3, east: -60.5, north: 46.1 }, new AbortController().signal);

    expect(fetch).toHaveBeenCalledOnce();
    const url = new URL(fetch.mock.calls[0][0]);
    expect(url.pathname).toBe(`/arcgis/rest/services/open_data_donnees_ouvertes/small_craft_harbours_en/MapServer/${layerNumber}/query`);
    expect(url.searchParams.get("where")).toBe("Province = 'NS'");
    expect(url.searchParams.get("geometry")).toBe("-62,45.3,-60.5,46.1");
    expect(url.searchParams.get("outFields")).toBe(descriptor.outFields!.join(","));
    expect(url.searchParams.get("orderByFields")).toBe("OBJECTID");
    expect(url.searchParams.get("outSR")).toBe("4326");
    expect(url.searchParams.get("f")).toBe("geojson");
    expect(collection.features.map(({ id: featureId }) => featureId)).toEqual(fixture.features.map(({ properties }) => properties.OBJECTID));
    expectScalarPopups(descriptor, collection.features as unknown as Feature[]);
  });
});

describe("withheld fishing sources", () => {
  it("are absent from every layer catalogue and every shipped fishing file", () => {
    const catalogues = [contextLayerCatalog, ...Object.values(layerCatalogs).filter(Array.isArray)];
    const haystacks = [
      JSON.stringify(catalogues),
      ...["spots.geojson", "source.json", "rules.json", "calendar.json", "stocked-waters.source.json", "LICENCE.txt"].map(publicText),
    ];
    for (const { pattern } of withheldFishingSources) {
      for (const haystack of haystacks) expect(haystack.toLowerCase()).not.toContain(pattern.toLowerCase());
    }
  });
});
