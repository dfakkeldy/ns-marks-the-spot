import { describe, expect, it } from "vitest";
import { buildExportLayers, type ExportLayerInputs } from "./exportLayerSpecs";

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

  it("maps ArcGIS descriptors through arcGISExportUrlForTile", () => {
    const layers = buildExportLayers(inputs({
      arcgisLayers: [{
        id: "nsprd",
        name: "Property boundaries",
        serviceUrl: "https://arcgis.example/rest/services/NSPRD/MapServer",
        exportOptions: { transparent: true, layers: "show:0" },
        opacity: 1,
        maxNativeZoom: 19,
      }],
    }));
    const nsprd = layers.find((l) => l.id === "nsprd");
    expect(nsprd?.kind).toBe("tile");
    if (nsprd?.kind !== "tile") return;
    const url = nsprd.url({ z: 12, x: 1351, y: 1452 });
    expect(url).toContain("/export?");
    expect(url).toContain("bboxSR=3857");
    expect(url).toContain("layers=show%3A0");
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
        maxNativeZoom: 19,
      }, {
        id: "nsprd",
        name: "Property boundaries",
        serviceUrl: "https://arcgis.example/rest/services/NSPRD/MapServer",
        exportOptions: { transparent: true },
        opacity: 1,
        maxNativeZoom: 19,
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
