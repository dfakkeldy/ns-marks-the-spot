import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { contextLayerCatalog } from "../layers/contextLayerCatalog";
import { layerCategoryByLayerId } from "../layers/layerCategories";
import {
  allResourceLayerCatalog,
  environmentalHealthLayerCatalog,
  floodHazardLayerCatalog,
  provinceLayerCatalog,
} from "../layers/layerCatalog";
import { POINT_TUPPER_SITES_COVERAGE, pointTupperLayers, pointTupperSiteKinds } from "../layers/pointTupperLayers";
import { focusOffersLayer } from "../focus/focusDefinition";
import { focusDefinitions, focusForTheme } from "../focus/registry";
import type { ShareLayerId } from "../services/mapShareState";
import { buildMapPresentationFixture, builtInMapThemes, validateMapTheme } from "../themes/mapThemes";
import { matchTheme, resolveTheme } from "../themes/themeState";
import { POINT_TUPPER_FACTS, POINT_TUPPER_TIMELINE } from "./facts";
import { POINT_TUPPER_BOUNDS, POINT_TUPPER_POSITION } from "./focus";
import { pointTupperFocusDefinition } from "./focusDefinition";

interface SiteFeature {
  id: string;
  geometry: { type: string; coordinates: [number, number] };
  properties: Record<string, unknown>;
}

const sites = JSON.parse(readFileSync(resolve(__dirname, "../../public/point-tupper/sites.geojson"), "utf8")) as {
  notice: string;
  features: SiteFeature[];
};
const [layer] = pointTupperLayers;

describe("Point Tupper key places", () => {
  it("keeps the layer's caveat and the file's notice identical", () => {
    expect(layer.webCaveat).toBe(sites.notice);
  });

  it("gives every place a unique id, a known kind and a stated source", () => {
    const ids = sites.features.map(({ id }) => id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const feature of sites.features) {
      expect(feature.properties.id, feature.id).toBe(feature.id);
      expect(Object.keys(pointTupperSiteKinds), feature.id).toContain(feature.properties.kind);
      for (const field of ["name", "note", "located_by", "source", "source_date"]) {
        expect(typeof feature.properties[field], `${feature.id}.${field}`).toBe("string");
        expect(String(feature.properties[field]).length, `${feature.id}.${field}`).toBeGreaterThan(0);
      }
    }
  });

  it("places every point inside the layer's coverage", () => {
    for (const { id, geometry } of sites.features) {
      expect(geometry.type, id).toBe("Point");
      const [longitude, latitude] = geometry.coordinates;
      expect(longitude, id).toBeGreaterThanOrEqual(POINT_TUPPER_SITES_COVERAGE.west);
      expect(longitude, id).toBeLessThanOrEqual(POINT_TUPPER_SITES_COVERAGE.east);
      expect(latitude, id).toBeGreaterThanOrEqual(POINT_TUPPER_SITES_COVERAGE.south);
      expect(latitude, id).toBeLessThanOrEqual(POINT_TUPPER_SITES_COVERAGE.north);
    }
  });

  it("draws no campus shape, because the footprint has not been published", () => {
    expect(sites.features.every(({ geometry }) => geometry.type === "Point")).toBe(true);
    expect(sites.notice).toMatch(/footprint has not been published/u);
  });

  it("files the layer under its own category, as a project-derived source", () => {
    expect(layerCategoryByLayerId["point-tupper-sites"]).toBe("point-tupper-site");
    expect(layer.provenance).toBe("project-derived");
    expect(contextLayerCatalog.some(({ id }) => id === "point-tupper-sites")).toBe(true);
  });
});

describe("Point Tupper summary and timeline", () => {
  it.each([...POINT_TUPPER_FACTS, ...POINT_TUPPER_TIMELINE])("links $sourceLabel over https", ({ sourceUrl, sourceLabel }) => {
    expect(sourceLabel.length).toBeGreaterThan(0);
    expect(new URL(sourceUrl).protocol).toBe("https:");
  });

  it("labels every fact once", () => {
    const labels = POINT_TUPPER_FACTS.map(({ label }) => label);
    expect(new Set(labels).size).toBe(labels.length);
  });
});

describe("Point Tupper setup", () => {
  const theme = builtInMapThemes.find(({ id }) => id === "point-tupper")!;
  // The same restricted set App uses to decide whether a named setup needs the licence.
  const restricted = new Set<ShareLayerId>([
    ...provinceLayerCatalog.filter(({ licence }) => licence === "province-restricted").map(({ id }) => id),
    ...allResourceLayerCatalog.filter((entry) => "requiresProvinceLicence" in entry && entry.requiresProvinceLicence).map(({ id }) => id),
    ...floodHazardLayerCatalog.filter(({ licence }) => licence === "province-restricted").map(({ id }) => id),
    ...environmentalHealthLayerCatalog.filter(({ licence }) => licence === "province-restricted").map(({ id }) => id),
    ...contextLayerCatalog.filter(({ licence }) => licence === "province-restricted").map(({ id }) => id),
  ]);

  it("is a valid setup that opens the key places and the mapped grid", () => {
    expect(theme).toBeDefined();
    expect(validateMapTheme(theme)).toEqual([]);
    expect(theme.layerIds).toEqual(expect.arrayContaining(["point-tupper-sites", "transmission-lines", "substations"]));
  });

  it("needs no Province licence, so a first visit applies it exactly", () => {
    expect(theme.layerIds.filter((id) => restricted.has(id))).toEqual([]);
    const resolved = resolveTheme(theme, {
      licenceAccepted: false,
      availableLayerIds: new Set<ShareLayerId>(theme.layerIds),
      restrictedLayerIds: restricted,
    });
    expect(resolved).toMatchObject({ status: "exact", blockedLayerIds: [], unavailableLayerIds: [] });
  });

  it("opens no province layer that would zoom the map in past the site overview", () => {
    const detail = provinceLayerCatalog.filter(({ id, minZoom }) => id !== "nsprd" && minZoom >= 12).map(({ id }) => id);
    expect(theme.layerIds.filter((id) => detail.includes(id as never))).toEqual([]);
    expect(theme.layerIds).not.toContain("place-names");
  });

  it("is the setup its own layers identify, and stays outside the native presentation contract", () => {
    expect(matchTheme(theme, builtInMapThemes)?.id).toBe("point-tupper");
    expect(buildMapPresentationFixture().builtInThemes.some(({ id }) => id === "point-tupper")).toBe(false);
    expect(buildMapPresentationFixture().categories.some(({ id }) => id === "point-tupper-site")).toBe(false);
  });
});

describe("Point Tupper on the registry", () => {
  it("is the page for its setup, and offers every layer the setup opens", () => {
    expect(focusDefinitions.pointtupper).toBe(pointTupperFocusDefinition);
    expect(focusForTheme("point-tupper")).toBe(pointTupperFocusDefinition);
    const theme = builtInMapThemes.find(({ id }) => id === "point-tupper")!;
    for (const id of theme.layerIds) expect(focusOffersLayer(pointTupperFocusDefinition, id), id).toBe(true);
  });

  it("keeps the fishing pins off the site brief", () => {
    expect(focusOffersLayer(pointTupperFocusDefinition, "fishing-spots")).toBe(false);
    expect(focusOffersLayer(pointTupperFocusDefinition, "stocked-waters")).toBe(false);
  });

  it("opens on the Strait, inside the area it zooms to", () => {
    const [[south, west], [north, east]] = POINT_TUPPER_BOUNDS;
    expect(POINT_TUPPER_POSITION.latitude).toBeGreaterThan(south);
    expect(POINT_TUPPER_POSITION.latitude).toBeLessThan(north);
    expect(POINT_TUPPER_POSITION.longitude).toBeGreaterThan(west);
    expect(POINT_TUPPER_POSITION.longitude).toBeLessThan(east);
    const jetty = sites.features.find(({ id }) => id === "everwind-jetty")!;
    const [longitude, latitude] = jetty.geometry.coordinates;
    expect(latitude).toBeGreaterThan(south);
    expect(latitude).toBeLessThan(north);
    expect(longitude).toBeGreaterThan(west);
    expect(longitude).toBeLessThan(east);
  });
});
