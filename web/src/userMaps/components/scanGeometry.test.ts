import { describe, expect, it } from "vitest";
import {
  clampToRaster,
  latLngFromPixel,
  pixelFromLatLng,
  scanBounds,
} from "./scanGeometry";

describe("scan coordinate helpers", () => {
  it("maps image pixels onto CRS.Simple's y-flipped space", () => {
    // Verified against Leaflet: map.project(latLng(-3, 4), 0) === {x: 4, y: 3}.
    expect(latLngFromPixel({ x: 4, y: 3 })).toEqual([-3, 4]);
    expect(pixelFromLatLng({ lat: -3, lng: 4 })).toEqual({ x: 4, y: 3 });
  });

  it("round-trips every corner of a raster", () => {
    for (const pixel of [
      { x: 0, y: 0 },
      { x: 1200, y: 0 },
      { x: 0, y: 800 },
      { x: 1200, y: 800 },
      { x: 637, y: 415 },
    ]) {
      const [lat, lng] = latLngFromPixel(pixel);
      expect(pixelFromLatLng({ lat, lng })).toEqual(pixel);
    }
  });

  it("bounds the overlay by ORIGINAL pixel dimensions", () => {
    // south-west is the bottom-left of the image, which is pixel (0, height).
    expect(scanBounds({ width: 1200, height: 800 })).toEqual([
      [-800, 0],
      [0, 1200],
    ]);
  });

  it("never returns -0 for a top-left corner", () => {
    // Object.is(-0, 0) is false, so a stray -0 breaks toEqual comparisons in
    // every downstream test and any Map keyed on the value.
    const [lat, lng] = latLngFromPixel({ x: 0, y: 0 });
    expect(Object.is(lat, -0)).toBe(false);
    expect(Object.is(lng, -0)).toBe(false);
  });

  it("never returns -0 for the pixel-space inverse of a top-left corner", () => {
    // The symmetric direction: pixelFromLatLng's `-latLng.lat` computation can
    // reintroduce -0 just as easily as latLngFromPixel's `-pixel.y` can, and
    // an earlier draft's `|| 0` guard only covered one of the two functions.
    const pixel = pixelFromLatLng({ lat: 0, lng: 0 });
    expect(Object.is(pixel.x, -0)).toBe(false);
    expect(Object.is(pixel.y, -0)).toBe(false);
  });

  it("clamps a point outside the raster back onto it", () => {
    // maxBounds constrains the VIEW, not the coordinate: viscosity defaults
    // to 0 and minZoom={-4} leaves letterboxed map outside the image, so a
    // click off the scan is easy and nothing downstream refuses it.
    const size = { width: 1200, height: 800 };
    expect(clampToRaster({ x: -40, y: -12 }, size)).toEqual({ x: 0, y: 0 });
    expect(clampToRaster({ x: 1400, y: 950 }, size)).toEqual({
      x: 1200,
      y: 800,
    });
    expect(clampToRaster({ x: 637, y: 415 }, size)).toEqual({
      x: 637,
      y: 415,
    });
  });
});
