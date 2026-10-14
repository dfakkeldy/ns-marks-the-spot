import { describe, expect, it } from "vitest";
import { toMercator } from "../../userMaps/transform/webMercator";
import { composeMapImage } from "./mapCompositor";
import { buildExportLayers, contextExportOmission, type ExportLayerInputs } from "./exportLayerSpecs";
import { contextLayerCatalog } from "../../layers/contextLayerCatalog";

const imageContextLayers = contextLayerCatalog.filter(({ delivery }) => delivery === undefined);

const bounds = { north: 46.35, south: 46.25, west: -61.25, east: -61.10 };

function inputs(overrides: Partial<ExportLayerInputs> = {}): ExportLayerInputs {
  return {
    bounds,
    showModernMap: true,
    fletcher: {
      visible: false,
      opacity: 0.8,
      tileBaseUrl: "https://tiles.example",
      maxNativeZoom: 15,
    },
    arcgisLayers: [],
    userMaps: [],
    selectedParcelRings: [],
    ...overrides,
  };
}

describe("buildExportLayers", () => {
  it("omits below-scale context services before a blank image can be credited as rendered", () => {
    for (const layer of imageContextLayers) {
      expect(contextExportOmission(layer, layer.minZoom - 1)).toBe(
        `below display scale (zoom ${layer.minZoom} required)`,
      );
      expect(contextExportOmission(layer, layer.minZoom)).toBeNull();
      expect(contextExportOmission(layer, layer.maxZoom)).toBeNull();
      expect(contextExportOmission(layer, layer.maxZoom + 1)).toBe(
        `above display scale (maximum zoom ${layer.maxZoom})`,
      );
    }
  });

  it("names unsupported feature and static sources distinctly from below-scale sources", () => {
    const unsupported = contextLayerCatalog.filter(({ delivery }) => delivery !== undefined && delivery !== "tile");
    expect(unsupported.some(({ delivery }) => delivery === "static-image")).toBe(true);
    for (const layer of unsupported) {
      expect(contextExportOmission(layer, layer.minZoom)).toBe("PDF export does not support this source format");
      expect(contextExportOmission(layer, layer.minZoom - 1)).toContain("below display scale");
    }
  });
  it("keeps confirmed open context imagery in its on-screen pane order", () => {
    const layers = buildExportLayers(inputs({ arcgisLayers: [...imageContextLayers].reverse() }));
    const ids = layers.map(layer => layer.id);
    for (const lower of imageContextLayers) for (const higher of imageContextLayers.filter(layer => layer.zIndex > lower.zIndex)) {
      expect(ids.indexOf(lower.id)).toBeLessThan(ids.indexOf(higher.id));
    }
  });

  it("preserves each context service's selected classes and filters in its frame render", () => {
    const layers = buildExportLayers(inputs({ arcgisLayers: [...imageContextLayers] }));
    for (const source of imageContextLayers) {
      const layer = layers.find(({ id }) => id === source.id);
      if (source.openData) {
        expect(layer).toMatchObject({ kind: "open-data", source: source.openData });
        continue;
      }
      expect(layer?.kind).toBe("image");
      if (layer?.kind !== "image") throw new Error(`Missing context image ${source.id}`);
      const url = new URL(layer.url({ bounds, widthPx: 900, heightPx: 600 })!);
      expect(url.origin + url.pathname).toBe(`${source.serviceUrl}/export`);
      expect(url.searchParams.get("layers")).toBe(source.exportOptions.layers ?? null);
      expect(url.searchParams.get("dynamicLayers")).toBe(source.exportOptions.dynamicLayers
        ? JSON.stringify(JSON.parse(source.exportOptions.dynamicLayers)) : null);
      expect(url.searchParams.get("size")).toBe("900,600");
      expect(layer.opacity).toBe(source.opacity);
    }
  });

  it("limits close-up context renders to source resolution without changing the geographic extent", () => {
    const source = imageContextLayers.find(({ id }) => id === "ns-topographic")!;
    expect(source.maxNativeZoom).toBe(19);
    const layer = buildExportLayers(inputs({ arcgisLayers: [source] }))
      .find(({ id }) => id === source.id)!;
    if (layer.kind !== "image") throw new Error("Missing topographic export image");

    const closeBounds = { north: 46.3001, south: 46.3, west: -61.2, east: -61.1999 };
    const nw = toMercator({ lat: closeBounds.north, lng: closeBounds.west });
    const se = toMercator({ lat: closeBounds.south, lng: closeBounds.east });
    const resolution = 156_543.033_928_040_97 / 2 ** 19;
    const url = new URL(layer.url({ bounds: closeBounds, widthPx: 3000, heightPx: 2000 })!);
    const [width, height] = url.searchParams.get("size")!.split(",").map(Number);
    expect(width).toBeGreaterThanOrEqual(1);
    expect(height).toBeGreaterThanOrEqual(1);
    expect(width).toBeLessThan(3000);
    expect(height).toBeLessThan(2000);
    expect((se.x - nw.x) / width).toBeGreaterThanOrEqual(resolution);
    expect((nw.y - se.y) / height).toBeGreaterThanOrEqual(resolution);
    expect(url.searchParams.get("bbox")).toBe(`${nw.x},${se.y},${se.x},${nw.y}`);
    expect(new URL(layer.url({ bounds, widthPx: 900, heightPx: 600 })!).searchParams.get("size"))
      .toBe("900,600");

    const tinyBounds = { north: 46.300000001, south: 46.3, west: -61.2, east: -61.199999999 };
    expect(new URL(layer.url({ bounds: tinyBounds, widthPx: 3000, heightPx: 2000 })!).searchParams.get("size"))
      .toBe("1,1");

    const parcelLayer = buildExportLayers(inputs({ arcgisLayers: [{
      id: "test-image", name: "Parcels", serviceUrl: "https://example.test/MapServer",
      exportOptions: { transparent: true }, opacity: 1,
    }] })).find(({ id }) => id === "test-image")!;
    if (parcelLayer.kind !== "image") throw new Error("Missing parcel export image");
    expect(new URL(parcelLayer.url({ bounds: closeBounds, widthPx: 3000, heightPx: 2000 })!).searchParams.get("size"))
      .toBe("3000,2000");
  });
  it("puts the basemap first and honours the modern toggle", () => {
    const layers = buildExportLayers(inputs());
    expect(layers[0]).toMatchObject({ kind: "tile", id: "modern" });
    expect(
      buildExportLayers(inputs({ showModernMap: false }))
        .some((layer) => layer.id === "modern"),
    ).toBe(false);
  });

  it("locks Fletcher reproduction while preserving its source metadata", () => {
    expect(() => buildExportLayers(inputs({ fletcher: { ...inputs().fletcher, visible: true } }))).toThrow(/Fletcher.*permission/i);
  });

  it("cannot reopen Fletcher reproduction by changing the tile host", () => {
    expect(() => buildExportLayers(inputs({ fletcher: { ...inputs().fletcher, visible: true, tileBaseUrl: "https://other.example" } }))).toThrow(/permission/i);
  });

  it("asks an ArcGIS service for ONE frame-sized render, not a tile grid", () => {
    // Each ArcGIS "tile" is a server-side render, so the per-tile builder
    // this replaces turned one layer into ~200 renders (~800 across the four
    // default Province layers) in a single burst. The spec asked for "one
    // bbox export-image request per service at the exact output size".
    const layers = buildExportLayers(inputs({
      arcgisLayers: [{
        id: "test-image",
        name: "Test image",
        serviceUrl: "https://arcgis.example/rest/services/NSPRD/MapServer",
        exportOptions: { transparent: true, layers: "show:0" },
        opacity: 1,
      }],
    }));
    const nsprd = layers.find((l) => l.id === "test-image");
    expect(nsprd?.kind).toBe("image");
    if (nsprd?.kind !== "image") return;

    const raw = nsprd.url({ bounds, widthPx: 3067, heightPx: 1808 });
    expect(raw).not.toBeNull();
    const url = new URL(raw!);
    expect(url.pathname).toBe("/rest/services/NSPRD/MapServer/export");
    expect(url.searchParams.get("bboxSR")).toBe("3857");
    expect(url.searchParams.get("imageSR")).toBe("3857");
    expect(url.searchParams.get("layers")).toBe("show:0");
    expect(url.searchParams.get("transparent")).toBe("true");
    // The frame's own bbox, in Web Mercator, and the output size verbatim —
    // no 256,256 tile anywhere in it.
    const nw = toMercator({ lat: bounds.north, lng: bounds.west });
    const se = toMercator({ lat: bounds.south, lng: bounds.east });
    expect(url.searchParams.get("bbox")).toBe(
      `${nw.x},${se.y},${se.x},${nw.y}`,
    );
    expect(url.searchParams.get("size")).toBe("3067,1808");
  });

  it("issues exactly one network request per ArcGIS layer for a whole frame", async () => {
    const layers = buildExportLayers(inputs({
      showModernMap: false,
      fletcher: {
        visible: false, opacity: 1, tileBaseUrl: null, maxNativeZoom: 15,
      },
      arcgisLayers: [{
        id: "test-image",
        name: "Test image",
        serviceUrl: "https://arcgis.example/rest/services/NSPRD/MapServer",
        exportOptions: { transparent: true },
        opacity: 1,
      }],
    }));
    const requested: string[] = [];
    const tile = document.createElement("canvas");
    tile.width = 8;
    tile.height = 8;
    const { statuses } = await composeMapImage(
      bounds, { widthPx: 900, heightPx: 600 }, layers,
      {
        fetchImage: async (url) => {
          requested.push(url);
          return tile;
        },
      },
    );

    expect(statuses).toEqual([
      { id: "test-image", name: "Test image", status: "rendered" },
    ]);
    // One. Not one per 256px tile of the frame.
    expect(requested).toHaveLength(1);
    expect(new URL(requested[0]).searchParams.get("size")).toBe("900,600");
  });

  it("appends user maps above permitted tile layers", () => {
    const image = document.createElement("canvas");
    const layers = buildExportLayers(inputs({
      userMaps: [{
        id: "um-1", name: "My scan", image, imageWidth: 100, imageHeight: 80,
        latLngMesh: [
          [{ lat: 46.3, lng: -61.2 }, { lat: 46.3, lng: -61.1 }],
          [{ lat: 46.2, lng: -61.2 }, { lat: 46.2, lng: -61.1 }],
        ],
        opacity: 0.7,
      }],

    }));
    const kinds = layers.map((l) => l.kind);
    expect(kinds[kinds.length - 1]).toBe("warped");
  });

  it("locks restricted aerial and property-source output even without Fletcher", () => {
    for (const id of ["ns-aerial", "nsprd"]) {
      expect(() => buildExportLayers(inputs({ arcgisLayers: [{ id, name: id, serviceUrl: "https://example.test/MapServer", exportOptions: { transparent: true }, opacity: 1 }] }))).toThrow(/permission/i);
    }
  });

});

it("captures atlas mode and preserves the legacy OSM default", () => {
  expect(buildExportLayers(inputs({ basemapStyle: "night" }))[0]).toMatchObject({ kind: "atlas", mode: "night", id: "modern" });
  expect(buildExportLayers(inputs())[0]).toMatchObject({ kind: "tile", id: "modern" });
  expect(buildExportLayers(inputs({ basemapStyle: "day", showModernMap: false })).some((layer) => layer.kind === "atlas")).toBe(false);
});
