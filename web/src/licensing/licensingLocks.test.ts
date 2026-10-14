import { afterEach, describe, expect, it, vi } from "vitest";
import type { FeatureCollection } from "geojson";
import { zoningLayerCatalog } from "../layers/layerCatalog";
import { fetchZoningPolygons } from "../services/zoning";
import { buildExportLayers, type ExportLayerInputs } from "../print/pdf/exportLayerSpecs";
import { composeMapImage } from "../print/pdf/mapCompositor";
import { geojsonExportBlob } from "../userMaps/vector/export/exportGeoJson";
import { kmlExportBlob } from "../userMaps/vector/export/kmlWriter";
import { gpxExportBlob } from "../userMaps/vector/export/gpxWriter";
import { buildKmzBlob } from "../userMaps/vector/export/kmzWriter";
import { openProvinceSources } from "../layers/openDataSources";
import { PROVINCE_REPRODUCTION_LOCK_IDS, reproductionLockReason } from "./layerUse";

const bounds = { west: -61.3, south: 46.2, east: -61.1, north: 46.4 };
const inputs: ExportLayerInputs = {
  bounds, showModernMap: true,
  fletcher: { visible: false, opacity: 1, tileBaseUrl: "https://tiles.example", maxNativeZoom: 15 },
  arcgisLayers: [], userMaps: [], selectedParcelRings: [],
};
const traced: FeatureCollection = { type: "FeatureCollection", features: [{
  type: "Feature", properties: { "nsmts:traced": "nsprd-parcel" },
  geometry: { type: "Point", coordinates: [-61.2, 46.3] },
}] };

afterEach(() => vi.unstubAllGlobals());

describe("licensing locks at data and output boundaries", () => {
  it.each(PROVINCE_REPRODUCTION_LOCK_IDS)("refuses the original restricted %s source", id => {
    expect(() => buildExportLayers({ ...inputs, arcgisLayers: [{
      id, name: id, serviceUrl: "https://example.test/MapServer", exportOptions: { transparent: true }, opacity: 1,
    }] })).toThrow(/permission/i);
  });

  it("keeps documented web OGL replacements separate from native restricted services", () => {
    for (const [id, openData] of Object.entries(openProvinceSources)) {
      expect(reproductionLockReason(id, openData)).toBeNull();
      expect(buildExportLayers({ ...inputs, arcgisLayers: [{
        id, name: id, openData, serviceUrl: "https://example.test/open-data", exportOptions: { transparent: true }, opacity: 1,
      }] }).find(layer => layer.id === id)?.kind).toBe("open-data");
    }
    expect(reproductionLockReason("nsprd", openProvinceSources["crown-lands"])).toMatch(/permission/i);
    expect(reproductionLockReason("crown-lands", { parts: [{ dataset: "unknown", fields: [] }], color: "#000" })).toMatch(/permission/i);
  });
  it.each(["zoning-inverness", "zoning-victoria", "zoning-richmond", "zoning-cumberland"])(
    "refuses %s before even one network request", async (id) => {
      const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ type: "FeatureCollection", features: [] })));
      vi.stubGlobal("fetch", fetch);
      const layer = zoningLayerCatalog.find(layer => layer.id === id)!;
      await expect(fetchZoningPolygons(layer, bounds)).rejects.toThrow(/permission|licen/i);
      expect(fetch).not.toHaveBeenCalled();
    });

  it("continues querying Halifax under its documented open licence", async () => {
    const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ type: "FeatureCollection", features: [] })));
    vi.stubGlobal("fetch", fetch);
    await fetchZoningPolygons(zoningLayerCatalog.find(layer => layer.id === "zoning-halifax")!, bounds);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("refuses historical Fletcher reproduction without disabling the modern Fletcher style", () => {
    expect(() => buildExportLayers({ ...inputs, fletcher: { ...inputs.fletcher, visible: true } })).toThrow(/permission|licen/i);
    expect(buildExportLayers({ ...inputs, basemapStyle: "fletcher" }).map(layer => layer.id)).toEqual(["modern"]);
  });

  it("refuses retained parcel coordinates even with all restricted layer switches off", () => {
    expect(() => buildExportLayers({ ...inputs, selectedParcelRings: [[{ lat: 46.3, lng: -61.2 }]] })).toThrow(/permission|licen/i);
  });

  it("refuses a direct compositor call before fetching a restricted image", async () => {
    const fetchImage = vi.fn();
    await expect(composeMapImage(bounds, { widthPx: 10, heightPx: 10 }, [{
      kind: "image", id: "nsprd", name: "Parcels", opacity: 1, url: () => "https://example.test/image",
    }], { fetchImage })).rejects.toThrow(/permission|licen/i);
    expect(fetchImage).not.toHaveBeenCalled();
  });

  it("refuses every external traced-vector format without changing the retained record", () => {
    const original = structuredClone(traced);
    for (const write of [
      () => geojsonExportBlob(traced), () => kmlExportBlob("Parcel", traced),
      () => gpxExportBlob("Parcel", traced), () => buildKmzBlob("Parcel", traced, new Map()),
    ]) expect(write).toThrow(/permission|licen/i);
    expect(traced).toEqual(original);
    expect(geojsonExportBlob({ ...traced, features: [{ ...traced.features[0], properties: {} }] }).size).toBeGreaterThan(0);
  });
});
