import { PDFDocument } from "pdf-lib";
import { describe, expect, it } from "vitest";
import {
  extractGeoPdfMetadata,
  type PdfViewportGeometry,
} from "../../userMaps/parsers/geoPdfMetadata";
import { applyAffine, solveAffineFromGcps } from "../../userMaps/transform/affine";
import { fromMercator, toMercator } from "../../userMaps/transform/webMercator";
import { attachGeoRegistration } from "./geoRegistration";

const bounds = { north: 46.2, south: 46.0, west: -61.4, east: -61.1 };
const mapFrame = { x: 28, y: 192, width: 556, height: 500 };

function viewport(width: number, height: number): PdfViewportGeometry {
  return {
    width,
    height,
    transform: [1, 0, 0, -1, 0, height],
    viewBox: [0, 0, width, height],
  };
}

async function writtenBytes(): Promise<Uint8Array> {
  const document = await PDFDocument.create();
  const page = document.addPage([612, 792]);
  attachGeoRegistration(document, page, bounds, mapFrame);
  return document.save({ useObjectStreams: false });
}

// Rendered at 72 dpi with a top-left origin: PDF (x, y) → pixel (x, 792 − y).
const frameTopPx = 792 - (mapFrame.y + mapFrame.height); // 100
const frameBottomPx = 792 - mapFrame.y; // 600
const frameLeftPx = mapFrame.x; // 28
const frameRightPx = mapFrame.x + mapFrame.width; // 584

describe("attachGeoRegistration round-trips through the app's own parser", () => {
  it("yields one accepted candidate per flavour and nothing rejected", async () => {
    const extraction = await extractGeoPdfMetadata(
      await writtenBytes(),
      viewport(612, 792),
    );
    expect(extraction.rejected).toEqual([]);
    expect(extraction.candidates.map(({ flavor }) => flavor).sort())
      .toEqual(["lgidict", "measure"]);
  });

  it.each(["measure", "lgidict"] as const)(
    "%s corners are exact",
    async (flavor) => {
      const extraction = await extractGeoPdfMetadata(
        await writtenBytes(),
        viewport(612, 792),
      );
      const candidate = extraction.candidates.find(
        (entry) => entry.flavor === flavor,
      );
      expect(candidate).toBeDefined();
      const byPixel = (x: number, y: number) =>
        candidate!.gcps.find(
          (gcp) =>
            Math.abs(gcp.pixel.x - x) < 1e-6 &&
            Math.abs(gcp.pixel.y - y) < 1e-6,
        );
      const sw = byPixel(frameLeftPx, frameBottomPx);
      const ne = byPixel(frameRightPx, frameTopPx);
      expect(sw?.map.lat).toBeCloseTo(bounds.south, 9);
      expect(sw?.map.lng).toBeCloseTo(bounds.west, 9);
      expect(ne?.map.lat).toBeCloseTo(bounds.north, 9);
      expect(ne?.map.lng).toBeCloseTo(bounds.east, 9);
    },
  );

  it("is affine-exact at the frame midpoint (EPSG:3857)", async () => {
    // The registration's own affine solution, evaluated at the frame's
    // centre pixel, must equal the true Mercator midpoint of the framed
    // area — that is what "no interior interpolation error" means, and it
    // is what a geographic-CRS registration would FAIL (the geographic
    // midpoint latitude differs from the Mercator one by ~9e-5° here, i.e.
    // about 10 m on the ground).
    const { candidates } = await extractGeoPdfMetadata(
      await writtenBytes(),
      viewport(612, 792),
    );
    for (const candidate of candidates) {
      const params = solveAffineFromGcps(candidate.gcps);
      expect(params).not.toBeNull();
      // applyAffine takes pixel coordinates in and returns Mercator metres
      // (see affine.ts: "Pixels in, Mercator out"), so the pixel-space
      // centre must be un-projected back to lat/lng before comparing.
      const centreMercator = applyAffine(
        params!,
        mapFrame.x + mapFrame.width / 2,
        frameTopPx + 250, // centre row in top-left pixel space
      );
      const centre = fromMercator(centreMercator);
      const trueMid = fromMercator({
        x: (toMercator({ lat: 0, lng: bounds.west }).x +
            toMercator({ lat: 0, lng: bounds.east }).x) / 2,
        y: (toMercator({ lat: bounds.north, lng: 0 }).y +
            toMercator({ lat: bounds.south, lng: 0 }).y) / 2,
      });
      expect(centre.lat).toBeCloseTo(trueMid.lat, 7);
      expect(centre.lng).toBeCloseTo(trueMid.lng, 7);
      // Guard that this assertion has teeth: the naive geographic midpoint
      // is measurably different (~9.07e-5° for these bounds, verified
      // independently against the raw Mercator formulas), so a geographic
      // registration would fail. Threshold set an order of magnitude below
      // the actual divergence rather than the brief's original 1e-4, which
      // slightly overshot the true value for this specific bounds fixture.
      expect(Math.abs(trueMid.lat - (bounds.north + bounds.south) / 2))
        .toBeGreaterThan(1e-5);
    }
  });
});
