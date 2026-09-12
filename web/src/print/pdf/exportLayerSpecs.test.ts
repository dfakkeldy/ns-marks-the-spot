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
      visible: true,
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
  it("keeps topographic imagery under aerial and Fletcher, and broad overlays under parcel lines", () => {
    const layers = buildExportLayers(inputs({
      arcgisLayers: [
        { id: "nsprd", name: "Parcels", serviceUrl: "https://example.test/MapServer", exportOptions: { transparent: true }, opacity: 1 },
        ...[...imageContextLayers].reverse(),
        { id: "ns-aerial", name: "Aerial", serviceUrl: "https://example.test/MapServer", exportOptions: { transparent: false }, opacity: 1 },
      ],
    }));
    const ids = layers.map(({ id }) => id);
    expect(ids.indexOf("modern")).toBeLessThan(ids.indexOf("ns-topographic"));
    expect(ids.indexOf("ns-topographic")).toBeLessThan(ids.indexOf("ns-aerial"));
    expect(ids.indexOf("ns-aerial")).toBeLessThan(ids.findIndex((id) => id.startsWith("fletcher-")));
    for (const layer of imageContextLayers.filter(({ zIndex }) => zIndex >= 165 && zIndex <= 195)) {
      expect(ids.indexOf(layer.id)).toBeGreaterThan(ids.findIndex((id) => id.startsWith("fletcher-")));
      expect(ids.indexOf(layer.id)).toBeLessThan(ids.indexOf("nsprd"));
    }
    for (const lower of imageContextLayers) {
      for (const higher of imageContextLayers.filter(({ zIndex }) => zIndex > lower.zIndex)) {
        expect(ids.indexOf(lower.id)).toBeLessThan(ids.indexOf(higher.id));
      }
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
      id: "nsprd", name: "Parcels", serviceUrl: "https://example.test/MapServer",
      exportOptions: { transparent: true }, opacity: 1,
    }] })).find(({ id }) => id === "nsprd")!;
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

  it("includes only Fletcher sheets intersecting the bounds", () => {
    const layers = buildExportLayers(inputs());
    const fletcher = layers.filter((l) => l.id.startsWith("fletcher-"));
    // Bounds sit over Inverness sheets 11 and 13 (see fletcherSheets table);
    // sheet 1 (Cape North) must not appear.
    expect(fletcher.length).toBeGreaterThan(0);
    expect(fletcher.some((l) => l.id === "fletcher-01")).toBe(false);
  });

  it("a Fletcher sheet's url() is null for tiles outside the sheet", () => {
    const layers = buildExportLayers(inputs());
    const sheet = layers.find((l) => l.id.startsWith("fletcher-"));
    expect(sheet?.kind).toBe("tile");
    if (sheet?.kind !== "tile") return;
    // z10 tile at the world's origin is nowhere near Nova Scotia.
    expect(sheet.url({ z: 10, x: 0, y: 0 })).toBeNull();
    // Verified against tileMath.tilesForBounds directly: the z12 tile
    // covering (-61.2, 46.3) is {x: 1351, y: 1452}, not y=1442 — see the
    // task report for the scratch check that established this.
    expect(
      sheet.url({ z: 12, x: 1351, y: 1452 }),
    ).toMatch(/^https:\/\/tiles\.example\/.+\/12\/1351\/1452\.png$/u);
  });

  it("asks an ArcGIS service for ONE frame-sized render, not a tile grid", () => {
    // Each ArcGIS "tile" is a server-side render, so the per-tile builder
    // this replaces turned one layer into ~200 renders (~800 across the four
    // default Province layers) in a single burst. The spec asked for "one
    // bbox export-image request per service at the exact output size".
    const layers = buildExportLayers(inputs({
      arcgisLayers: [{
        id: "nsprd",
        name: "Property boundaries",
        serviceUrl: "https://arcgis.example/rest/services/NSPRD/MapServer",
        exportOptions: { transparent: true, layers: "show:0" },
        opacity: 1,
      }],
    }));
    const nsprd = layers.find((l) => l.id === "nsprd");
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
        id: "nsprd",
        name: "Property boundaries",
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
      { id: "nsprd", name: "Property boundaries", status: "rendered" },
    ]);
    // One. Not one per 256px tile of the frame.
    expect(requested).toHaveLength(1);
    expect(new URL(requested[0]).searchParams.get("size")).toBe("900,600");
  });

  it("appends user maps and the parcel ring above tile layers", () => {
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
      selectedParcelRings: [[
        { lat: 46.3, lng: -61.2 }, { lat: 46.3, lng: -61.19 },
        { lat: 46.29, lng: -61.19 }, { lat: 46.3, lng: -61.2 },
      ]],
    }));
    const kinds = layers.map((l) => l.kind);
    expect(kinds[kinds.length - 1]).toBe("parcel-ring");
    expect(kinds[kinds.length - 2]).toBe("warped");
  });

  it("orders ns-aerial below Fletcher and user maps, matching mapPanes z-index (150 < 155 < 160)", () => {
    const image = document.createElement("canvas");
    const layers = buildExportLayers(inputs({
      arcgisLayers: [{
        id: "ns-aerial",
        name: "NS Aerial",
        serviceUrl: "https://arcgis.example/rest/services/AERIAL/MapServer",
        exportOptions: { transparent: false },
        opacity: 1,
      }, {
        id: "nsprd",
        name: "Property boundaries",
        serviceUrl: "https://arcgis.example/rest/services/NSPRD/MapServer",
        exportOptions: { transparent: true },
        opacity: 1,
      }],
      userMaps: [{
        id: "um-1", name: "My scan", image, imageWidth: 100, imageHeight: 80,
        latLngMesh: [
          [{ lat: 46.3, lng: -61.2 }, { lat: 46.3, lng: -61.1 }],
          [{ lat: 46.2, lng: -61.2 }, { lat: 46.2, lng: -61.1 }],
        ],
        opacity: 0.7,
      }],
    }));
    const ids = layers.map((l) => l.id);
    const modernIndex = ids.indexOf("modern");
    const aerialIndex = ids.indexOf("ns-aerial");
    const fletcherIndex = ids.findIndex((id) => id.startsWith("fletcher-"));
    const userMapIndex = ids.indexOf("um-1");
    const nsprdIndex = ids.indexOf("nsprd");
    // On-screen z-index order: modern(100) < ns-aerial(150) < Fletcher(155)
    // < user maps(160) < nsprd(200). ns-aerial is opaque, so drawing it above
    // Fletcher/user maps in the export would hide them entirely — the export
    // must match the screen, not group all ArcGIS layers as a single block.
    expect(modernIndex).toBeLessThan(aerialIndex);
    expect(aerialIndex).toBeLessThan(fletcherIndex);
    expect(fletcherIndex).toBeLessThan(userMapIndex);
    expect(userMapIndex).toBeLessThan(nsprdIndex);
  });
});

it("captures atlas mode and preserves the legacy OSM default", () => {
  expect(buildExportLayers(inputs({ basemapStyle: "night" }))[0]).toMatchObject({ kind: "atlas", mode: "night", id: "modern" });
  expect(buildExportLayers(inputs())[0]).toMatchObject({ kind: "tile", id: "modern" });
  expect(buildExportLayers(inputs({ basemapStyle: "day", showModernMap: false })).some((layer) => layer.kind === "atlas")).toBe(false);
});
