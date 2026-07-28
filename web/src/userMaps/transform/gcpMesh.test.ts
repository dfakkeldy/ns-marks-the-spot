import { describe, expect, it } from "vitest";
import { BENT } from "../testFixtures";
import { applyAffine, type AffineParams } from "./affine";
import {
  AFFINE_GRID_SIZE,
  buildGcpLatLngMesh,
  buildTpsLatLngMesh,
} from "./gcpMesh";
import { applyTps, solveTps } from "./tps";
import { fromMercator } from "./webMercator";

const TRUTH: AffineParams = [3.5, -1.25, -6790000, 0.75, 4.5, 5780000];
const PIXEL_SIZE = { width: 4096, height: 3072 };

describe("buildGcpLatLngMesh", () => {
  it("defaults to a single cell, because affine needs no lattice", () => {
    expect(AFFINE_GRID_SIZE).toBe(1);
    const mesh = buildGcpLatLngMesh(TRUTH, PIXEL_SIZE);
    expect(mesh).toHaveLength(2);
    expect(mesh[0]).toHaveLength(2);
  });

  it("places corners exactly where the transform predicts", () => {
    const mesh = buildGcpLatLngMesh(TRUTH, PIXEL_SIZE);
    const corner = (x: number, y: number) =>
      fromMercator(applyAffine(TRUTH, x, y));
    // row = pixel Y, col = pixel X, matching buildLatLngMesh in projection.ts.
    expect(mesh[0][0]).toEqual(corner(0, 0));
    expect(mesh[0][1]).toEqual(corner(4096, 0));
    expect(mesh[1][0]).toEqual(corner(0, 3072));
    expect(mesh[1][1]).toEqual(corner(4096, 3072));
  });

  it("returns a (grid+1) x (grid+1) lattice for a denser grid", () => {
    const mesh = buildGcpLatLngMesh(TRUTH, PIXEL_SIZE, 8);
    expect(mesh).toHaveLength(9);
    expect(mesh[0]).toHaveLength(9);
    expect(mesh[4][2]).toEqual(fromMercator(applyAffine(TRUTH, 1024, 1536)));
  });

  it("gains nothing from a denser grid, which is why the default is 1", () => {
    // Every interior node of the dense mesh already lies on the straight line
    // between the coarse mesh's corners in Mercator space. If this ever fails,
    // the transform stopped being affine and AFFINE_GRID_SIZE must change.
    const dense = buildGcpLatLngMesh(TRUTH, PIXEL_SIZE, 8);
    const midpoint = fromMercator(applyAffine(TRUTH, 2048, 1536));
    expect(dense[4][4].lat).toBeCloseTo(midpoint.lat, 12);
    expect(dense[4][4].lng).toBeCloseTo(midpoint.lng, 12);
  });

  it("handles a rotated transform without swapping axes", () => {
    const rotated: AffineParams = [0, 4, -6790000, -4, 0, 5780000];
    const mesh = buildGcpLatLngMesh(rotated, { width: 100, height: 50 });
    expect(mesh[0][1]).toEqual(fromMercator(applyAffine(rotated, 100, 0)));
    expect(mesh[1][0]).toEqual(fromMercator(applyAffine(rotated, 0, 50)));
  });

  it("evaluates an affine over only the selected rectangle", () => {
    const mesh = buildGcpLatLngMesh(
      TRUTH,
      PIXEL_SIZE,
      1,
      { x: 100, y: 50, width: 3000, height: 2000 },
    );
    expect(mesh[0][0]).toEqual(fromMercator(applyAffine(TRUTH, 100, 50)));
    expect(mesh[1][1]).toEqual(fromMercator(applyAffine(TRUTH, 3100, 2050)));
  });
});

describe("buildTpsLatLngMesh", () => {
  const solved = () => { const r = solveTps(BENT); if (!r.ok) throw new Error("fixture must solve"); return r.params; };

  it("returns a lattice of gridSize+1 by gridSize+1 vertices", () => {
    const mesh = buildTpsLatLngMesh(solved(), { width: 2000, height: 1700 }, 4);
    expect(mesh).toHaveLength(5);
    for (const row of mesh) {
      expect(row).toHaveLength(5);          // EVERY row, not just mesh[0]
    }
  });

  it("spans the raster's real extent — asserted at a NON-ZERO index", () => {
    // mesh[0][0] is (0,0) for ANY pixelSize and for a transposed applyTps(y,x),
    // so it cannot catch a swapped extent. The affine sibling guards this with
    // mesh[0][1] on a non-square raster; do not drop that guard while mirroring.
    const params = solved();
    const mesh = buildTpsLatLngMesh(params, { width: 2000, height: 500 }, 2);
    const atFullWidth = fromMercator(applyTps(params, 2000, 0));
    const atFullHeight = fromMercator(applyTps(params, 0, 500));
    expect(mesh[0][2].lat).toBeCloseTo(atFullWidth.lat, 9);
    expect(mesh[0][2].lng).toBeCloseTo(atFullWidth.lng, 9);
    expect(mesh[2][0].lat).toBeCloseTo(atFullHeight.lat, 9);
    expect(mesh[2][0].lng).toBeCloseTo(atFullHeight.lng, 9);
  });

  it("orders the lattice row = pixel Y, col = pixel X", () => {
    const params = solved();
    const mesh = buildTpsLatLngMesh(params, { width: 2000, height: 500 }, 2);
    expect(Math.abs(mesh[0][1].lng - mesh[0][0].lng))
      .toBeGreaterThan(Math.abs(mesh[0][1].lat - mesh[0][0].lat));
    expect(Math.abs(mesh[1][0].lat - mesh[0][0].lat))
      .toBeGreaterThan(Math.abs(mesh[1][0].lng - mesh[0][0].lng));
  });

  it("evaluates a spline over only the selected rectangle", () => {
    const params = solved();
    const mesh = buildTpsLatLngMesh(
      params,
      { width: 2000, height: 500 },
      1,
      { x: 100, y: 50, width: 1200, height: 300 },
    );
    expect(mesh[0][0]).toEqual(fromMercator(applyTps(params, 100, 50)));
    expect(mesh[1][1]).toEqual(fromMercator(applyTps(params, 1300, 350)));
  });
});
