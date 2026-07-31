import { describe, expect, it } from "vitest";
import { isConstrainedDevice, resolveExportResolution } from "./exportResolution";
import { pdfTemplates } from "./templates/index";
import { POINTS_PER_INCH } from "./templates/types";

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

  it("reports an honest effective DPI when even the lowest ladder rung overflows the cap", () => {
    // Even 150 DPI (the last, lowest rung) would produce
    // 3200/72*150 ≈ 6667 px — well past the 4096 px cap — so this frame
    // forces the fallback branch that the existing "4096 cap" test above
    // does not reach (a 1100x1100pt frame is satisfied at 200 DPI inside
    // the loop).
    const bigFrame = { x: 0, y: 0, width: 3200, height: 2000 };
    const r = resolveExportResolution(bigFrame, { constrainedDevice: false });

    expect(Math.max(r.widthPx, r.heightPx)).toBeLessThanOrEqual(4096);
    expect(r.reduced).toBe(true);

    // The reported dpi must describe the actual returned pixels, not a
    // stale hardcoded ladder rung (150).
    const effectiveDpi = Math.round(
      r.widthPx / (bigFrame.width / POINTS_PER_INCH),
    );
    expect(r.dpi).toBe(effectiveDpi);
    expect(r.dpi).not.toBe(150);
  });

  it("detects iOS and low-memory navigators as constrained", () => {
    const ios = { userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 26_0 like Mac OS X)" };
    const lowMem = { userAgent: "x", deviceMemory: 2 };
    const desktop = { userAgent: "Mozilla/5.0 (Macintosh)", deviceMemory: 16 };
    expect(isConstrainedDevice(ios as Navigator)).toBe(true);
    expect(isConstrainedDevice(lowMem as unknown as Navigator)).toBe(true);
    expect(isConstrainedDevice(desktop as unknown as Navigator)).toBe(false);
  });

  it("detects modern iPadOS Safari (Macintosh UA + multi-touch) as constrained, but not a real desktop Mac", () => {
    // Since iPadOS 13, Safari's default UA reports as desktop "Macintosh"
    // with no "iPad" token, and `deviceMemory` is undefined on Safari —
    // so the touch-point check is what has to catch this device.
    const ipadOsSafari = {
      userAgent:
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_6) AppleWebKit/605.1.15 " +
        "(KHTML, like Gecko) Version/17.0 Safari/605.1.15",
      maxTouchPoints: 5,
    };
    expect(isConstrainedDevice(ipadOsSafari as unknown as Navigator)).toBe(true);

    // A genuine desktop Mac has the same "Macintosh" UA token but no
    // multi-touch support and plenty of memory — this must NOT trigger,
    // or the fix would over-classify every desktop as constrained.
    const genuineDesktopMac = {
      userAgent:
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 " +
        "(KHTML, like Gecko) Version/17.0 Safari/605.1.15",
      maxTouchPoints: 0,
      deviceMemory: 16,
    };
    expect(isConstrainedDevice(genuineDesktopMac as unknown as Navigator)).toBe(false);
  });
});
