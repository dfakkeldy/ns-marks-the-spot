import { afterEach, describe, expect, it, vi } from "vitest";
import {
  affineFromTriangles,
  buildSrcMesh,
  drawWarpedImage,
  drawWarpedTriangles,
  MIP_MIN_SOURCE_DIM,
  mipScaleFor,
} from "./mesh";

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

  it("builds the source lattice over only the selected rectangle", () => {
    expect(
      buildSrcMesh(
        4096,
        3072,
        1,
        { x: 200, y: 100, width: 3600, height: 2700 },
      ),
    ).toEqual([
      [{ x: 200, y: 100 }, { x: 3800, y: 100 }],
      [{ x: 200, y: 2800 }, { x: 3800, y: 2800 }],
    ]);
  });
});

/**
 * Culling reads the backing size off ctx.canvas, so the stub carries one.
 * Numbers in the culling tests are binary-exact so bbox comparisons don't
 * inherit float dust.
 */
function stubCtx(width: number, height: number): CanvasRenderingContext2D {
  return {
    canvas: { width, height },
    save: vi.fn(), restore: vi.fn(), beginPath: vi.fn(), moveTo: vi.fn(),
    lineTo: vi.fn(), closePath: vi.fn(), clip: vi.fn(),
    setTransform: vi.fn(), drawImage: vi.fn(),
  } as unknown as CanvasRenderingContext2D;
}

/** Shifts every lattice point rigidly by (dx, dy). */
function shiftMesh(mesh: ReturnType<typeof buildSrcMesh>, dx: number, dy: number) {
  return mesh.map((row) => row.map((p) => ({ x: p.x + dx, y: p.y + dy })));
}

describe("drawWarpedImage", () => {
  it("draws two clipped triangles per mesh cell", () => {
    const ctx = stubCtx(100, 100);
    const src = buildSrcMesh(10, 10, 2); // 2x2 cells = 8 triangles
    const dst = buildSrcMesh(100, 100, 2);
    drawWarpedImage(ctx, {} as CanvasImageSource, src, dst);
    expect(ctx.drawImage).toHaveBeenCalledTimes(8);
    expect(ctx.clip).toHaveBeenCalledTimes(8);
  });

  it("draws nothing when the whole destination mesh misses the canvas", () => {
    const ctx = stubCtx(10, 10);
    const src = buildSrcMesh(10, 10, 2);
    const dst = shiftMesh(buildSrcMesh(10, 10, 2), -500, -500);
    drawWarpedImage(ctx, {} as CanvasImageSource, src, dst);
    expect(ctx.drawImage).not.toHaveBeenCalled();
    expect(ctx.save).not.toHaveBeenCalled();
  });

  it("keeps a triangle whose clip-overdraw growth still reaches the canvas", () => {
    // Raw bbox ends at x = -1.5, but the clip path grows outward by
    // CLIP_OVERDRAW_DEVICE_PX (2), reaching x = 0.5 — visible, must draw.
    const ctx = stubCtx(10, 10);
    const src = buildSrcMesh(10, 10, 1);
    const dst = shiftMesh(buildSrcMesh(10, 10, 1), -11.5, 0);
    drawWarpedImage(ctx, {} as CanvasImageSource, src, dst);
    expect(ctx.drawImage).toHaveBeenCalledTimes(2);
  });

  it("culls a triangle that stays off-canvas even after clip-overdraw growth", () => {
    // Raw bbox ends at x = -3; grown by 2 it reaches only x = -1.
    const ctx = stubCtx(10, 10);
    const src = buildSrcMesh(10, 10, 1);
    const dst = shiftMesh(buildSrcMesh(10, 10, 1), -13, 0);
    drawWarpedImage(ctx, {} as CanvasImageSource, src, dst);
    expect(ctx.drawImage).not.toHaveBeenCalled();
  });

  it("draws only the triangles whose grown bbox overlaps the canvas", () => {
    // 4x4 cells of 10 px over a 10x10 canvas: cells in rows/cols {0, 1} come
    // within the 2 px growth of the canvas (col 1 spans 10..20, grown to
    // 8..22), the rest miss it — 4 cells x 2 triangles.
    const ctx = stubCtx(10, 10);
    const src = buildSrcMesh(40, 40, 4);
    const dst = buildSrcMesh(40, 40, 4);
    drawWarpedImage(ctx, {} as CanvasImageSource, src, dst);
    expect(ctx.drawImage).toHaveBeenCalledTimes(8);
  });
});

describe("drawWarpedTriangles", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("draws at most maxTriangles and reports where to resume", () => {
    const ctx = stubCtx(100, 100);
    const src = buildSrcMesh(10, 10, 2); // 8 triangles total
    const dst = buildSrcMesh(100, 100, 2);
    const next = drawWarpedTriangles(ctx, {} as CanvasImageSource, src, dst, 0, 3);
    expect(next).toBe(3);
    expect(ctx.drawImage).toHaveBeenCalledTimes(3);
  });

  it("draws at least one triangle so a chunk sequence always progresses", () => {
    const ctx = stubCtx(100, 100);
    const src = buildSrcMesh(10, 10, 2);
    const dst = buildSrcMesh(100, 100, 2);
    const next = drawWarpedTriangles(ctx, {} as CanvasImageSource, src, dst, 3, 0);
    expect(next).toBe(4);
    expect(ctx.drawImage).toHaveBeenCalledTimes(1);
  });

  it("resumes mid-walk and returns the total once the tail is done", () => {
    const ctx = stubCtx(100, 100);
    const src = buildSrcMesh(10, 10, 2);
    const dst = buildSrcMesh(100, 100, 2);
    const next = drawWarpedTriangles(ctx, {} as CanvasImageSource, src, dst, 6, 99);
    expect(next).toBe(8);
    expect(ctx.drawImage).toHaveBeenCalledTimes(2);
  });

  it("counts culled triangles against the chunk so a chunk always terminates", () => {
    // Off-canvas triangles cost almost nothing, but a chunk that only
    // counted DRAWN triangles would walk the entire off-canvas remainder
    // looking for its quota — reintroducing the unbounded frame this whole
    // mechanism exists to prevent.
    const ctx = stubCtx(10, 10);
    const src = buildSrcMesh(10, 10, 2);
    const dst = shiftMesh(buildSrcMesh(100, 100, 2), -500, -500);
    const next = drawWarpedTriangles(ctx, {} as CanvasImageSource, src, dst, 0, 3);
    expect(next).toBe(3);
    expect(ctx.drawImage).not.toHaveBeenCalled();
  });

  it("chunked calls reproduce the full walk exactly across the boundary", () => {
    // Chunk continuity: splitting the walk must not skip, duplicate, or
    // reorder a triangle, or the shared-edge overdraw ordering (and thus the
    // final pixels) would differ from the one-shot walk.
    const src = buildSrcMesh(10, 10, 2);
    const dst = buildSrcMesh(100, 100, 2);
    const whole = stubCtx(100, 100);
    drawWarpedImage(whole, {} as CanvasImageSource, src, dst);
    const chunked = stubCtx(100, 100);
    let next = 0;
    while (next < 8) {
      next = drawWarpedTriangles(chunked, {} as CanvasImageSource, src, dst, next, 3);
    }
    expect(vi.mocked(chunked.setTransform).mock.calls).toEqual(
      vi.mocked(whole.setTransform).mock.calls,
    );
  });
});

describe("mipScaleFor", () => {
  it("keeps full resolution while the destination needs it", () => {
    expect(mipScaleFor(1, 4096)).toBe(1);
    expect(mipScaleFor(0.9, 4096)).toBe(1);
  });

  it("halves to the smallest level that still covers the destination", () => {
    // A 4096 source drawn onto ~800 device px: 0.25 * 4096 = 1024 >= 800,
    // and 0.125 would undershoot.
    expect(mipScaleFor(800 / 4096, 4096)).toBe(0.25);
    expect(mipScaleFor(0.5, 4096)).toBe(0.5);
  });

  it("never shrinks a level below the minimum edge", () => {
    // 512 px source at a tiny ratio: one halving reaches the 256 floor and
    // the chain stops there.
    expect(mipScaleFor(0.01, 512)).toBe(0.5);
    expect(mipScaleFor(0.01, MIP_MIN_SOURCE_DIM)).toBe(1);
  });

  it("treats degenerate ratios as full resolution", () => {
    expect(mipScaleFor(0, 4096)).toBe(1);
    expect(mipScaleFor(Number.NaN, 4096)).toBe(1);
    expect(mipScaleFor(Infinity, 4096)).toBe(1);
  });
});
