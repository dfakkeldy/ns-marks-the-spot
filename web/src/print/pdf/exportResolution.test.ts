import { describe, expect, it } from "vitest";
import { isConstrainedDevice, resolveExportResolution } from "./exportResolution";
import { pdfTemplates } from "./templates/index";

describe("resolveExportResolution", () => {
  it("uses 300 DPI on unconstrained devices", () => {
    const r = resolveExportResolution(pdfTemplates.portrait.mapFrame, {
      constrainedDevice: false,
    });
    expect(r).toEqual({
      dpi: 300,
      widthPx: Math.round((556 / 72) * 300), // 2317
      heightPx: Math.round((500 / 72) * 300), // 2083
      reduced: false,
    });
  });

  it("drops to 200 DPI on constrained devices and flags the reduction", () => {
    const r = resolveExportResolution(pdfTemplates.landscape.mapFrame, {
      constrainedDevice: true,
    });
    expect(r.dpi).toBe(200);
    expect(r.reduced).toBe(true);
  });

  it("never exceeds the 4096 px canvas cap", () => {
    const r = resolveExportResolution(
      { x: 0, y: 0, width: 1100, height: 1100 }, // hypothetical oversized frame
      { constrainedDevice: false },
    );
    expect(Math.max(r.widthPx, r.heightPx)).toBeLessThanOrEqual(4096);
  });

  it("detects iOS and low-memory navigators as constrained", () => {
    const ios = { userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 26_0 like Mac OS X)" };
    const lowMem = { userAgent: "x", deviceMemory: 2 };
    const desktop = { userAgent: "Mozilla/5.0 (Macintosh)", deviceMemory: 16 };
    expect(isConstrainedDevice(ios as Navigator)).toBe(true);
    expect(isConstrainedDevice(lowMem as unknown as Navigator)).toBe(true);
    expect(isConstrainedDevice(desktop as unknown as Navigator)).toBe(false);
  });
});
