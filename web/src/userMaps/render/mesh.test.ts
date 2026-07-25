import { describe, expect, it, vi } from "vitest";
import { affineFromTriangles, buildSrcMesh, drawWarpedImage } from "./mesh";

describe("affineFromTriangles", () => {
  it("recovers a pure scale+translate mapping", () => {
    const [a, b, c, d, e, f] = affineFromTriangles(
      { x: 0, y: 0 }, { x: 1, y: 0 }, { x: 0, y: 1 },
      { x: 10, y: 20 }, { x: 12, y: 20 }, { x: 10, y: 23 },
    );
    expect([a, b, c, d, e, f]).toEqual([2, 0, 0, 3, 10, 20]);
  });

  it("maps every source vertex exactly onto its destination", () => {
    const s = [{ x: 3, y: 7 }, { x: 90, y: 12 }, { x: 40, y: 80 }];
    const t = [{ x: -5, y: 4 }, { x: 55, y: -9 }, { x: 31, y: 66 }];
    const [a, b, c, d, e, f] = affineFromTriangles(s[0], s[1], s[2], t[0], t[1], t[2]);
    for (let i = 0; i < 3; i += 1) {
      expect(a * s[i].x + c * s[i].y + e).toBeCloseTo(t[i].x, 9);
      expect(b * s[i].x + d * s[i].y + f).toBeCloseTo(t[i].y, 9);
    }
  });
});

describe("buildSrcMesh", () => {
  it("builds a lattice matching buildLatLngMesh's row/col order", () => {
    const mesh = buildSrcMesh(800, 400, 8);
    expect(mesh).toHaveLength(9);
    expect(mesh[0][0]).toEqual({ x: 0, y: 0 });
    expect(mesh[8][8]).toEqual({ x: 800, y: 400 });
    expect(mesh[4][2]).toEqual({ x: 200, y: 200 });
  });
});

describe("drawWarpedImage", () => {
  it("draws two clipped triangles per mesh cell", () => {
    const ctx = {
      save: vi.fn(), restore: vi.fn(), beginPath: vi.fn(), moveTo: vi.fn(),
      lineTo: vi.fn(), closePath: vi.fn(), clip: vi.fn(),
      setTransform: vi.fn(), drawImage: vi.fn(),
    } as unknown as CanvasRenderingContext2D;
    const src = buildSrcMesh(10, 10, 2); // 2x2 cells = 8 triangles
    const dst = buildSrcMesh(100, 100, 2);
    drawWarpedImage(ctx, {} as CanvasImageSource, src, dst);
    expect(ctx.drawImage).toHaveBeenCalledTimes(8);
    expect(ctx.clip).toHaveBeenCalledTimes(8);
  });
});
