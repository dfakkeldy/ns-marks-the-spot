import { describe, expect, it, vi } from "vitest";
import { zoningLayerCatalog } from "../../layers/layerCatalog";
import { userLayerAttributionLines } from "./attributionLines";
import { buildExportLayers, selectUserLayersForExport, type ExportLayerInputs } from "./exportLayerSpecs";
import { composeMapImage } from "./mapCompositor";
import type { UserLayerRecord } from "../../userLayers/types";
import type { VisibleUserLayer } from "../../userLayers/components/UserTileLayers";

const bounds = { north: 46.35, south: 46.25, west: -61.25, east: -61.10 };
const record: UserLayerRecord = { id: "user-layer:test", name: "Example", kind: "xyz", role: "base", opaque: true, url: "https://tiles.example.org/{z}/{x}/{y}.png?key=secret", attribution: "Credit", termsNote: "Personal use", termsUrl: null, minZoom: 0, maxNativeZoom: 19, tileSize: 256, createdAt: "2026-11-14", modifiedAt: "2026-11-14", acknowledgement: { version: 1, at: "2026-11-14" }, probe: { display: true, corsReadable: true, at: "2026-11-14" } };
const layer = (overrides: Partial<UserLayerRecord> = {}): VisibleUserLayer => ({ record: { ...record, ...overrides }, opacity: 1 });
const frame = (overrides: Partial<ExportLayerInputs> = {}): ExportLayerInputs => ({ bounds, showModernMap: true, basemapStyle: "osm", fletcher: { visible: false, opacity: 1, tileBaseUrl: null, maxNativeZoom: 15 }, arcgisLayers: [], userMaps: [], selectedParcelRings: [], ...overrides });

describe("user layer PDF export", () => {
  it("exports XYZ tiles and omits a covered modern base", () => {
    const layers = buildExportLayers(frame({ userLayers: [layer()] }));
    expect(layers.map(x => x.id)).toEqual([record.id]);
    const tile = layers[0]; if (tile.kind !== "tile") throw new Error("Expected tile");
    expect(tile.url({ z: 2, x: 1, y: 3 })).toBe("https://tiles.example.org/2/1/3.png?key=secret");
  });
  it("builds one WMS image request for the frame", () => {
    const wms = layer({ kind: "wms", url: "https://example.org/wms", wms: { layers: "a", styles: "", format: "image/png", version: "1.3.0", transparent: true } });
    const image = buildExportLayers(frame({ userLayers: [wms] })).find(x => x.id === record.id)!;
    if (image.kind !== "image") throw new Error("Expected image");
    const url = new URL(image.url({ bounds, widthPx: 1200, heightPx: 800 })!);
    expect(url.searchParams.get("bbox")).toBeTruthy(); expect(url.searchParams.get("width")).toBe("1200"); expect(url.searchParams.get("height")).toBe("800"); expect(url.searchParams.get("crs")).toBe("EPSG:3857");
  });
  it("refuses a matched restricted service before any network request", async () => {
    const restricted = layer({ kind: "arcgis-map", url: "https://nsgiwa.novascotia.ca/arcgis/rest/services/BASE/BASE_NSODB_10k_WM84/MapServer" });
    expect(() => buildExportLayers(frame({ userLayers: [restricted] }))).toThrow(/permission/i);
    const fetchImage = vi.fn();
    await expect(composeMapImage(bounds, { widthPx: 50, heightPx: 50 }, [{ kind: "image", id: record.id, sourceId: "ns-aerial", userSource: restricted.record, name: record.name, opacity: 1, url: () => "https://example.org" }], { fetchImage })).rejects.toThrow(/permission/i);
    expect(fetchImage).not.toHaveBeenCalled();
  });
  it("refuses parcel evidence even when a user base is present", () => {
    expect(() => buildExportLayers(frame({ userLayers: [layer()], selectedParcelRings: [[{ lat: 46.3, lng: -61.2 }]] }))).toThrow(/permission/i);
  });
  it("keeps the user-supplied clause and omits the address query", () => {
    const text = userLayerAttributionLines([layer({ name: "User-supplied layer, not an NS Marks The Spot source:" })])[0];
    expect(text.startsWith("User-supplied layer, not an NS Marks The Spot source:")).toBe(true);
    expect(text).toContain("tiles.example.org"); expect(text).not.toContain("secret");
    const withAddress = userLayerAttributionLines([layer({ termsNote: "See https://example.org/licence?key=private" })])[0];
    expect(withAddress).toContain("example.org"); expect(withAddress).not.toContain("private");
  });
  it("keeps the modern map under a base with transparency", () => {
    const transparent = layer({ opaque: false, kind: "arcgis-map", url: "https://example.org/MapServer" });
    expect(buildExportLayers(frame({ userLayers: [transparent] })).map(x => x.id)).toContain("modern");
    expect(buildExportLayers(frame({ userLayers: [layer({ opaque: false })] })).map(x => x.id)).toContain("modern");
  });
  it("credits matched catalogue sources independently of user text", async () => {
    const { sentinel2Layer } = await import("../../layers/sentinel2");
    const lines = userLayerAttributionLines([layer({ url: sentinel2Layer.tileUrl })]);
    expect(lines.join(" ")).toContain("EOX IT Services");
    expect(lines.join(" ")).toContain("https://creativecommons.org/licenses/by/4.0/");
  });
  it("names view-blocked sources as omitted", () => {
    const restricted = layer({ kind: "arcgis-map", url: "https://nsgiwa.novascotia.ca/arcgis/rest/services/BASE/BASE_NSODB_10k_WM84/MapServer" });
    expect(selectUserLayersForExport([restricted], false).omitted[0]).toMatch(/Example.*acceptance/);
    const municipal = zoningLayerCatalog.find(entry => entry.id === "zoning-inverness")!;
    expect(selectUserLayersForExport([layer({ kind: "arcgis-map", url: municipal.serviceUrl })], true).omitted[0]).toMatch(/queries/i);
  });
  it("names unreadable and untested layers as omitted", () => {
    const noCors = layer({ probe: { display: true, corsReadable: false, at: "2026-11-14" } });
    expect(selectUserLayersForExport([noCors], true)).toEqual({ included: [], omitted: ["Example — cannot be read for a PDF"] });
    expect(selectUserLayersForExport([layer({ probe: null })], true).omitted).toEqual(["Example — not tested"]);
  });

});
