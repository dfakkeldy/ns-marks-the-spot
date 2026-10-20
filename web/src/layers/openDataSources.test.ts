import { describe, expect, it } from "vitest";
import receipt from "../data/openLayerSources.json";
import { provinceLayerCatalog, nativeProvinceLayerCatalog } from "./layerCatalog";
import { contextLayerCatalog } from "./contextLayerCatalog";
import { openDataSourceLinks, openProvinceSources } from "./openDataSources";
import { sentinel2Layer } from "./sentinel2";
import { buildExportLayers, contextExportOmission } from "../print/pdf/exportLayerSpecs";

const migrated = [...provinceLayerCatalog, ...contextLayerCatalog].filter((layer) => layer.openData);
describe("open source replacements", () => {
  it("binds every migrated constituent to a verified OGL dataset and real schema", () => {
    expect(migrated).toHaveLength(26);
    for (const layer of migrated) {
      expect(layer.licence).toBe("province-open");
      expect(layer.serviceUrl).toMatch(/^https:\/\/data.novascotia.ca\/resource\//);
      const links = openDataSourceLinks(layer.openData!);
      for (const part of layer.openData!.parts) {
        const entry = receipt.datasets.find(({ id }) => id === part.dataset);
        expect(entry?.licenseId, `${layer.id}/${part.dataset}`).toBe("OGL_NOVA_SCOTIA");
        for (const field of part.fields) expect(entry?.fields).toContain(field);
        expect(links.some(({ url }) => url === entry?.url)).toBe(true);
      }
    }
  });
  it("retains restricted aerial and parcel services and preserves native service identity", () => {
    for (const id of ["ns-aerial", "nsprd"]) {
      const web = provinceLayerCatalog.find((layer) => layer.id === id)!;
      expect(web.licence).toBe("province-restricted");
      expect(web).toEqual(nativeProvinceLayerCatalog.find((layer) => layer.id === id));
    }
    expect(nativeProvinceLayerCatalog.find(({ id }) => id === "crown-lands")?.serviceUrl).toContain("MapServer");
  });
  it("exports the open Sentinel edition at its native tile ceiling and correct XYZ order", () => {
    expect(sentinel2Layer.licenceUrl).toBe("https://creativecommons.org/licenses/by/4.0/");
    expect(sentinel2Layer.sourceDate).toContain("2016–2017");
    expect(contextExportOmission(sentinel2Layer, 18)).toBeNull();
    const [layer] = buildExportLayers({ bounds: { north: 46, south: 45, east: -60, west: -61 }, showModernMap: false,
      fletcher: { visible: false, opacity: 1, tileBaseUrl: null, maxNativeZoom: 15 },
      arcgisLayers: [sentinel2Layer], userMaps: [], selectedParcelRings: [] });
    expect(layer.kind).toBe("tile");
    if (layer.kind !== "tile") throw new Error("Expected tile source");
    expect(layer.maxNativeZoom).toBe(14);
    expect(layer.url({ z: 12, x: 1348, y: 1457 })).toBe("https://tiles.maps.eox.at/wmts/1.0.0/s2cloudless_3857/default/g/12/1457/1348.jpg");
  });
});

describe("tiered NSRN roads", () => {
  // Every class and surface the dataset published on 2026-09-27, plus an unclassified row.
  const rows = ["Track", "Driveway", "Local", "Dryweather", "Collector", "Arterial", "Active Rail Road", "Trail", "Ramp", "Local Arterial", "Local Collector", "Highway", "Seasonal", "Trans Canada", "Local Highway", null]
    .flatMap((roadc_desc) => ["ROAD - x - 2 Lanes - Paved", "ROAD - x - 1 Lane - Unpaved"].map((feat_desc) => ({ roadc_desc, feat_desc })));
  const tiers = openProvinceSources.roads.parts.filter(({ dataset }) => dataset === "484g-adjn");

  /** Just enough SoQL to evaluate these catalogue expressions against a row. */
  function evaluate(where: string, row: Record<string, string | null>): boolean {
    const tokens = where.match(/'[^']*'|\(|\)|,|<>|[A-Za-z_]+/g)!;
    let i = 0;
    const peek = () => tokens[i]?.toUpperCase();
    const list = () => { const values: string[] = []; i++; while (tokens[i] !== ")") { if (tokens[i] !== ",") values.push(tokens[i].slice(1, -1)); i++; } i++; return values; };
    const comparison = (): boolean | null => {
      if (tokens[i] === "(") { i++; const value = or(); i++; return value; }
      const value = row[tokens[i++]];
      let not = false;
      if (peek() === "IS") { i += 2; return value === null; }
      if (peek() === "NOT") { not = true; i++; }
      if (peek() === "IN") { i++; const values = list(); return value === null ? null : values.includes(value) !== not; }
      if (peek() === "LIKE") { i++; const pattern = tokens[i++].slice(1, -1); if (value === null) return null; const like = new RegExp(`^${pattern.replace(/%/g, ".*")}$`).test(value); return like !== not; }
      if (tokens[i] === "<>") { i++; const other = tokens[i++].slice(1, -1); return value === null ? null : value !== other; }
      throw new Error(`Unsupported SoQL near ${tokens[i]}`);
    };
    const and = (): boolean | null => { let value = comparison(); while (peek() === "AND") { i++; const next = comparison(); value = value === false || next === false ? false : value === null || next === null ? null : true; } return value; };
    function or(): boolean | null { let value = and(); while (peek() === "OR") { i++; const next = and(); value = value === true || next === true ? true : value === null || next === null ? null : false; } return value; }
    return or() === true;
  }

  it("draws paved through roads first, then unpaved and resource roads, then tracks, trails and driveways", () => {
    expect(tiers.map(({ minZoom }) => minZoom)).toEqual([undefined, 13, 14]);
    const tierOf = (row: (typeof rows)[number]) => tiers.findIndex(({ where }) => evaluate(where!, row));
    expect(tierOf({ roadc_desc: "Highway", feat_desc: "ROAD - Highway - 2 Lanes - Paved" })).toBe(0);
    expect(tierOf({ roadc_desc: "Local", feat_desc: "ROAD - Local - 1 Lane - Unpaved" })).toBe(1);
    expect(tierOf({ roadc_desc: "Dryweather", feat_desc: "ROAD - Resource Access - 1 Lane - Unpaved" })).toBe(1);
    expect(tierOf({ roadc_desc: "Track", feat_desc: "TRACK" })).toBe(2);
    expect(tierOf({ roadc_desc: "Local", feat_desc: "WATER ACCESS" })).toBe(-1);
  });

  it("puts every road row in exactly one tier", () => {
    for (const row of rows) {
      expect(tiers.filter(({ where }) => evaluate(where!, row)), JSON.stringify(row)).toHaveLength(1);
    }
  });

  it("lists each source dataset once", () => {
    const links = openDataSourceLinks(openProvinceSources.roads);
    expect(new Set(links.map(({ url }) => url)).size).toBe(links.length);
  });
});
