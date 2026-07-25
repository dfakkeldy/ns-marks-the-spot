import proj4 from "proj4";
import { describe, expect, it } from "vitest";
import { UserMapImportError } from "../errors";
import {
  buildLatLngMesh,
  pixelToLatLng,
  validateCrs,
  type EmbeddedGeoref,
} from "./projection";

/** 10 m pixels, origin on the UTM 20N central meridian (easting 500 000). */
const UTM20_GEOREF: EmbeddedGeoref = {
  kind: "embedded",
  crs: "EPSG:26920",
  geotransform: [500000, 10, 0, 5000000, 0, -10],
};

describe("validateCrs", () => {
  it("accepts every locked EPSG code", () => {
    for (const code of [26920, 2961, 2962, 4617, 4326, 3857]) {
      expect(() => validateCrs(`EPSG:${code}`)).not.toThrow();
    }
  });

  it("accepts a raw proj4 definition string (WKT-citation fallback)", () => {
    expect(() =>
      validateCrs("+proj=utm +zone=20 +datum=NAD83 +units=m +no_defs"),
    ).not.toThrow();
  });

  it("rejects unknown CRSs with the code in the message", () => {
    try {
      validateCrs("EPSG:32633");
      expect.unreachable("should have thrown");
    } catch (error) {
      expect(error).toBeInstanceOf(UserMapImportError);
      expect((error as UserMapImportError).code).toBe("unsupported-crs");
      expect((error as UserMapImportError).userMessage).toContain("EPSG:32633");
    }
  });
});

describe("pixelToLatLng", () => {
  it("maps the origin pixel of a UTM 20N raster onto the central meridian", () => {
    const { lat, lng } = pixelToLatLng(UTM20_GEOREF, 0, 0);
    expect(lng).toBeCloseTo(-63, 6);
    expect(lat).toBeGreaterThan(45);
    expect(lat).toBeLessThan(45.3);
  });

  it("round-trips through proj4 to within a millimetre", () => {
    const { lat, lng } = pixelToLatLng(UTM20_GEOREF, 120, 45);
    const [easting, northing] = proj4("EPSG:4326", "EPSG:26920", [lng, lat]);
    expect(easting).toBeCloseTo(500000 + 120 * 10, 3);
    expect(northing).toBeCloseTo(5000000 - 45 * 10, 3);
  });

  it("applies rotation terms of the geotransform", () => {
    const rotated: EmbeddedGeoref = {
      kind: "embedded",
      crs: "EPSG:26920",
      geotransform: [500000, 0, 10, 5000000, -10, 0],
    };
    const { lat, lng } = pixelToLatLng(rotated, 120, 45);
    const [easting, northing] = proj4("EPSG:4326", "EPSG:26920", [lng, lat]);
    expect(easting).toBeCloseTo(500000 + 45 * 10, 3);
    expect(northing).toBeCloseTo(5000000 - 120 * 10, 3);
  });

  it("passes WGS84 rasters through untouched", () => {
    const geographic: EmbeddedGeoref = {
      kind: "embedded",
      crs: "EPSG:4326",
      geotransform: [-63.5, 0.001, 0, 46, 0, -0.001],
    };
    const { lat, lng } = pixelToLatLng(geographic, 100, 200);
    expect(lng).toBeCloseTo(-63.4, 9);
    expect(lat).toBeCloseTo(45.8, 9);
  });
});

describe("buildLatLngMesh", () => {
  it("returns a (grid+1) x (grid+1) lattice covering the full raster", () => {
    const mesh = buildLatLngMesh(UTM20_GEOREF, { width: 800, height: 400 }, 8);
    expect(mesh).toHaveLength(9);
    expect(mesh[0]).toHaveLength(9);
    expect(mesh[0][0]).toEqual(pixelToLatLng(UTM20_GEOREF, 0, 0));
    expect(mesh[8][8]).toEqual(pixelToLatLng(UTM20_GEOREF, 800, 400));
    expect(mesh[4][2]).toEqual(pixelToLatLng(UTM20_GEOREF, 200, 200));
  });
});
