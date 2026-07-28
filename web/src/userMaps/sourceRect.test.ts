import { describe, expect, it } from "vitest";
import { resolveSourceRect } from "./sourceRect";

describe("resolveSourceRect", () => {
  it("defaults to the complete raster", () => {
    expect(resolveSourceRect({ width: 400, height: 300 })).toEqual({
      x: 0,
      y: 0,
      width: 400,
      height: 300,
    });
  });

  it("rejects a rectangle outside the canonical raster", () => {
    expect(() =>
      resolveSourceRect(
        { width: 400, height: 300 },
        { x: 350, y: 10, width: 60, height: 20 },
      ),
    ).toThrow("source rectangle");
  });
});
