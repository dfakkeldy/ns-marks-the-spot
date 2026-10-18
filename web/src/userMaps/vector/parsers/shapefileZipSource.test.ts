import { strToU8, zipSync } from "fflate";
import { describe, expect, it } from "vitest";
import { UserMapImportError } from "../../errors";
import {
  NAD83_UTM20N_WKT,
  buildDbf,
  buildPointShp,
} from "./shapefileTestFixtures";
import { parseShapefileZip } from "./shapefileZipSource";

/**
 * NAD83 / UTM zone 20N easting 500000 sits exactly on the zone's central
 * meridian (-63°); northing 5000000 puts it in mainland Nova Scotia. Values
 * confirmed against proj4 directly, so a regression in the reprojection path
 * (or a silently skipped `.prj`) moves these numbers.
 */
const UTM_POINT = { x: 500000, y: 5000000 };
const EXPECTED_LON = -63;
const EXPECTED_LAT = 45.153477;

function zipOf(entries: Record<string, Uint8Array | string>): ArrayBuffer {
  const zipped = zipSync(
    Object.fromEntries(
      Object.entries(entries).map(([name, value]) => [
        name,
        typeof value === "string" ? strToU8(value) : value,
      ]),
    ),
  );
  return zipped.buffer.slice(
    zipped.byteOffset,
    zipped.byteOffset + zipped.byteLength,
  ) as ArrayBuffer;
}

async function expectCode(promise: Promise<unknown>, code: string): Promise<UserMapImportError> {
  let caught: unknown;
  try {
    await promise;
  } catch (error) {
    caught = error;
  }
  expect(caught).toBeInstanceOf(UserMapImportError);
  expect((caught as UserMapImportError).code).toBe(code);
  return caught as UserMapImportError;
}

describe("parseShapefileZip", () => {
  it("reprojects a UTM shapefile into longitude/latitude", async () => {
    const layers = await parseShapefileZip(
      zipOf({
        "parcels.shp": buildPointShp([UTM_POINT]),
        "parcels.prj": NAD83_UTM20N_WKT,
      }),
    );
    expect(layers).toHaveLength(1);
    expect(layers[0].featureCount).toBe(1);
    const [lon, lat] = (
      layers[0].collection.features[0].geometry as GeoJSON.Point
    ).coordinates;
    expect(lon).toBeCloseTo(EXPECTED_LON, 5);
    expect(lat).toBeCloseTo(EXPECTED_LAT, 5);
  });

  it("names the layer after the shapefile inside the archive", async () => {
    const layers = await parseShapefileZip(
      zipOf({
        "export/ns-parcels.shp": buildPointShp([UTM_POINT]),
        "export/ns-parcels.prj": NAD83_UTM20N_WKT,
      }),
    );
    expect(layers[0].name).toBe("ns-parcels");
  });

  it("carries DBF attributes into feature properties", async () => {
    const layers = await parseShapefileZip(
      zipOf({
        "parcels.shp": buildPointShp([UTM_POINT]),
        "parcels.prj": NAD83_UTM20N_WKT,
        "parcels.dbf": buildDbf(["PID"], [{ PID: "01234567" }]),
      }),
    );
    expect(layers[0].collection.features[0].properties?.PID).toBe("01234567");
  });

  it("refuses a shapefile with no .prj, naming the file", async () => {
    // Without a .prj the coordinates mean nothing; shpjs would pass them
    // through as though they were already degrees. Guessing the projection is
    // exactly what this map must not do.
    const error = await expectCode(
      parseShapefileZip(zipOf({ "parcels.shp": buildPointShp([UTM_POINT]) })),
      "missing-crs",
    );
    expect(error.userMessage).toContain("parcels");
    expect(error.userMessage).toMatch(/\.prj/);
  });

  it("refuses a .prj proj4 cannot read", async () => {
    const error = await expectCode(
      parseShapefileZip(
        zipOf({
          "parcels.shp": buildPointShp([UTM_POINT]),
          "parcels.prj": "this is not a projection",
        }),
      ),
      "unsupported-crs",
    );
    expect(error.userMessage).toContain("parcels");
  });

  it("refuses the whole archive when any shapefile in it lacks a .prj", async () => {
    const error = await expectCode(
      parseShapefileZip(
        zipOf({
          "good.shp": buildPointShp([UTM_POINT]),
          "good.prj": NAD83_UTM20N_WKT,
          "bad.shp": buildPointShp([UTM_POINT]),
        }),
      ),
      "missing-crs",
    );
    expect(error.userMessage).toContain("bad");
  });

  it("produces one layer per shapefile in a multi-layer archive", async () => {
    const layers = await parseShapefileZip(
      zipOf({
        "roads.shp": buildPointShp([UTM_POINT]),
        "roads.prj": NAD83_UTM20N_WKT,
        "wells.shp": buildPointShp([{ x: 600000, y: 5080000 }]),
        "wells.prj": NAD83_UTM20N_WKT,
      }),
    );
    expect(layers.map((l) => l.name).sort()).toEqual(["roads", "wells"]);
  });

  it("notes when a shapefile arrived without its attribute table", async () => {
    const layers = await parseShapefileZip(
      zipOf({
        "parcels.shp": buildPointShp([UTM_POINT]),
        "parcels.prj": NAD83_UTM20N_WKT,
      }),
    );
    expect(layers[0].note).toMatch(/attribute/i);
    expect(layers[0].collection.features[0].properties).toEqual({});
  });

  it("ignores macOS resource forks when matching siblings", async () => {
    const layers = await parseShapefileZip(
      zipOf({
        "parcels.shp": buildPointShp([UTM_POINT]),
        "parcels.prj": NAD83_UTM20N_WKT,
        "__MACOSX/._parcels.shp": strToU8("resource fork"),
      }),
    );
    expect(layers).toHaveLength(1);
  });

  it("refuses an archive with no shapefile in it", async () => {
    await expectCode(
      parseShapefileZip(zipOf({ "readme.txt": "nothing here" })),
      "unsupported-type",
    );
  });

  it("refuses bytes that are not a readable archive", async () => {
    const notAZip = new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0x09, 0x09]);
    await expectCode(
      parseShapefileZip(notAZip.buffer as ArrayBuffer),
      "corrupt-file",
    );
  });

  it("applies the shared feature cap and empty-file rule", async () => {
    await expectCode(
      parseShapefileZip(
        zipOf({
          "empty.shp": buildPointShp([]),
          "empty.prj": NAD83_UTM20N_WKT,
        }),
      ),
      "empty-file",
    );
  });
});
