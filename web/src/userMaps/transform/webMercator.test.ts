import { describe, expect, it } from "vitest";
import {
  EARTH_RADIUS_METRES,
  fromMercator,
  groundMetresBetween,
  toMercator,
} from "./webMercator";

describe("toMercator", () => {
  it("puts the origin at 0, 0", () => {
    const origin = toMercator({ lat: 0, lng: 0 });
    expect(origin.x).toBe(0);
    // tan(pi/4) is not exactly 1 in binary floating point, so y lands within
    // a nanometre of zero rather than exactly on it.
    expect(origin.y).toBeCloseTo(0, 6);
  });

  it("matches Leaflet's SphericalMercator at a Nova Scotia coordinate", () => {
    // Captured from L.Projection.SphericalMercator.project(L.latLng(46, -61)).
    // Keeping transform/ Leaflet-free is only safe if it agrees exactly.
    const { x, y } = toMercator({ lat: 46, lng: -61 });
    expect(x).toBeCloseTo(-6790488.938389688, 6);
    expect(y).toBeCloseTo(5780349.220256354, 6);
  });

  it("round-trips through fromMercator to sub-nanometre precision", () => {
    for (const point of [
      { lat: 46, lng: -61 },
      { lat: 44.5, lng: -63.9 },
      { lat: -33.9, lng: 151.2 },
    ]) {
      const back = fromMercator(toMercator(point));
      expect(back.lat).toBeCloseTo(point.lat, 9);
      expect(back.lng).toBeCloseTo(point.lng, 9);
    }
  });

  it("clamps beyond the Mercator latitude limit instead of returning Infinity", () => {
    // tan(pi/4 + pi/2) diverges; an unclamped pole makes every downstream
    // mesh coordinate NaN and the drape silently disappears.
    expect(Number.isFinite(toMercator({ lat: 90, lng: 0 }).y)).toBe(true);
    expect(Number.isFinite(toMercator({ lat: -90, lng: 0 }).y)).toBe(true);
  });
});

describe("groundMetresBetween", () => {
  it("is zero for identical points", () => {
    expect(groundMetresBetween({ lat: 46, lng: -61 }, { lat: 46, lng: -61 })).toBe(0);
  });

  it("measures a known east-west offset in true ground metres", () => {
    // 100 m east at 46N. This is the whole point of the module: the same
    // separation measured in Mercator metres reads 143.96 m, because
    // 1/cos(46 deg) = 1.4396.
    const degreesFor100m =
      100 / (EARTH_RADIUS_METRES * Math.cos((46 * Math.PI) / 180) * (Math.PI / 180));
    const a = { lat: 46, lng: -61 };
    const b = { lat: 46, lng: -61 + degreesFor100m };
    expect(groundMetresBetween(a, b)).toBeCloseTo(100, 6);

    const ma = toMercator(a);
    const mb = toMercator(b);
    const mercatorDistance = Math.hypot(mb.x - ma.x, mb.y - ma.y);
    expect(mercatorDistance).toBeCloseTo(143.96, 1);
  });

  it("measures a north-south offset symmetrically", () => {
    const degreesFor100m = 100 / (EARTH_RADIUS_METRES * (Math.PI / 180));
    expect(
      groundMetresBetween({ lat: 46, lng: -61 }, { lat: 46 + degreesFor100m, lng: -61 }),
    ).toBeCloseTo(100, 6);
  });
});
