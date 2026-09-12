import { describe, expect, it } from "vitest";
import receipt from "../data/openLayerSources.json";
import { provinceLayerCatalog, nativeProvinceLayerCatalog } from "./layerCatalog";
import { contextLayerCatalog } from "./contextLayerCatalog";
import { openDataSourceLinks } from "./openDataSources";
import { sentinel2Layer } from "./sentinel2";
import { buildExportLayers, contextExportOmission } from "../print/pdf/exportLayerSpecs";

const migrated = [...provinceLayerCatalog, ...contextLayerCatalog].filter((layer) => layer.openData);
describe("open source replacements", () => {
  it("binds every migrated constituent to a verified OGL dataset and real schema", () => {
    expect(migrated).toHaveLength(24);
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
