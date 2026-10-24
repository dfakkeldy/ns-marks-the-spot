import { describe, expect, it } from "vitest";
import { contextMarkerAnchor, contextMarkerSize, contextMarkerSvg } from "./contextMarkers";

describe("context markers", () => {
  it("stands a turbine on its coordinate and centres a pin on it", () => {
    const turbine = { glyph: "turbine" } as const;
    const { width, height } = contextMarkerSize(turbine);
    expect(height).toBeGreaterThan(width);
    expect(contextMarkerAnchor(turbine)).toEqual([Math.round(width / 2), Math.round(height * 27 / 28)]);
    expect(contextMarkerAnchor({ glyph: "drop" })).toEqual([13, 13]);
  });

  it("draws a planned turbine hollow, in outline, and an installed one filled", () => {
    const filled = contextMarkerSvg({ glyph: "turbine" }, "#0891b2");
    const hollow = contextMarkerSvg({ glyph: "turbine", hollow: true }, "#b24719");
    expect(filled).toContain('fill="#0891b2"');
    expect(hollow).toContain('fill="#ffffff" stroke="#b24719"');
    expect(hollow).not.toContain('fill="#b24719"');
  });

  it("accepts only a #rrggbb colour, so the markup cannot carry anything else", () => {
    expect(() => contextMarkerSvg({ glyph: "tank" }, 'red" onload="alert(1)')).toThrow(/#rrggbb/u);
    for (const glyph of ["turbine", "tank", "bolt", "drop", "dot"] as const) {
      const svg = contextMarkerSvg({ glyph }, "#123abc");
      expect(svg.startsWith("<svg")).toBe(true);
      expect(svg).not.toMatch(/href|<script|on[a-z]+=/iu);
    }
  });
});
