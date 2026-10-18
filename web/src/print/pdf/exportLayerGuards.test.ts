import { afterEach, describe, expect, it, vi } from "vitest";
import { landContextLayers } from "../../layers/landContextLayers";
import { openProvinceSources } from "../../layers/openDataSources";
import { buildExportLayers, type ExportArcGisLayerInput, type ExportLayerInputs } from "./exportLayerSpecs";
import { composeMapImage } from "./mapCompositor";

const bounds = { north: 46.35, south: 46.25, west: -61.25, east: -61.10 };
const frame = (overrides: Partial<ExportLayerInputs> = {}): ExportLayerInputs => ({
  bounds, showModernMap: false,
  fletcher: { visible: false, opacity: 1, tileBaseUrl: null, maxNativeZoom: 15 },
  arcgisLayers: [], userMaps: [], selectedParcelRings: [], ...overrides,
});
const imageSource = (id: string): ExportArcGisLayerInput => ({
  id, name: id, serviceUrl: "https://example.test/MapServer",
  exportOptions: { transparent: true }, opacity: 1,
});

/** A refused input must not reach even the first compositor-layer decision. */
function expectEarlyRefusal(inputs: ExportLayerInputs, reason: RegExp) {
  let constructionStarted = false;
  Object.defineProperty(inputs, "showModernMap", {
    get() { constructionStarted = true; return false; },
  });
  expect(() => buildExportLayers(inputs)).toThrow(reason);
  expect(constructionStarted).toBe(false);
}

afterEach(() => vi.unstubAllGlobals());

describe("independent export entry guards", () => {
  it.each(["wam-relative-wetness", "wam-predicted-flow", "forest-treatments"])(
    "refuses the restored %s descriptor before constructing compositor layers", id => {
      const retainedSource = landContextLayers.find(layer => layer.id === id)!;
      expectEarlyRefusal(frame({ arcgisLayers: [retainedSource] }), /excluded/);
    },
  );

  it.each(["nsprd", "ns-aerial", "crown-lands"])(
    "refuses restored original %s imagery independently of forestry", id => {
      expectEarlyRefusal(frame({ arcgisLayers: [imageSource(id)] }), /permission/i);
    },
  );

  it("does not let an unknown dataset inherit the Crown Land replacement grant", () => {
    expectEarlyRefusal(frame({ arcgisLayers: [{
      ...imageSource("crown-lands"),
      openData: { parts: [{ dataset: "unknown", fields: [] }], color: "#000" },
    }] }), /permission/i);
  });

  it("refuses an aliased Fletcher sheet supplied through the ArcGIS tile path", () => {
    expectEarlyRefusal(frame({ arcgisLayers: [{
      ...imageSource("fletcher-19"), tileUrl: "https://other.example/{z}/{x}/{y}.png",
    }] }), /Fletcher.*permission/i);
  });

  it("refuses visible Fletcher even when its tile host is unavailable", () => {
    expectEarlyRefusal(frame({ fletcher: { ...frame().fletcher, visible: true } }), /Fletcher.*permission/i);
  });

  it("refuses retained parcel rings with every source switch off", () => {
    expectEarlyRefusal(frame({ selectedParcelRings: [[{ lat: 46.3, lng: -61.2 }]] }), /permission/i);
  });

  it("retains all nine documented OGL replacements as compositor inputs", () => {
    const sources = Object.entries(openProvinceSources).map(([id, openData]) => ({
      ...imageSource(id), openData,
    }));
    const layers = buildExportLayers(frame({ arcgisLayers: sources }));
    expect(layers).toHaveLength(9);
    for (const source of sources) {
      expect(layers.find(layer => layer.id === source.id)).toMatchObject({
        kind: "open-data", source: source.openData,
      });
    }
  });

  it("renders a permitted Crown Land replacement through the real open-data compositor", async () => {
    const requested: string[] = [];
    vi.stubGlobal("fetch", async (url: string) => {
      requested.push(String(url));
      return new Response(JSON.stringify({ type: "FeatureCollection", features: [{
        type: "Feature", properties: { source_row_id: "fixture-row", dnr_id: "fixture" },
        geometry: { type: "Polygon", coordinates: [[
          [-61.2, 46.3], [-61.15, 46.3], [-61.15, 46.32], [-61.2, 46.3],
        ]] },
      }] }), { headers: { "Content-Type": "application/json" } });
    });
    const layers = buildExportLayers(frame({ arcgisLayers: [{
      ...imageSource("crown-lands"), openData: openProvinceSources["crown-lands"],
    }] }));
    const result = await composeMapImage(bounds, { widthPx: 40, heightPx: 40 }, layers);
    expect(result.statuses).toEqual([{
      id: "crown-lands", name: "crown-lands", status: "rendered",
      detail: "1 open-data features; project-rendered cartography",
    }]);
    expect(requested).toHaveLength(1);
    expect(new URL(requested[0]).pathname).toBe("/resource/3nka-59nz.geojson");
  });
});
