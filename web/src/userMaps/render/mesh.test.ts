import { afterEach, describe, expect, it, vi } from "vitest";
import {
  affineFromTriangles,
  buildSrcMesh,
  drawWarpedImage,
  drawWarpedTriangles,
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

  /** Advances the mocked clock by `stepMs` on every performance.now call. */
  function tickingClock(stepMs: number) {
    let now = 0;
    vi.spyOn(performance, "now").mockImplementation(() => {
      const value = now;
      now += stepMs;
      return value;
    });
  }

  it("stops when the frame budget is spent and reports where to resume", () => {
    // The walker reads the clock once at entry and once after each triangle;
    // 5 ms per read against an 8 ms budget: after triangle 0 the elapsed time
    // is 5 ms (continue), after triangle 1 it is 10 ms (stop).
    tickingClock(5);
    const ctx = stubCtx(100, 100);
    const src = buildSrcMesh(10, 10, 2); // 8 triangles total
    const dst = buildSrcMesh(100, 100, 2);
    const next = drawWarpedTriangles(ctx, {} as CanvasImageSource, src, dst, 0, 8);
    expect(next).toBe(2);
    expect(ctx.drawImage).toHaveBeenCalledTimes(2);
  });

  it("draws at least one triangle even when the budget is already spent", () => {
    tickingClock(100);
    const ctx = stubCtx(100, 100);
    const src = buildSrcMesh(10, 10, 2);
    const dst = buildSrcMesh(100, 100, 2);
    const next = drawWarpedTriangles(ctx, {} as CanvasImageSource, src, dst, 3, 8);
    expect(next).toBe(4);
    expect(ctx.drawImage).toHaveBeenCalledTimes(1);
  });

  it("resumes mid-walk and returns the total once the tail is done", () => {
    const ctx = stubCtx(100, 100);
    const src = buildSrcMesh(10, 10, 2);
    const dst = buildSrcMesh(100, 100, 2);
    const next = drawWarpedTriangles(ctx, {} as CanvasImageSource, src, dst, 6, Infinity);
    expect(next).toBe(8);
    expect(ctx.drawImage).toHaveBeenCalledTimes(2);
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
      next = drawWarpedTriangles(chunked, {} as CanvasImageSource, src, dst, next, 0);
    }
    expect(vi.mocked(chunked.setTransform).mock.calls).toEqual(
      vi.mocked(whole.setTransform).mock.calls,
    );
  });
});
