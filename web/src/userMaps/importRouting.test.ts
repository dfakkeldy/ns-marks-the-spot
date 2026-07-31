import { describe, expect, it } from "vitest";
import { routeImportFiles } from "./importRouting";

function file(name: string, bytes: Uint8Array | string): File {
  return new File([typeof bytes === "string" ? bytes : (bytes.buffer as ArrayBuffer)], name);
}

const TIFF = new Uint8Array([0x49, 0x49, 0x2a, 0x00, 0x08, 0x00]);
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a]);
const PDF = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d]);
const ZIP = new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0x00]);

describe("routeImportFiles", () => {
  it("routes raster magic bytes to the raster pipeline", async () => {
    const routed = await routeImportFiles([
      file("a.tif", TIFF),
      file("b.png", PNG),
      file("c.pdf", PDF),
    ]);
    expect(routed.raster.map((f) => f.name)).toEqual(["a.tif", "b.png", "c.pdf"]);
    expect(routed.vector).toEqual([]);
  });

  it("routes JSON, XML, and zip content to the vector pipeline", async () => {
    const routed = await routeImportFiles([
      file("camps.geojson", '{"type":"FeatureCollection","features":[]}'),
      file("trails.kml", "<?xml version=\"1.0\"?><kml/>"),
      file("parcels.zip", ZIP),
    ]);
    expect(routed.vector.map((f) => f.name)).toEqual([
      "camps.geojson",
      "trails.kml",
      "parcels.zip",
    ]);
    expect(routed.raster).toEqual([]);
  });

  it("sends unrecognized content to the raster pipeline so its outcome machinery reports it", async () => {
    const routed = await routeImportFiles([file("points.csv", "PID,123")]);
    expect(routed.raster.map((f) => f.name)).toEqual(["points.csv"]);
    expect(routed.vector).toEqual([]);
  });

  it("keeps mixed batches in order within each pipeline", async () => {
    const routed = await routeImportFiles([
      file("one.geojson", "{}"),
      file("two.tif", TIFF),
      file("three.geojson", "{}"),
    ]);
    expect(routed.vector.map((f) => f.name)).toEqual(["one.geojson", "three.geojson"]);
    expect(routed.raster.map((f) => f.name)).toEqual(["two.tif"]);
  });
});
