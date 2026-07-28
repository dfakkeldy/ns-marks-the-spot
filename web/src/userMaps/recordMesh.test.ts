import { describe, expect, it } from "vitest";
import { meshForRecord } from "./recordMesh";
import { BENT, gcpRecord } from "./testFixtures";
import { AFFINE_GRID_SIZE, TPS_GRID_SIZE } from "./transform/gcpMesh";
import type { GcpGeoref, UserMapRecord } from "./types";

const GCP_RECORD: UserMapRecord = {
  id: "g",
  name: "Church scan",
  source: "image",
  createdAt: "2026-07-25T00:00:00.000Z",
  pixelSize: { width: 1200, height: 800 },
  georef: {
    kind: "gcp",
    method: "affine",
    gcps: [
      { id: "a", pixel: { x: 0, y: 0 }, map: { lat: 46.1, lng: -61.2 } },
      { id: "b", pixel: { x: 1200, y: 0 }, map: { lat: 46.1, lng: -61.0 } },
      { id: "c", pixel: { x: 0, y: 800 }, map: { lat: 46.0, lng: -61.2 } },
    ],
  },
};

const EMBEDDED_RECORD: UserMapRecord = {
  id: "e",
  name: "Fixture map",
  source: "geotiff",
  createdAt: "2026-07-24T00:00:00.000Z",
  pixelSize: { width: 8, height: 6 },
  georef: {
    kind: "embedded",
    crs: "EPSG:26920",
    geotransform: [500000, 10, 0, 5000000, 0, -10],
  },
};

describe("meshForRecord", () => {
  it("builds a solved mesh for a GCP record", () => {
    const mesh = meshForRecord(GCP_RECORD);
    expect(mesh).not.toBeNull();
    // AFFINE_GRID_SIZE is 1, so a GCP mesh is a single cell.
    expect(mesh).toHaveLength(2);
    // The (0,0) corner is evaluated at x=0 and y=0, so it returns just the
    // translation term and is invariant to pixelSize. Test the corners actually
    // evaluated at the image extent: mesh[0][1] at x=width and mesh[1][0] at
    // y=height. Passing the wrong pixelSize would visibly misplace these.
    expect(mesh![0][0].lat).toBeCloseTo(46.1, 4);
    expect(mesh![0][1].lng).toBeCloseTo(-61.0, 4);
    expect(mesh![1][0].lat).toBeCloseTo(46.0, 4);
  });

  it("returns null below the three-point minimum", () => {
    expect(
      meshForRecord({
        ...GCP_RECORD,
        georef: { kind: "gcp", method: "affine", gcps: [] },
      }),
    ).toBeNull();
  });

  it("returns null for points too close to a straight line on the SCAN", () => {
    expect(
      meshForRecord({
        ...GCP_RECORD,
        georef: {
          kind: "gcp",
          method: "affine",
          gcps: [
            { id: "a", pixel: { x: 0, y: 0 }, map: { lat: 46, lng: -61 } },
            { id: "b", pixel: { x: 10, y: 10 }, map: { lat: 46.1, lng: -61.1 } },
            { id: "c", pixel: { x: 20, y: 20 }, map: { lat: 46.2, lng: -61.2 } },
          ],
        },
      }),
    ).toBeNull();
  });

  it("returns null for points on one meridian, where only the SOLVE is degenerate", () => {
    // The case that motivated MIN_ANISOTROPY_RATIO: the scan points are a
    // textbook triangle, but three map clicks down a meridian are exactly
    // collinear in Mercator, so the linear part is singular, the drape has
    // zero area, and every residual reads a perfect 0 m.
    expect(
      meshForRecord({
        ...GCP_RECORD,
        georef: {
          kind: "gcp",
          method: "affine",
          gcps: [
            { id: "a", pixel: { x: 0, y: 0 }, map: { lat: 46.0, lng: -61.0 } },
            { id: "b", pixel: { x: 1200, y: 0 }, map: { lat: 46.1, lng: -61.0 } },
            { id: "c", pixel: { x: 0, y: 800 }, map: { lat: 46.2, lng: -61.0 } },
          ],
        },
      }),
    ).toBeNull();
  });

  it("draws a SAVED tps record through the spline too", () => {
    // recordMesh.ts is what UserMapLayers actually calls (UserMapLayers.tsx:133).
    // Without this, the panel shows TPS and the saved layer snaps back to affine
    // the moment the user clicks Done — with every other test still green.
    const record = gcpRecord({ georef: { kind: "gcp", gcps: BENT, method: "tps" } });
    const mesh = meshForRecord(record)!;
    expect(mesh.length - 1).toBe(TPS_GRID_SIZE);
    const affineMesh = meshForRecord(gcpRecord({
      georef: { kind: "gcp", gcps: BENT, method: "affine" },
    }))!;
    expect(affineMesh.length - 1).toBe(AFFINE_GRID_SIZE);
  });

  it("drops a 3-point tps record back to the AFFINE lattice", () => {
    // A record reaches this state by having a point deleted after the warp was
    // chosen: the toggle's gate is a count, so at three points the control is
    // gone and the user cannot switch back. The drapes are identical there —
    // the spline's bending weights are exactly zero at n = 3, measured at
    // 1.317e-9 m worst separation — but the COST is not: TPS_GRID_SIZE is 32,
    // so the spline path pays 2 * 32^2 = 2048 clipped full-image draws per
    // redraw against the affine's 2, on every pan and zoom, forever.
    const threePoint = meshForRecord({
      ...GCP_RECORD,
      georef: { ...(GCP_RECORD.georef as GcpGeoref), method: "tps" },
    })!;
    expect(threePoint.length - 1).toBe(AFFINE_GRID_SIZE);
    // Not "it returned something": the fallback must produce the same drape
    // the spline would have, or this is a silent georeferencing change rather
    // than a cost saving. Compared against the record's own affine.
    const asAffine = meshForRecord(GCP_RECORD)!;
    expect(threePoint).toEqual(asAffine);
    // …and one more point puts it straight back on the spline, so this is a
    // floor and not a disabling of TPS in `meshForRecord`.
    const fourPoint = meshForRecord(
      gcpRecord({ georef: { kind: "gcp", gcps: BENT.slice(0, 4), method: "tps" } }),
    )!;
    expect(fourPoint.length - 1).toBe(TPS_GRID_SIZE);
  });

  it("still builds an 8x8 mesh for embedded georeferencing", () => {
    // Embedded rasters go pixel -> UTM -> WGS84 -> Mercator, and UTM curves,
    // so they keep the dense lattice. Only the GCP path is exact at 1x1.
    expect(meshForRecord(EMBEDDED_RECORD)).toHaveLength(9);
  });

  it("forwards a saved record's selected source rectangle", () => {
    const record = {
      ...EMBEDDED_RECORD,
      sourceRect: { x: 1, y: 1, width: 6, height: 4 },
    };
    const mesh = meshForRecord(record)!;
    expect(mesh[0][0]).not.toEqual(meshForRecord(EMBEDDED_RECORD)![0][0]);
    expect(mesh[8][8]).not.toEqual(meshForRecord(EMBEDDED_RECORD)![8][8]);
  });
});
